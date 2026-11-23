/** Search an authorized desktop copy, including edits still awaiting delivery from this device. */
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import * as Y from 'yjs'
import {exportPageMarkdown} from '../shared/markdown-export'
import {tagSearchHits,tagSearchName} from '../shared/tag-search'
import {documentText,literalQuery,matchingExcerpt,pageLabelMatches,wholeLabel} from '../shared/document-text'
import {libraryPages,type Item,type Library} from '../shared/library'
import type {TagTable,TaggedRow} from '../shared/tag-fields'
import type {LibraryAttachmentHit,LibrarySearchHit,Source} from '../shared/agent'
import {documentOutbox,recoveryMarkdown,withPendingLibrary} from './document-outbox'
import {attachmentMatch,attachmentText,supportsAttachmentText} from '../shared/attachment-text'
import {cachedPageFiles,withWorkspaceCache} from './offline-server'
import {attachmentFilename} from '../shared/attachment-filename'

/** Merge only the writers this account can currently read into the last downloaded snapshot. */
async function deviceState(snapshot:Response|undefined,replica:string,page:number,includeDrafts:boolean){
  const base=snapshot?new Uint8Array(await snapshot.arrayBuffer()):new Uint8Array()
  const updates=includeDrafts?(await documentOutbox(replica,page)).recovered.map(row=>row.state):[]
  return updates.length?Y.mergeUpdates([...(base.length?[base]:[]),...updates]):base
}

/** Read the same merged writing projection for search, tag links and tag targets. */
async function deviceDocumentText(snapshot:Response|undefined,replica:string,page:number,includeDrafts:boolean){
  const doc=new Y.Doc()
  let model:DocumentModelImpl|undefined
  try{
    const state=await deviceState(snapshot,replica,page,includeDrafts)
    if(state.length)Y.applyUpdate(doc,state)
    model=new DocumentModelImpl(new YjsDoc(String(page),doc))
    return documentText(model)
  }finally{if(model)await model.destroy();else doc.destroy()}
}

type DeviceTagAccess=Pick<Library,'profile'|'replica'|'role'>
/** Scope each offline tag lookup to a current account, replica and active page snapshot. */
async function withDeviceTagPages<T>(lib:DeviceTagAccess,workspace:number,read:(catalog:Library,snapshot:(id:number)=>Promise<Response|undefined>,text:(state:Response,id:number)=>ReturnType<typeof deviceDocumentText>)=>Promise<T>){
  const {profile,replica}=lib
  if(!profile||!replica)throw Error('Local workspace copy is unavailable.')
  return withWorkspaceCache(profile,workspace,replica,async(cache,catalog)=>{
    const drafts=lib.role==='editor'&&catalog.role==='editor'
    const active=new Set(catalog.pages.filter(page=>!page.deleted).map(page=>page.id))
    return read(drafts?await withPendingLibrary(catalog,false):catalog,async id=>active.has(id)
      ?cache.match(new URL('/api/pages/'+id+'/state?workspace='+workspace,location.origin)):undefined,
      (state,id)=>deviceDocumentText(state,replica,id,drafts))
  })
}

/** A downloaded file list includes names even when the corresponding bodies are online only. */
async function listedFiles(cache:Cache,key:URL|Request):Promise<Item[]>{
  const manifest=await cache.match(key)
  return manifest?manifest.json():[]
}

