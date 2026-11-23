/** Expose preview links to readers while keeping the surrounding Rivto editing controls inert. */
import {useLayoutEffect,useRef} from 'react'

const previewLink='.markdown-preview a[href]'
const interactive='[contenteditable], [tabindex], button, input, textarea, select, a[href], [draggable=true]'

/** Apply native inertness to controls as the collaborative surface mounts and replaces blocks. */
export function useReadOnlyLinks(writable:boolean){
  const surface=useRef<HTMLDivElement>(null)
  useLayoutEffect(()=>{
    const root=surface.current
    if(writable||!root)return
    const owned=new WeakSet<HTMLElement>()
    function protect(){
      for(const el of root!.querySelectorAll<HTMLElement>(interactive)){
        if(el.matches(previewLink)){el.tabIndex=0;continue}
        // An editor focus container can also contain readable links.
        if(el.querySelector(previewLink)){if(el.tabIndex>=0)el.tabIndex=-1;if(owned.delete(el))el.inert=false}
        else if(!el.inert){el.inert=true;owned.add(el)}
      }
    }
    protect()
    const observer=new MutationObserver(protect)
    observer.observe(root,{childList:true,subtree:true})
    // Editor pointer and keyboard shortcuts are also delegated on non-focusable ancestors.
    function guard(event:Event){
      event.stopPropagation()
      if(event.type==='beforeinput'||event.type==='drop'||event.type==='dragstart')event.preventDefault()
    }
    const events=['pointerdown','mousedown','touchstart','click','dblclick','keydown','keyup','beforeinput','paste','cut','dragstart','drop','contextmenu']
    for(const type of events)root.addEventListener(type,guard,true)
    return ()=>{observer.disconnect();for(const type of events)root.removeEventListener(type,guard,true)}
  },[writable])
  return surface
}
