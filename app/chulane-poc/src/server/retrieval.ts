/** Application-owned retrieval boundary. The host supplies the active pages visible to the caller. */
import type {DatabaseSync} from 'node:sqlite'

import type {AttachmentExcerpt,LibrarySearchHit,Source} from '../shared/agent.ts'
import {exactPageLabelsFirst,literalQuery,matchingPassage,pageLabelMatches} from '../shared/document-text.ts'
import {agentDocument} from './agent-document.ts'
import type {reviewedDocuments} from './reviewed-documents.ts'
import {matchingAttachments} from './attachment-text.ts'

export type SearchablePage = { id: number; title: string; plain: string; day?:string; attachment?:AttachmentExcerpt }

/** Rank eligible source IDs. A future semantic retriever can use the workspace's derived index. */
export interface PageRetriever {
  search(workspace: number, query: string, pages: readonly SearchablePage[]): Promise<readonly number[]>
}

/** Match literal writing text and titles, including non-ASCII case pairs. */
export const textRetriever: PageRetriever = {
  async search(_workspace, query, pages) {
    const literal = literalQuery(query)
    const matches=pages.filter(page => page.attachment || pageLabelMatches(page,literal) || literal.test(page.plain))
    return (query ? exactPageLabelsFirst(matches,literal,page=>page.attachment?.name) : matches).map(page => page.id)
  },
}

