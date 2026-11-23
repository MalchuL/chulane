/** Bound browser text selections to the shell property or editor pane in which they start. */
const shellSelector='.app,.login,[data-app-overlay]'

/** Descendants inherit the copyable text style from the property that owns their value. */
function propertyRoot(element:Element){
  while(element.parentElement&&getComputedStyle(element.parentElement).userSelect==='text')element=element.parentElement
  return element
}

/** Install shell interaction handlers and return their shared teardown for both application hosts. */
export function installShellSelection(){
  /** Keep Select All in the active text surface. Dock and navigation commands have no document text. */
  function selectText(event:KeyboardEvent){
    if(event.defaultPrevented||event.key.toLowerCase()!=='a'||!(event.metaKey||event.ctrlKey)||event.altKey||event.shiftKey)return
    const target=event.target
    if(!(target instanceof HTMLElement)||target.isContentEditable||target.closest('input,textarea,select'))return
    const selection=window.getSelection()
    if(!selection)return
    // Rivto gets the first chance to handle its own selection. Contain the browser fallback in this pane.
    const surface=target.closest('.surface-body')
    if(surface){event.preventDefault();selection.selectAllChildren(surface);return}
    const anchor=selection.anchorNode
    const element=anchor instanceof Element?anchor:anchor?.parentElement
    let scope:Element|null=element&&(target===document.body||target.contains(element)||element.contains(target))?element:target
    if(!scope.closest(shellSelector)&&target!==document.body)return
    event.preventDefault()
    // CSS owns the list of copyable properties, including those rendered in portals.
    if(getComputedStyle(scope).userSelect!=='text')scope=target
    if(getComputedStyle(scope).userSelect!=='text')return
    scope=propertyRoot(scope)
    selection.selectAllChildren(scope)
  }
  let boundary:Element|null=null
  let editorGesture=false
  let startX=0,startY=0,suppressClick=false
  /** Keep native ranges within the originating editor pane or copyable shell property. */
  function beginSelection(event:PointerEvent){
    boundary=null
    suppressClick=false
    const target=event.target
    if(event.button!==0||!(target instanceof Element)||!target.closest(shellSelector)||target.closest('input,textarea,select'))return
    const surface=target.closest('.surface-body')
    editorGesture=!!surface
    if(!surface&&(target.closest('[contenteditable]')||getComputedStyle(target).userSelect!=='text'))return
    // Shift-click normally extends a browser range across anchors and activates the second button.
    // Keep a shell property selection in its original value, including when both rows are links.
    const anchor=window.getSelection()?.anchorNode
    const origin=anchor instanceof Element?anchor:anchor?.parentElement
    if(event.shiftKey&&!surface&&origin?.closest(shellSelector)&&getComputedStyle(origin).userSelect==='text'&&
      !origin.closest('.surface-body')&&!propertyRoot(origin).contains(target)){
      event.preventDefault()
      suppressClick=true
      return
    }
    startX=event.clientX;startY=event.clientY
    boundary=surface??propertyRoot(target)
  }
  /** Browsers allow a range to cross nonselectable ancestors into a second selectable label. */
  function containSelection(){
    const selection=window.getSelection()
    if(!selection?.anchorNode||!selection.focusNode||selection.isCollapsed)return
    const anchor=selection.anchorNode
    let scope=boundary
    // Keyboard and touch selection handles can extend a range after the pointer gesture ends.
    if(!scope){
      const origin=anchor instanceof Element?anchor:anchor.parentElement
      if(!origin?.closest(shellSelector)||origin.contains(selection.focusNode))return
      scope=origin.closest('.surface-body')
      if(!scope&&getComputedStyle(origin).userSelect==='text')scope=propertyRoot(origin)
    }
    if(!scope||!scope.contains(anchor)||scope.contains(selection.focusNode))return
    const before=scope.compareDocumentPosition(selection.focusNode)&Node.DOCUMENT_POSITION_PRECEDING
    selection.extend(scope,before?0:scope.childNodes.length)
  }
  /** Clamp the final range before releasing the gesture. */
  function endSelection(event:PointerEvent){
    containSelection()
    const selection=window.getSelection()
    suppressClick=suppressClick||!editorGesture&&!!boundary&&!!selection&&!selection.isCollapsed&&boundary.contains(selection.anchorNode)&&
      Math.hypot(event.clientX-startX,event.clientY-startY)>3
    boundary=null
  }
  /** Firefox can dispatch a navigation click after a text drag inside a button. */
  function finishClick(event:MouseEvent){
    if(suppressClick&&event.detail>0){event.preventDefault();event.stopPropagation()}
    suppressClick=false
  }
  const listeners=new AbortController()
  const {signal}=listeners
  document.addEventListener('keydown',selectText,{signal})
  document.addEventListener('click',finishClick,{capture:true,signal})
  document.addEventListener('pointerdown',beginSelection,{capture:true,signal})
  document.addEventListener('selectionchange',containSelection,{signal})
  window.addEventListener('pointerup',endSelection,{capture:true,signal})
  window.addEventListener('pointercancel',endSelection,{capture:true,signal})
  return ()=>listeners.abort()
}
