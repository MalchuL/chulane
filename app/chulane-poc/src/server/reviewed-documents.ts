/** Bind reviewed edits from conversations and external tools to the same live document and SQLite transaction. */
import {textBoundary} from '../shared/document-text.ts'
import type {DatabaseSync} from 'node:sqlite'
import {agentDocument,type AgentEdit,type PageBody} from './agent-document.ts'

/** Open the workspace-scoped read and approval operations for a host's live Rivto drafts. */
export function reviewedDocuments(db:DatabaseSync,drafts:Map<number,{state:Uint8Array}>){
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
  /** Resolve the latest available document state after checking its workspace and trash status. */
  function read(ws:number,id:number):PageBody{
    const row=db.prepare('SELECT id,title,state,plain FROM pages WHERE id=? AND workspace=? AND deleted=0').get(id,ws) as PageBody|undefined
    if(!row)throw Object.assign(Error('Page unavailable'),{status:404})
    return {...row,state:drafts.get(id)?.state??row.state}
  }
  /** Resolve a writing block or canvas against the caller's current snapshot and slice by UTF-16 offset. */
  function readPassage(ws:number,id:number,block:string|null,offset:number){
    if(!Number.isSafeInteger(offset)||offset<0)throw Object.assign(Error('Invalid text offset'),{status:400})
    const page=read(ws,id),document=liveText(id)??agentDocument(page)
    const item=block===null?undefined:document.blocks.find(item=>item.id===block)
    if(block!==null&&!item)throw Object.assign(Error('Block unavailable'),{status:404})
    const content=item?.text??document.canvasText
    if(offset>content.length)throw Object.assign(Error('Text offset is past the current end. Read again from offset 0.'),{status:409})
    if(offset!==textBoundary(content,offset))throw Object.assign(Error('Text offset splits a Unicode character.'),{status:400})
    const end=textBoundary(content,offset+12000)
    return {title:page.title,item,passage:{text:content.slice(offset,end),nextOffset:end<content.length?end:null}}
  }
  /** A replacement preview must still match the latest authorized snapshot when it enters review. */
  function checkProposalBlock(target:PageBody,block:string,before:string){
    if(!block)return
    const document=liveText(target.id)??agentDocument(target)
    if(document.blocks.find(item=>item.id===block)?.text!==before)
      throw Object.assign(Error('Read the current block before proposing an edit'),{status:409})
  }
  /** Commit the checked mutation and decision together. The renderer uses the returned delta for ordinary undo. */
  function apply(ws:number,edit:AgentEdit,record:(block:string)=>void){
    db.exec('BEGIN IMMEDIATE')
    try{
      const changed=agentDocument(read(ws,edit.page),edit)
      if(changed.state!.length+Buffer.byteLength(changed.plain)>16*1024*1024)
        throw Object.assign(Error('Edited document exceeds the size limit'),{status:413})
      db.prepare('UPDATE pages SET state=?,plain=?,rev=rev+1 WHERE id=?').run(changed.state!,changed.plain,edit.page)
      record(changed.changedBlock!)
      const result={page:edit.page,base:Buffer.from(changed.base!).toString('base64'),delta:Buffer.from(changed.delta!).toString('base64'),block:changed.changedBlock!}
      db.exec('COMMIT');drafts.delete(edit.page)
      return result
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  return {read,readPassage,apply,liveText,checkProposalBlock}
}