/** Invalidate the derived canvas and task text whenever any document writer replaces the binary snapshot. */
export function installDocumentSearch(db:DatabaseSync){
  if(!db.prepare('PRAGMA table_info(pages)').all().some(column=>column.name==='canvasText'))
    db.exec('ALTER TABLE pages ADD COLUMN canvasText TEXT')
  // The previous projection indexed text labels but omitted group titles. Invalidate it once on upgrade.
  db.exec('BEGIN IMMEDIATE')
  try{
    if(!db.prepare('PRAGMA table_info(pages)').all().some(column=>column.name==='taskDescriptions')){
      db.exec('ALTER TABLE pages ADD COLUMN taskDescriptions TEXT; DROP TRIGGER IF EXISTS invalidate_canvas_labels')
    }
    if(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name='invalidate_canvas_text'").get())
      db.exec('DROP TRIGGER invalidate_canvas_text; UPDATE pages SET canvasText=NULL WHERE canvasText IS NOT NULL')
    db.exec(`CREATE TRIGGER IF NOT EXISTS invalidate_canvas_labels AFTER UPDATE OF state ON pages
      WHEN OLD.canvasText IS NOT NULL BEGIN UPDATE pages SET canvasText=NULL,taskDescriptions=NULL WHERE id=NEW.id; END`)
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
}

/** Older libraries and newly changed pages derive their search projections on the next workspace search. */
function indexChangedDocuments(db:DatabaseSync,ws:number){
  const dirty=db.prepare('SELECT id FROM pages WHERE workspace=? AND deleted=0 AND (canvasText IS NULL OR taskDescriptions IS NULL) AND state IS NOT NULL').all(ws)
  if(!dirty.length)return
  const read=db.prepare('SELECT state FROM pages WHERE id=?')
  const save=db.prepare('UPDATE pages SET canvasText=?,taskDescriptions=? WHERE id=?')
  db.exec('BEGIN IMMEDIATE')
  try{
    for(const {id} of dirty){
      const state=read.get(id)?.state as Uint8Array|undefined
      if(state){
        const document=agentDocument({id:Number(id),title:'',plain:'',state})
        save.run(document.canvasText,document.taskDescriptions,id)
      }
    }
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
}

/** Resolve ranked IDs against current workspace rows after asynchronous retrieval, preserving rank and excluding trashed sources. */
export async function searchWorkspace(db:DatabaseSync,liveText:ReturnType<typeof reviewedDocuments>['liveText'],retriever:PageRetriever,ws:number,input:string,scope:'sources'|'pages'='sources'){
  const limit=scope==='sources'?30:Infinity
  const query=input.trim()
  const literal=query?literalQuery(query):null
  indexChangedDocuments(db,ws)
  const attachments=matchingAttachments(db,ws,literal,limit)
  const pages=db.prepare('SELECT id,title,day,plain,canvasText,taskDescriptions FROM pages WHERE workspace=? AND deleted=0 ORDER BY id').all(ws).map(row=>{
    const id=Number(row.id),hit=attachments.get(id)?.[0],live=liveText(id)
    return {id,title:String(row.title),day:row.day?String(row.day):undefined,plain:[live?.plain??row.plain,live?.canvasText??row.canvasText,live?.taskDescriptions??row.taskDescriptions].filter(Boolean).join('\n'),attachment:hit?{...hit}:undefined}
  })
  const eligible=new Set(pages.map(page=>page.id))
  const matches=await retriever.search(ws,query,pages)
  const results:LibrarySearchHit[]=[],additionalPassages:Source[]=[]
  const state=db.prepare('SELECT state FROM pages WHERE id=? AND state IS NOT NULL')
  const current=db.prepare('SELECT id,title,day,plain,canvasText,taskDescriptions FROM pages WHERE id=? AND workspace=? AND deleted=0')
  for(const id of new Set(matches)){
    if(!eligible.has(id))continue
    const row=current.get(id,ws)
    if(!row)continue
    const files=attachments.get(id)
    const day=row.day?String(row.day):undefined
    const source:LibrarySearchHit={id,title:String(row.title),...(day&&{day}),attachment:files?.[0]}
    if(scope==='pages'&&files&&files.length>1)source.additionalAttachments=files.slice(1)
    const live=liveText(id),plain=live?.plain??String(row.plain),canvas=live?.canvasText??String(row.canvasText??'')
    const descriptions=live?.taskDescriptions??String(row.taskDescriptions??'')
    if(retriever===textRetriever&&literal&&!source.attachment&&!pageLabelMatches(source,literal)&&![plain,canvas,descriptions].some(text=>literal.test(text)))continue
    /** Only offer readText coordinates when the excerpt has a canonical block or canvas target. */
    function locate(text:string,block:string|null|undefined,field?:'description'){
      const match=literal&&matchingPassage(text,literal)
      if(!match)return
      return {excerpt:match.excerpt,...(scope==='sources'&&block!==undefined&&match.excerpt.length<text.length&&
        {readFrom:{block,offset:match.offset,...(field&&{field})},excerptOffset:match.excerptOffset})}
    }
    if(literal&&(literal.test(plain)||literal.test(descriptions))){
      const snapshot=live?undefined:state.get(id)?.state as Uint8Array|undefined
      const blocks=live?.blocks??(snapshot?agentDocument({id,title:source.title,plain,state:snapshot}).blocks:[])
      for(const block of blocks){
        // Each offset belongs to the specific property that supplied the excerpt.
        const passage=locate(block.text,block.id)??(block.description&&locate(block.description,block.id,'description'))
        if(!passage)continue
        if(source.block)additionalPassages.push({id,title:source.title,block:block.id,...passage})
        else Object.assign(source,{block:block.id},passage)
        if(scope==='pages'||additionalPassages.length+results.length+1>=limit)break
      }
      // A legacy text-only page has the agent's @import paragraph before its editor first opens.
      if(!source.excerpt)Object.assign(source,locate(plain,!live&&!snapshot?'@import':undefined))
    }
    if(canvas&&(!source.excerpt||(scope==='sources'&&additionalPassages.length+results.length+1<limit))){
      const passage=locate(canvas,null)
      if(passage){
        if(source.excerpt)additionalPassages.push({id,title:source.title,surface:'canvas',...passage})
        else Object.assign(source,passage,{surface:'canvas'})
      }
    }
    results.push(source)
    if(results.length>=limit)break
  }
  // Give every ranked page its first result before using remaining tool slots for other files on those pages.
  if(scope==='sources'&&results.length<limit){
    for(const {id,title} of results.slice()){
      for(const attachment of attachments.get(id)?.slice(1)??[]){
        results.push({id,title,attachment})
        if(results.length===limit)return results
      }
    }
  }
  results.push(...additionalPassages.slice(0,limit-results.length))
  return results
}
