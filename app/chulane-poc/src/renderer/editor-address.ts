/** Reflect active editor navigation and synchronized block removal in the current browser history entry. */
import {useEffect} from 'react'
import type {DocumentModelImpl} from '@chulane/document-model'
import type {DocumentTarget} from '../shared/agent'
import {referenceTarget} from '../shared/inline-page-links'
import type {ViewHandle} from './editor-dock'

/** Keyboard activation carries a focus request only for this navigation in this window. */
export type EditorTarget=DocumentTarget & {focusResult?:boolean}
type EditorAddressProps={workspace:number;project?:number;journal?:boolean;view?:ViewHandle;target?:EditorTarget;blocks?:Pick<DocumentModelImpl['blocks'],'hasBlock'|'subscribeBlockNode'>}
/** Handle only document navigation on this host, route and workspace. Other links keep their native action. */
export function editorLinkTarget(anchor:HTMLAnchorElement,workspace:number){
  return referenceTarget(anchor.href,workspace,location.origin)
}

/** Reflect the active pane in the current history entry. A citation takes precedence while its surface is mounting. */
export function EditorAddress({workspace,project,journal,view,target,blocks}:EditorAddressProps){
  useEffect(()=>{
    if(view&&target)view.addressBlock=target.block
    function sync(){
      if(view&&!view.active)return
      const url=new URL(location.href),params=url.searchParams
      if(project!==undefined&&!view){
        params.set('workspace',String(workspace));params.set('project',String(project))
      }else params.delete('project')
      if(view){
        const canvas=!target?.block&&(target?.surface?target.surface==='canvas':view.mode.get()==='edgeless')
        if(canvas||(!target&&view.addressBlock&&blocks&&!blocks.hasBlock(view.addressBlock)))view.addressBlock=undefined
        if(view.addressBlock)params.set('block',view.addressBlock)
        else params.delete('block')
        if(view.addressBlock)params.delete('view');else params.set('view',canvas?'canvas':'page')
        params.set('workspace',String(workspace));params.set('page',String(view.page))
      }else{
        params.delete('page');params.delete('block')
        if(journal){params.set('workspace',String(workspace));params.set('view','journal')}else params.delete('view')
      }
      if(url.href!==location.href)history.replaceState(history.state,'',url)
    }
    sync()
    const unsubscribeMode=view?.mode.subscribe(sync)
    // Initial citation navigation owns its missing-block feedback. Track it once that navigation settles.
    const block=view?.addressBlock
    const unsubscribeBlock=block&&blocks&&!target?blocks.subscribeBlockNode(block,()=>{
      if(!blocks.hasBlock(block))sync()
    }):undefined
    return ()=>{unsubscribeBlock?.();unsubscribeMode?.()}
  },[workspace,project,journal,view,target,blocks])
  return null
}
