/** Stack independent Rivto documents by calendar day and keep mounted editors reachable for saves and edit approvals. */
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react'
import {ArrowDown,ArrowDownToLine,ArrowUp,ArrowUpRight,ListTree} from 'lucide-react'
import {ModeManager} from '@chulane/rivto'
import type {Page} from '../shared/library'
import type {ApplyInEditor} from './agent'
import {BlockLinkPage} from './block-links'
import {Editor,type Checkpoint} from './editor'
import {Button,Popover,PopoverTrigger,PopoverContent} from './ui'
import {ScrollArea} from './ui/scroll-area'

export type JournalEditors=Map<string,{
  page:number;panel:string
  checkpoint:RefObject<Checkpoint|null>
  apply:RefObject<ApplyInEditor|null>
}>
type DayProps={
  page:Page;panel:string;installation?:string;replica?:string;workspace:number;writable:boolean;linkBlocks:boolean;editors:JournalEditors
  properties:(page:Page)=>ReactNode;rename:(page:Page)=>ReactNode
  exportEntry:(page:Page)=>Promise<void>;select:(id:number,surface:'page'|'canvas')=>void;open:(id:number)=>void;saved:(id:number,text:string,referenceBlockLengths?:number[])=>void;report:(error:Error)=>void
}
const DAYS_PER_BATCH=7

/** Register one day's live editor for its mounted lifetime. Leaving the entry checkpoints its changes. */
function JournalDay({page,panel,installation,replica,workspace,writable,linkBlocks,editors,select,open,exportEntry,saved,report,properties,rename}:DayProps){
  const [mode]=useState(()=>new ModeManager('block'))
  const entry=useRef<HTMLElement>(null)
  const selected=()=>select(page.id,mode.get()==='edgeless'?'canvas':'page')
  useEffect(()=>mode.subscribe(()=>{if(entry.current?.contains(document.activeElement))selected()}),[mode,select,page.id])
  const checkpoint=useRef<Checkpoint|null>(null)
  const apply=useRef<ApplyInEditor|null>(null)
  useEffect(()=>{
    const key=panel+'/'+page.id
    editors.set(key,{page:page.id,panel,checkpoint,apply})
    return ()=>{editors.delete(key)}
  },[editors,page.id,panel])
  /** Save the selected day's active writers before reading the export snapshot. */
  async function download(){
    await checkpoint.current?.()
    await exportEntry(page)
  }
  const headingId=panel+'-journal-day-'+page.id
  const [toolbar,setToolbar]=useState<HTMLDivElement|null>(null)
  const [propertiesOpen,setPropertiesOpen]=useState(false)
  const heading=<header><h2 id={headingId} tabIndex={-1}><time data-copyable="" dateTime={page.day!}>{page.day}</time></h2>
    {rename(page)??(page.title!==page.day&&<span data-copyable="">{page.title}</span>)}
    {page.id>0&&<Popover open={propertiesOpen} onOpenChange={setPropertiesOpen}><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" title="Page properties" aria-label={'Properties for '+page.day}><ListTree/></Button></PopoverTrigger>
      <PopoverContent align="start" aria-label={'Properties for '+page.day}>{propertiesOpen&&properties(page)}</PopoverContent></Popover>}
    <Button variant="ghost" size="icon-sm" title="Export as Markdown" aria-label={'Export '+page.day+' as Markdown'} onClick={()=>void download().catch(report)}><ArrowDownToLine aria-hidden="true"/></Button>
    {page.id>0&&<Button variant="ghost" size="icon-sm" title="Open page" aria-label={'Open page '+page.day} onClick={()=>open(page.id)}><ArrowUpRight/></Button>}<div ref={setToolbar}/></header>
  return <article ref={entry} data-source-page={page.id} aria-labelledby={headingId} onFocusCapture={selected}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))void checkpoint.current?.().catch(report)}}>
    {heading}
    <BlockLinkPage.Provider value={linkBlocks&&writable&&page.id>0?page:undefined}>
      <Editor surfaceMode={mode} installation={installation} title={page.title} replica={replica} workspace={workspace} id={page.id} writable={writable} heading={null} toolbar={toolbar} initialText={page.plain}
        checkpoint={checkpoint} applyInEditor={apply} onSaved={(text,referenceBlockLengths)=>saved(page.id,text,referenceBlockLengths)}/>
    </BlockLinkPage.Provider>
  </article>
}

