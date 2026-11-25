/** Resize a shell sidebar without rerendering the editor during pointer movement. */
import {useLayoutEffect,useRef} from 'react'

import {sidebarLimits,validSidebarWidth,type SidebarSide} from '../shared/sidebar-widths'

/** Apply desktop sizes before mounting the shell so the first editor layout uses the saved widths. */
export async function restoreDesktopSidebarWidths(){
  const widths=await window.chulaneSidebarWidths?.read()
  for(const side of ['library','agent'] as const){
    const width=widths?.[side]
    if(validSidebarWidth(side,width))document.documentElement.style.setProperty('--'+side+'-width',width+'px')
  }
}

/** Restore device widths and expose the vertical separator to keyboard and pointer input. */
export function SidebarHandle({side,report}:{side:SidebarSide;report:(message:string)=>void}){
  const handle=useRef<HTMLDivElement>(null)
  const drag=useRef<{pointerId:number;x:number;width:number;preference:string}|undefined>(undefined)
  const library=side==='library',{minimum,maximum}=sidebarLimits[side]
  const key='chulane.sidebar.'+side
  const property='--'+side+'-width'
  function width(){return handle.current!.parentElement!.getBoundingClientRect().width}
  function resize(requested:number){
    const value=Math.round(Math.max(minimum,Math.min(maximum,requested)))
    document.documentElement.style.setProperty(property,value+'px')
  }
  /** Commit once at the end of a pointer gesture or keyboard adjustment. */
  async function save(){
    const value=Math.round(width())
    if(!validSidebarWidth(side,value))return
    resize(value)
    try{
      if(window.chulaneSidebarWidths)await window.chulaneSidebarWidths.save(side,value)
      else localStorage.setItem(key,String(value))
    }catch{report('Could not remember the sidebar width on this device.')}
  }
  /** A responsive cap can hide the preferred desktop width. Only commit a visible adjustment. */
  function commit(previous:number,preference:string){
    if(width()===previous)document.documentElement.style.setProperty(property,preference)
    else void save()
  }
  /** Restore the pre-drag preference, including a desktop width currently capped by the viewport. */
  function cancelDrag(){
    const gesture=drag.current
    if(!gesture)return
    drag.current=undefined
    handle.current?.removeAttribute('data-resizing-sidebar')
    document.documentElement.style.setProperty(property,gesture.preference)
  }
  useLayoutEffect(()=>{
    if(!window.chulaneSidebarWidths){
      try{
        const stored=Number(localStorage.getItem(key))
        if(validSidebarWidth(side,stored))resize(stored)
      }catch{/* Storage can be disabled in a browser. The sidebar still resizes. */}
    }
    const observer=new ResizeObserver(()=>handle.current?.setAttribute('aria-valuenow',String(Math.round(width()))))
    observer.observe(handle.current!.parentElement!)
    // The editor retains focus while its divider is dragged, so Escape can originate outside the handle.
    function escape(event:KeyboardEvent){
      if(event.key==='Escape'&&drag.current){
        event.preventDefault();event.stopPropagation();cancelDrag()
      }
    }
    window.addEventListener('keydown',escape,true)
    return ()=>{window.removeEventListener('keydown',escape,true);observer.disconnect();cancelDrag()}
  },[key])
  return <div ref={handle} data-part="sidebar-handle" data-side={side} role="separator" tabIndex={0}
    title="Drag to resize. Escape cancels the drag. Use the left and right arrow keys to resize with the keyboard."
    aria-controls={library?'library-navigation':'workspace-agent'} aria-description="Use the left and right arrow keys to resize."
    aria-label={'Resize '+side+' sidebar'} aria-orientation="vertical" aria-valuemin={minimum} aria-valuemax={maximum}
    onPointerDown={e=>{
      if(e.button!==0||!e.isPrimary||drag.current)return
      e.preventDefault()
      drag.current={pointerId:e.pointerId,x:e.clientX,width:width(),preference:document.documentElement.style.getPropertyValue(property)}
      e.currentTarget.setPointerCapture(e.pointerId)
    }}
    onPointerMove={e=>{
      const gesture=drag.current
      if(gesture?.pointerId!==e.pointerId)return
      e.currentTarget.toggleAttribute('data-resizing-sidebar',true)
      resize(gesture.width+(e.clientX-gesture.x)*(library?1:-1))
    }}
    onPointerUp={e=>{
      const gesture=drag.current
      if(gesture?.pointerId!==e.pointerId)return
      drag.current=undefined
      e.currentTarget.removeAttribute('data-resizing-sidebar')
      commit(gesture.width,gesture.preference)
    }}
    onPointerCancel={e=>{if(drag.current?.pointerId===e.pointerId)cancelDrag()}}
    onLostPointerCapture={e=>{if(drag.current?.pointerId===e.pointerId)cancelDrag()}}
    onKeyDown={e=>{
      const step=(e.shiftKey?48:12)*(library?1:-1)
      const next={ArrowLeft:width()-step,ArrowRight:width()+step,Home:minimum,End:maximum}[e.key]
      if(next===undefined)return
      e.preventDefault()
      const previous=width(),preference=document.documentElement.style.getPropertyValue(property)
      resize(next)
      commit(previous,preference)
    }}/>
}
