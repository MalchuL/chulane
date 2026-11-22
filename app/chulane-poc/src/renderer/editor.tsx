/** One mounted page owns one hydrated Rivto runtime. Compare-and-swap saves merge competing Yjs states. */
import React,{useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {FileText,LayoutDashboard,Save} from 'lucide-react'
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import {createDocumentEditor,ModeManager} from '@chulane/rivto'
import {
  EditorPanel,PageSurface,EdgelessSurface,createReactEditor,useEditorMode,standardPreset,edgelessPreset,
  bentoExtension,columnsExtension,kanbanExtension,tableExtension,todoItemExtension,pageDragExtension
} from '@chulane/rivto-react'
import '@chulane/rivto-react/styles.css'
import {Button,ToggleGroup,ToggleGroupItem} from './ui'
import {mountPluginBlocks} from './plugin-blocks'
import {InlineTagSurface} from './inline-tags'
import type {CitationTarget} from '../shared/agent'
import {blockLinkExtension} from './block-links'
import {initialJournalState} from '../shared/journal-state'
import {documentOutbox,localJournalDay,writingText} from './document-outbox'
import {pageFiles} from './page-files'
import {request} from './api'
const AUTOSAVE_DELAY_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 500

import type {ApplyInEditor} from './agent'
/** Navigation accepts a durable device copy. Explicit sync requires a server acknowledgement. */
export type Checkpoint=(destination?:'device'|'server')=>Promise<void>
type EditorProps={installation?:string;onFileAdded?:()=>void;citationTarget?:CitationTarget;finishCitation?:(value:undefined)=>void;report?:(message:string)=>void;title:string;replica?:string;workspace:number;toolbar:HTMLDivElement|null;applyInEditor:React.RefObject<ApplyInEditor|null>;heading:React.ReactNode;id:number;writable:boolean;checkpoint:React.RefObject<Checkpoint|null>;onSaved:(text:string)=>void;initialText?:string}
function Surface({writable,heading,save,toolbar,page,checkpoint}:{page:number;checkpoint:()=>Promise<void>;toolbar:HTMLDivElement|null;writable:boolean;heading:React.ReactNode;save:React.ReactNode}){
  const {mode,setMode}=useEditorMode()
  return <>{toolbar&&createPortal(<div className="editor-controls"><ToggleGroup className="surface-tabs" type="single" size="sm" value={mode} aria-label="Document view" onValueChange={next=>{if(next==='block'||next==='edgeless')setMode(next)}}><ToggleGroupItem value="block" aria-label="Page" title="Page view"><FileText/></ToggleGroupItem><ToggleGroupItem value="edgeless" aria-label="Canvas" title="Canvas view"><LayoutDashboard/></ToggleGroupItem></ToggleGroup>{save}</div>,toolbar)}{heading}{!toolbar&&save}<InlineTagSurface page={page} writable={writable} checkpoint={checkpoint}>{mode==='block'?<PageSurface/>:<EdgelessSurface/>}</InlineTagSurface></>
}
export function Editor({installation,onFileAdded,citationTarget,finishCitation,report,title,replica,toolbar,heading,id,workspace,writable,checkpoint,applyInEditor,onSaved,initialText}:EditorProps){
  const [runtime,setRuntime]=useState<any>(),[status,setStatus]=useState('Opening…')
  const currentTitle=useRef(title);currentTitle.current=title
  const saveNow=useRef<()=>void>(()=>{})
  useEffect(()=>{
    const doc=new Y.Doc(),path='pages/'+id+'/state?workspace='+workspace
    let releaseBlocks:(()=>void)|undefined
    let reviewing=false
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
    async function sync(){
      if(disposed||busy||reviewing)return
      busy=true
      try {
        if(replica&&writable&&!outbox){
          outbox=await documentOutbox(replica,id)
          if(disposed)return
          receipts=outbox.recovered.map(({writer,version})=>({writer,version}))
        }
        // The date is the only identity available before reconnect. Recover its writers through the normal outbox.
        const response=localDay?new Response(rev===0?null:initialJournalState(localDay) as BodyInit,{
          status:rev===0?204:200,headers:{'X-Chulane-Offline':'1','X-Revision':'0'}
        }):await request(path+'&since='+rev,{headers:replicaHeaders})
        if(disposed)return
        if(response.status!==204){
          const bytes=new Uint8Array(await response.arrayBuffer())
          if(disposed)return
          remote=true;try{if(bytes.length)Y.applyUpdate(doc,bytes)}finally{remote=false}
          rev=Number(response.headers.get('X-Revision'))
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
            blockLinkExtension,pageDragExtension(),...edgelessPreset()
          ]})
          releaseBlocks=mountPluginBlocks(reactEditor,message=>report?.(message))
          doc.on('update',()=>{if(writable&&!remote){dirty=true;unpublished=true;queueBackup();window.addEventListener('beforeunload',unload);setStatus('Unsaved changes')}})
          if(!rev && (writable||initialText) && !editor.dump().blocks.length)
            editor.blocks.insertBlock({...reactEditor.defaultWritingBlockFactory.createEmptyBlock(),content:initialText||''})
          setRuntime({reactEditor,mode:new ModeManager('block')})
        }
        if(response.headers.has('X-Chulane-Offline')){
          if(dirty)throw new TypeError('Server offline')
          setStatus(writable?'Available offline':'Read only · offline')
          return
        }
        if(unpublished || saveDue){
          const persist=saveDue
          if(persist)setStatus('Saving…')
          const plain=persist?writingText(editor.dump().blocks):'',text=new TextEncoder().encode(plain)
          const sentVersion=version
          unpublished=false
          try{
            const ack=await (await request(persist?path:path+'&live',{method:'PUT',headers:{...replicaHeaders,'If-Match':String(rev),'X-Text-Bytes':String(text.length)},body:new Blob([text,Y.encodeStateAsUpdate(doc) as BlobPart])})).json()
            rev=ack.rev
            if(persist&&outbox){
              acknowledged=Math.max(acknowledged,sentVersion)
              await outbox.acknowledge([...receipts,{writer:outbox.writer,version:sentVersion}])
              receipts=[]
            }
            if(persist){dirty=unpublished;saveDue=dirty;if(!disposed)onSaved(plain)
              if(!dirty){saved?.();pending=undefined;saved=undefined;failed=undefined}}
          }catch(error){unpublished=true;throw error}
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
      finally{busy=false}
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
      if(reviewing)throw Error('An edit is being applied')
      reviewing=true
      try{
        while(busy&&!disposed)await new Promise(done=>setTimeout(done,10))
        if(disposed||!model)throw Error('The destination editor is unavailable. Reopen the page and try again.')
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
      }finally{reviewing=false}
    }
    void sync()
    const poll=setInterval(sync,POLL_INTERVAL_MS)
    const autosave=setTimeout(()=>saveNow.current(),AUTOSAVE_DELAY_MS)
    return ()=>{disposed=true;clearTimeout(timer);void backup()?.catch(()=>{});applyInEditor.current=null;checkpoint.current=null;failed?.(new Error('Page closed'));clearInterval(poll);clearTimeout(autosave);saveNow.current=()=>{};window.removeEventListener('beforeunload',unload);releaseBlocks?.();reactEditor?.destroy();if(editor)void editor.destroy().finally(()=>model.destroy());else doc.destroy()}
  },[id,workspace,writable,replica,installation])
  useEffect(()=>{
    if(!runtime||!citationTarget)return
    const surface=document.querySelector('[data-source-page="'+id+'"]')
    if(!surface)return
    if(citationTarget.surface==='canvas'){
      runtime.mode.set('edgeless')
      finishCitation?.(undefined)
      return
    }
    if(!citationTarget.block)return
    // A block citation points into the writing outline. Canvas cards may render another copy of the block.
    runtime.mode.set('block')
    const selector='.page-surface [data-block-id="'+CSS.escape(citationTarget.block)+'"]'
    let frame=0
    function reveal(){
      const target=surface?.querySelector(selector)
      if(!target)return false
      observer.disconnect()
      clearTimeout(timer)
      target.scrollIntoView({block:'center',behavior:'instant'})
      // Offscreen Markdown expands after the first scroll. Recenter against its painted dimensions.
      frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
        target.scrollIntoView({block:'center',behavior:'instant'})
        finishCitation?.(undefined)
      })})
      return true
    }
    // Rivto can commit the block DOM after its runtime is ready.
    const observer=new MutationObserver(reveal)
    const timer=setTimeout(()=>{
      if(!reveal()){report?.('The linked block is unavailable in this view.');finishCitation?.(undefined)}
    },2000)
    if(!reveal())observer.observe(surface,{childList:true,subtree:true})
    return ()=>{observer.disconnect();clearTimeout(timer);cancelAnimationFrame(frame)}
  },[runtime,id,citationTarget,finishCitation,report])
  const save=<div className="save-bar"><div className="save" role="status">{status}</div>{runtime && writable && status!=='Saved' && <Button size="icon-sm" variant="ghost" title="Save now" aria-label="Save now" type="button" disabled={status==='Saving…'} onClick={()=>saveNow.current()}><Save/></Button>}</div>
  return runtime?<EditorPanel editor={runtime.reactEditor} mode={runtime.mode}><Surface page={id} checkpoint={()=>checkpoint.current?.()??Promise.resolve()} toolbar={toolbar} writable={writable} heading={heading} save={save}/></EditorPanel>:<>{save}{heading}</>
}
