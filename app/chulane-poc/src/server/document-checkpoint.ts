/** Checkpoint accepted Rivto drafts at host shutdown and page lifecycle changes and reconcile queued replica writes against a trashed document. */
import type {DatabaseSync} from 'node:sqlite'
import * as Y from 'yjs'
import {agentDocument} from './agent-document.ts'

/** Maximum encoded Yjs snapshot accepted by the host for a single page. */
export const MAX_DOCUMENT_BYTES=16*1024*1024

/** Keep the server's synchronization vector small enough to echo in a request header. */
export function documentVector(state:Uint8Array){
  const vector=Buffer.from(Y.encodeStateVectorFromUpdate(state)).toString('base64')
  return vector.length<=4096?vector:undefined
}

/** Rebuild a self-contained snapshot before journaling a revision-checked incremental write. */
export function applyLiveUpdate(base:Uint8Array|null,update:Uint8Array){
  if(!base)throw Object.assign(Error('Read the document before publishing changes'),{status:409})
  const doc=new Y.Doc()
  try{
    try{Y.applyUpdate(doc,base);Y.applyUpdate(doc,update)}
    catch{throw Object.assign(Error('Invalid document update'),{status:400})}
    // A delta can decode successfully while waiting on missing structs or a deletion dependency.
    if(doc.store.pendingStructs||doc.store.pendingDs)throw Object.assign(Error('Document update needs a fresh base'),{status:409})
    const state=Buffer.from(Y.encodeStateAsUpdate(doc))
    if(state.byteLength>MAX_DOCUMENT_BYTES)throw Object.assign(Error('Edited document exceeds the size limit'),{status:413})
    return state
  }finally{doc.destroy()}
}

export type LiveDrafts=Map<number,{state:Buffer;rev:number}>
/** Validate a Rivto snapshot and derive the searchable writing for its checkpoint. */
export function checkpointWriting(id:number,state:Uint8Array){
  try{return agentDocument({id,title:'',plain:'',state}).plain}
  catch{throw Object.assign(Error('Invalid document state'),{status:400})}
}

/** Recover interrupted saves before serving requests. Only the latest acknowledged snapshot per page is needed. */
export function openLiveDraftJournal(db:DatabaseSync){
  db.exec(`CREATE TABLE IF NOT EXISTS live_document_drafts(
      page INTEGER PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,state BLOB NOT NULL,plain TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS clear_checkpointed_draft AFTER UPDATE OF state ON pages
    BEGIN DELETE FROM live_document_drafts WHERE page=NEW.id; END;
    UPDATE pages SET state=d.state,plain=d.plain,rev=rev+1 FROM live_document_drafts d WHERE pages.id=d.page`)
  const write=db.prepare(`INSERT INTO live_document_drafts(page,state,plain) VALUES(?,?,?)
    ON CONFLICT(page) DO UPDATE SET state=excluded.state,plain=excluded.plain`)
  /** Validate the writing projection now so every acknowledged draft can be restored without decoding it on startup. */
  return (id:number,state:Buffer)=>{
    write.run(id,state,checkpointWriting(id,state))
  }
}

/** Reserve negative revision numbers in SQLite so a pre-restart tab cannot overwrite a new live draft. */
export function liveRevisionAllocator(db:DatabaseSync){
  if(!db.prepare('PRAGMA table_info(installation)').all().some(column=>column.name==='draftFloor'))
    db.exec('ALTER TABLE installation ADD COLUMN draftFloor INTEGER NOT NULL DEFAULT -4294967296 CHECK(draftFloor>=-9007199254740991)')
  const batch=4096
  const reserve=db.prepare('UPDATE installation SET draftFloor=draftFloor-? WHERE id=1 RETURNING draftFloor')
  let next=0,floor=0
  return ()=>{
    if(next===floor){
      // Reserve before publishing. Any unused numbers are skipped if this process exits.
      floor=Number(reserve.get(batch)!.draftFloor)
      next=floor+batch
    }
    return --next
  }
}

type CheckpointPage={workspace:number;id:number;title:string;plain:string;projectTrash:number|null}

type LifecycleChange={workspace:number;include?:(page:CheckpointPage)=>boolean;change:()=>void}

/** Commit selected drafts with their lifecycle change, or all accepted drafts on host shutdown. */
export function checkpointDrafts(db:DatabaseSync,drafts:LiveDrafts,lifecycle?:LifecycleChange){
  if(!lifecycle&&!drafts.size)return
  const committed:number[]=[]
  db.exec('BEGIN IMMEDIATE')
  try{
    lifecycle?.change()
    if(drafts.size&&(!lifecycle||lifecycle.include)){
      const select=db.prepare('SELECT workspace,id,title,plain,projectTrash FROM pages WHERE id=? AND deleted<>2')
      const save=db.prepare('UPDATE pages SET state=?,plain=?,rev=rev+1 WHERE id=?')
      for(const [id,{state}] of drafts){
        const page=select.get(id) as CheckpointPage|undefined
        if(!page||(lifecycle&&(page.workspace!==lifecycle.workspace||!lifecycle.include?.(page))))continue
        save.run(state,agentDocument({...page,state}).plain,id)
        committed.push(id)
      }
    }
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
  for(const id of committed)drafts.delete(id)
}

/** Merge an authorized offline snapshot while preserving the trash marker, page ID and independent document changes. */
export function mergeTrashedDocument(db:DatabaseSync,drafts:LiveDrafts,workspace:number,id:number,incoming:Uint8Array){
  db.exec('BEGIN IMMEDIATE')
  try{
    const target=db.prepare('SELECT state,deleted,title,plain FROM pages WHERE workspace=? AND id=?').get(workspace,id)
    if(!target)throw Object.assign(Error('Page missing'),{status:404})
    if(target.deleted===2)throw Object.assign(Error('Page permanently deleted.'),{status:410})
    if(!target.deleted)throw Object.assign(Error('Page restored. Retry ordinary document sync.'),{status:409})
    const existing=drafts.get(id)?.state??target.state as Uint8Array|null
    let state:Uint8Array,plain:string
    try{
      state=Y.mergeUpdates(existing?[existing,incoming]:[incoming])
      plain=agentDocument({id,title:String(target.title),plain:String(target.plain),state}).plain
    }catch{throw Object.assign(Error('Invalid document state'),{status:400})}
    if(state.length>MAX_DOCUMENT_BYTES)throw Object.assign(Error('Merged document exceeds the size limit'),{status:413})
    db.prepare('UPDATE pages SET state=?,plain=?,rev=rev+1 WHERE workspace=? AND id=?').run(state,plain,workspace,id)
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
  drafts.delete(id)
}
