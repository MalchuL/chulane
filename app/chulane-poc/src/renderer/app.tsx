/** Shared workspace shell. Both hosts call the same authenticated operations; the editor owns its save lifecycle. */
import React,{useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {HardDrive,CloudDownload,LogOut,Archive,BookOpen,Globe,Hash,Link2,CalendarDays,Folder,Plus,Trash2,Search,FileText,Paperclip,ArrowDownToLine,FolderPlus,PanelLeft,Layers,Upload,X,Ellipsis,MessageSquareText,RotateCcw,Pencil} from 'lucide-react'
import {DragDropProvider} from '@dnd-kit/react'
import {BlockLinkComposer,BlockLinkPage,type AttachBlockLinks} from './block-links'
import {PageDragHandle} from './page-drag'
import {AgentSidebar,type ApplyInEditor} from './agent'
import type {AppliedEdit,CitationTarget,LibrarySearchHit,Source} from '../shared/agent'
import {DraftPreview} from './proposal-history'
import {InlineTagsContext} from './inline-tags'
import {PageTags,TagsView} from './tags'
import {Journal,type JournalEditors} from './journal'
import {Editor,type Checkpoint} from './editor'
import {deviceMarkdown,searchDevicePages} from './offline-search'
import {projectRenameKey,queueMetadata,metadataOperationId,withPendingLibrary} from './document-outbox'
import {Appearance,useDeviceTheme} from './appearance'
import {WorkspaceInvitations,WorkspaceMembers} from './workspace-members'
import {WorkspaceSync} from './workspace-sync'
import {json,request} from './api'
import { Alert, Badge, Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator, Button,
  Dialog, DialogTrigger, DialogClose, DialogContent, DialogFooter, DialogTitle, Empty, EmptyContent, EmptyDescription,
  EmptyHeader, EmptyTitle, Input, Item, ItemGroup, ItemMedia, Label, NativeSelect, NativeSelectOption, Popover, PopoverContent,
  PopoverTrigger } from './ui'
import './style.css'
import {projectPaths,type Item as LibraryItem,type Library,type Page,type ToolProposal,type WorkspaceCatalog} from '../shared/library'
import {ArchivedWorkspaces,WorkspaceStart,ZoneSelect,deviceZone} from './workspace-start'
import {uploadPageFile} from './page-files'
import {downloadBlob} from './download'
import {RemovedPageCopies} from './removed-page-copies'
import {PendingRecovery} from './pending-recovery'
import {ServerSettings} from './server-settings'
import {ServerPicker} from './server-picker'
import {desktopServer,selectCachedSession} from './offline-server'
import {SignIn} from './sign-in'
const LIBRARY_REFRESH_MS=3500
type Attachment=LibraryItem & {size:number;availableOffline?:boolean}
function availabilityLabel(available?:boolean){return available===undefined?undefined:available?'Available offline':'Online only'}
/** Explain a missing citation using only records already visible in the current workspace. */
function unavailableSource(lib:Library,id:number){
  if(lib.removedPages?.some(page=>page.id===id))return 'Source page was permanently deleted.'
  if(lib.pages.some(page=>page.id===id&&page.deleted))return 'Source page is in the trash.'
  return 'Source page is unavailable.'
}
function PageIcon({available}:{available?:boolean}){
  const Icon=available===undefined?FileText:available?HardDrive:CloudDownload
  return <Icon size={16} aria-hidden="true"/>
}
function App(){
  const link=new URLSearchParams(location.search)
  const [ws,W]=useState(0),[lib,L]=useState<Library>(),[auth,A]=useState(false),[scope,S]=useState('all'),[id,I]=useState<number|undefined>(Number(link.get('page'))||undefined),[query,Q]=useState(''),[error,E]=useState(''),[dialog,G]=useState(''),[name,N]=useState(''),[files,F]=useState<Attachment[]>([]),[mobile,M]=useState(false),[notice,U]=useState('')
  const [citationTarget,setCitationTarget]=useState<CitationTarget|undefined>(()=>{
    const block=link.get('block'),page=Number(link.get('page'))
    if(page&&block)return {id:page,block}
    if(page&&link.get('view')==='canvas')return {id:page,surface:'canvas'}
  })
  const [catalog,setCatalog]=useState<WorkspaceCatalog>(),[attempt,reload]=useState(0)
  const appearance=useDeviceTheme(window.chulaneAppearance?'desktop':auth?'signed-out':lib?.profile??catalog?.profile??'browser')
  const requested=link.get('workspace')
  const [newZone,setNewZone]=useState(deviceZone)
  const [agentOpen,setAgentOpen]=useState(false)
  const [documentTools,setDocumentTools]=useState<HTMLDivElement|null>(null)
  const applyInEditor=useRef<ApplyInEditor|null>(null)
  const checkpoint=useRef<Checkpoint|null>(null)
  const blockComposer=useRef<AttachBlockLinks|null>(null)
  const journalEditors=useRef<JournalEditors>(new Map())
  const [focusedDay,focusDay]=useState<number>()
  const attachment=useRef<HTMLInputElement>(null), markdown=useRef<HTMLInputElement>(null)
  const rail=useRef<HTMLElement>(null),railToggle=useRef<HTMLButtonElement>(null)
  const searchInput=useRef<HTMLInputElement>(null)
  const metadataDelivery=useRef<{key:string;operationId:string}|null>(null)
  const renameBase=useRef<{target:number;title:string;workspace:number;replica?:string}|null>(null)
  const opener=useRef<HTMLElement|null>(null)
  const nameInput=useRef<HTMLInputElement>(null)
  const suffix='?workspace='+ws, page=lib?.pages.find(p=>p.id===id&&!p.deleted), write=lib?.role==='editor'
  const tagsView=scope==='tags'||scope.startsWith('tag/')
  const currentTag=lib?.tags.find(tag=>!tag.deleted&&scope==='tag/'+tag.id)
  const scopeTitle=tagsView?(currentTag?'#'+currentTag.name:'Tags'):scope==='all'?'All pages':scope==='journal'?'Journal':scope==='trash'?'Trash':lib?.projects.find(p=>String(p.id)===scope)?.name||'Project'
  const currentWorkspace=lib?.workspaces.find(w=>w.id===ws)
  const workspace=currentWorkspace?.name
  const libraryPath='library'+suffix+(scope==='journal'?'&view=journal':'')
  async function refresh(signal?:AbortSignal){
    const data=await withPendingLibrary(await json(libraryPath),scope==='journal')
    signal?.throwIfAborted()
    L(data);A(false);return data as Library
  }
  function act(fn:()=>Promise<unknown>){E('');void fn().catch(e=>E(e.message))}
  useEffect(()=>{
    let alive=true,pending=false,offeredCreation=false
    async function load(){
      if(pending)return
      pending=true
      try{
        if(!ws){
          const result:WorkspaceCatalog=await json('workspaces')
          if(alive){
            setCatalog(result);A(false);E('')
            const next=requested===null?result.workspaces[0]:result.workspaces.find(item=>item.id===Number(requested))
            // Another editor may create a workspace while this user is still naming theirs.
            if(next&&!offeredCreation)W(next.id)
            if(result.role==='editor'&&!result.workspaces.length)offeredCreation=true
          }
          return
        }
        const data:Library=await withPendingLibrary(await json(libraryPath),scope==='journal')
        if(alive){L(data);A(false)}
      }catch(e:any){if(alive){if(e.status===401)A(true);else if(ws&&[403,404,410].includes(e.status))chooseWorkspace(0);else E(e.message)}}
      finally{pending=false}
    }
    void load()
    const timer=setInterval(load,LIBRARY_REFRESH_MS)
    return ()=>{alive=false;clearInterval(timer)}
  },[ws,scope,attempt,requested])

  const [fileRefresh,refreshFiles]=useState(0)
  const filePath='pages/'+id+'/files'+suffix
  const replica=lib?.replica
  const fileHeaders:Record<string,string>=replica?{'X-Chulane-Replica':replica}:{}
  async function listFiles():Promise<Attachment[]>{return (await request(filePath,{headers:fileHeaders})).json()}
  useEffect(()=>{
    let alive=true;F([])
    if(page&&ws)void listFiles().then(f=>{if(alive)F(f)}).catch(e=>{if(alive)E(e.message)})
    return ()=>{alive=false}
  },[page?.id,ws,replica,lib?.offline,fileRefresh])
  async function downloadAttachment(pageId:number,file:LibraryItem){
    const path='pages/'+pageId+'/files/'+file.id+suffix
    const response=await request(path,{headers:fileHeaders})
    downloadBlob(await response.blob(),file.name)
    const cached=response.headers.get('X-Chulane-File-Cached')
    if(cached!==null||response.headers.has('X-Chulane-Offline')){
      const availableOffline=cached==='1'||response.headers.has('X-Chulane-Offline')
      F(current=>current.map(item=>item.id===file.id?{...item,availableOffline}:item))
      if(!availableOffline)U('Downloaded. Offline storage is unavailable for this attachment.')
    }
  }
  const projects=projectPaths(lib?.projects??[])
  /** Resolve the destination visible in this library revision. Trashed folders disappear from project navigation. */
  function destinationPath(id:number|null){
    return projects.find(entry=>entry.project.id===id)?.path??null
  }
  /** Project paths can repeat, so show the stable ID when comparing proposed destinations. */
  function locationLabel(id:number|null){
    return id===null?'No project':(destinationPath(id)??'Project in Trash')+' · #'+id
  }
  const hiddenProjects=new Set(lib?.projects.filter(p=>p.trashRoot!==null).map(p=>p.id))
  const activeProject=projects.find(p=>p.project.id===Number(scope))
  const trashProjects=lib?.projects.filter(p=>scope==='trash'&&p.trashRoot===p.id&&!hiddenProjects.has(p.parent??0)&&p.name.toLowerCase().includes(query.toLowerCase()))??[]
  const deviceDays=lib?.localJournalDays??[]
  const entries=scope==='journal'?[...deviceDays,...(lib?.pages??[]).filter(p=>p.day&&!p.deleted&&!deviceDays.some(draft=>draft.day===p.day))]
    .sort((a,b)=>b.day!.localeCompare(a.day!)):[]
  const [found,setFound]=useState<{ws:number;profile?:string;device?:string;write:boolean;query:string;hits:Map<number,LibrarySearchHit>}>()
  const searchProfile=lib?.profile
  const searchOnline=!!lib&&!page&&!tagsView&&!lib.offline&&scope!=='trash'&&!auth
  const device=lib?.offline&&scope!=='trash'&&!auth?lib.replica:undefined
  useEffect(()=>{
    if((!searchOnline&&!device)||!query.trim())return
    const controller=new AbortController()
    let timer=setTimeout(load,200)
    async function load(){
      try{
        const hits:LibrarySearchHit[]=device&&searchProfile
          ?await searchDevicePages(searchProfile,ws,device,write,query,controller.signal)
          :await (await request('library/search?workspace='+ws+'&q='+encodeURIComponent(query),{signal:controller.signal})).json()
        if(!controller.signal.aborted)setFound({ws,profile:searchProfile,device,write,query,hits:new Map(hits.map(hit=>[hit.id,hit]))})
      }catch(err){if(!controller.signal.aborted)E((err as Error).message)}
      if(searchOnline&&!controller.signal.aborted)timer=setTimeout(load,LIBRARY_REFRESH_MS)
    }
    return ()=>{clearTimeout(timer);controller.abort()}
  },[query,ws,searchProfile,searchOnline,device,write])
  const searchHits=(searchOnline||device)&&found?.device===device&&found?.ws===ws&&found.write===write&&found.profile===searchProfile&&found.query===query?found.hits:undefined
  function matches(p:{id:number;title:string;plain:string}){
    const needle=query.toLowerCase()
    if(!searchHits)return (p.title+' '+p.plain).toLowerCase().includes(needle)
    // A queued device rename can be visible in the catalog before the host receives it.
    return searchHits.has(p.id)||(!device&&p.title.toLowerCase().includes(needle))
  }
  const rows=scope==='journal'?entries.filter(entry=>(entry.id>0||(!query&&!page))&&matches(entry)):lib?.pages.filter(p=>!hiddenProjects.has(p.project??0)&&Boolean(p.deleted)===(scope==='trash') && (scope==='all'||scope==='trash'||String(p.project)===scope) && matches(p)).reverse()||[]
  const journal=scope==='journal'&&!page
  const agentPage=page??entries.find(entry=>entry.id>0&&entry.id===focusedDay)
  /** Persist every mounted day before navigation, including a day whose blur save is still running. */
  async function saveEditors(destination:Parameters<Checkpoint>[0]='device'){
    await Promise.all([checkpoint.current?.(destination),...Array.from(journalEditors.current.values(),editor=>editor.checkpoint.current?.(destination))])
  }
  function savedText(id:number,plain:string){L(l=>l&&({...l,pages:l.pages.map(p=>p.id===id?{...p,plain}:p)}))}

  // The rail precedes the breadcrumb toggle in DOM order, so enter it when the disclosure opens.
  useEffect(()=>{if(mobile)rail.current?.focus()},[mobile])
  function navigate(next:string){if(mobile)railToggle.current?.focus();focusDay(undefined);setCitationTarget(undefined);I(undefined);S(next);Q('');M(false);U('')}
  /** Open a workspace without carrying over another workspace's editor, page link or cached library. */
  function chooseWorkspace(next:number){
    const url=new URL(location.href)
    if(next)url.searchParams.set('workspace',String(next));else url.searchParams.delete('workspace');url.searchParams.delete('page');url.searchParams.delete('block');url.searchParams.delete('view')
    history.replaceState(null,'',url)
    navigate('all');setCatalog(undefined);L(undefined);E('');W(next)
  }
  /** Wait for SQLite acknowledgment before an action can replace this editor. */
  function afterSave(action:()=>void|Promise<unknown>){act(async()=>{await saveEditors();await action()})}
  useEffect(()=>{
    if(!page?.id||!write)return
    function outside(event:Event){
      if(event.target instanceof Element&&!event.target.closest('.surface-body'))void checkpoint.current?.().catch(()=>{})
    }
    document.addEventListener('click',outside,true)
    document.addEventListener('focusin',outside,true)
    return ()=>{document.removeEventListener('click',outside,true);document.removeEventListener('focusin',outside,true)}
  },[page?.id,write])
  async function openSource(source:Source,signal?:AbortSignal){
    await saveEditors()
    signal?.throwIfAborted()
    const data=await refresh(signal)
    signal?.throwIfAborted()
    const target=data.pages.find(p=>p.id===source.id&&!p.deleted)
    if(!target)throw Error(unavailableSource(data,source.id))
    if(data.offline&&target.availableOffline===false&&target.id!==page?.id)throw Error('Connect to open this source. This page is only available online.')
    showPage(target,source)
  }
  /** Select a page in its library scope and optionally reveal a cited block. */
  function showPage(target:Page,source?:Source){
    const destination=target.day?'journal':target.project===null?'all':String(target.project)
    if(scope!=='all'&&scope!==destination)navigate(destination)
    I(target.id);M(false)
    setCitationTarget(source)
  }
  useEffect(()=>{
    if(lib&&id&&!page){E(unavailableSource(lib,id));I(undefined);setCitationTarget(undefined)}
  },[!!lib,id,page?.id])
  function ask(kind:string,defaultName=''){if(kind==='Workspace')setNewZone(deviceZone);opener.current=document.activeElement as HTMLElement;G(kind);N(defaultName)}
  async function create(title:string,content?:string){
    const {id:newId}=await json((content===undefined?'pages':'pages/import-markdown')+suffix,'POST',{title,content,project:/^\d+$/.test(scope)?Number(scope):null})
    await refresh()
    I(newId);M(false)
  }
  async function change(data:object){await json('pages/'+id+suffix,'PATCH',data);await refresh()}
  /** A transport error can follow a commit. Keep the operation ID when the same choice is submitted again. */
  async function deliverMetadata(path:string,data:object,send:(operationId:string)=>Promise<unknown>){
    const key=JSON.stringify([lib?.replica,ws,path,data])
    if(metadataDelivery.current?.key!==key)metadataDelivery.current={key,operationId:metadataOperationId()}
    const delivery=metadataDelivery.current
    await send(delivery.operationId)
    await refresh()
    if(metadataDelivery.current===delivery)metadataDelivery.current=null
  }
  /** Use a durable queue for desktop project renames and deliver online changes directly. */
  async function submitProjectName(project:number,baseName:string,name:string,resolveName?:number){
    const path='projects/'+project+suffix,data={name,baseName,resolveName}
    await deliverMetadata(path,data,operationId=>desktopServer&&lib?.replica&&resolveName===undefined
      ?queueMetadata(lib.replica,projectRenameKey(project),{baseTitle:baseName,title:name},operationId)
      :json(path,'PATCH',{...data,operationId}))
  }
  /** Bind a move or conflict decision to the placement shown to the editor. */
  async function submitPageMove(page:Page,project:number|null,resolveMove?:number){
    const path='pages/'+page.id+suffix,data={project,baseProject:page.project,resolveMove}
    await deliverMetadata(path,data,operationId=>desktopServer&&lib?.replica&&resolveMove===undefined
      ?queueMetadata(lib.replica,page.id,{baseProject:page.project,project,pageTitle:page.title},operationId)
      :json(path,'PATCH',{...data,operationId}))
  }
  async function submit(){const title=name.trim();if(!title)return
    if(dialog==='Workspace'){const w=await json('workspaces','POST',{name:title,timeZone:newZone});chooseWorkspace(w.id)}
    if(dialog==='Project'||dialog==='Subproject'){const p=await json('projects'+suffix,'POST',{name:title,parent:dialog==='Subproject'?Number(scope):null});await refresh();navigate(String(p.id))}
    if(dialog==='Page')await create(title)
    if(dialog==='Rename project'){
      const base=renameBase.current
      if(!base||base.workspace!==ws||base.target!==activeProject?.project.id||lib?.replica!==base.replica)throw Error('Reopen the project to rename it.')
      await submitProjectName(base.target,base.title,title)
    }
    if(dialog==='Rename'){
      const base=renameBase.current
      if(!base||ws!==base.workspace||id!==base.target||lib?.replica!==base.replica)throw Error('Reopen the page to rename it.')
      if(lib?.replica){
        await queueMetadata(lib.replica,base.target,{baseTitle:base.title,title})
        await refresh()
      }else await change({title,baseTitle:base.title})
    }
    G('')
  }
  /** Checkpoint the open document before removing its project from navigation. */
  async function toggleProject(project:number,deleted:boolean){
    await saveEditors()
    await json('projects/'+project+suffix,'PATCH',{deleted})
    await refresh();navigate(deleted?'trash':String(project))
  }
  /** Export checkpointed writing from the connected host or the current authorized desktop copy. */
  async function download(){
    if(!page||!lib)return
    const query=new URLSearchParams({workspace:String(ws),origin:location.origin})
    const result=lib.offline?await deviceMarkdown(lib,ws,page.id):await json('pages/'+page.id+'/markdown?'+query).catch(async error=>{
      // The connection can drop before the library's next poll marks this window offline.
      if(!desktopServer||!lib.profile||!(error instanceof TypeError||[502,503,504].includes(error.status)))throw error
      const latest:Library=await json('library'+suffix)
      if(!latest.offline||latest.profile!==lib.profile||latest.replica!==lib.replica)throw error
      return deviceMarkdown(latest,ws,page.id)
    })
    const {markdown,omitted}=result
    downloadBlob(new Blob([markdown],{type:'text/markdown'}),(result.title??page.title)+'.md')
    const notice=omitted.length?'Markdown exported. Omitted '+omitted.join(', ')+'.':'Markdown exported.'
    U(result.metadataIncomplete?notice+' This older device copy cannot confirm attachment or field metadata.':notice)
  }
  async function logout(){await json('logout','POST',{});location.replace(location.pathname)}
  if(auth)return <SignIn openOffline={workspace=>{chooseWorkspace(workspace);A(false);reload(n=>n+1)}} opened={()=>{W(0);L(undefined);setCatalog(undefined);E('');A(false);reload(n=>n+1)}}/>
  if(!ws&&catalog)return <WorkspaceStart catalog={catalog} updated={setCatalog} missing={requested!==null} logout={()=>act(logout)} choose={chooseWorkspace}/>
  if(!lib)return <main className="login">{error||'Opening workspace…'}</main>
  /** Resolve the current workspace date again after checkpointing the open journal. */
  function startPage(){
    if(scope!=='journal'){ask('Page');return}
    afterSave(async()=>{
      const library=await refresh()
      if(library.removedPages?.some(item=>item.day===library.today)){U('Today’s journal entry was permanently deleted.');return}
      const draft=library.localJournalDays?.find(item=>item.day===library.today)
      if(draft){
        Q('');U('');M(false)
        requestAnimationFrame(()=>document.getElementById('journal-day-'+draft.id)?.focus())
        return
      }
      const entry=library.pages.find(item=>item.day===library.today)
      if(library.offline&&(!entry||(!entry.deleted&&!entry.availableOffline))){
        U('Today’s journal entry is unavailable on this device. Connect to open it.')
        return
      }
      if(!entry){U('Today’s journal entry is unavailable.');return}
      if(entry.deleted){navigate('trash');U(write?'This journal day is in the trash. Restore it to continue.':'This journal day is in the trash.');return}
      U('');I(entry.id);M(false)
    })
  }
  const createAction=(write||scope==='journal')&&scope!=='trash'&&<Button size={rows.length||query?'icon-sm':'sm'} title={scope==='journal'?'Open today':'New page'} aria-label={scope==='journal'?'Open today':'New page'} onClick={startPage}>{scope==='journal'?<CalendarDays/>:<Plus/>}{!rows.length&&!query&&(scope==='journal'?'Open today':'New page')}</Button>
  const importAction=write&&scope!=='trash'&&scope!=='journal'&&<Button variant="ghost" size="icon-sm" aria-label="Import Markdown" title="Import Markdown" onClick={()=>markdown.current?.click()}><Upload/></Button>
  const trashedTags=scope==='trash'?lib.tags.filter(tag=>tag.deleted&&tag.name.toLowerCase().includes(query.toLowerCase())):[]
  const showListTools=rows.length>0||trashProjects.length>0||trashedTags.length>0||!!query
  const emptyState=query
    ? {title:'No matching pages',detail:'Try another title or a word from the page.'}
    : scope==='trash'
      ? {title:'Trash is empty',detail:'Pages moved to the trash appear here.'}
      : scope==='journal'
        ? {title:'No journal entries yet',detail:lib.offline?'Connect to open the first journal entry.':write?'Open today’s entry to start writing.':'Journal entries appear here by date.'}
        : scope==='all'
          ? {title:'No pages yet',detail:write?'Pages you create here belong to this workspace.':'Pages shared with this workspace appear here.'}
          : {title:'No pages in this project',detail:write?'Create a page here or move one into this project.':'Pages added to this project appear here.'}
  /** Mount the destination before committing so Rivto records the approved delta in that document's undo history. */
  async function applyPageEdit(target:number,commit:()=>Promise<AppliedEdit>){
    let editor=page?.id===target?applyInEditor.current:journalEditors.current.get(target)?.apply.current
    if(!editor){
      const destination=lib?.pages.find(item=>item.id===target&&!item.deleted)
      if(!destination)throw Error(unavailableSource(lib!,target))
      flushSync(()=>showPage(destination))
      editor=applyInEditor.current
    }
    if(!editor)throw Error('The destination editor is unavailable.')
    await editor(target,commit)
  }
  async function decideProposal(proposal:ToolProposal,choice:'approve'|'dismiss'){
    const draft=proposal.draft
    const review=choice==='approve'&&draft?{reviewedPath:destinationPath(draft.project)}:undefined
    const commit=()=>json('proposals/'+proposal.id+'/'+choice+suffix,'POST',review)
    if(choice==='approve'&&proposal.edit&&proposal.page!==null){
      await applyPageEdit(proposal.page,commit)
      await refresh();M(false);U('Paragraph edit applied.')
    }else{
      const result=await commit()
      await refresh();if(choice==='approve'){I(result.page);M(false)}
    }
  }
  function showTag(id?:number){afterSave(()=>navigate(id?'tag/'+id:'tags'))}
  const linkedIds=new Set(lib.links.filter(link=>link.source===page?.id).map(link=>link.target))
  const linkedPages=lib.pages.filter(item=>linkedIds.has(item.id))
  /** Store the relationship by page ID so both views can resolve the current target title and availability. */
  async function changeLink(target:number,method:'PUT'|'DELETE'){
    if(!page)return
    await request('pages/'+page.id+'/links/'+target+suffix,{method})
    await refresh()
  }
  const documentHeading=page&&<div className="doc-head"><h1>{page.title}</h1>
    <PageTags key={page.id} page={page} ws={ws} lib={lib} refresh={refresh} report={E} checkpoint={saveEditors} showTag={showTag}/>
    {linkedPages.length>0&&<nav aria-label="Linked pages" data-part="linked-pages">{linkedPages.map(target=><span key={target.id}>
      <Link2 size={14} aria-hidden="true"/>{target.deleted?<span>{target.title} (in trash)</span>:<a href={'?workspace='+ws+'&page='+target.id} onClick={event=>{
        if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
        event.preventDefault();act(()=>openSource(target))
      }}>{target.title}</a>}
      {write&&<Button variant="ghost" size="icon-sm" title={'Unlink '+target.title} aria-label={'Unlink '+target.title} onClick={()=>act(()=>changeLink(target.id,'DELETE'))}><X/></Button>}
    </span>)}</nav>}{files.map(f=>{
      const availability=availabilityLabel(f.availableOffline)
      if(lib.offline&&f.availableOffline===false)return <Button key={f.id} size="sm" variant="ghost" disabled title="Download while online"><CloudDownload/>{f.name} · Online only</Button>
      return <Button asChild variant="link" size="sm" key={f.id}><a className="file" title={availability} aria-description={availability}
        href={'/api/pages/'+id+'/files/'+f.id+suffix} download={f.name} onClick={event=>{
          if(f.availableOffline!==undefined){event.preventDefault();act(()=>downloadAttachment(page.id,f))}
        }}>{availability&&(f.availableOffline?<HardDrive/>:<CloudDownload/>)}{f.name}</a></Button>
    })}</div>
  return <InlineTagsContext.Provider value={{tags:lib.tags,report:E,apply:async(page,block,choice)=>{
    await json('pages/'+page+'/tags'+suffix,'PUT',{block,active:true,...(choice.id?{tag:choice.id}:{name:choice.name})})
    await refresh()
  }}}><BlockLinkComposer.Provider value={blockComposer}><DragDropProvider><div className={'app'+(agentOpen?' agent-open':'')+(mobile?' menu-open':'')}>
    <nav ref={rail} tabIndex={-1} id="library-navigation" className="rail" aria-label="Library"><div className="brand"><Layers size={23}/> Chulane</div><Label className="sr-only" htmlFor="workspace-select">Workspace</Label><div className="workspace-switcher"><NativeSelect id="workspace-select" value={ws} onChange={e=>{const next=Number(e.target.value);afterSave(()=>chooseWorkspace(next))}}>{lib.workspaces.map(w=><NativeSelectOption key={w.id} value={w.id}>{w.name}</NativeSelectOption>)}</NativeSelect>
    {lib.owner&&lib.profile&&<WorkspaceMembers key={ws} workspace={ws} offline={lib.offline} changed={refresh}/>}
    {lib.archivedWorkspaces&&<Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Manage workspace archive" title="Manage workspace archive"><Archive/></Button></PopoverTrigger>
      <PopoverContent>{lib.owner&&<Button variant="ghost" onClick={()=>afterSave(async()=>{
        const result:WorkspaceCatalog=await json('workspaces/archive'+suffix,'PUT',{archived:true})
        chooseWorkspace(result.workspaces[0]?.id??0)
      })}><Archive/>Archive {workspace}</Button>}
        <ArchivedWorkspaces local={lib.desktop} items={lib.archivedWorkspaces} deleted={lib.deletedWorkspaces} changed={result=>L(current=>current&&({...current,workspaces:result.workspaces,archivedWorkspaces:result.archivedWorkspaces,deletedWorkspaces:result.deletedWorkspaces}))} restore={id=>afterSave(async()=>{await json('workspaces/archive?workspace='+id,'PUT',{archived:false});chooseWorkspace(id)})}/>
      </PopoverContent></Popover>}
    {write&&<Button variant="ghost" size="icon-sm" className="workspace-add" aria-label="New workspace" title="New workspace" onClick={()=>ask('Workspace')}><Plus/></Button>}</div>
    {!lib.offline&&<WorkspaceInvitations offers={lib.invitations??[]} changed={(catalog,id)=>{
      L(current=>current&&({...current,workspaces:catalog.workspaces,invitations:catalog.invitations}))
      if(id)afterSave(()=>chooseWorkspace(id))
    }}/>}
    {[['all','All pages',BookOpen],['journal','Journal',CalendarDays],['tags','Tags',Hash],['trash','Trash',Trash2]].map(([s,label,Icon]:any)=><Button variant="ghost" size="sm" key={s} aria-current={scope===s?'location':undefined} className={scope===s?'active':''} onClick={()=>afterSave(()=>navigate(s))}><Icon/>{label}</Button>)}
    <div className="caprow"><span>Projects</span>{write&&<Button variant="ghost" size="sm" title="New project" aria-label="New project" onClick={()=>ask('Project')}><Plus/></Button>}</div>
    {projects.map(({project:p,path,depth})=><Button title={path} style={{paddingInlineStart:12+Math.min(depth,8)*12}} variant="ghost" size="sm" key={p.id} aria-current={scope===String(p.id)?'location':undefined} className={scope===String(p.id)?'active':''} onClick={()=>afterSave(()=>navigate(String(p.id)))}><Folder/>{p.name}</Button>)}
    {page&&rows.length>0&&<section className="page-index" aria-label="Pages in this view"><div className="caprow">Pages</div>{rows.map(item=><div className="page-index-entry" key={item.id}><Button variant="ghost" size="sm" disabled={lib.offline&&item.availableOffline===false} title={availabilityLabel(item.availableOffline)} aria-description={availabilityLabel(item.availableOffline)} aria-current={item.id===page.id?'page':undefined} onClick={()=>afterSave(()=>{I(item.id);M(false);U('')})}><PageIcon available={item.availableOffline}/><span>{item.title}</span></Button>{agentOpen&&write&&<PageDragHandle page={item}/>}</div>)}</section>}
    <footer>{lib.serverAdmin&&!lib.offline&&<ServerSettings/>}<Appearance {...appearance}/><PendingRecovery catalog={lib}/>{lib.desktop&&<ServerPicker local={lib.workspaces} choose={id=>afterSave(()=>{if(id!==ws)chooseWorkspace(id)})}/>} {lib.desktop?'Local workspace':'Web workspace'} <Badge variant="outline" className="role">{lib.owner?'owner':lib.role}</Badge>{!lib.desktop&&<Button variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out" onClick={()=>afterSave(logout)}><LogOut/></Button>}</footer></nav>
    <main className="work"><header className="crumb"><Button variant="ghost" size="sm" ref={railToggle} className="rail-toggle" aria-label="Toggle navigation" title="Toggle navigation" aria-expanded={mobile} aria-controls="library-navigation" onClick={()=>M(!mobile)}><PanelLeft/></Button><Breadcrumb><BreadcrumbList><BreadcrumbItem>{workspace}</BreadcrumbItem><BreadcrumbSeparator/><BreadcrumbItem><Button variant="ghost" size="sm" onClick={()=>afterSave(()=>navigate(scope))}>{scopeTitle}</Button></BreadcrumbItem></BreadcrumbList></Breadcrumb><div data-part="document-tools" ref={setDocumentTools}/>{lib.replica&&write&&<WorkspaceSync key={lib.replica} workspace={ws} lib={lib} page={id} mounted={source=>source===id||journalEditors.current.has(source)} checkpoint={()=>saveEditors('server')}/>}<Button size="icon-sm" variant="ghost" aria-label="Agent" title="Workspace agent" aria-expanded={agentOpen} onClick={()=>setAgentOpen(!agentOpen)}><MessageSquareText/></Button>{page&&<Popover key={page.id}><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" title="Page actions" aria-label="Page actions"><Ellipsis/></Button></PopoverTrigger><PopoverContent align="end" aria-label="Page actions" className="page-actions">
    {write&&<><NativeSelect aria-label="Link to page" value="" onChange={e=>{const target=Number(e.target.value);act(()=>changeLink(target,'PUT'))}}>
      <NativeSelectOption value="" disabled>Link to page…</NativeSelectOption>
      {lib.pages.filter(item=>!item.deleted&&item.id!==page.id&&!linkedIds.has(item.id)).map(item=><NativeSelectOption key={item.id} value={item.id}>{item.title} · #{item.id}</NativeSelectOption>)}
    </NativeSelect><Button variant="ghost" size="sm" onClick={()=>{renameBase.current={target:page.id,title:page.title,workspace:ws,replica:lib.replica};ask('Rename',page.title)}}><Pencil/>Rename</Button>{!page.day&&<NativeSelect aria-label="Move to project" value={page.project||''} onChange={e=>act(()=>submitPageMove(page,Number(e.target.value)||null))}><NativeSelectOption value="">No project</NativeSelectOption>{projects.map(({project:p,path})=><NativeSelectOption key={p.id} value={p.id}>{path}</NativeSelectOption>)}</NativeSelect>}<Button variant="ghost" size="sm" disabled={lib.offline} title={lib.offline?'Connect to upload an attachment':undefined} onClick={()=>attachment.current?.click()}><Paperclip/>Attach</Button><Button variant="ghost" size="sm" aria-label="Move to trash" title="Move to trash" onClick={()=>afterSave(async()=>{await change({deleted:true});I(undefined)})}><Trash2/>Move to trash</Button></>}
    <Button variant="ghost" size="sm" onClick={()=>afterSave(download)}><ArrowDownToLine/>Markdown</Button></PopoverContent></Popover>}</header>
    {lib.offline&&<Alert role="status" className="message">{lib.signInRequired?<>Session expired · Working offline. <Button size="sm" variant="outline" onClick={()=>afterSave(()=>{selectCachedSession(null);A(true);reload(n=>n+1)})}>Sign in to sync</Button></>:'Offline · Previously opened documents are available on this device.'}</Alert>}
    {desktopServer&&lib.profile&&lib.replica&&!!lib.removedPages?.length&&<RemovedPageCopies key={lib.replica} profile={lib.profile} workspace={ws} replica={lib.replica} removed={lib.removedPages}/>}
    {!page&&activeProject&&write&&lib.projectNameConflicts?.filter(conflict=>conflict.project===activeProject.project.id).map(conflict=><Alert key={conflict.id} className="message">
      <strong>Conflicting project names</strong>
      {[activeProject.project.name,conflict.name].map(name=><Button key={name} variant="outline" size="sm" disabled={lib.offline}
        onClick={()=>act(()=>submitProjectName(conflict.project,activeProject.project.name,name,conflict.id))}>{name===activeProject.project.name?'Keep':'Use'} “{name}”</Button>)}
    </Alert>)}
    {page&&write&&lib.moveConflicts?.filter(conflict=>conflict.page===page.id).map(conflict=><Alert key={conflict.id} className="message">
      <strong>Conflicting page locations</strong>
      <Button variant="outline" size="sm" disabled={lib.offline} onClick={()=>act(()=>submitPageMove(page,page.project,conflict.id))}>Keep {locationLabel(page.project)}</Button>
      <Button variant="outline" size="sm" disabled={lib.offline||(conflict.project!==null&&!destinationPath(conflict.project))} onClick={()=>act(()=>submitPageMove(page,conflict.project,conflict.id))}>Use {locationLabel(conflict.project)}</Button>
    </Alert>)}
    {page&&write&&lib.titleConflicts?.filter(conflict=>conflict.page===page.id).map(conflict=><Alert key={conflict.id} className="message">
      <strong>Conflicting page titles</strong>
      {[page.title,conflict.title].map(title=><Button key={title} variant="outline" size="sm" disabled={lib.offline}
        onClick={()=>act(()=>change({title,baseTitle:page.title,resolveTitle:conflict.id}))}>{title===page.title?'Keep':'Use'} “{title}”</Button>)}
    </Alert>)}
    {lib.proposals.map(proposal=><Alert className="message" key={proposal.id}>
      {proposal.profile?'Tool request from profile '+proposal.profile:'Tool request'}{proposal.requestedBy&&' · '+proposal.requestedBy} · {proposal.edit?(proposal.edit.block?'Edit a block in':'Append a paragraph to'):proposal.page?'Rename page '+proposal.page+' to':'Create page'} {proposal.edit&&proposal.page!==null?<a href={suffix+'&page='+proposal.page+(proposal.edit.block?'&block='+encodeURIComponent(proposal.edit.block):'')}
        onClick={event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();act(()=>openSource({id:proposal.page!,title:proposal.title,block:proposal.edit!.block}))}}>{proposal.title} · #{proposal.page}</a>:'“'+proposal.title+'”'}
      {proposal.draft&&<DraftPreview draft={proposal.draft} shown={destinationPath(proposal.draft.project)}/>}
      {proposal.edit&&<div data-part="proposal-text">{proposal.edit.block&&<div><small>Before</small><p>{proposal.edit.before||'(empty)'}</p></div>}
        <div><small>After</small><p>{proposal.edit.after||'(empty)'}</p></div></div>}
      {(['approve','dismiss'] as const).map(choice=><Button variant="ghost" size="sm" key={choice} disabled={choice==='approve'&&!!proposal.draft&&proposal.draft.project!==null&&destinationPath(proposal.draft.project)===null} onClick={()=>afterSave(()=>decideProposal(proposal,choice))}>{choice}</Button>)}</Alert>)}
    {error&&<Alert variant="destructive" className="message">{error}<Button variant="ghost" size="icon-sm" title="Dismiss" aria-label="Dismiss" onClick={()=>E('')}><X/></Button></Alert>}{notice&&<Alert role="status" className="message">{notice}<Button variant="ghost" size="icon-sm" title="Dismiss" aria-label="Dismiss" onClick={()=>U('')}><X/></Button></Alert>}
    {page?<article className="doc" data-source-page={page.id}><BlockLinkPage.Provider value={write&&agentOpen?page:undefined}><Editor installation={lib.installation} onFileAdded={()=>refreshFiles(n=>n+1)} citationTarget={citationTarget?.id===page.id?citationTarget:undefined} finishCitation={setCitationTarget} report={E} title={page.title} key={(lib.replica??'')+'/'+page.id} replica={lib.replica} id={page.id} writable={write} workspace={ws} toolbar={documentTools} heading={documentHeading} initialText={page.plain} checkpoint={checkpoint} applyInEditor={applyInEditor} onSaved={plain=>savedText(page.id,plain)}/></BlockLinkPage.Provider></article>
    :tagsView?<TagsView key={scope} tag={currentTag} ws={ws} lib={lib} refresh={refresh} report={E} select={showTag} open={openSource}/>:<section className="library"><div className="heading"><h1>{scopeTitle}</h1><div className="actions">{scope==='journal'&&currentWorkspace&&<Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Journal time zone" title="Journal time zone"><Globe/></Button></PopoverTrigger><PopoverContent aria-label="Journal settings"><ZoneSelect value={currentWorkspace.timeZone} disabled={(!lib.desktop&&!lib.owner)||!write} onChange={timeZone=>act(async()=>{await json('workspaces'+suffix,'PATCH',{timeZone});await refresh()})}/></PopoverContent></Popover>}{activeProject&&write&&<><Button variant="ghost" size="icon-sm" aria-label="New subproject" title="New subproject" onClick={()=>ask('Subproject')}><FolderPlus/></Button><Button variant="ghost" size="icon-sm" aria-label="Rename project" title="Rename project" onClick={()=>{metadataDelivery.current=null;renameBase.current={target:activeProject.project.id,title:activeProject.project.name,workspace:ws,replica:lib.replica};ask('Rename project',activeProject.project.name)}}><Pencil/></Button><Button variant="ghost" size="icon-sm" aria-label="Trash project" title="Move project and contents to trash" onClick={()=>act(()=>toggleProject(activeProject.project.id,true))}><Trash2/></Button></>}{showListTools&&<>{importAction}{createAction}</>}</div></div>
    {showListTools&&<div data-part="library-filter"><div className="search"><Search/><Input ref={searchInput} aria-label="Search pages" placeholder="Search titles and contents" value={query} onChange={e=>Q(e.target.value)}/>{query&&<Button variant="ghost" size="sm" className="search-clear" title="Clear search" aria-label="Clear search" onClick={()=>{Q('');searchInput.current?.focus()}}><X/></Button>}</div>
    <small>{trashedTags.length>0&&<>{trashedTags.length} {trashedTags.length===1?'tag':'tags'} · </>}{trashProjects.length>0&&<>{trashProjects.length} {trashProjects.length===1?'project':'projects'} · </>}{rows.length} {rows.length===1?'page':'pages'}</small></div>}
    {trashedTags.length>0&&<ItemGroup aria-label="Trashed tags">{trashedTags.map(tag=><Item role="listitem" key={tag.id}><Hash size={16}/><strong>#{tag.name}</strong>{write&&<Button variant="ghost" size="icon-sm" aria-label={'Restore tag '+tag.name} title={'Restore tag '+tag.name} onClick={()=>act(async()=>{await json('tags/'+tag.id+suffix,'PATCH',{deleted:false});await refresh()})}><RotateCcw/></Button>}</Item>)}</ItemGroup>}
    {trashProjects.length>0&&<ItemGroup aria-label="Trashed projects">{trashProjects.map(p=><Item role="listitem" key={p.id} className="row"><ItemMedia><Folder/></ItemMedia><strong>{p.name}</strong>{write&&<Button variant="ghost" size="icon-sm" aria-label={'Restore project '+p.name} title="Restore project and contents" onClick={()=>act(()=>toggleProject(p.id,false))}><RotateCcw/></Button>}</Item>)}</ItemGroup>}
    {journal&&entries.length>0&&<Journal installation={lib.installation} key={ws} replica={lib.replica} workspace={ws} entries={entries} offline={!!lib.offline} hidden={!!query} writable={write} linkBlocks={agentOpen} editors={journalEditors.current} select={focusDay} saved={savedText} report={err=>E(err.message)} open={id=>afterSave(()=>I(id))}/>}
    {rows.length>0&&(!journal||!!query)&&<ItemGroup aria-label="Page list">{rows.map(p=>{
      const hit=searchHits?.get(p.id)
      const preview=hit?.excerpt??(hit?.attachment?hit.attachment.name+' · '+hit.attachment.excerpt:p.plain)
      return <Item role="listitem" size="sm" className="row" key={p.id}><ItemMedia>{agentOpen&&write&&!p.deleted?<PageDragHandle page={p}/>:<PageIcon available={p.availableOffline}/>}</ItemMedia><Button variant="ghost" size="sm" title={availabilityLabel(p.availableOffline)} aria-description={availabilityLabel(p.availableOffline)} disabled={!!p.deleted||lib.offline&&p.availableOffline===false} onClick={()=>afterSave(()=>{I(p.id);M(false);U('');setCitationTarget(hit)})}><strong>{p.title}</strong>{preview&&<small>{preview.slice(0,160)}</small>}</Button>{hit?.attachment&&<Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" title={'Matching attachments for '+p.title} aria-label={'Matching attachments for '+p.title}><Paperclip/></Button></PopoverTrigger><PopoverContent data-part="matching-attachments" aria-label={'Matching attachments for '+p.title}>
        {[hit.attachment,...(hit.additionalAttachments??[])].map(file=><a key={file.id} href={'/api/pages/'+p.id+'/files/'+file.id+suffix} download={file.name} onClick={event=>{
          if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
          event.preventDefault();act(()=>downloadAttachment(p.id,file))
        }}><ArrowDownToLine size={15} aria-hidden="true"/><span><strong>{file.name}</strong><small>{file.excerpt}</small></span></a>)}
      </PopoverContent></Popover>}{p.deleted&&write?<Button variant="ghost" size="icon-sm" title="Restore" aria-label="Restore" onClick={()=>act(async()=>{await json('pages/'+p.id+suffix,'PATCH',{deleted:false});await refresh()})}><RotateCcw/></Button>:<small>{p.day||lib.projects.find(i=>i.id===p.project)?.name}</small>}{!!p.deleted&&lib.owner&&!lib.offline&&<Dialog><DialogTrigger asChild><Button variant="ghost" size="icon-sm" title="Delete permanently" aria-label={'Permanently delete '+p.title}><Trash2/></Button></DialogTrigger>
        <DialogContent aria-describedby={undefined}><DialogTitle>Permanently delete “{p.title}”?</DialogTitle><p>The page and its attachments will be removed from this workspace. This cannot be undone.</p>
          <DialogFooter><DialogClose asChild><Button variant="outline" autoFocus>Cancel</Button></DialogClose><DialogClose asChild><Button variant="destructive" onClick={()=>act(async()=>{await json('pages/'+p.id+suffix,'DELETE');await refresh()})}>Delete permanently</Button></DialogClose></DialogFooter>
        </DialogContent></Dialog>}</Item>})}</ItemGroup>}
    {!rows.length&&!trashProjects.length&&!trashedTags.length&&<Empty><EmptyHeader><EmptyTitle>{emptyState.title}</EmptyTitle><EmptyDescription>{emptyState.detail}</EmptyDescription></EmptyHeader>{!query&&createAction&&<EmptyContent className="empty-actions">{createAction}{importAction}</EmptyContent>}</Empty>}</section>}
    </main>
    <AgentSidebar destinationPath={destinationPath} openProject={async project=>{await saveEditors();const data=await refresh();if(!data.projects.some(item=>item.id===project&&item.trashRoot===null))throw Error('Project is unavailable');navigate(String(project))}} key={ws} downloadAttachment={downloadAttachment} pages={lib.pages.filter(p=>!p.deleted)} ws={ws} page={agentPage} write={!!write} visible={agentOpen} close={()=>setAgentOpen(false)} open={openSource} applyPageEdit={applyPageEdit} checkpoint={saveEditors}/>
    <Input hidden ref={attachment} type="file" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f&&page)act(async()=>{await uploadPageFile(ws,page.id,fileHeaders,f.name,f);refreshFiles(n=>n+1)})}}/>
    <Input hidden ref={markdown} type="file" accept=".md,.markdown,text/markdown" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)act(async()=>{if(f.size>1024*1024)throw Error('Markdown import limit is 1 MiB');await create(f.name.replace(/\.m(?:arkdown|d)$/i,'')||'Imported page',await f.text())})}}/>
    <Dialog open={Boolean(dialog)} onOpenChange={open=>{if(!open)G('')}}>
      <DialogContent aria-describedby={undefined} onOpenAutoFocus={e=>{e.preventDefault();nameInput.current?.focus()}} onCloseAutoFocus={e=>{e.preventDefault();opener.current?.focus()}}>
        <DialogTitle>{dialog==='Rename'?'Rename page':dialog==='Rename project'?dialog:'New '+dialog.toLowerCase()}</DialogTitle>
        <form className="name-form" onSubmit={e=>{e.preventDefault();afterSave(submit)}}>
          <Label htmlFor="page-name">Name</Label><Input id="page-name" ref={nameInput} required maxLength={250} value={name} onChange={e=>N(e.target.value)}/>
          {dialog==='Workspace'&&<ZoneSelect value={newZone} onChange={setNewZone}/>}
          {error&&<Alert variant="destructive">{error}</Alert>}
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit">Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div></DragDropProvider></BlockLinkComposer.Provider></InlineTagsContext.Provider>
}
createRoot(document.getElementById('root')!).render(<App/>)
