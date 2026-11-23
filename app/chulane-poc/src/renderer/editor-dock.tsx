/** Dockview owns tab order, nested splits and resize handles. The workspace supplies page data and editor commands. */
import {createContext,useContext,useCallback,useSyncExternalStore,useLayoutEffect,useRef,useState,type KeyboardEvent,type ReactNode,type RefObject} from 'react'
import {flushSync} from 'react-dom'
import {ModeManager} from '@chulane/rivto'
import {Check,Columns2,MoveHorizontal,Rows2,Scaling} from 'lucide-react'
import {DockviewDefaultTab,DockviewReact,themeLight,type DockviewApi,type SerializedDockview,type IDockviewHeaderActionsProps,type IDockviewPanelHeaderProps,type IDockviewPanelProps} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import type {Page} from '../shared/library'
import {OpenTabs} from './open-tabs'
import type {ApplyInEditor} from './agent'
import type {Checkpoint} from './editor'
import {Button,DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,Input,Popover,PopoverContent,PopoverTrigger} from './ui'

export type ViewHandle={mode:ModeManager;page:number;addressBlock?:string;active:boolean;checkpoint:RefObject<Checkpoint|null>;apply:RefObject<ApplyInEditor|null>}
export type DockTarget=number|'journal'
type DockProps={
  layoutKey:string;pages:Page[];pageLabel:(page:Page)=>string;selected?:DockTarget;select:(page?:DockTarget)=>void
  surfaceChanged:(surface:'canvas'|'page')=>void;closed:()=>void;focusLibrary:()=>void;handles:Map<string,ViewHandle>;report:(message:string)=>void
  renderJournal:(panel:string,active:boolean)=>ReactNode;saveJournal:(panel:string)=>Promise<void>
  render:(page:Page,active:boolean,handle:ViewHandle)=>ReactNode
}
const Context=createContext<(DockProps&{active?:string;closeTab:(id:string)=>void})|null>(null)
const dockClass='editor-dock'
let nextView=0
/** Restored panels retain their IDs so each group can select the same tab after reload. */
function allocateViewId(api:DockviewApi){
  let id:string
  do{id='view-'+ ++nextView}while(api.getPanel(id))
  return id
}

/** Identify canvas views of a document in the tab strip and group menus. */
function tabTitle(title:string,mode:unknown){
  return mode==='edgeless'?title+' · Canvas':title
}

/** Rebuild titles from the authorized catalog, dropping stale tabs before the editor is rendered. */
function restoreLayout(api:DockviewApi,{layoutKey,pages,pageLabel}:Pick<DockProps,'layoutKey'|'pages'|'pageLabel'>){
  try{
    const saved=sessionStorage.getItem(layoutKey)
    if(!saved)return
    const {grid,panels,activeGroup}=JSON.parse(saved) as SerializedDockview
    for(const [id,panel] of Object.entries(panels)){
      if(panel.contentComponent==='journal'&&panel.params?.page==='journal'){
        panels[id]={id,contentComponent:'journal',params:{page:'journal'},title:'Journal'}
        continue
      }
      const page=pages.find(item=>item.id===panel.params?.page&&!item.deleted)
      const mode=panel.params?.mode==='edgeless'?'edgeless':'block'
      panels[id]={id,contentComponent:'document',params:{page:page?.id,mode},title:page&&tabTitle(pageLabel(page),mode)}
    }
    api.fromJSON({grid,panels,activeGroup})
    for(const panel of api.panels)if(!panel.params?.page)panel.api.close()
  }catch{
    // A disabled storage area or an obsolete grid should still allow opening the requested page.
    api.clear()
  }
}
// Dockview relayouts the grid when its options change. Keep this override stable during catalog refreshes.
const tabMenuItems=():[]=>[]