/** Export the authorized device copy and resolve links and the filename against its pending page titles. */
export async function deviceMarkdown(lib:Library,workspace:number,id:number){
  if(!lib.profile||!lib.replica)throw Error('Local workspace copy is unavailable.')
  const replica=lib.replica
  return withWorkspaceCache(lib.profile,workspace,replica,async(cache,catalog,keys)=>{
    const drafts=lib.role==='editor'&&catalog.role==='editor'
    if(id<0){
      // A device-only day has no server snapshot. Check the current catalog before reading its queued writers.
      const journal=drafts?await withPendingLibrary({...catalog,offline:true},false):null
      const day=journal?.localJournalDays?.find(entry=>entry.id===id)
      if(!day)throw Error('Journal entry unavailable on this device.')
      return {...await recoveryMarkdown(replica,id),title:day.title,metadataIncomplete:false}
    }
    const library=drafts?await withPendingLibrary(catalog,false):catalog
    const page=library.pages.find(item=>item.id===id&&!item.deleted)
    if(!page)throw Error('Page unavailable.')
    const state=await cache.match(new URL('/api/pages/'+id+'/state?workspace='+workspace,location.origin))
    if(!state)throw Error('Open this page online to keep a copy on this device.')
    const bytes=await deviceState(state,replica,id,drafts)
    const linked=new Set(library.links.filter(link=>link.source===id).map(link=>link.target))
    const files=await cachedPageFiles(cache,new URL('/api/pages/'+id+'/files?workspace='+workspace,location.origin),keys)
    const result=await exportPageMarkdown(bytes.length?bytes:null,page.plain,workspace,location.origin,library.pages.filter(item=>linked.has(item.id)),{
      installation:library.installation,page:id,files,hasFiles:!!page.hasFiles,tagged:library.applications.some(item=>item.page===id),fields:!!page.hasFieldValues,
    })
    return {...result,title:page.title,metadataIncomplete:page.hasFiles===undefined||page.hasFieldValues===undefined}
  })
}

/** Resolve cached assignments against current device text, omitting missing pages and removed blocks. */
function deviceTagTargets(lib:DeviceTagAccess,workspace:number,tag:number|string,signal:AbortSignal){
  return withDeviceTagPages(lib,workspace,async(catalog,snapshot,text)=>{
    const sources:Source[]=[]
    const definition=catalog.tags.find(item=>!item.deleted&&(typeof tag==='string'?item.name===tag:item.id===tag))
    if(!definition)return {sources,fields:catalog.tagFields}
    const targets=new Map<number,Set<string>>()
    for(const item of catalog.applications){
      if(item.tag!==definition.id)continue
      const blocks=targets.get(item.page)??new Set<string>()
      blocks.add(item.block)
      targets.set(item.page,blocks)
    }
    for(const {id,title,day} of catalog.pages){
      signal.throwIfAborted()
      const wanted=targets.get(id)
      if(!wanted)continue
      const state=await snapshot(id)
      if(!state)continue
      const source={id,title,...(day&&{day})}
      if(wanted.delete(''))sources.push(source)
      if(wanted.size)for(const block of (await text(state,id)).blocks){
        if(wanted.has(block.id))sources.push({...source,block:block.id,excerpt:block.text.slice(0,120)||'Empty block'})
      }
    }
    return {sources,fields:catalog.tagFields}
  })
}

/** Follow tag links using the latest downloaded and pending document state. */
export async function deviceTagSources(lib:Library,workspace:number,tag:number,signal:AbortSignal){
  return (await deviceTagTargets(lib,workspace,tag,signal)).sources
}

/** Join field values only to objects that the signed-in device can currently open. */
export async function deviceTagTable(lib:Library,workspace:number,tag:number,signal:AbortSignal):Promise<TagTable>{
  const {sources,fields}=await deviceTagTargets(lib,workspace,tag,signal)
  if(!fields)throw Error('Reconnect to download the tag field values.')
  const rows:TaggedRow[]=sources.map(source=>({...source,values:{}}))
  const targets=new Map(rows.map(row=>[row.id+'/'+(row.block??''),row]))
  for(const cell of fields.cells){
    if(cell.tag!==tag)continue
    const row=targets.get(cell.page+'/'+cell.block)
    if(row)row.values[cell.field]=cell.value
  }
  return {fields:fields.columns.filter(column=>column.tag===tag),rows}
}

