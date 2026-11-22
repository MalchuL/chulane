/** Stack independent Rivto documents by calendar day and keep mounted editors reachable for saves and edit approvals. */
import {useEffect,useRef,useState,type RefObject} from 'react'
import {ArrowDown,ArrowUpRight} from 'lucide-react'
import type {Page} from '../shared/library'
import type {ApplyInEditor} from './agent'
import {BlockLinkPage} from './block-links'
import {Editor,type Checkpoint} from './editor'
import {Button} from './ui'

export type JournalEditors=Map<number,{
  checkpoint:RefObject<Checkpoint|null>
  apply:RefObject<ApplyInEditor|null>
}>
type DayProps={
  page:Page;installation?:string;replica?:string;workspace:number;writable:boolean;linkBlocks:boolean;editors:JournalEditors
  select:(id:number)=>void;open:(id:number)=>void;saved:(id:number,text:string)=>void;report:(error:Error)=>void
}
const DAYS_PER_BATCH=7

/** Register one day's live editor for its mounted lifetime. Leaving the entry checkpoints its changes. */
function JournalDay({page,installation,replica,workspace,writable,linkBlocks,editors,select,open,saved,report}:DayProps){
  const checkpoint=useRef<Checkpoint|null>(null)
  const apply=useRef<ApplyInEditor|null>(null)
  useEffect(()=>{
    editors.set(page.id,{checkpoint,apply})
    return ()=>{editors.delete(page.id)}
  },[editors,page.id])
  const headingId='journal-day-'+page.id
  const heading=<header><h2 id={headingId} tabIndex={-1}><time dateTime={page.day!}>{page.day}</time></h2>
    {page.title!==page.day&&<span>{page.title}</span>}
    {page.id>0&&<Button variant="ghost" size="icon-sm" title="Open page" aria-label={'Open page '+page.day} onClick={()=>open(page.id)}><ArrowUpRight/></Button>}</header>
  return <article data-source-page={page.id} aria-labelledby={headingId} onFocusCapture={()=>select(page.id)}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))void checkpoint.current?.().catch(report)}}>
    <BlockLinkPage.Provider value={linkBlocks&&writable&&page.id>0?page:undefined}>
      <Editor installation={installation} title={page.title} replica={replica} workspace={workspace} id={page.id} writable={writable} heading={heading} initialText={page.plain} toolbar={null}
        checkpoint={checkpoint} applyInEditor={apply} onSaved={text=>saved(page.id,text)}/>
    </BlockLinkPage.Provider>
  </article>
}

type JournalProps=Omit<DayProps,'page'> & {entries:Page[];hidden:boolean;offline:boolean}
/** Keep the oldest loaded day mounted when midnight adds a page above it. Search can hide the stack without losing edits. */
export function Journal({entries,hidden,offline,...props}:JournalProps){
  const batchEnd=entries[Math.min(DAYS_PER_BATCH,entries.length)-1].day!
  const [oldest,setOldest]=useState(batchEnd)
  useEffect(()=>{if(batchEnd<oldest)setOldest(batchEnd)},[oldest,batchEnd])
  const visible=entries.filter(entry=>entry.day!>=oldest||entry.day!>=batchEnd)
  return <section data-part="journal-entries" aria-label="Journal entries" hidden={hidden}>
    {visible.map(page=>offline&&page.availableOffline===false
      ? <article key={page.id} data-source-page={page.id} aria-label={page.day!}><header><h2><time dateTime={page.day!}>{page.day}</time></h2>{page.title!==page.day&&<span>{page.title}</span>}<small>Online only</small></header></article>
      : <JournalDay key={page.id} page={page} {...props}/>)}
    {entries.length>visible.length&&<Button variant="ghost" size="sm" onClick={()=>setOldest(entries[Math.min(entries.length,visible.length+DAYS_PER_BATCH)-1].day!)}><ArrowDown/>Earlier entries</Button>}
  </section>
}
