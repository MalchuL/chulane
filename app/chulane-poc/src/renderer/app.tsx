/** Shared workspace shell. Both hosts call the same authenticated operations; the editor owns its save lifecycle. */
import React,{useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {BookOpen,CalendarDays,Folder,Plus,Trash2,Search,FileText,Paperclip,ArrowDownToLine,PanelLeft,Layers,Upload,X,Ellipsis,MessageSquareText,RotateCcw,Pencil} from 'lucide-react'
import {DragDropProvider} from '@dnd-kit/react'
import {BlockLinkPage} from './block-links'
import {PageDragHandle} from './page-drag'
import {AgentSidebar,type ApplyInEditor} from './agent'
import type {Source} from '../shared/agent'
import {Editor} from './editor'
import {json,request} from './api'
import { Alert, Badge, Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator, Button,
  Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle, Empty, EmptyContent, EmptyDescription,
  EmptyHeader, EmptyTitle, Input, Item, ItemGroup, ItemMedia, Label, NativeSelect, NativeSelectOption, Popover, PopoverContent,
  PopoverTrigger } from './ui'
import './style.css'
import type {Item as LibraryItem,Library} from '../shared/library'
function App(){
  const link=new URLSearchParams(location.search)
  const [ws,W]=useState(Number(link.get('workspace'))||1),[lib,L]=useState<Library>(),[auth,A]=useState(false),[key,K]=useState(''),[scope,S]=useState('all'),[id,I]=useState<number|undefined>(Number(link.get('page'))||undefined),[query,Q]=useState(''),[error,E]=useState(''),[dialog,G]=useState(''),[name,N]=useState(''),[files,F]=useState<LibraryItem[]>([]),[mobile,M]=useState(false),[notice,U]=useState('')
  const [agentOpen,setAgentOpen]=useState(false)
  const [documentTools,setDocumentTools]=useState<HTMLDivElement|null>(null)
  const applyInEditor=useRef<ApplyInEditor|null>(null)
  const checkpoint=useRef<(()=>Promise<void>)|null>(null)
  const attachment=useRef<HTMLInputElement>(null), markdown=useRef<HTMLInputElement>(null)
  const rail=useRef<HTMLElement>(null),railToggle=useRef<HTMLButtonElement>(null)
  const searchInput=useRef<HTMLInputElement>(null)
  const opener=useRef<HTMLElement|null>(null)
  const nameInput=useRef<HTMLInputElement>(null)
  const suffix='?workspace='+ws, page=lib?.pages.find(p=>p.id===id&&!p.deleted), write=lib?.role==='editor'
  const scopeTitle=scope==='all'?'All pages':scope==='journal'?'Journal':scope==='trash'?'Trash':lib?.projects.find(p=>String(p.id)===scope)?.name||'Project'
  const workspace=lib?.workspaces.find(w=>w.id===ws)?.name
  async function refresh(){const data=await json('library'+suffix);L(data);A(false);return data as Library}
  function act(fn:()=>Promise<unknown>){E('');void fn().catch(e=>E(e.message))}
  useEffect(()=>{let alive=true;let pending=false;async function load(){if(pending)return;pending=true;try{const data=await json('library'+suffix);if(alive){L(data);A(false)}}catch(e:any){if(alive){if(e.status===401)A(true);else E(e.message)}}finally{pending=false}}void load();const t=setInterval(load,3500);return()=>{alive=false;clearInterval(t)}},[ws])
  useEffect(()=>{let alive=true;F([]);if(id)void json('pages/'+id+'/files').then(f=>{if(alive)F(f)}).catch(e=>{if(alive)E(e.message)});return()=>{alive=false}},[id])
  const rows=lib?.pages.filter(p=>Boolean(p.deleted)===(scope==='trash') && (scope==='all'||scope==='trash'||(scope==='journal'?p.day:String(p.project)===scope)) && (p.title+' '+p.plain).toLowerCase().includes(query.toLowerCase())).reverse()||[]
  // The rail precedes the breadcrumb toggle in DOM order, so enter it when the disclosure opens.
  useEffect(()=>{if(mobile)rail.current?.focus()},[mobile])
  function navigate(next:string){if(mobile)railToggle.current?.focus();I(undefined);S(next);Q('');M(false);U('')}
  /** Wait for SQLite acknowledgment before an action can replace this editor. */
  function afterSave(action:()=>void|Promise<unknown>){act(async()=>{await checkpoint.current?.();await action()})}
  useEffect(()=>{
    if(!page?.id||!write)return
    function outside(event:Event){
      if(event.target instanceof Element&&!event.target.closest('.surface-body'))void checkpoint.current?.().catch(()=>{})
    }
    document.addEventListener('click',outside,true)
    document.addEventListener('focusin',outside,true)
    return ()=>{document.removeEventListener('click',outside,true);document.removeEventListener('focusin',outside,true)}
  },[page?.id,write])
  async function openSource(source:Source){
    await checkpoint.current?.()
    const data=await refresh()
    if(!data.pages.some(p=>p.id===source.id&&!p.deleted))throw Error('Source page is unavailable')
    I(source.id);M(false)
    if(source.block){
      for(let i=0;i<40;i++){
        const block=document.querySelector('[data-source-page="'+source.id+'"] [data-block-id="'+CSS.escape(source.block)+'"]')
        if(block){block.scrollIntoView({block:'center'});return}
        await new Promise(done=>setTimeout(done,50))
      }
      throw Error('The linked block is unavailable in this view.')
    }
  }
  function ask(kind:string,defaultName=''){opener.current=document.activeElement as HTMLElement;G(kind);N(defaultName)}
  async function create(title:string,day?:string,content?:string){
    const {id:newId}=await json('pages'+suffix,'POST',{title,day,content,project:/^\d+$/.test(scope)?Number(scope):null})
    const data=await refresh()
    if(data.pages.find(p=>p.id===newId)?.deleted){navigate('trash');U('This journal day is in the trash. Restore it to continue.');return}
    I(newId);M(false)
  }
  async function change(data:object){await json('pages/'+id+suffix,'PATCH',data);await refresh()}
  async function submit(){const title=name.trim();if(!title)return
    if(dialog==='Workspace'){const w=await json('workspaces','POST',{name:title});navigate('all');W(w.id)}
    if(dialog==='Project'){const p=await json('projects'+suffix,'POST',{name:title});await refresh();navigate(String(p.id))}
    if(dialog==='Page')await create(title)
    if(dialog==='Rename')await change({title})
    G('')
  }
  async function download(){if(!page)return;const current=(await refresh()).pages.find(item=>item.id===page.id);if(!current)return;const url=URL.createObjectURL(new Blob([current.plain],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download=page.title+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);U('Export includes writing text. Canvas objects, attachments and block properties are omitted.')}
  if(auth)return <main className="login"><div className="login-heading"><div className="brand"><Layers aria-hidden="true"/> Chulane</div><h1>Open your workspace</h1></div><form onSubmit={e=>{e.preventDefault();act(async()=>{await json('login','POST',{key});K('');await refresh()})}}><Label htmlFor="access-key">Workspace access key</Label><Input id="access-key" type="password" aria-describedby="key-help" autoComplete="current-password" autoFocus required value={key} onChange={e=>K(e.target.value)}/><p id="key-help" className="login-help">Ask the person running this library for an editor or viewer key. If you started the server, use your configured CHULANE_EDITOR_KEY or CHULANE_VIEWER_KEY.</p><Button size="sm">Open library</Button></form><p role="alert">{error}</p></main>
  if(!lib)return <main className="login">{error||'Opening workspace…'}</main>
  /** Opens the scope's page creation flow, using the local calendar day for journal entries. */
  function startPage(){
    if(scope!=='journal'){ask('Page');return}
    const date=new Date()
    const day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
    act(()=>create(day,day))
  }
  const createAction=write&&scope!=='trash'&&<Button size={rows.length||query?'icon-sm':'sm'} title={scope==='journal'?'Open today':'New page'} aria-label={scope==='journal'?'Open today':'New page'} onClick={startPage}>{scope==='journal'?<CalendarDays/>:<Plus/>}{!rows.length&&!query&&(scope==='journal'?'Open today':'New page')}</Button>
  const importAction=write&&scope!=='trash'&&scope!=='journal'&&<Button variant="ghost" size="icon-sm" aria-label="Import Markdown" title="Import Markdown" onClick={()=>markdown.current?.click()}><Upload/></Button>
  const showListTools=rows.length>0||!!query
  const emptyState=query
    ? {title:'No matching pages',detail:'Try another title or a word from the page.'}
    : scope==='trash'
      ? {title:'Trash is empty',detail:'Pages moved to the trash appear here.'}
      : scope==='journal'
        ? {title:'No journal entries yet',detail:write?'Open today’s entry to start writing.':'Journal entries appear here by date.'}
        : scope==='all'
          ? {title:'No pages yet',detail:write?'Pages you create here belong to this workspace.':'Pages shared with this workspace appear here.'}
          : {title:'No pages in this project',detail:write?'Create a page here or move one into this project.':'Pages added to this project appear here.'}
  const documentHeading=page&&<div className="doc-head"><h1>{page.title}</h1>{files.map(f=><Button asChild variant="link" size="sm" key={f.id}><a className="file" href={'/api/pages/'+id+'/files/'+f.id} download={f.name}>{f.name}</a></Button>)}</div>
  return <DragDropProvider><div className={'app'+(agentOpen?' agent-open':'')+(mobile?' menu-open':'')}>
    <nav ref={rail} tabIndex={-1} id="library-navigation" className="rail" aria-label="Library"><div className="brand"><Layers size={23}/> Chulane</div><Label className="sr-only" htmlFor="workspace-select">Workspace</Label><div className="workspace-switcher"><NativeSelect id="workspace-select" value={ws} onChange={e=>{const next=Number(e.target.value);afterSave(()=>{navigate('all');W(next)})}}>{lib.workspaces.map(w=><NativeSelectOption key={w.id} value={w.id}>{w.name}</NativeSelectOption>)}</NativeSelect>
    {write&&<Button variant="ghost" size="icon-sm" className="workspace-add" aria-label="New workspace" title="New workspace" onClick={()=>ask('Workspace')}><Plus/></Button>}</div>
    {[['all','All pages',BookOpen],['journal','Journal',CalendarDays],['trash','Trash',Trash2]].map(([s,label,Icon]:any)=><Button variant="ghost" size="sm" key={s} aria-current={scope===s?'location':undefined} className={scope===s?'active':''} onClick={()=>afterSave(()=>navigate(s))}><Icon/>{label}</Button>)}
    <div className="caprow"><span>Projects</span>{write&&<Button variant="ghost" size="sm" title="New project" aria-label="New project" onClick={()=>ask('Project')}><Plus/></Button>}</div>
    {lib.projects.map(p=><Button variant="ghost" size="sm" key={p.id} aria-current={scope===String(p.id)?'location':undefined} className={scope===String(p.id)?'active':''} onClick={()=>afterSave(()=>navigate(String(p.id)))}><Folder/>{p.name}</Button>)}
    {page&&rows.length>0&&<section className="page-index" aria-label="Pages in this view"><div className="caprow">Pages</div>{rows.map(item=><div className="page-index-entry" key={item.id}><Button variant="ghost" size="sm" aria-current={item.id===page.id?'page':undefined} onClick={()=>afterSave(()=>{I(item.id);M(false);U('')})}><FileText/><span>{item.title}</span></Button>{agentOpen&&write&&<PageDragHandle page={item}/>}</div>)}</section>}
    <footer>{lib.desktop?'Local workspace':'Web workspace'} <Badge variant="outline" className="role">{lib.role}</Badge></footer></nav>
    <main className="work"><header className="crumb"><Button variant="ghost" size="sm" ref={railToggle} className="rail-toggle" aria-label="Toggle navigation" title="Toggle navigation" aria-expanded={mobile} aria-controls="library-navigation" onClick={()=>M(!mobile)}><PanelLeft/></Button><Breadcrumb><BreadcrumbList><BreadcrumbItem>{workspace}</BreadcrumbItem><BreadcrumbSeparator/><BreadcrumbItem><Button variant="ghost" size="sm" onClick={()=>afterSave(()=>navigate(scope))}>{scopeTitle}</Button></BreadcrumbItem></BreadcrumbList></Breadcrumb><div data-part="document-tools" ref={setDocumentTools}/><Button size="icon-sm" variant="ghost" aria-label="Agent" title="Workspace agent" aria-expanded={agentOpen} onClick={()=>setAgentOpen(!agentOpen)}><MessageSquareText/></Button>{page&&<Popover key={page.id}><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" title="Page actions" aria-label="Page actions"><Ellipsis/></Button></PopoverTrigger><PopoverContent align="end" aria-label="Page actions" className="page-actions">
    {write&&<><Button variant="ghost" size="sm" onClick={()=>ask('Rename',page.title)}><Pencil/>Rename</Button>{!page.day&&<NativeSelect aria-label="Move to project" value={page.project||''} onChange={e=>act(()=>change({project:Number(e.target.value)||null}))}><NativeSelectOption value="">No project</NativeSelectOption>{lib.projects.map(p=><NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}</NativeSelect>}<Button variant="ghost" size="sm" onClick={()=>attachment.current?.click()}><Paperclip/>Attach</Button><Button variant="ghost" size="sm" aria-label="Move to trash" title="Move to trash" onClick={()=>afterSave(async()=>{await change({deleted:true});I(undefined)})}><Trash2/>Move to trash</Button></>}
    <Button variant="ghost" size="sm" onClick={()=>afterSave(download)}><ArrowDownToLine/>Markdown</Button></PopoverContent></Popover>}</header>
    {lib.proposals.map(proposal=><Alert className="message" key={proposal.id}>Tool request: {proposal.page?'Rename page '+proposal.page+' to':'Create page'} “{proposal.title}” {['approve','dismiss'].map(choice=><Button variant="ghost" size="sm" key={choice} onClick={()=>afterSave(async()=>{const r=await json('proposals/'+proposal.id+'/'+choice+suffix,'POST');await refresh();if(choice==='approve'){I(r.page);M(false)}})}>{choice}</Button>)}</Alert>)}
    {error&&<Alert variant="destructive" className="message">{error}<Button variant="ghost" size="icon-sm" title="Dismiss" aria-label="Dismiss" onClick={()=>E('')}><X/></Button></Alert>}{notice&&<Alert role="status" className="message">{notice}<Button variant="ghost" size="icon-sm" title="Dismiss" aria-label="Dismiss" onClick={()=>U('')}><X/></Button></Alert>}
    {page?<article className="doc" data-source-page={page.id}><BlockLinkPage.Provider value={write&&agentOpen?page:undefined}><Editor key={page.id} id={page.id} writable={write} toolbar={documentTools} heading={documentHeading} initialText={page.plain} checkpoint={checkpoint} applyInEditor={applyInEditor} onSaved={plain=>{L(l=>l&&({...l,pages:l.pages.map(p=>p.id===page.id?{...p,plain}:p)}))}}/></BlockLinkPage.Provider></article>
    :<section className="library"><div className="heading"><h1>{scopeTitle}</h1>{showListTools&&<div className="actions">{importAction}{createAction}</div>}</div>
    {showListTools&&<div data-part="library-filter"><div className="search"><Search/><Input ref={searchInput} aria-label="Search pages" placeholder="Search titles and contents" value={query} onChange={e=>Q(e.target.value)}/>{query&&<Button variant="ghost" size="sm" className="search-clear" title="Clear search" aria-label="Clear search" onClick={()=>{Q('');searchInput.current?.focus()}}><X/></Button>}</div>
    <small>{rows.length} {rows.length===1?'page':'pages'}</small></div>}
    {rows.length>0&&<ItemGroup aria-label="Page list">{rows.map(p=><Item role="listitem" size="sm" className="row" key={p.id}><ItemMedia>{agentOpen&&write&&!p.deleted?<PageDragHandle page={p}/>:<FileText size={16}/>}</ItemMedia><Button variant="ghost" size="sm" disabled={!!p.deleted} onClick={()=>{I(p.id);M(false);U('')}}><strong>{p.title}</strong>{p.plain&&<small>{p.plain.slice(0,120)}</small>}</Button>{p.deleted&&write?<Button variant="ghost" size="icon-sm" title="Restore" aria-label="Restore" onClick={()=>act(async()=>{await json('pages/'+p.id+suffix,'PATCH',{deleted:false});await refresh()})}><RotateCcw/></Button>:<small>{p.day||lib.projects.find(i=>i.id===p.project)?.name}</small>}</Item>)}</ItemGroup>}
    {!rows.length&&<Empty><EmptyHeader><EmptyTitle>{emptyState.title}</EmptyTitle><EmptyDescription>{emptyState.detail}</EmptyDescription></EmptyHeader>{!query&&createAction&&<EmptyContent className="empty-actions">{createAction}{importAction}</EmptyContent>}</Empty>}</section>}
    </main>
    <AgentSidebar key={ws} pages={lib.pages.filter(p=>!p.deleted)} ws={ws} page={page} write={!!write} visible={agentOpen} close={()=>setAgentOpen(false)} open={openSource} applyInEditor={applyInEditor} checkpoint={async()=>{await checkpoint.current?.()}}/>
    <Input hidden ref={attachment} type="file" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)act(async()=>{await request('pages/'+id+'/files?name='+encodeURIComponent(f.name),{method:'POST',body:f});F(await json('pages/'+id+'/files'))})}}/>
    <Input hidden ref={markdown} type="file" accept=".md,.markdown,text/markdown" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)act(async()=>{if(f.size>1024*1024)throw Error('Markdown import limit is 1 MiB');await create(f.name.replace(/\.m(?:arkdown|d)$/i,'')||'Imported page',undefined,await f.text())})}}/>
    <Dialog open={Boolean(dialog)} onOpenChange={open=>{if(!open)G('')}}>
      <DialogContent aria-describedby={undefined} onOpenAutoFocus={e=>{e.preventDefault();nameInput.current?.focus()}} onCloseAutoFocus={e=>{e.preventDefault();opener.current?.focus()}}>
        <DialogTitle>{dialog==='Rename'?'Rename page':'New '+dialog.toLowerCase()}</DialogTitle>
        <form className="name-form" onSubmit={e=>{e.preventDefault();afterSave(submit)}}>
          <Label htmlFor="page-name">Name</Label><Input id="page-name" ref={nameInput} required maxLength={250} value={name} onChange={e=>N(e.target.value)}/>
          {error&&<Alert variant="destructive">{error}</Alert>}
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit">Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div></DragDropProvider>
}
createRoot(document.getElementById('root')!).render(<App/>)