/** Keep each view's save and approval callbacks attached to that view throughout tab moves. */
function DocumentPane({api,params}:IDockviewPanelProps){
  const ctx=useContext(Context)!
  const [handle]=useState<ViewHandle>(()=>({mode:new ModeManager(params.mode),page:params.page,active:false,checkpoint:{current:null},apply:{current:null}}))
  const page=ctx.pages.find(item=>item.id===params.page&&!item.deleted)
  const label=page&&ctx.pageLabel(page)
  useLayoutEffect(()=>{
    ctx.handles.set(api.id,handle)
    // Toolbar switches and citation navigation both change Rivto's local mode.
    const unsubscribe=handle.mode.subscribe(()=>{
      const mode=handle.mode.get()
      api.updateParameters({page:handle.page,mode})
      if(label!==undefined)api.setTitle(tabTitle(label,mode))
    })
    return ()=>{unsubscribe();ctx.handles.delete(api.id)}
  },[api,ctx.handles,handle,label])
  handle.active=ctx.active===api.id&&ctx.selected===params.page
  useLayoutEffect(()=>{
    if(!handle.active)return
    const publish=()=>ctx.surfaceChanged(handle.mode.get()==='edgeless'?'canvas':'page')
    publish()
    return handle.mode.subscribe(publish)
  },[handle,handle.active,ctx.surfaceChanged])
  return page?ctx.render(page,handle.active,handle):null
}
// A journal tab keeps the dated stack together as Dockview moves or splits the group.
function JournalPane({api}:IDockviewPanelProps){
  const ctx=useContext(Context)!
  return ctx.renderJournal(api.id,ctx.selected==='journal'&&ctx.active===api.id)
}
const components={document:DocumentPane,journal:JournalPane}

/** Route button and middle-click dismissal through the document checkpoint. */
function DocumentTab(props:IDockviewPanelHeaderProps){
  const {closeTab}=useContext(Context)!
  return <DockviewDefaultTab {...props} closeActionOverride={()=>closeTab(props.api.id)}/>
}

/** Offer precise keyboard sizing while Dockview enforces the nested grid's layout constraints. */
function ResizeGroup({api,containerApi,group}:IDockviewHeaderActionsProps){
  const [open,setOpen]=useState(false)
  const subscribe=useCallback((notify:()=>void)=>{
    const subscription=containerApi.onDidLayoutChange(notify)
    return ()=>subscription.dispose()
  },[containerApi])
  const split=useSyncExternalStore(subscribe,()=>containerApi.groups.length>1)
  if(!split)return null
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Resize editor group" title="Resize editor group"><Scaling/></Button></PopoverTrigger>
    <PopoverContent align="end" aria-label="Resize editor group">
      <form data-part="group-size" onSubmit={event=>{
        event.preventDefault()
        const data=new FormData(event.currentTarget)
        api.setSize({
          width:data.has('width')?Number(data.get('width')):undefined,
          height:data.has('height')?Number(data.get('height')):undefined
        })
        setOpen(false)
      }}>
        {(['width','height'] as const).map(axis=>api[axis]<containerApi[axis]&&<label key={axis}>
          {axis==='width'?'Width (px)':'Height (px)'}
          <Input type="number" name={axis} required step="1" min={Math.ceil(axis==='width'?group.minimumWidth:group.minimumHeight)}
            max={containerApi[axis]} defaultValue={Math.round(api[axis])}/>
        </label>)}
        <Button type="submit" size="icon-sm" aria-label="Apply size" title="Apply size"><Check/></Button>
      </form>
    </PopoverContent>
  </Popover>
}

