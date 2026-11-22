/** Persist unsent Yjs snapshots, page moves and ordered page or project renames in IndexedDB under their authenticated workspace replica. */
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import type {Library} from '../shared/library'
import {exportMarkdown} from '../shared/markdown-export'
import {initialJournalState} from '../shared/journal-state'
import {request} from './api'

type WritingBlock={content?:unknown;children?:WritingBlock[]}
/** Match the search projection sent by Rivto's foreground and background checkpoints. */
export function writingText(blocks:WritingBlock[]):string{
  const parts:string[]=[]
  function visit(items:WritingBlock[]){
    for(const block of items){
      if(typeof block.content==='string')parts.push(block.content)
      if(block.children)visit(block.children)
    }
  }
  visit(blocks)
  return parts.join('\n')
}

type PendingDocument={writer:string;source:string;title?:string;version:number;state:Uint8Array}
type Rename={baseTitle:string;title:string}
type Move={baseProject:number|null;project:number|null;pageTitle:string}
type QueuedMetadata={sequence:number;source:string;operationId:string} & (Rename|Move)
type Receipt=Pick<PendingDocument,'writer'|'version'>
let opening:Promise<IDBDatabase>|undefined

/** A single origin-local database can hold pending changes from independent windows and accounts. */
function database(){
  if(!opening){
    opening=new Promise<IDBDatabase>((resolve,reject)=>{
      const open=indexedDB.open('chulane-document-outbox',2)
      open.onupgradeneeded=()=>{
        if(!open.result.objectStoreNames.contains('drafts'))open.result.createObjectStore('drafts',{keyPath:'writer'}).createIndex('source','source')
        open.result.createObjectStore('renames',{keyPath:'sequence',autoIncrement:true}).createIndex('source','source')
      }
      open.onsuccess=()=>{const db=open.result;db.onversionchange=()=>{db.close();opening=undefined};resolve(db)}
      open.onerror=()=>reject(open.error)
    }).catch(error=>{opening=undefined;throw error})
  }
  return opening
}

/** Resolve only after commit. Request success alone does not establish local durability. */
function committed(tx:IDBTransaction){
  return new Promise<void>((resolve,reject)=>{
    tx.oncomplete=()=>resolve()
    tx.onabort=()=>reject(tx.error??new Error('Local document storage unavailable'))
  })
}

/** Recover every writer for this page and retire only the exact snapshots included in an acknowledged save. */
export async function documentOutbox(replica:string,page:number){
  const db=await database(),source=replica+'/'+page,writer=crypto.randomUUID()
  const store='drafts'
  const read=db.transaction(store,'readonly')
  const rows=read.objectStore(store).index('source').getAll(source)
  await committed(read)
  const recovered=rows.result as PendingDocument[]
  return {recovered,writer,
    async save(version:number,state:Uint8Array,title:string){
      const tx=db.transaction(store,'readwrite',{durability:'strict'})
      tx.objectStore(store).put({source,writer,version,state,title})
      await committed(tx)
    },
    async acknowledge(receipts:Receipt[]){
      const tx=db.transaction(store,'readwrite',{durability:'strict'}),table=tx.objectStore(store)
      for(const receipt of receipts){
        const read=table.get(receipt.writer)
        read.onsuccess=()=>{if(read.result?.source===source&&read.result.version<=receipt.version)table.delete(receipt.writer)}
      }
      await committed(tx)
    }
  }
}

/** Generate a stable delivery identity before the first metadata request. */
export function metadataOperationId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('')}

/** Numeric keys remain compatible with existing page queues. A project can have the same database ID. */
export function projectRenameKey(id:number){return 'project:'+id}

/** Commit the observed and requested metadata together before acknowledging a local change. */
export async function queueMetadata(replica:string,target:number|string,change:Rename|Move,operationId=metadataOperationId()){
  const db=await database(),tx=db.transaction('renames','readwrite',{durability:'strict'})
  tx.objectStore('renames').add({source:replica+'/'+target,operationId,...change})
  await committed(tx)
}

