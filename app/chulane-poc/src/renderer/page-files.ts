/** Store Rivto file input in the owning page and resolve saved references through Chulane's authenticated file API. */
import type {ReactEditorExtension} from '@chulane/rivto-react'
import {fileExtension,type BinaryProvider} from '@chulane/rivto-react/extensions'
import {request} from './api'
import {attachmentFilename} from '../shared/attachment-filename'
import {downloadBlob} from './download'

/** Use the same upload and device-cache path for picker, paste and drop. */
export async function uploadPageFile(workspace:number,page:number,headers:Record<string,string>,name:string,body:Blob,signal?:AbortSignal){
  const response=await request('pages/'+page+'/files?workspace='+workspace+'&name='+encodeURIComponent(name),{method:'POST',headers,body,signal})
  return (await response.json()).id as number
}

type PageFilesOptions={workspace:number;page:number;installation?:string;writable:boolean;headers:Record<string,string>;added?:()=>void}

/** Bind one editor's input to its page. References survive host port changes and remain scoped to their original library. */
export function pageFiles({workspace,page,installation,writable,headers,added}:PageFilesOptions):ReactEditorExtension{
  const prefix='chulane-file:'+installation+'/'+workspace+'/'
  /** Resolve only files from this library through the owning page's authenticated endpoint. */
  function fetchFile(uri:string,signal:AbortSignal){
    const parts=installation&&uri.startsWith(prefix)&&/^([1-9]\d*)\/([1-9]\d*)$/.exec(uri.slice(prefix.length))
    if(!parts)throw Error('This file belongs to another workspace or installation.')
    return request('pages/'+parts[1]+'/files/'+parts[2]+'?workspace='+workspace,{headers,signal})
  }
  const provider:BinaryProvider={
    async write(content,{name,signal}){
      if(!writable)throw Error('Editor access required')
      if(!installation||page<1)throw Error('Connect to the workspace to attach a file.')
      const file=await uploadPageFile(workspace,page,headers,name,content,signal)
      added?.()
      return prefix+page+'/'+file
    },
    async read(uri,{signal}){
      if(!uri.startsWith('chulane-file:'))return
      return (await fetchFile(uri,signal)).blob()
    }
  }
  return {id:'chulane.page-files',setup(editor){
    // The pinned Rivto file handler also claims bare filesystem paths. Preserve text-only clipboard input.
    editor.events.register({id:'chulane.paste-path',type:'paste',capture:true},({raw,reactPanel})=>{
      const data=raw.clipboardData
      if(data?.types.length!==1||data.types[0]!=='text/plain')return false
      const text=data.getData('text/plain')
      if(!/^(?:\/|file:\/\/|[a-z]:[\\/])/i.test(text.trimStart()))return false
      const caret=reactPanel.selection.readDOM()
      if(caret)reactPanel.selection.set(caret)
      reactPanel.clipboard.paste({text,textTarget:caret??undefined,defaultBlockType:editor.defaultWritingBlockFactory.createEmptyBlock().type})
      reactPanel.selection.scheduleIfSelectionUnchanged(()=>reactPanel.selection.restoreDOM())
      return true
    })
    editor.extensions.install(fileExtension({provider}))
    editor.attachments.registerFileOpenHandler({id:'chulane.download',matches:ref=>ref.uri.startsWith('chulane-file:'),
      async open(reference,context){
        const response=await fetchFile(reference.uri,context.signal)
        const bytes=await response.blob()
        context.signal.throwIfAborted()
        downloadBlob(bytes,attachmentFilename(response)??reference.name)
      }})
  }}
}
