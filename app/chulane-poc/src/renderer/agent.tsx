/** The workspace sidebar owns chat selection and the foreground response connection across document switches. */
import {useEffect,useRef,useState} from 'react'
import {useDragDropMonitor,useDroppable} from '@dnd-kit/react'
import {ArrowUp,ArrowUpRight,BookOpen,Check,FileText,Layers,Link2,MessageSquare,Paperclip,Plus,Settings2,Square,Users,X} from 'lucide-react'
import {Alert,Badge,Button,Input,Label,NativeSelect,NativeSelectOption,Popover,PopoverContent,PopoverTrigger,Textarea} from './ui'
import {BLOCK_REFERENCE} from './block-links'
import {MAX_BLOCK_LINKS,type BlockSource,type LocalAgent} from '../shared/agent'
import {CHAT_COMPOSER,PAGE_REFERENCE} from './page-drag'
import {json,request} from './api'
import type {AppliedEdit,Chat,Conversation,EditPreview,Source} from '../shared/agent'

type Settings={hasApiKey:boolean;agent?:LocalAgent;localAgents:LocalAgent[];configured:boolean;configurable:boolean;model:string;chats:Chat[]}
export type ApplyInEditor=(commit:()=>Promise<AppliedEdit>)=>Promise<void>
type Props={ws:number;pages:Source[];page?:Source;write:boolean;visible:boolean;close:()=>void;open:(source:Source)=>Promise<void>;checkpoint:()=>Promise<void>;applyInEditor:React.RefObject<ApplyInEditor|null>}
const PANEL='agent-panel',LOG='agent-log',REVIEW='agent-review'
/** Render shared history, model setup, streamed text and durable block-level review. */
export function AgentSidebar({ws,pages,page,write,visible,close,open,checkpoint,applyInEditor}:Props){
  const [settings,S]=useState<Settings>(),[chat,C]=useState(0),[view,V]=useState<Conversation>({messages:[],edits:[]})
  const [draft,D]=useState(''),[busy,B]=useState(false),[error,E]=useState(''),[setup,G]=useState(false),[key,K]=useState(''),[model,M]=useState(''),[notice,N]=useState('')
  const [connection,setConnection]=useState<LocalAgent|'api'|null>(null)
  const selectedProvider=connection??settings?.agent??'api'
  const active=useRef<AbortController|null>(null),selected=useRef(0),alive=useRef(true),sequence=useRef(0)
  const [attachments,attach]=useState<number[]>([]),[dragging,drag]=useState(false),[picker,P]=useState(false),[filter,Q]=useState('')
  const [blockLinks,setBlockLinks]=useState<BlockSource[]>([])
  const composer=useRef<HTMLTextAreaElement>(null),log=useRef<HTMLDivElement>(null),follow=useRef(true)
  const refs=pages.filter(p=>p.id!==page?.id && attachments.includes(p.id))
  const {ref:dropRef,isDropTarget}=useDroppable({id:CHAT_COMPOSER,accept:[PAGE_REFERENCE,BLOCK_REFERENCE],disabled:!visible||!write||busy})
  function addPage(id:number){
    if(!write||busy||!pages.some(p=>p.id===id))return
    if(page?.id===id || refs.some(p=>p.id===id)){N('Page already in context.');return}
    if(refs.length>=3){N('Remove a page to add another.');return}
    attach([...refs.map(p=>p.id),id]);P(false);Q('');N('Added '+pages.find(p=>p.id===id)!.title)
  }
  useDragDropMonitor({
    onDragStart:e=>{if(e.operation.source?.type===PAGE_REFERENCE||e.operation.source?.type===BLOCK_REFERENCE)drag(true)},
    onDragEnd:e=>{
      drag(false)
      if(e.canceled || e.operation.target?.id!==CHAT_COMPOSER || busy || !write)return
      if(e.operation.source?.type===BLOCK_REFERENCE){
        const incoming:BlockSource[]=e.operation.source.data.links.current
        const unique=new Map([...blockLinks,...incoming].map(s=>[s.id+'/'+s.block,s]))
        if(unique.size>MAX_BLOCK_LINKS){N('A message can include up to '+MAX_BLOCK_LINKS+' block links.');return}
        setBlockLinks([...unique.values()]);N('Block links added to context.')
      }
      if(e.operation.source?.type===PAGE_REFERENCE)
        addPage(Number(e.operation.source.data.pageId))
    },
  })
  useEffect(()=>{if(follow.current && log.current)log.current.scrollTop=log.current.scrollHeight},[view,visible])
  const suffix='?workspace='+ws
  const path=(id:number)=>'agent/chats/'+id
  async function settingsNow(){const data:Settings=await json('agent'+suffix);if(alive.current)S(data);return data}
  async function load(id:number){
    const seq=++sequence.current
    const data=await json(path(id)+suffix)
    if(alive.current && selected.current===id && sequence.current===seq)V(data)
  }
  function select(id:number){follow.current=true;selected.current=id;C(id);V({messages:[],edits:[]});if(id)void load(id).catch(e=>E(e.message))}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.abort()}},[])
  useEffect(()=>{
    if(!visible)return
    let live=true
    async function refresh(){try{const data=await settingsNow();if(!live)return
      if(!selected.current && data.chats.length)select(data.chats[0].id)
      else if(selected.current && !active.current)await load(selected.current)
    }catch(e){if(live)E((e as Error).message)}}
    void refresh();const timer=setInterval(refresh,2500)
    return()=>{live=false;clearInterval(timer)}
  },[visible])
  async function newChat(){const {id}=await json('agent/chats'+suffix,'POST');select(id);await settingsNow();return id as number}
  async function send(){
    if(active.current || !draft.trim())return
    const controller=new AbortController();active.current=controller;B(true);E('')
    let id=chat
    try{
      await checkpoint()
      if(!id)id=await newChat()
      const response=await request(path(id)+'/turn'+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:draft,page:page?.id??null,references:refs.map(p=>p.id),blockLinks:blockLinks.map(({id,block})=>({id,block}))}),signal:controller.signal})
      D('');attach([]);setBlockLinks([]);N('');follow.current=true
      const reader=response.body!.pipeThrough(new TextDecoderStream()).getReader()
      let buffer='',received=''
      for(;;){
        const {done,value}=await reader.read();if(done)break
        buffer+=value
        let newline:number
        while((newline=buffer.indexOf('\n'))>=0){
          const event=JSON.parse(buffer.slice(0,newline));buffer=buffer.slice(newline+1)
          if(event.error)E(event.error)
          if(event.delta){received+=event.delta;const text=received;V(prev=>({...prev,messages:prev.messages.map(m=>m.id===event.message?{...m,text}:m)}))}
          else if(event.message || event.proposal)await load(id)
        }
      }
    }catch(e){if(alive.current && !controller.signal.aborted)E((e as Error).message)}
    finally{active.current=null;if(alive.current){B(false);if(id)await load(id).catch(e=>E(e.message));await settingsNow().catch(e=>E(e.message))}}
  }
  async function decide(edit:EditPreview,choice:'apply'|'dismiss'){
    await checkpoint()
    const commit=()=>json(path(chat)+'/edits/'+edit.id+'/'+choice+suffix,'POST') as Promise<AppliedEdit>
    if(choice==='apply' && page?.id===edit.page && applyInEditor.current)await applyInEditor.current(commit)
    else await commit()
    await load(chat)
  }
  function act(fn:()=>Promise<unknown>){E('');void fn().catch(e=>E(e.message))}
  if(!visible)return null
  return <aside className={PANEL} aria-label="Workspace agent">
    <header data-part="agent-heading">
      <span data-part="agent-mark"><Layers size={20}/></span>
      <div><h2>Workspace agent</h2><small><Users size={12}/>Shared workspace chat</small></div>
      {settings?.configured&&settings.configurable&&write&&<Button variant="ghost" size="icon-sm" aria-label="Provider settings" title="Provider settings" aria-expanded={setup} onClick={()=>{G(!setup);setConnection(null)}}><Settings2/></Button>}
      <Button size="icon-sm" variant="ghost" onClick={close} aria-label="Close agent" title="Close agent"><X/></Button>
    </header>
    <div data-part="conversation-bar"><MessageSquare size={15}/>
      <NativeSelect aria-label="Conversation" value={chat} disabled={busy} size="sm" onChange={e=>select(Number(e.target.value))}>
        {!chat&&<NativeSelectOption value={0}>New conversation</NativeSelectOption>}{settings?.chats.map(c=><NativeSelectOption key={c.id} value={c.id}>{c.title}</NativeSelectOption>)}</NativeSelect>
      {write&&<Button size="icon-sm" variant="ghost" title="New chat" aria-label="New chat" disabled={busy} onClick={()=>act(newChat)}><Plus/></Button>}
    </div>
    <div role="log" aria-label="Chat messages" className={LOG} ref={log} onScroll={e=>{const n=e.currentTarget;follow.current=n.scrollHeight-n.scrollTop-n.clientHeight<60}}>
      {settings&&(!settings.configured || setup)&&<section data-part="provider-card">
        <strong><Settings2 size={15}/>Provider setup</strong>
        <p>Messages and selected page excerpts go to the provider you choose.</p>
        {!!settings.localAgents?.length&&write&&<div><Label htmlFor="agent-connection">Connection</Label><NativeSelect id="agent-connection" value={selectedProvider} onChange={e=>setConnection(e.target.value as LocalAgent|'api')}>
          <NativeSelectOption value="api">OpenAI API key</NativeSelectOption>
          {settings.localAgents.map(agent=><NativeSelectOption key={agent} value={agent}>{agent==='codex'?'Local Codex':agent==='claude'?'Local Claude Code':'Local Hermes'}</NativeSelectOption>)}
        </NativeSelect></div>}
        {settings.configurable&&write&&selectedProvider!=='api'?<Button size="sm" disabled={busy} onClick={()=>act(async()=>{
          const result=await json('agent/provider'+suffix,'POST',{agent:selectedProvider})
          await settingsNow();G(false);N(result.message)
        })}>Use local {selectedProvider}</Button>:settings.configurable&&write?<form aria-label="OpenAI connection" onSubmit={e=>{e.preventDefault();act(async()=>{const result=await json('agent/provider'+suffix,'POST',{key,model:model||settings.model});K('');G(false);N(result.message);await settingsNow()})}}>
          <Label>OpenAI API key<Input type="password" required={!settings.hasApiKey} placeholder={settings.hasApiKey?'Saved key':undefined} autoComplete="off" value={key} onChange={e=>K(e.target.value)}/></Label>
          <Label>Model<Input required defaultValue={settings.model} onChange={e=>M(e.target.value)}/></Label>
          <Button size="sm">Save provider</Button></form>:<p>Ask the server operator to set OPENAI_API_KEY to enable chat.</p>}
      </section>}
      {settings?.configured&&!view.messages.length&&!busy&&write&&<div data-part="start-chat">
        <BookOpen size={26}/><h3>{page?'Work with this page':'Work with your pages'}</h3>
        {(page?['Summarize this page','Suggest a clearer introduction']:['Find a page about…','Compare two pages']).map(text=><Button variant="ghost" size="sm" key={text} onClick={()=>{D(text);composer.current?.focus()}}>{text}<ArrowUpRight size={14}/></Button>)}
      </div>}
      {view.messages.map(m=><article key={m.id} data-author={m.role}>
        <small data-part="author">{m.role==='assistant'?<><Layers size={13}/>Agent</>:'User'}</small>
        {m.text&&<p data-part="message">{m.text}</p>}
        {m.status==='running'&&<small>Responding…</small>}{m.status==='interrupted'&&<small>Turn interrupted</small>}
        {m.status==='failed'&&<small>Provider request failed. Check the connection settings.</small>}
        {!!m.sources.length&&<div data-part="sources">{m.sources.map(s=><a key={s.id+'/'+(s.block??'')} href={'?workspace='+ws+'&page='+s.id+(s.block?'&block='+encodeURIComponent(s.block):'')} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();act(()=>open(s))}}><FileText size={12}/>{s.excerpt?s.title+' · '+s.excerpt:s.title}</a>)}</div>}
        {view.edits.filter(e=>e.message===m.id).map(edit=><section className={REVIEW} key={edit.id}>
          <header><FileText size={14}/><strong>{edit.title}</strong><Badge variant="outline">{edit.status==='pending'?'Review':edit.status}</Badge></header>
          {edit.before&&<del>{edit.before}</del>}<ins>{edit.after||'(remove block text)'}</ins>
          <footer><a href={'?workspace='+ws+'&page='+edit.page+'&block='+encodeURIComponent(edit.block)} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();act(()=>open({id:edit.page,title:edit.title,block:edit.block}))}}>Open page<ArrowUpRight size={12}/></a>
          {edit.status==='pending'&&write&&<><Button size="icon-sm" aria-label="Dismiss" title="Dismiss edit" variant="ghost" onClick={()=>act(()=>decide(edit,'dismiss'))}><X/></Button><Button size="sm" onClick={()=>act(()=>decide(edit,'apply'))}><Check/>Apply</Button></>}</footer>
        </section>)}</article>)}
    </div>
    <footer data-part="compose-area">
    {error&&<Alert variant="destructive">{error}</Alert>}
    {notice&&<small role="status">{notice}</small>}
    {write?<form aria-label="Chat composer" ref={dropRef} data-part="composer" data-drag={isDropTarget?'over':dragging?'ready':'idle'} onSubmit={e=>{e.preventDefault();void send()}}>
      <div data-part="context"><small>Context</small>{page&&<Badge variant="secondary" title={'Current document: '+page.title}><FileText size={12}/>{page.title}</Badge>}
      {refs.map(s=><Button type="button" key={s.id} size="sm" variant="outline" disabled={busy} aria-label={'Remove '+s.title} onClick={()=>{attach(attachments.filter(id=>id!==s.id));N('Removed '+s.title)}}>{s.title}<X size={12}/></Button>)}
      {blockLinks.map(s=><span data-part="block-link" key={s.id+'/'+s.block}>
        <a href={'?workspace='+ws+'&page='+s.id+'&block='+encodeURIComponent(s.block)} title={s.title+' · '+s.excerpt} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();act(()=>open(s))}}><Link2 size={12}/>{s.excerpt}</a>
        <Button type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={'Remove block link: '+s.excerpt} title="Remove block link" onClick={()=>setBlockLinks(blockLinks.filter(item=>item!==s))}><X size={12}/></Button>
      </span>)}
      {!page&&!blockLinks.length&&!refs.length&&<small>Workspace library</small>}</div>
      <Textarea ref={composer} aria-label="Message the agent" placeholder={dragging?'Drop context here…':'Ask about your pages…'} rows={2} maxLength={12000} value={draft} onChange={e=>D(e.target.value)}/>
      <div data-part="compose-tools"><Popover open={picker} onOpenChange={P}><PopoverTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Add page" disabled={busy} title="Add a page to this message"><Paperclip/></Button></PopoverTrigger>
        <PopoverContent aria-label="Add page to context" align="start"><Input placeholder="Find a page…" aria-label="Find a page" value={filter} onChange={e=>Q(e.target.value)}/>
        <div data-part="page-picker">{pages.filter(p=>p.title.toLowerCase().includes(filter.toLowerCase())).map(p=><Button key={p.id} type="button" size="sm" variant="ghost" disabled={p.id===page?.id||refs.some(s=>s.id===p.id)||refs.length>=3} onClick={()=>addPage(p.id)}><FileText/>{p.title}</Button>)}
        {!pages.some(p=>p.title.toLowerCase().includes(filter.toLowerCase()))&&<small>No matching pages</small>}</div></PopoverContent></Popover>
        {busy?<Button type="button" size="icon-sm" aria-label="Stop response" title="Stop response" onClick={()=>active.current?.abort()}><Square/></Button>:<Button size="icon-sm" aria-label="Send" title="Send" disabled={!draft.trim()||!settings?.configured}><ArrowUp/></Button>}</div>
    </form>:<small>Read-only conversation</small>}
    {settings?.configured&&write&&<small data-part="disclosure">Messages and page context are sent to {settings.agent?'local '+settings.agent:'OpenAI'}.</small>}
    </footer>
  </aside>
}