/** Read metadata in insertion order within the requested scope, without reading document bodies. */
async function queuedMetadata(query:IDBKeyRange|string){
  const db=await database(),tx=db.transaction('renames','readonly')
  const rows=tx.objectStore('renames').index('source').getAll(query)
  await committed(tx)
  return (rows.result as QueuedMetadata[]).sort((a,b)=>a.sequence-b.sequence)
}

/** Restrict scans to descendants of one authenticated profile or workspace. */
function descendants(scope:string){return IDBKeyRange.bound(scope+'/',scope+'/\uffff')}

/** Negative keys identify a calendar day only inside a replica's device queue. Server page IDs are positive. */
export function localJournalDay(id:number):string|undefined{
  if(!Number.isSafeInteger(id)||id>=0||id< -99991231)return
  const date=String(-id).padStart(8,'0')
  return date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6)
}

/** Retain the initial day in the same durable queue as its edits, including when the user leaves it blank. */
async function localDays(lib:Library,replica:string){
  const ids=(await documentSources(replica)).map(source=>Number(source.slice(replica.length+1))).filter(id=>id<0)
  const today=-Number(lib.today.replaceAll('-',''))
  if(!lib.pages.some(page=>page.day===lib.today)&&!lib.removedPages?.some(page=>page.day===lib.today)&&!ids.includes(today)){
    const box=await documentOutbox(replica,today)
    if(!box.recovered.length)await box.save(0,initialJournalState(lib.today),lib.today)
    ids.push(today)
  }
  return ids.flatMap(id=>{
    const day=localJournalDay(id)
    return day&&!lib.removedPages?.some(page=>page.day===day)&&!lib.pages.some(page=>page.day===day&&page.deleted)?[{id,day,title:day,project:null,deleted:0,plain:'',availableOffline:true}]:[]
  })
}

/** Project queued names and page locations onto the authorized library, leaving the server cache canonical. */
export async function withPendingLibrary(lib:Library,journal:boolean){
  const replica=lib.replica
  if(!replica||lib.role!=='editor')return lib
  if(journal&&lib.offline)lib={...lib,localJournalDays:await localDays(lib,replica)}
  const rows=await queuedMetadata(descendants(replica))
  if(!rows.length)return lib
  const titles=new Map<string,string>(),moves=new Map<string,number|null>()
  for(const row of rows){
    if('baseProject' in row)moves.set(row.source,row.project)
    else titles.set(row.source,row.title)
  }
  const activeProjects=new Set(lib.projects.filter(project=>project.trashRoot===null).map(project=>project.id))
  return {...lib,pendingRename:rows.at(-1)!.sequence,
    // Conflict choices must use server names once the queued renames for that item have settled.
    projects:lib.projects.map(project=>({...project,name:titles.get(replica+'/'+projectRenameKey(project.id))??project.name})),
    projectNameConflicts:lib.projectNameConflicts?.filter(conflict=>!titles.has(replica+'/'+projectRenameKey(conflict.project))),
    titleConflicts:lib.titleConflicts?.filter(conflict=>!titles.has(lib.replica+'/'+conflict.page)),
    moveConflicts:lib.moveConflicts?.filter(conflict=>!moves.has(replica+'/'+conflict.page)),
    pages:lib.pages.map(page=>{
      const source=replica+'/'+page.id,destination=moves.get(source)
      return {...page,title:titles.get(source)??page.title,project:destination===undefined||page.deleted||(destination!==null&&!activeProjects.has(destination))?page.project:destination}
    })}
}

/** Replay ordered metadata changes; duplicate deliveries across windows share the server's receipt. */
export async function replayMetadata(replica:string,workspace:number,signal:AbortSignal,deliveryReplica=replica,onlyTarget?:number|string,allowed?:ReadonlySet<string>){
  const db=await database()
  let failure:unknown
  const failedSources=new Set<string>()
  for(const row of await queuedMetadata(onlyTarget===undefined?descendants(replica):replica+'/'+onlyTarget)){
    signal.throwIfAborted()
    if(failedSources.has(row.source))continue
    try{
      const target=row.source.slice(replica.length+1)
      if(allowed&&!allowed.has(target))continue
      const project=target.startsWith('project:')
      const path=project?'projects/'+target.slice('project:'.length):'pages/'+target
      const change='baseProject' in row?{baseProject:row.baseProject,project:row.project}
        :project?{baseName:row.baseTitle,name:row.title}:{baseTitle:row.baseTitle,title:row.title}
      await request(path+'?workspace='+workspace,{method:'PATCH',signal,
        headers:{'Content-Type':'application/json','X-Chulane-Replica':deliveryReplica},
        body:JSON.stringify({operationId:row.operationId,...change})})
      const tx=db.transaction('renames','readwrite',{durability:'strict'})
      tx.objectStore('renames').delete(row.sequence)
      await committed(tx)
    }catch(error){failedSources.add(row.source);failure??=error}
  }
  if(failure)throw failure
}