export type JournalAnchor={day?:string}
type JournalProps=Omit<DayProps,'page'|'select'> & {
  entries:Page[];anchor?:JournalAnchor;handled:(anchor:JournalAnchor)=>void;active:boolean;offline:boolean
  select:(panel:string,id:number|undefined,surface:'page'|'canvas')=>void
}
/** Anchor the initial batch to the requested day. Date bounds keep mounted entries stable across catalog refreshes. */
export function Journal({entries,anchor,handled,active,offline,select,...props}:JournalProps){
  function dateRange(day?:string){
    const target=entries.findIndex(entry=>entry.day===day)
    const first=Math.max(0,Math.min(target-Math.floor(DAYS_PER_BATCH/2),entries.length-DAYS_PER_BATCH))
    const last=Math.min(entries.length,first+DAYS_PER_BATCH)-1
    return {newest:first?entries[first].day:null,oldest:entries[last].day!}
  }
  const [range,setRange]=useState(()=>dateRange())
  const stack=useRef<HTMLDivElement>(null)
  const focusAfterJump=useRef<number|undefined>(undefined)
  const lastDay=useRef<{id:number;surface:'page'|'canvas'}|undefined>(undefined)
  function selectDay(id:number,surface:'page'|'canvas'){
    lastDay.current={id,surface}
    select(props.panel,id,surface)
  }
  // Dockview may activate the requested group after the shell has already changed routes.
  useLayoutEffect(()=>{
    if(!active||!anchor)return
    setRange(dateRange(anchor.day))
    focusAfterJump.current=entries.find(entry=>entry.day===anchor.day)?.id
    if(!anchor.day)stack.current?.scrollTo({top:0})
    handled(anchor)
  },[active,anchor,entries,handled])
  useLayoutEffect(()=>{
    if(focusAfterJump.current===undefined)return
    const heading=document.getElementById(props.panel+'-journal-day-'+focusAfterJump.current)
    if(heading){focusAfterJump.current=undefined;heading.focus()}
  },[range,props.panel])
  useLayoutEffect(()=>{
    if(!active)return
    const last=lastDay.current
    select(props.panel,last?.id,last?.surface??'page')
  },[active,props.panel,select])
  // An open upper bound follows midnight. A historical window stays anchored while new days arrive.
  const start=range.newest?entries.findIndex(entry=>entry.day!<=range.newest!):0
  const first=start<0?entries.length-1:start
  const older=entries.findIndex(entry=>entry.day!<range.oldest)
  const end=Math.min(entries.length,Math.max(first+DAYS_PER_BATCH,older<0?entries.length:older))
  const visible=entries.slice(first,end)
  return <ScrollArea ref={stack} role="region" tabIndex={0} data-part="journal-entries" aria-label="Journal entries">
    {first>0&&<Button variant="ghost" size="sm" onClick={()=>setRange({...range,newest:first>DAYS_PER_BATCH?entries[first-DAYS_PER_BATCH].day:null})}><ArrowUp/>Later entries</Button>}
    {visible.map(page=>offline&&page.availableOffline===false
      ? <article key={page.id} data-source-page={page.id} aria-label={page.day!}><header><h2><time data-copyable="" dateTime={page.day!}>{page.day}</time></h2>{page.title!==page.day&&<span data-copyable="">{page.title}</span>}<small>Online only</small></header></article>
      : <JournalDay key={page.id} page={page} select={selectDay} {...props}/>)}
    {end<entries.length&&<Button variant="ghost" size="sm" onClick={()=>setRange({...range,oldest:entries[Math.min(entries.length,end+DAYS_PER_BATCH)-1].day!})}><ArrowDown/>Earlier entries</Button>}
  </ScrollArea>
}
