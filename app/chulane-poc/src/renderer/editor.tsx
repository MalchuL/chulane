/** One mounted page owns one hydrated Rivto runtime. Compare-and-swap saves merge competing Yjs states. */
import React,{useEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {FileText,LayoutDashboard,Save} from 'lucide-react'
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import {createDocumentEditor,ModeManager} from '@chulane/rivto'
import {
  MarkdownPluginsContext,EditorPanel,PageSurface,EdgelessSurface,createReactEditor,useEditorMode,standardPreset,edgelessPreset,
  bentoExtension,columnsExtension,kanbanExtension,tableExtension,todoItemExtension,pageDragExtension
} from '@chulane/rivto-react'
import '@chulane/rivto-react/styles.css'
import {Button,ToggleGroup,ToggleGroupItem} from './ui'
import {mountPluginBlocks} from './plugin-blocks'
import {DocumentTextSelection} from './document-text-selection'
import {remarkNamedReferences} from '../shared/named-references'
import {InlineTagSurface} from './inline-tags'
import type {ViewHandle} from './editor-dock'
import {EditorAddress,type EditorTarget} from './editor-address'
import {blockLinkExtension} from './block-links'
import {initialJournalState} from '../shared/journal-state'
import {documentOutbox,localJournalDay,writingText} from './document-outbox'
import {pageFiles} from './page-files'
import {watchDocumentChanges} from './document-events'
import {joinDocumentViews,peerOrigin} from './document-peers'
import {request} from './api'
const AUTOSAVE_DELAY_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 500

import type {ApplyInEditor} from './agent'
/** Navigation accepts a durable device copy. Explicit sync requires a server acknowledgement. */
export type Checkpoint=(destination?:'device'|'server')=>Promise<void>
/** Journal entries omit the toolbar for inline save status. Dock panes share a toolbar owned by the active pane. */
type EditorProps={surfaceMode?:ModeManager;view?:ViewHandle;installation?:string;onFileAdded?:()=>void;citationTarget?:EditorTarget;finishCitation?:(next:EditorTarget|undefined)=>void;report?:(message:string)=>void;title:string;replica?:string;workspace:number;toolbar?:HTMLDivElement|null;applyInEditor:React.RefObject<ApplyInEditor|null>;heading:React.ReactNode;id:number;writable:boolean;checkpoint:React.RefObject<Checkpoint|null>;onSaved:(text:string,referenceBlockLengths?:number[])=>void;initialText?:string}
type EditorRuntime={reactEditor:ReturnType<typeof createReactEditor>;mode:ModeManager;model:DocumentModelImpl}

function Surface({writable,save,toolbar,page,checkpoint}:{page:number;checkpoint:()=>Promise<void>;toolbar?:HTMLDivElement|null;writable:boolean;save:React.ReactNode}){
  const {mode,setMode}=useEditorMode()
  return <>{toolbar&&createPortal(<div className="editor-controls"><ToggleGroup className="surface-tabs" type="single" size="sm" value={mode} aria-label="Document view" onValueChange={next=>{if(next==='block'||next==='edgeless')setMode(next)}}><ToggleGroupItem value="block" aria-label="Page" title="Page view"><FileText/></ToggleGroupItem><ToggleGroupItem value="edgeless" aria-label="Canvas" title="Canvas view"><LayoutDashboard/></ToggleGroupItem></ToggleGroup>{save}</div>,toolbar)}<InlineTagSurface page={page} writable={writable} checkpoint={checkpoint}>{mode==='block'?<PageSurface/>:<EdgelessSurface/>}</InlineTagSurface></>
}
export function Editor({view,surfaceMode,installation,onFileAdded,citationTarget,finishCitation,report,title,replica,toolbar,heading,id,workspace,writable,checkpoint,applyInEditor,onSaved,initialText}:EditorProps){
  const [runtime,setRuntime]=useState<EditorRuntime>(),[status,setStatus]=useState('Opening…')
  const referencePlugins=useMemo(()=>[remarkNamedReferences(workspace,id)],[workspace,id])
  const mode=view?.mode??surfaceMode
  const surfaceAnchor=useRef<HTMLSpanElement>(null)
  const currentTitle=useRef(title);currentTitle.current=title
  const saveNow=useRef<()=>void>(()=>{})
  useEffect(()=>{
    const doc=new Y.Doc(),path='pages/'+id+'/state?workspace='+workspace
    const documentIdentity=JSON.stringify([installation,replica,workspace,id])
    const room=joinDocumentViews(documentIdentity,doc,wake)
    let releaseBlocks:(()=>void)|undefined
    // Local writes include everything previously read. Echoing the last read vector may repeat some of our own edits.
    let serverVector='',livePatches=false
    const localDay=localJournalDay(id)
    const adapter=new YjsDoc(String(id),doc)
    let disposed=false,busy=false,dirty=false,unpublished=false,saveDue=false,rev=-1,remote=false,editor:any,model:any,reactEditor:any
    // All callers waiting to leave share the checkpoint, including edits typed during its PUT.
    let pending:Promise<Error|undefined>|undefined, saved:((uploadError?:Error)=>void)|undefined, failed:((error:unknown)=>void)|undefined
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    const replicaHeaders:Record<string,string>=replica?{'X-Chulane-Replica':replica}:{}
    let outbox:Awaited<ReturnType<typeof documentOutbox>>|undefined
    let receipts:{writer:string;version:number}[]=[],version=0,stored=0,acknowledged=0
    let timer:ReturnType<typeof setTimeout>|undefined,localWrite:Promise<void>|undefined
    // Coalesce typing bursts, including while a network request is stalled.
    function backup(){
      clearTimeout(timer);timer=undefined
      if(!outbox||version<=Math.max(stored,acknowledged))return localWrite
      const snapshot=version
      localWrite=outbox.save(snapshot,Y.encodeStateAsUpdate(doc),currentTitle.current).then(()=>{
        stored=Math.max(stored,snapshot)
        if(version===snapshot&&!disposed){
          window.removeEventListener('beforeunload',unload)
          if(dirty&&snapshot>acknowledged)setStatus('Saved on device · waiting to sync')
        }
      })
      return localWrite
    }
    function queueBackup(){
      if(!outbox)return
      ++version
      if(timer!==undefined)return
      timer=setTimeout(()=>{timer=undefined;void backup()?.catch(()=>{if(!disposed)setStatus('Device save failed · retrying')})},150)
    }
    let wakeTimer:ReturnType<typeof setTimeout>|undefined,wakePending=false
    /** Batch typing bursts and remember notifications arriving during a read, write or review. */
    function wake(){
      wakePending=true
      if(disposed||busy||room.reviewing||wakeTimer!==undefined)return
      wakeTimer=setTimeout(()=>{wakeTimer=undefined;void sync()},35)
    }
    async function sync(){
      if(disposed||busy||room.reviewing)return
      busy=true;wakePending=false
      try {
        if(replica&&writable&&!outbox){
          outbox=await documentOutbox(replica,id)
          if(disposed)return
          receipts=outbox.recovered.map(({writer,version})=>({writer,version}))
        }
        // The date is the only identity available before reconnect. Recover its writers through the normal outbox.
        // A second view can open from an authorized, hydrated peer while disconnected.
        const response=room.hydrated&&!editor?new Response(null,{status:204,headers:{'X-Chulane-Offline':'1'}}):localDay?new Response(rev===0?null:initialJournalState(localDay) as BodyInit,{
          status:rev===0?204:200,headers:{'X-Chulane-Offline':'1','X-Revision':'0'}
        }):await request(path+'&since='+rev,{headers:{...replicaHeaders,'X-Yjs-State-Vector':serverVector}})
        if(disposed||room.reviewing)return
        livePatches=response.headers.get('Accept-Patch')==='application/octet-stream'
        if(response.status!==204){
          const bytes=new Uint8Array(await response.arrayBuffer())
          if(disposed||room.reviewing)return
          remote=true;try{if(bytes.length)Y.applyUpdate(doc,bytes)}finally{remote=false}
          rev=Number(response.headers.get('X-Revision'))
          serverVector=response.headers.get('X-Yjs-State-Vector')??''
        }
        if(!editor){
          if(outbox&&receipts.length){
            for(const row of outbox.recovered)Y.applyUpdate(doc,row.state)
            // A local day starts with a committed blank seed. Only recovered edits need a save indication.
            dirty=!localDay||outbox.recovered.some(row=>row.version>0)
            unpublished=dirty;saveDue=dirty
            outbox.recovered.length=0
          }
          model=new DocumentModelImpl(adapter)
          editor=createDocumentEditor({document:model})
          reactEditor=createReactEditor({editor,extensions:[
            standardPreset(),pageFiles({workspace,page:id,installation,writable,headers:replicaHeaders,added:onFileAdded}),todoItemExtension(),tableExtension(),kanbanExtension(),columnsExtension(),bentoExtension(),
            blockLinkExtension,...(writable?[pageDragExtension({documentIdentity})]:[]),...edgelessPreset()
          ]})
          releaseBlocks=mountPluginBlocks(reactEditor,message=>report?.(message))
          doc.on('update',(_bytes,origin)=>{if(writable&&!remote&&origin!==peerOrigin){dirty=true;unpublished=true;queueBackup();wake();window.addEventListener('beforeunload',unload);setStatus('Unsaved changes')}})
          if(!rev && (writable||initialText) && !editor.dump().blocks.length)
            editor.blocks.insertBlock({...reactEditor.defaultWritingBlockFactory.createEmptyBlock(),content:initialText||''})
          room.ready()
          setRuntime({reactEditor,model,mode:mode??new ModeManager('block')})
        }
        if(response.headers.has('X-Chulane-Offline')){
          if(dirty)throw new TypeError('Server offline')
          setStatus(writable?'Available offline':'Read only · offline')
          return
        }
        if(unpublished || saveDue){
          const persist=saveDue
          if(persist)setStatus('Saving…')
          const plain=persist?writingText(editor.dump().blocks):''
          const sentVersion=version
          const incremental=!persist&&livePatches&&!!serverVector
          unpublished=false
          try{
            const vector=incremental?Uint8Array.from(atob(serverVector),char=>char.charCodeAt(0)):undefined
            const update=Y.encodeStateAsUpdate(doc,vector)
            const ack=await (await request(persist?path:path+'&live',{method:incremental?'PATCH':'PUT',headers:{...replicaHeaders,'If-Match':String(rev),'Content-Type':'application/octet-stream'},body:new Blob([update as BlobPart])})).json()
            rev=ack.rev
            if(incremental)serverVector=ack.vector??''
            if(persist&&outbox){
              acknowledged=Math.max(acknowledged,sentVersion)
              await outbox.acknowledge([...receipts,{writer:outbox.writer,version:sentVersion}])
              receipts=[]
            }
            if(persist){dirty=unpublished;saveDue=dirty;if(!disposed)onSaved(plain,ack.referenceBlockLengths)
              if(!dirty){saved?.();pending=undefined;saved=undefined;failed=undefined}}
          }catch(error){
            // A missing base or a host downgrade requires the next write to carry complete state.
            if(incremental&&[405,409,415].includes((error as {status:number}).status))serverVector=''
            unpublished=true;throw error
          }
        }
        if(!disposed){if(!dirty)window.removeEventListener('beforeunload',unload);setStatus(!writable?'Read only':dirty||rev<0?(outbox&&dirty&&stored>=version?'Saved on device · waiting to sync':'Unsaved changes'):'Saved')}
      }catch(error:any){
        if(outbox&&dirty&&(!error.status||error.status>=500)){
          saveDue=true
          try{
            await backup()
            if(!disposed&&stored>=version){
              setStatus('Saved on device · waiting to sync')
              saved?.(error);pending=undefined;saved=undefined;failed=undefined
            }
          }catch{if(!disposed)setStatus('Device save failed · retrying')}
        }else if(!disposed)setStatus(error.status===409?'Merging changes…':error.message+' · retrying')
        if(error.status!==409){failed?.(error);pending=undefined;saved=undefined;failed=undefined}}
      finally{busy=false;if(wakePending)wake()}
    }
    // A busy poll picks up the requested save; conflicts and failures leave it due for retry.
    saveNow.current=()=>{if(writable && (dirty || (rev<0 && editor))){saveDue=true;void sync()}}
    checkpoint.current=(destination='device')=>{
      if(!writable||(!dirty&&!saveDue)||!editor)return Promise.resolve()
      pending??=new Promise<Error|undefined>((resolve,reject)=>{saved=resolve;failed=reject})
      const result=pending
      saveNow.current()
      return result.then(uploadError=>{if(uploadError&&destination==='server')throw uploadError})
    }
    applyInEditor.current=async(target,commit)=>{
      if(target!==id||!writable)throw Error('The destination editor is unavailable.')
      // A review can open its destination. Let the first read mount the model before pausing all panes.
      while(busy&&!disposed)await new Promise(done=>setTimeout(done,10))
      if(disposed||!model)throw Error('The destination editor is unavailable. Reopen the page and try again.')
      room.beginReview()
      try{
        const result=await commit()
        if(disposed)return
        const decode=(value:string)=>Uint8Array.from(atob(value),char=>char.charCodeAt(0))
        remote=true
        try{
          Y.applyUpdate(doc,decode(result.base))
          // Only this approval is a local undoable operation; other collaborators receive normal remote updates.
          model.history.stopCapturing()
          adapter.transact(()=>Y.applyUpdate(doc,decode(result.delta)))
          model.history.stopCapturing()
        }finally{remote=false}
      }finally{room.finishReview()}
    }
    void sync()
    const unwatch=localDay?undefined:watchDocumentChanges(workspace,replica,page=>{if(page===undefined||page===id)wake()})
    // Reconcile periodically even with push, including writes from older integrations.
    const poll=setInterval(sync,POLL_INTERVAL_MS)
    const autosave=setTimeout(()=>saveNow.current(),AUTOSAVE_DELAY_MS)
    return ()=>{room.leave();disposed=true;unwatch?.();clearTimeout(wakeTimer);clearTimeout(timer);void backup()?.catch(()=>{});applyInEditor.current=null;checkpoint.current=null;failed?.(new Error('Page closed'));clearInterval(poll);clearTimeout(autosave);saveNow.current=()=>{};window.removeEventListener('beforeunload',unload);releaseBlocks?.();reactEditor?.destroy();if(editor)void editor.destroy().finally(()=>model.destroy());else doc.destroy()}
  },[id,workspace,writable,replica,installation,mode])
  useEffect(()=>{
    if(!runtime||!citationTarget)return
    const surface=surfaceAnchor.current?.closest('[data-source-page]')
    if(!surface)return
    const headingSelector='.doc-head h1'
    // A slow document load may finish after the user has already focused another control.
    function focusResult(destination:HTMLElement|null|undefined){
      if(citationTarget?.focusResult&&document.activeElement===document.body)destination?.focus({preventScroll:true})
    }
    const block=citationTarget.block
    if(citationTarget.surface==='canvas')runtime.mode.set('edgeless')
    else if(block||citationTarget.surface==='page')runtime.mode.set('block')
    if(!block&&!citationTarget.focusResult){finishCitation?.(undefined);return}
    /** Find the laid-out writing row for a block ID in this pane. Canvas cards can repeat that ID. */
    function writingBlock(blockId:string){
      const row=surface?.querySelector<HTMLElement>('.page-surface [data-block-id="'+CSS.escape(blockId)+'"]')
      return row?.getClientRects().length?row:null
    }
    let frame=0
    function reveal(){
      const target=block?writingBlock(block):surface?.querySelector<HTMLElement>(headingSelector)
      if(!target)return false
      observer.disconnect()
      clearTimeout(timer)
      if(!block){focusResult(target);finishCitation?.(undefined);return true}
      target.scrollIntoView({block:'center',behavior:'instant'})
      // Offscreen Markdown expands after the first scroll. Recenter against its painted dimensions.
      frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
        const field=writable?target.querySelector<HTMLElement>('[data-block-content][contenteditable]'):null
        focusResult(field?.closest('[data-block-id]')===target?field:surface?.querySelector<HTMLElement>(headingSelector))
        target.scrollIntoView({block:'center',behavior:'instant'})
        finishCitation?.(undefined)
      })})
      return true
    }
    // Rivto can commit the block DOM after its runtime is ready.
    const observer=new MutationObserver(reveal)
    const timer=setTimeout(()=>{
      if(reveal())return
      const blocks=runtime.model.blocks
      let parent=block?blocks.getParentId(block):null
      let row:HTMLElement|null=null
      while(parent&&!row){
        row=writingBlock(parent)
        parent=blocks.getParentId(parent)
      }
      row?.scrollIntoView({block:'center',behavior:'instant'})
      const expand=writable&&row?row.querySelector<HTMLElement>('[data-collapse-toggle][aria-expanded=false]'):null
      focusResult(expand??surface.querySelector<HTMLElement>(headingSelector))
      if(block)report?.(row?'The linked block is hidden in this view. Showing the nearest visible parent.':'The linked block is unavailable in this view.')
      // Only a block missing from the hydrated document invalidates its deep link.
      finishCitation?.(block&&!blocks.hasBlock(block)?{id,surface:'page'}:undefined)
    },2000)
    if(!reveal())observer.observe(surface,{childList:true,subtree:true})
    return ()=>{observer.disconnect();clearTimeout(timer);cancelAnimationFrame(frame)}
  },[runtime,id,citationTarget,finishCitation,report,writable])
  const save=<div className="save-bar"><div className="save" role="status" title={status}>{status}</div>{runtime&&!writable&&<DocumentTextSelection model={runtime.model}/>}
    {runtime && writable && status!=='Saved' && <Button size="icon-sm" variant="ghost" title="Save now" aria-label="Save now" type="button" disabled={status==='Saving…'} onClick={()=>saveNow.current()}><Save/></Button>}</div>
  // Keep the application controls mounted when the asynchronous editor runtime becomes ready.
  return <>
    {view?.active&&<EditorAddress workspace={workspace} view={view} target={citationTarget} blocks={runtime?.model.blocks}/>}
    <span hidden ref={surfaceAnchor}/>{heading}{toolbar===undefined&&save}
    {runtime&&<MarkdownPluginsContext.Provider value={referencePlugins}><EditorPanel editor={runtime.reactEditor} mode={runtime.mode}>
      <Surface page={id} checkpoint={()=>checkpoint.current?.()??Promise.resolve()} toolbar={toolbar} writable={writable} save={save}/>
    </EditorPanel></MarkdownPluginsContext.Provider>}
  </>
}