/** Enumerate durable source identifiers without loading binary document bodies. */
async function documentSources(scope:string){
  const db=await database(),tx=db.transaction('drafts','readonly'),prefix=scope+'/'
  const cursor=tx.objectStore('drafts').index('source').openKeyCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'),'nextunique')
  const sources:string[]=[]
  cursor.onsuccess=()=>{const item=cursor.result;if(item){sources.push(String(item.key));item.continue()}}
  await committed(tx)
  return sources
}

/** List pending projects and pages once, including pages with both body and title changes. */
export async function pendingSources(scope:string){
  const [documents,titles]=await Promise.all([documentSources(scope),queuedMetadata(descendants(scope))])
  return [...new Set([...documents,...titles.map(row=>row.source)])]
}

/** Identify pending body edits separately from metadata-only changes, and prefer the latest queued title. */
export async function pendingRecoveryInfo(source:string){
  const db=await database(),tx=db.transaction('drafts','readonly')
  const row=tx.objectStore('drafts').index('source').get(source)
  await committed(tx)
  const latest=(await queuedMetadata(source)).at(-1)
  const title:string|undefined=latest?('baseProject' in latest?latest.pageTitle:latest.title):row.result?.title
  return {title,hasDocument:!!row.result}
}

/** Merge only the outstanding local writers so recovery still works after workspace cache removal. */
export async function pendingMarkdown(replica:string,page:number){
  const {recovered}=await documentOutbox(replica,page)
  if(!recovered.length)throw Error('No pending document content remains to export.')
  return exportMarkdown(Y.mergeUpdates(recovered.map(row=>row.state)),'',false)
}

