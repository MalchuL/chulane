/** Bind reviewed edits from conversations and external tools to the same live document and SQLite transaction. */
import {pageSource,type AppliedEdit} from '../shared/agent.ts'
import {inlinePageLinks} from '../shared/inline-page-links.ts'
import type {LinkedPages,LinkDirection} from '../shared/page-links.ts'
import {journalDayQuery,type JournalList} from '../shared/page-draft.ts'
import {MAX_DOCUMENT_BYTES} from './document-checkpoint.ts'
import {textBoundary} from '../shared/document-text.ts'
import type {DatabaseSync} from 'node:sqlite'
import {agentDocument,type AgentEdit,type PageBody} from './agent-document.ts'

/** Preserve Rivto's block-local definitions when a flattened catalog page contains Markdown reference links. */
function blockLengths(blocks:readonly {text:string}[]){
  return blocks.length>1?blocks.slice(0,-1).map(block=>block.text.length):undefined
}

/** Open the workspace-scoped read and approval operations for a host's live Rivto drafts. */
export function reviewedDocuments(db:DatabaseSync,drafts:Map<number,{state:Uint8Array}>,notify:(workspace:number,page:number)=>void){
  const projections=new WeakMap<Uint8Array,ReturnType<typeof agentDocument>>()
  /** Project the current live revision of an already authorized page. Each published update replaces its byte buffer. */
  function liveText(id:number){
    const state=drafts.get(id)?.state
    if(!state)return
    let text=projections.get(state)
    if(!text){
      text=agentDocument({id,title:'',state,plain:''})
      projections.set(state,text)
    }
    return text
  }
  // Cache only the block boundaries needed to interpret a saved Markdown definition. Rebuild on demand after restore.
  db.exec(`CREATE TEMP TABLE markdown_reference_blocks(page INTEGER PRIMARY KEY,lengths TEXT);
    CREATE TEMP TRIGGER invalidate_reference_blocks AFTER UPDATE OF state,plain,deleted ON pages
      BEGIN DELETE FROM markdown_reference_blocks WHERE page=NEW.id; END;
    CREATE TEMP TRIGGER forget_reference_blocks AFTER DELETE ON pages
      BEGIN DELETE FROM markdown_reference_blocks WHERE page=OLD.id; END`)
  const cachedLengths=db.prepare('SELECT lengths FROM markdown_reference_blocks WHERE page=?')
  const saveLengths=db.prepare('INSERT INTO markdown_reference_blocks(page,lengths) VALUES(?,?)')
  const snapshot=db.prepare('SELECT state FROM pages WHERE id=?')
  /** Supply offsets only for pages where a definition in one Rivto block could affect a link in another. */
  function referenceBlockLengths(id:number,plain:string,live?:ReturnType<typeof liveText>){
    if(!plain.includes(']:')||!plain.includes('?'))return
    if(live)return blockLengths(live.blocks)
    const cached=cachedLengths.get(id)
    if(cached)return cached.lengths?JSON.parse(String(cached.lengths)) as number[]:undefined
    const state=snapshot.get(id)?.state as Uint8Array|null
    const lengths=state?blockLengths(agentDocument({id,title:'',plain,state}).blocks):undefined
    saveLengths.run(id,lengths?JSON.stringify(lengths):null)
    return lengths
  }
  /** Resolve a calendar date without creating a page or exposing trashed entries. */
  function journalPageId(ws:number,day:string):number|null{
    if(!journalDayQuery.shape.day.safeParse(day).success)throw Object.assign(Error('Expected a calendar date in YYYY-MM-DD format.'),{status:400})
    const row=db.prepare('SELECT id FROM pages WHERE workspace=? AND day=? AND deleted=0').get(ws,day)
    return row?Number(row.id):null
  }
  /** Use the workspace's unique date index as a cursor so newer entries cannot shift the next batch. */
  function listJournal(ws:number,before:string|null):JournalList{
    if(before!==null&&!journalDayQuery.shape.day.safeParse(before).success)throw Object.assign(Error('Expected a calendar date in YYYY-MM-DD format.'),{status:400})
    const rows=db.prepare(`SELECT id,day,title FROM pages WHERE workspace=? AND deleted=0 AND day IS NOT NULL
      ${before===null?'':'AND day < ?'} ORDER BY day DESC LIMIT 41`).all(ws,...(before===null?[]:[before]))
    const entries=rows.slice(0,40).map(row=>({id:Number(row.id),day:String(row.day),title:String(row.title)}))
    return {entries,nextBefore:rows.length>entries.length?entries[entries.length-1].day:null}
  }
  /** Page IDs are stable cursor values even when a destination is renamed or an earlier link disappears. */
  function listPageLinks(ws:number,id:number,after:number,origin:string,direction:LinkDirection='outgoing'):LinkedPages{
    const source=db.prepare('SELECT plain FROM pages WHERE workspace=? AND id=? AND deleted=0').get(ws,id)
    if(!source)
      throw Object.assign(Error('Page unavailable'),{status:404})
    /** Active drafts carry their own block boundaries, which can change before the next checkpoint. */
    function links(sourceId:number,saved:string){
      const live=liveText(sourceId),plain=live?.plain??saved
      return inlinePageLinks(plain,ws,origin,referenceBlockLengths(sourceId,plain,live))
    }
    if(direction==='incoming'){
      // Stored links resolve by ID. Inline Markdown uses the latest writing and the caller's installation origin.
      const candidates=db.prepare(`WITH linked(source) AS (
        SELECT source FROM page_links WHERE target=? AND source>?
        UNION SELECT source FROM named_page_references WHERE target=? AND source>?
      ) SELECT p.id,p.title,p.day,l.source,CASE WHEN l.source IS NULL THEN p.plain END AS plain
        FROM pages p LEFT JOIN linked l ON l.source=p.id
        WHERE p.workspace=? AND p.deleted=0 AND p.id>? AND (
          l.source IS NOT NULL OR instr(p.plain,'?')>0 OR p.id IN (SELECT value FROM json_each(?))
        ) ORDER BY p.id`).iterate(id,after,id,after,ws,after,JSON.stringify([...drafts.keys()]))
      const entries:LinkedPages['entries']=[]
      for(const row of candidates){
        const sourceId=Number(row.id)
        if(row.source===null&&!links(sourceId,String(row.plain)).some(ref=>ref.target===id))continue
        if(entries.length===40)return {entries,nextAfter:entries[entries.length-1].id}
        entries.push(pageSource({id:sourceId,title:String(row.title),day:row.day===null?null:String(row.day)}))
      }
      return {entries,nextAfter:null}
    }
    const inline=links(id,String(source.plain))
    const rows=db.prepare(`SELECT id,title FROM pages WHERE workspace=? AND deleted=0 AND id>? AND id IN (
      SELECT target FROM page_links WHERE source=? AND target>?
      UNION ALL SELECT target FROM named_page_references WHERE source=?
      UNION ALL SELECT value FROM json_each(?)
    ) ORDER BY id LIMIT 41`).all(ws,after,id,after,id,JSON.stringify(inline.map(link=>link.target)))
    const entries=rows.slice(0,40).map(row=>({id:Number(row.id),title:String(row.title)}))
    return {entries,nextAfter:rows.length>entries.length?entries[entries.length-1].id:null}
  }
  /** Resolve the latest available document state after checking its workspace and trash status. */
  function read(ws:number,id:number):PageBody{
    const row=db.prepare('SELECT id,title,day,state,plain FROM pages WHERE id=? AND workspace=? AND deleted=0').get(id,ws) as PageBody|undefined
    if(!row)throw Object.assign(Error('Page unavailable'),{status:404})
    return {...row,state:drafts.get(id)?.state??row.state}
  }
  /** Resolve a writing block or canvas against the caller's current snapshot and slice by UTF-16 offset. */
  function readPassage(ws:number,id:number,block:string|null,offset:number,anchor?:{excerpt:string;inside:number},field?:'description'|null){
    if(!Number.isSafeInteger(offset)||offset<0)throw Object.assign(Error('Invalid text offset'),{status:400})
    const page=read(ws,id),document=liveText(id)??agentDocument(page)
    const item=block===null?undefined:document.blocks.find(item=>item.id===block)
    if(block!==null&&!item)throw Object.assign(Error('Block unavailable'),{status:404})
    const content=field?item?.description:item?.text??document.canvasText
    if(content===undefined)throw Object.assign(Error('Task description unavailable'),{status:404})
    if(anchor){
      const {excerpt,inside}=anchor
      const previous=offset-inside
      if(previous<0||!content.startsWith(excerpt,previous)){
        const first=content.indexOf(excerpt)
        if(first<0||content.indexOf(excerpt,first+1)!==-1)
          throw Object.assign(Error('The cited passage changed or is ambiguous. Search the current document again.'),{status:409})
        offset=first+inside
      }
    }
    if(offset>content.length)throw Object.assign(Error('Text offset is past the current end. Read again from offset 0.'),{status:409})
    if(offset!==textBoundary(content,offset))throw Object.assign(Error('Text offset splits a Unicode character.'),{status:400})
    const end=textBoundary(content,offset+12000)
    return {title:page.title,item,offset,passage:{text:content.slice(offset,end),nextOffset:end<content.length?end:null}}
  }
  /** A replacement preview must still match the latest authorized snapshot when it enters review. */
  function checkProposalBlock(target:PageBody,block:string,before:string){
    if(!block)return
    const document=liveText(target.id)??agentDocument(target)
    if(document.blocks.find(item=>item.id===block)?.text!==before)
      throw Object.assign(Error('Read the current block before proposing an edit'),{status:409})
  }
  /** Commit the checked mutation and decision together. The renderer uses the returned delta for ordinary undo. */
  function apply(ws:number,edit:AgentEdit,reviewedTitle:unknown,record:(block:string)=>void){
    let result:AppliedEdit
    db.exec('BEGIN IMMEDIATE')
    try{
      const target=read(ws,edit.page)
      if(target.title!==reviewedTitle)throw Object.assign(Error('The page title changed. Review its current title and try again.'),{status:409})
      const changed=agentDocument(target,edit)
      if(changed.state!.byteLength>MAX_DOCUMENT_BYTES)
        throw Object.assign(Error('Edited document exceeds the size limit'),{status:413})
      db.prepare('UPDATE pages SET state=?,plain=?,rev=rev+1 WHERE id=?').run(changed.state!,changed.plain,edit.page)
      record(changed.changedBlock!)
      result={page:edit.page,base:Buffer.from(changed.base!).toString('base64'),delta:Buffer.from(changed.delta!).toString('base64'),block:changed.changedBlock!}
      db.exec('COMMIT')
    }catch(error){db.exec('ROLLBACK');throw error}
    drafts.delete(edit.page)
    notify(ws,edit.page)
    return result
  }
  return {referenceBlockLengths,listPageLinks,listJournal,journalPageId,read,readPassage,apply,liveText,checkProposalBlock}
}