/** Move the selected view through Dockview so tab order, active context and the saved layout stay in sync. */
function MoveTab({activePanel,containerApi,group}:IDockviewHeaderActionsProps){
  const [open,setOpen]=useState(false)
  const moved=useRef<string|null>(null)
  const subscribe=useCallback((notify:()=>void)=>{
    const subscription=containerApi.onDidLayoutChange(notify)
    return ()=>subscription.dispose()
  },[containerApi])
  const available=useSyncExternalStore(subscribe,()=>containerApi.panels.length>1)
  if(!activePanel||!available)return null
  const index=group.panels.indexOf(activePanel)
  /** Return keyboard focus to the selected tab even when moving it removes its original group. */
  function move(target:typeof group,position?:number){
    moved.current=activePanel!.id
    activePanel!.api.moveTo({group:target,index:position})
  }
  return <DropdownMenu modal={false} open={open} onOpenChange={value=>{if(value)moved.current=null;setOpen(value)}}>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Move current tab" title="Move current tab"><MoveHorizontal/></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" aria-label="Move current tab" onCloseAutoFocus={event=>{
      if(!moved.current)return
      // Dockview can replace the tab element during a move. Resolve it when the menu releases focus.
      const panel=containerApi.getPanel(moved.current)
      const tab=panel?.group.element.querySelector<HTMLElement>('[data-tab-panel-id="'+CSS.escape(moved.current)+'"]')
      if(tab){event.preventDefault();tab.focus()}
    }}>
      {group.panels.length>1&&<>
        <DropdownMenuItem disabled={index===0} onSelect={()=>move(group,index-1)}>Move left</DropdownMenuItem>
        <DropdownMenuItem disabled={index===group.panels.length-1} onSelect={()=>move(group,index+1)}>Move right</DropdownMenuItem>
      </>}
      {containerApi.groups.filter(target=>target!==group).map(target=>
        <DropdownMenuItem key={target.id} onSelect={()=>move(target)}>Move to group {target.id} · {target.activePanel?.title}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>
}

/** Split the chosen group, keeping both views on the current document initially. */
function SplitActions(props:IDockviewHeaderActionsProps){
  const {activePanel,containerApi,group}=props
  const {closeTab}=useContext(Context)!
  useLayoutEffect(()=>{
    group.element.querySelector('[role="tablist"]')?.setAttribute('aria-label','Editor group '+group.id)
  },[group])
  function split(direction:'right'|'below'){
    if(activePanel)containerApi.addPanel({id:allocateViewId(containerApi),component:activePanel.params?.page==='journal'?'journal':'document',title:activePanel.title,params:activePanel.params,position:{referencePanel:activePanel,direction}})
  }
  return <><OpenTabs group={group} activePanel={activePanel} closeTab={closeTab}/>{([['right',Columns2,'Split right'],['below',Rows2,'Split down']] as const).map(([direction,Icon,label])=>
    <Button key={direction} variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={()=>split(direction)}><Icon/></Button>)}<MoveTab {...props}/><ResizeGroup {...props}/></>
}

/** Opening a library page activates an existing view or adds a tab in the focused group. */
export function EditorDock(props:DockProps){
  const frame=useRef<HTMLDivElement>(null)
  const [api,setApi]=useState<DockviewApi>()
  const [active,setActive]=useState<string>()
  const visible=!!props.selected
  const {select,closed}=props
  useLayoutEffect(()=>{
    if(!api)return
    const sub=api.onDidActivePanelChange(({panel})=>{
      setActive(panel?.id)
      select(panel?.params?.page)
    })
    const removal=api.onDidRemovePanel(closed)
    return ()=>{sub.dispose();removal.dispose()}
  },[api,select,closed])
  useLayoutEffect(()=>{
    if(!api)return
    function save(){
      if(!api)return
      try{
        if(!api.panels.length){sessionStorage.removeItem(props.layoutKey);return}
        // Hidden library views can have zero-size grid geometry. Keep the last visible layout.
        if(!frame.current?.clientWidth||!frame.current.clientHeight)return
        const layout=api.toJSON()
        for(const panel of Object.values(layout.panels))delete panel.title
        sessionStorage.setItem(props.layoutKey,JSON.stringify(layout))
      }catch{/* Session storage is optional in restricted browsing contexts. */}
    }
    const changes=api.onDidLayoutChange(save)
    window.addEventListener('pagehide',save)
    return ()=>{changes.dispose();window.removeEventListener('pagehide',save)}
  },[api,props.layoutKey])
  // A dock initialized behind the library has zero dimensions until its first reveal.
  useLayoutEffect(()=>{
    if(api&&visible&&frame.current)api.layout(frame.current.clientWidth,frame.current.clientHeight)
  },[api,visible])
  useLayoutEffect(()=>{
    if(!api)return
    for(const panel of api.panels){
      if(panel.params?.page==='journal')continue
      const page=props.pages.find(item=>item.id===panel.params?.page&&!item.deleted)
      if(!page)panel.api.close()
      else{
        const title=tabTitle(props.pageLabel(page),panel.params?.mode)
        if(title!==panel.title)panel.api.setTitle(title)
      }
    }
    const target=props.selected
    if(target===undefined||api.activePanel?.params?.page===target)return
    const page=props.pages.find(item=>item.id===target&&!item.deleted)
    if(!page&&target!=='journal')return
    const candidates=[...(api.activeGroup?.panels??[]),...api.panels]
    const existing=candidates.find(panel=>panel.params?.page===target)
    if(existing)existing.api.setActive()
    else api.addPanel({id:allocateViewId(api),component:page?'document':'journal',params:{page:target},title:page?props.pageLabel(page):'Journal'})
  },[api,props.selected,props.pages,props.pageLabel])
  /** Save the requested view before dismissal, even if a different tab is active in this group. */
  async function closeTab(id:string){
    const panel=api?.getPanel(id)
    if(!api||!panel)return
    const focused=document.activeElement
    try{
      if(panel.params?.page==='journal')await props.saveJournal(id)
      else await props.handles.get(id)?.checkpoint.current?.()
      if(!frame.current||api.getPanel(id)!==panel)return
      const siblings=panel.group.panels,index=siblings.indexOf(panel)
      const neighbour=siblings[index+1]??siblings[index-1]
      const restoreFocus=focused===document.activeElement
      // Commit the active-panel notification before looking up the library input on the next frame.
      flushSync(()=>panel.api.close())
      requestAnimationFrame(()=>{
        if(!restoreFocus||!frame.current||document.activeElement!==document.body)return
        const target=(neighbour&&api.getPanel(neighbour.id))??api.activePanel
        if(target)target.group.element.querySelector<HTMLElement>('[data-tab-panel-id="'+CSS.escape(target.id)+'"]')?.focus()
        else props.focusLibrary()
      })
    }catch(error){props.report(String(error))}
  }
  /** Scope shortcuts to the originating dock group and place focus on the newly active tab. */
  function navigateByKey(event:KeyboardEvent<HTMLDivElement>){
    const target=event.target
    if(!api||event.defaultPrevented||event.nativeEvent.isComposing||event.altKey||event.metaKey||
      !(target instanceof Element)||!event.currentTarget.contains(target)||target.closest('[role=dialog],[role=menu]'))return
    const cycleGroup=event.key==='F6'&&!event.ctrlKey
    const cycleTab=event.ctrlKey&&!event.shiftKey&&(event.key==='['||event.key===']')
    if(!cycleGroup&&!cycleTab)return
    const group=api.groups.find(candidate=>candidate.element.contains(target))
    if(!group||(cycleGroup?api.groups.length:group.panels.length)<2)return
    event.preventDefault()
    if(cycleGroup){
      if(event.shiftKey)api.activatePrevious({group})
      else api.activateNext({group})
    }else if(event.key==='[')group.model.moveToPrevious()
    else group.model.moveToNext()
    api.activeGroup?.model.focusActiveTab()
  }
  return <Context.Provider value={{...props,active,closeTab}}><div ref={frame} className={dockClass} hidden={!props.selected} onKeyDown={navigateByKey}
    onKeyDownCapture={event=>{
      if(event.key!=='Delete'&&event.key!=='Backspace')return
      const tab=event.target
      if(!(tab instanceof HTMLElement)||tab.getAttribute('role')!=='tab'||!tab.dataset.tabPanelId)return
      // Dockview's tab-strip shortcut otherwise disposes the editor synchronously, bypassing its close button.
      event.preventDefault();event.stopPropagation()
      if(!event.repeat)void closeTab(tab.dataset.tabPanelId)
    }}>
    {(visible||api)&&<DockviewReact theme={themeLight} components={components} onReady={({api})=>{
      restoreLayout(api,props)
      setActive(api.activePanel?.id)
      setApi(api)
    }} disableFloatingGroups
      defaultTabComponent={DocumentTab} rightHeaderActionsComponent={SplitActions} getTabContextMenuItems={tabMenuItems}/>}
  </div></Context.Provider>
}
