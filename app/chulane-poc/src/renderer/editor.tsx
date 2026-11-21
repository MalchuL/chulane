/** One mounted page owns one hydrated Rivto runtime. Compare-and-swap saves merge competing Yjs states. */
import React,{useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {FileText,LayoutDashboard,Save} from 'lucide-react'
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import {createDocumentEditor,ModeManager} from '@chulane/rivto'
import {EditorPanel,PageSurface,EdgelessSurface,createReactEditor,standardPreset,pageDragExtension,edgelessPreset,useEditorMode} from '@chulane/rivto-react'
import '@chulane/rivto-react/styles.css'
import {Button,ToggleGroup,ToggleGroupItem} from './ui'
import {blockLinkExtension} from './block-links'
import {request} from './api'
const AUTOSAVE_DELAY_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 500

import type {ApplyInEditor} from './agent'
type EditorProps={toolbar:HTMLDivElement|null;applyInEditor:React.RefObject<ApplyInEditor|null>;heading:React.ReactNode;id:number;writable:boolean;checkpoint:React.RefObject<(()=>Promise<void>)|null>;onSaved:(text:string)=>void;initialText?:string}
function Surface({writable,heading,save,toolbar}:{toolbar:HTMLDivElement|null;writable:boolean;heading:React.ReactNode;save:React.ReactNode}){
  const {mode,setMode}=useEditorMode()
  return <>{toolbar&&createPortal(<div className="editor-controls"><ToggleGroup className="surface-tabs" type="single" size="sm" value={mode} aria-label="Document view" onValueChange={next=>{if(next==='block'||next==='edgeless')setMode(next)}}><ToggleGroupItem value="block" aria-label="Page" title="Page view"><FileText/></ToggleGroupItem><ToggleGroupItem value="edgeless" aria-label="Canvas" title="Canvas view"><LayoutDashboard/></ToggleGroupItem></ToggleGroup>{save}</div>,toolbar)}{heading}<div className="surface-body" inert={!writable}>{mode==='block'?<PageSurface/>:<EdgelessSurface/>}</div></>
}
export function Editor({toolbar,heading,id,writable,checkpoint,applyInEditor,onSaved,initialText}:EditorProps){
  const [runtime,setRuntime]=useState<any>(),[status,setStatus]=useState('Opening…')
  const saveNow=useRef<()=>void>(()=>{})
  useEffect(()=>{
    const doc=new Y.Doc(),path='pages/'+id+'/state'
    let reviewing=false
    const adapter=new YjsDoc(String(id),doc)
    let disposed=false,busy=false,dirty=false,unpublished=false,saveDue=false,rev=-1,remote=false,editor:any,model:any,reactEditor:any
    // All callers waiting to leave share the checkpoint, including edits typed during its PUT.
    let pending:Promise<void>|undefined, saved:(()=>void)|undefined, failed:((error:unknown)=>void)|undefined
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    async function sync(){
      if(disposed||busy||reviewing)return
      busy=true
      try {
        const response=await request(path+'?since='+rev)
        if(disposed)return
        if(response.status!==204){
          const bytes=new Uint8Array(await response.arrayBuffer())
          if(disposed)return
          remote=true;try{if(bytes.length)Y.applyUpdate(doc,bytes)}finally{remote=false}
          rev=Number(response.headers.get('X-Revision'))
        }
        if(!editor){
          model=new DocumentModelImpl(adapter)
          editor=createDocumentEditor({document:model})
          reactEditor=createReactEditor({editor,extensions:[standardPreset(),blockLinkExtension,pageDragExtension(),...edgelessPreset()]})
          doc.on('update',()=>{if(writable&&!remote){dirty=true;unpublished=true;window.addEventListener('beforeunload',unload);setStatus('Unsaved changes')}})
          if(!rev && (writable||initialText) && !editor.dump().blocks.length)
            editor.blocks.insertBlock({...reactEditor.defaultWritingBlockFactory.createEmptyBlock(),content:initialText||''})
          setRuntime({reactEditor,mode:new ModeManager('block')})
        }
        if(unpublished || saveDue){
          const persist=saveDue
          if(persist)setStatus('Saving…')
          const parts:string[]=[]
          function walk(list:any[]){for(const b of list){if(typeof b.content==='string')parts.push(b.content);if(Array.isArray(b.children))walk(b.children)}}
          if(persist)walk(editor.dump().blocks)
          const plain=parts.join('\n'),text=new TextEncoder().encode(plain)
          unpublished=false
          try{
            const ack=await (await request(persist?path:path+'?live',{method:'PUT',headers:{'If-Match':String(rev),'X-Text-Bytes':String(text.length)},body:new Blob([text,Y.encodeStateAsUpdate(doc) as BlobPart])})).json()
            rev=ack.rev
            if(persist){dirty=unpublished;saveDue=dirty&&!!pending;if(!disposed)onSaved(plain)
              if(!dirty){saved?.();pending=undefined;saved=undefined;failed=undefined}}
          }catch(error){unpublished=true;throw error}
        }
        if(!disposed){if(!dirty)window.removeEventListener('beforeunload',unload);setStatus(!writable?'Read only':dirty||rev<0?'Unsaved changes':'Saved')}
      }catch(error:any){if(error.status!==409){failed?.(error);pending=undefined;saved=undefined;failed=undefined}if(!disposed)setStatus(error.status===409?'Merging changes…':error.message+' · retrying')}
      finally{busy=false}
    }
    // A busy poll picks up the requested save; conflicts and failures leave it due for retry.
    saveNow.current=()=>{if(writable && (dirty || (rev<0 && editor))){saveDue=true;void sync()}}
    checkpoint.current=()=>{
      if(!writable||(!dirty&&!saveDue)||!editor)return Promise.resolve()
      pending??=new Promise<void>((resolve,reject)=>{saved=resolve;failed=reject})
      const result=pending
      saveNow.current()
      return result
    }
    applyInEditor.current=async commit=>{
      if(reviewing)throw Error('An edit is being applied')
      reviewing=true
      try{
        while(busy&&!disposed)await new Promise(done=>setTimeout(done,10))
        if(disposed)throw Error('Page closed')
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
    return ()=>{disposed=true;applyInEditor.current=null;checkpoint.current=null;failed?.(new Error('Page closed'));clearInterval(poll);clearTimeout(autosave);saveNow.current=()=>{};window.removeEventListener('beforeunload',unload);reactEditor?.destroy();if(editor)void editor.destroy().finally(()=>model.destroy());else doc.destroy()}
  },[id,writable])
  useEffect(()=>{
    const link=new URLSearchParams(location.search),block=link.get('block')
    if(runtime && block && Number(link.get('page'))===id)
      document.querySelector('[data-block-id="'+CSS.escape(block)+'"]')?.scrollIntoView({block:'center'})
  },[runtime,id])
  const save=<div className="save-bar"><div className="save" role="status">{status}</div>{runtime && writable && status!=='Saved' && <Button size="icon-sm" variant="ghost" title="Save now" aria-label="Save now" type="button" disabled={status==='Saving…'} onClick={()=>saveNow.current()}><Save/></Button>}</div>
  return runtime?<EditorPanel editor={runtime.reactEditor} mode={runtime.mode}><Surface toolbar={toolbar} writable={writable} heading={heading} save={save}/></EditorPanel>:<>{save}{heading}</>
}