/** Merge cached and pending Yjs snapshots for a read. The account lock and abort signal bound the scan. */
export function searchDevicePages(profile:string,workspace:number,replica:string,write:boolean,query:string,signal:AbortSignal,scope:'pages'|'sources'='pages'):Promise<LibrarySearchHit[]>{
  const tag=tagSearchName(query)
  if(tag)return deviceTagTargets({profile,replica,role:write?'editor':'viewer'},workspace,tag,signal)
    .then(({sources})=>tagSearchHits(sources,scope))
  const literal=literalQuery(query)
  const exactName=wholeLabel(literal)
  return withWorkspaceCache(profile,workspace,replica,async(cache,catalog,keys)=>{
    const includeDrafts=write&&catalog.role==='editor'
    const library=includeDrafts?await withPendingLibrary({...catalog,offline:true},false):catalog
    const states=new Map<number,Request>()
    const manifests=new Map<number,Request>()
    const files=new Map<number,Map<number,Request>>()
    for(const key of keys){
      const path=new URL(key.url).pathname
      const file=/^\/api\/pages\/(\d+)\/files(?:\/(\d+))?$/.exec(path)
      if(file){
        const page=Number(file[1])
        if(file[2]){
          const entries=files.get(page)??new Map<number,Request>()
          entries.set(Number(file[2]),key)
          files.set(page,entries)
        }else manifests.set(page,key)
      }
      const match=/^\/api\/pages\/(\d+)\/state$/.exec(path)
      if(match)states.set(Number(match[1]),key)
    }
    const hits:LibrarySearchHit[]=[]
    for(const page of libraryPages(library)){
      signal.throwIfAborted()
      if(page.deleted)continue
      const source:LibrarySearchHit={id:page.id,title:page.title,...(page.day&&{day:page.day})}
      const key=states.get(page.id),snapshot=key&&await cache.match(key)
      if(snapshot||page.id<0){
        const {blocks,canvasText}=await deviceDocumentText(snapshot,replica,page.id,includeDrafts)
        for(const block of blocks){
          source.excerpt=matchingExcerpt(block.text,literal)??(block.description&&matchingExcerpt(block.description,literal))
          if(source.excerpt){source.block=block.id;break}
        }
        if(!source.excerpt){
          source.excerpt=matchingExcerpt(canvasText,literal)
          if(source.excerpt)source.surface='canvas'
        }
        if(!source.excerpt&&pageLabelMatches(page,literal))
          source.excerpt=blocks.find(block=>block.text)?.text.slice(0,160)??''

      }else source.excerpt=matchingExcerpt(page.plain,literal)
      // A saved upload can precede the next manifest refresh. Both sources contribute file IDs.
      const manifest=manifests.get(page.id)
      const listed=manifest?await listedFiles(cache,manifest):[]
      const names=new Map(listed.map(file=>[file.id,file.name]))
      const downloads=files.get(page.id)
      const ids=new Set([...names.keys(),...(downloads?.keys()??[])])
      const exactFiles:LibraryAttachmentHit[]=[]
      const otherFiles:LibraryAttachmentHit[]=[]
      for(const id of [...ids].sort((a,b)=>a-b)){
        signal.throwIfAborted()
        const key=downloads?.get(id)
        const response=key&&await cache.match(key)
        const name=names.get(id)??(response&&attachmentFilename(response))
        if(!name)continue
        const text=response&&supportsAttachmentText(name)?attachmentText(name,new Uint8Array(await response.arrayBuffer())):null
        const match=attachmentMatch(name,text,literal)
        if(match){
          const hit={id,name,availableOffline:!!response,...match}
          if(exactName.test(name))exactFiles.push(hit)
          else otherFiles.push(hit)
        }
      }
      const [first,...rest]=exactFiles.concat(otherFiles)
      if(first)source.attachment=first
      if(rest.length)source.additionalAttachments=rest
      if(source.excerpt||source.attachment||pageLabelMatches(page,literal))hits.push(source)
    }
    return hits
  })
}
