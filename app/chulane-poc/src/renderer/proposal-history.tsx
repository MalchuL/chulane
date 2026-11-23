/** Inspect completed external tool reviews without reissuing them. Stable result links open the affected page or block. */
import {Disclosure} from './ui/disclosure'
import {useEffect,useState} from 'react'
import {History} from 'lucide-react'
import type {ToolProposal,DecisionKind,DecisionPage,ProposalDecision} from '../shared/library'
import type {Source} from '../shared/agent'
import {json} from './api'
import {Button,Popover,PopoverContent,PopoverTrigger} from './ui'
import {ScrollArea} from './ui/scroll-area'

const actions:Record<DecisionKind,string>={create:'Create page',rename:'Rename page',append:'Append paragraph',replace:'Edit block',page:'Page change'}
type HistoryProps={ws:number;openSource:(source:Source)=>void}

/** Keep the current destination and its stable ID visible alongside a changed original path. */
export function ReviewDestination({id,original,shown}:{id:number|null;original:string|null;shown:string|null}){
  if(id===null)return <>Workspace root</>
  return <>{shown??'Folder unavailable'} · #{id}{original!==shown&&<> (requested as {original})</>}</>
}

/** Show the submitted destination and literal Markdown before and after the decision. */
export function DraftPreview({draft,shown}:{draft:NonNullable<ToolProposal['draft']>;shown?:string|null}){
  if('day' in draft)return <div data-part="proposal-text"><small>Journal date</small><p><time dateTime={draft.day}>{draft.day}</time></p><small>Writing</small><p>{draft.content||'(empty entry)'}</p></div>
  return <div data-part="proposal-text"><div><small>Destination</small><p><ReviewDestination id={draft.project} original={draft.projectName} shown={shown===undefined?draft.reviewedPath??draft.projectName:shown}/></p></div>
    <div><small>Markdown</small><p>{draft.markdown||'(empty page)'}</p></div></div>
}

/** Load one cursor at a time and discard responses if the user closes this history or leaves its workspace. */
function Decisions({ws,openSource}:HistoryProps){
  const [items,setItems]=useState<ProposalDecision[]>([]),[before,setBefore]=useState<number|null>(null)
  const [next,setNext]=useState<number|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{
    let active=true
    setLoading(true);setError('')
    void json('proposals/history?workspace='+ws+(before===null?'':'&before='+before)).then((page:DecisionPage)=>{
      if(active){setItems(current=>before===null?page.items:[...current,...page.items]);setNext(page.next)}
    }).catch(err=>{if(active)setError(err.message)}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[ws,before,retry])
  return <ScrollArea className="decision-scroll" data-part="decision-list" aria-label="Completed tool requests"><ol>{items.map(item=><li key={item.id}>
    <header><strong>{item.draft&&'day' in item.draft?'Create journal entry':actions[item.kind]}</strong><span>{item.status==='approve'?'Approved':'Dismissed'}{item.reviewedBy&&' by '+item.reviewedBy}</span></header>
    {item.page!==null?<a href={'?workspace='+ws+'&page='+item.page+(item.block?'&block='+encodeURIComponent(item.block):'')}
      onClick={e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();openSource({id:item.page!,title:item.titleAtApproval??item.title,block:item.block??undefined})}}>
      {item.titleAtApproval??item.title} · #{item.page}</a>:<span>{item.title}</span>}
    {item.kind==='rename'&&item.titleAtApproval!=null&&item.titleAtApproval!==item.title&&<p>Requested “{item.title}”. Approval kept “{item.titleAtApproval}”.</p>}
    <small>Request #{item.id}{item.profile&&' · '+item.profile}{item.requestedBy&&' · Requested by '+item.requestedBy}{item.decidedAt&&<> · <time dateTime={item.decidedAt}>{new Date(item.decidedAt).toLocaleString()}</time></>}</small>
    {item.draft&&<Disclosure label={'day' in item.draft?'Requested journal entry':'Requested page'}><DraftPreview draft={item.draft}/></Disclosure>}
    {item.edit&&<Disclosure label="Requested text"><div data-part="proposal-text">
      {item.edit.block&&<div><small>Before</small><p>{item.edit.before||'(empty)'}</p></div>}
      <div><small>After</small><p>{item.edit.after||'(empty)'}</p></div></div></Disclosure>}
  </li>)}</ol>
  {loading?<small role="status">Loading decisions…</small>:error?<><p role="alert">{error}</p><Button size="sm" onClick={()=>setRetry(n=>n+1)}>Retry</Button></>
    :!items.length?<p>No completed tool requests.</p>:next!==null&&<Button size="sm" variant="ghost" onClick={()=>setBefore(next)}>Older decisions</Button>}
  </ScrollArea>
}

/** Open review history beside its trigger and fetch current decisions on each opening. */
export function ProposalHistory({ws,openSource}:HistoryProps){
  const [open,setOpen]=useState(false)
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
    <Button size="icon-sm" variant="ghost" aria-label="Tool request history" title="Tool request history"><History/></Button>
    </PopoverTrigger><PopoverContent align="end" data-part="decision-history" aria-label="Tool request history"><h2>Tool request history</h2>
      {open&&<Decisions key={ws} ws={ws} openSource={source=>{setOpen(false);openSource(source)}}/>}
    </PopoverContent></Popover>
}
