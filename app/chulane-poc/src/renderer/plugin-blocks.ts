/** Bind trusted desktop renderer modules to each mounted Rivto editor. The editor owns every block registration. */
import * as React from 'react'
import {BLOCK_TEXT_METADATA_KEY,MarkdownContent,useBlockNode,usePanel,type ReactEditorApi} from '@chulane/rivto-react'
import {json} from './api'

const rendererApi={React,MarkdownContent,useBlockNode,usePanel,BLOCK_TEXT_METADATA_KEY}
type Registration=Parameters<ReactEditorApi['blockTypes']['register']>[0]
export type PluginBlocks=(api:typeof rendererApi)=>Registration[]
declare global{interface Window{chulanePluginBlocks?:{subscribe(listener:(ids:string[])=>void):()=>void}}}

/** Install the latest enabled set. Ignore imports that resolve after removal or editor teardown. */
export function mountPluginBlocks(editor:ReactEditorApi,report:(message:string)=>void){
  const bridge=window.chulanePluginBlocks
  if(!bridge)return
  const installed=new Map<string,(()=>void)[]>()
  let disposed=false,received=false
  function release(id:string){
    const disposers=installed.get(id)??[]
    installed.delete(id)
    for(const dispose of disposers.reverse())dispose()
  }
  function reconcile(ids:string[]){
    if(disposed)return
    for(const id of installed.keys())if(!ids.includes(id))release(id)
    for(const id of ids){
      if(installed.has(id)||!/^[a-f0-9]{64}$/.test(id))continue
      const disposers:(()=>void)[]=[]
      installed.set(id,disposers)
      const url='/api/desktop/renderers/'+id+'.mjs'
      void import(/* @vite-ignore */ url).then(({default:blocks}:{default:PluginBlocks})=>{
        if(installed.get(id)!==disposers)return
        for(const registration of blocks(rendererApi))disposers.push(editor.blockTypes.register(registration))
      }).catch(error=>{
        if(installed.get(id)!==disposers)return
        release(id);report('Plugin blocks could not load: '+error.message)
      })
    }
  }
  const unsubscribe=bridge.subscribe(ids=>{received=true;reconcile(ids)})
  void json('desktop/renderers').then(ids=>{if(!received)reconcile(ids)}).catch(error=>{if(!disposed&&!received)report(error.message)})
  return ()=>{disposed=true;unsubscribe();for(const id of installed.keys())release(id)}
}