/** Encode bytes for a portable recovery file without expanding them into a JavaScript argument list. */
export async function recoveryBase64(blob:Blob){
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=()=>resolve(String(reader.result).split(',')[1])
    reader.onerror=()=>reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Export only the selected project's ordered rename requests under the original workspace replica. */
export async function exportProjectRenames(profile:string,workspace:number,project:number,replica:string){
  const rows=await queuedMetadata(replica+'/'+projectRenameKey(project))
  if(!rows.length)throw Error('These edits have already synced.')
  const renames=rows.flatMap(row=>'baseTitle' in row?[{baseName:row.baseTitle,name:row.title,operationId:row.operationId}]:[])
  return new Blob([JSON.stringify({format:'chulane-project-recovery',version:1,server:location.origin,profile,workspace,project,renames},null,2)],{type:'application/json'})
}

type RetiredCopy={day:string|null;title?:string;state?:Uint8Array;attachments:{id:number;name:string;base64:string}[]}

/** A provisional calendar day and its eventual server ID can both own undelivered writers. */
function recoveryIds(page:number,day?:string|null){return day?[page,-Number(day.replaceAll('-',''))]:[page]}

/** Export the synchronized base, outstanding edits and locally available files together. Keep all originals. */
export async function exportPendingDocument(profile:string,workspace:number,page:number,replica=profile+'/'+workspace,copy?:RetiredCopy){
  const ids=recoveryIds(page,copy?.day)
  const boxes=await Promise.all(ids.map(id=>documentOutbox(replica,id)))
  const writers=boxes.flatMap(box=>box.recovered)
  const changes=(await Promise.all(ids.map(id=>queuedMetadata(replica+'/'+id)))).flat()
  const renames=changes.flatMap(row=>'baseTitle' in row?[{baseTitle:row.baseTitle,title:row.title,operationId:row.operationId}]:[])
  const moves=changes.flatMap(row=>'baseProject' in row?[{baseProject:row.baseProject,project:row.project,operationId:row.operationId}]:[])
  const base={version:1,server:location.origin,profile,workspace,page,renames,...(moves.length&&{moves})}
  if(!writers.length&&!copy){
    if(!changes.length)throw Error('These edits have already synced.')
    return new Blob([JSON.stringify({format:moves.length?'chulane-page-metadata-recovery':'chulane-title-recovery',...base},null,2)],{type:'application/json'})
  }
  const states=writers.map(row=>row.state)
  if(copy?.state)states.unshift(copy.state)
  const state=Y.mergeUpdates(states),doc=new Y.Doc()
  Y.applyUpdate(doc,state)
  const model=new DocumentModelImpl(new YjsDoc(String(page),doc))
  try{
    const encoded=await recoveryBase64(new Blob([state as BlobPart]))
    return new Blob([JSON.stringify({format:'chulane-document-recovery',...base,
      journalDay:copy?.day??localJournalDay(page),title:renames.at(-1)?.title??writers.find(row=>row.title)?.title??copy?.title,
      writingText:writingText(model.blocks.getBlocks()),yjsUpdateBase64:encoded,attachments:copy?.attachments},null,2)],{type:'application/json'})
  }finally{model.destroy()}
}

/** Discard the selected removed page’s local writers and renames in one IndexedDB transaction. */
export async function discardRemovedDrafts(replica:string,page:number,day:string|null){
  const db=await database(),tx=db.transaction(['drafts','renames'],'readwrite',{durability:'strict'})
  for(const store of ['drafts','renames']){
    const table=tx.objectStore(store)
    for(const id of recoveryIds(page,day)){
      const cursor=table.index('source').openCursor(replica+'/'+id)
      cursor.onsuccess=()=>{if(cursor.result){cursor.result.delete();cursor.result.continue()}}
    }
  }
  await committed(tx)
}

/** Drain previously opened pages through the same authenticated, revision-checked write used by the live editor. */
export async function replayClosedDocuments(replica:string,workspace:number,eligible:(id:number)=>boolean,signal:AbortSignal,deliveryReplica=replica){
  const pages=(await documentSources(replica)).map(source=>Number(source.slice(replica.length+1)))
  async function replay(id:number){
    const box=await documentOutbox(replica,id)
    if(!box.recovered.length)return
    const headers={'X-Chulane-Replica':deliveryReplica}
    const day=localJournalDay(id)
    // The unique workspace/date also resolves a concurrent server creation or a day moved to Trash.
    const target=day?(await (await request('pages?workspace='+workspace,{method:'POST',signal,
      headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({day,title:day})})).json()).id:id
    const path='pages/'+target+'/state?workspace='+workspace
    try{
      const head=await request(path,{headers,signal})
      if(head.headers.has('X-Chulane-Offline'))throw Error('Server unavailable. Edits remain on this device.')
      const bytes=new Uint8Array(await head.arrayBuffer()),doc=new Y.Doc()
      const model=new DocumentModelImpl(new YjsDoc(String(id),doc))
      try{
        if(bytes.length)Y.applyUpdate(doc,bytes)
        for(const row of box.recovered)Y.applyUpdate(doc,row.state)
        const plain=new TextEncoder().encode(writingText(model.blocks.getBlocks()))
        const frame=new Blob([plain,Y.encodeStateAsUpdate(doc) as BlobPart])
        await request(path,{method:'PUT',signal,headers:{...headers,'X-Text-Bytes':String(plain.length),'If-Match':head.headers.get('X-Revision')!},body:frame})
      }finally{model.destroy()}
    }catch(error){
      if((error as {status?:number}).status!==410)throw error
      // A trashed page cannot be opened. Send the queued CRDT states for a server-side merge that keeps it in Trash.
      const state=Y.mergeUpdates(box.recovered.map(row=>row.state))
      await request(path+'&merge=1',{method:'POST',signal,headers,body:new Blob([state as BlobPart])})
    }
    await box.acknowledge(box.recovered)
  }
  // A page can be trashed while its siblings remain writable. Preserve each failed snapshot for recovery.
  let failure:unknown
  for(const id of pages){
    signal.throwIfAborted()
    if(eligible(id)){
      try{await replay(id)}catch(err){failure??=err}
    }
  }
  if(failure)throw failure
}
