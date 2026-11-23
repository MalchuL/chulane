/** Shared workspace shell. Both hosts call the same authenticated operations; the editor owns its save lifecycle. */
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {LiquiGlass} from '@liqui-design/glass'
import {Copy,Inbox,HardDrive,CloudDownload,LogOut,Archive,BookOpen,Globe,Hash,Link2,CalendarDays,Folder,Plus,Trash2,Search,FileText,Paperclip,Check,ArrowDownToLine,FolderPlus,FolderInput,PanelLeft,Layers,Upload,X,Ellipsis,MessageSquareText,RotateCcw,Pencil} from 'lucide-react'
import {defaultPreset,PreventSelection} from '@dnd-kit/dom'
import {DragDropProvider} from '@dnd-kit/react'
import {BlockLinkComposer,BlockLinkPage,type AttachBlockLinks} from './block-links'
import {installShellSelection} from './shell-selection'
import {tagSearchName} from '../shared/tag-search'
import {exactPageLabelsFirst,literalQuery,pageLabelMatches,wholeLabel} from '../shared/document-text'
import {readMarkdownFile} from '../shared/markdown-file'
import {DestinationPicker} from './destination-picker'
import {PageDragHandle} from './page-drag'
import {EditorDock,type DockTarget,type ViewHandle} from './editor-dock'
import {AgentSidebar} from './agent'
import {pageSource,sourceHref,type AppliedEdit,type DocumentTarget,type LibraryAttachmentHit,type LibrarySearchHit,type Source} from '../shared/agent'
import {DraftPreview} from './proposal-history'
import {editorTarget,inlinePageLinks} from '../shared/inline-page-links'
import {InlineTagsContext} from './inline-tags'
import {PageTags,TagsView} from './tags'
import {Journal,type JournalAnchor,type JournalEditors} from './journal'
import {Editor,type Checkpoint} from './editor'
import {EditorAddress,type EditorTarget} from './editor-address'
import {deviceMarkdown,searchDevicePages} from './offline-search'
import {projectRenameKey,queueMetadata,metadataOperationId,replayClosedDocuments,replayMetadata,withPendingLibrary,type MetadataChange} from './document-outbox'
import {Appearance,useDeviceTheme} from './appearance'
import {WorkspaceInvitations,WorkspaceMembers} from './workspace-members'
import {DocumentParticipants} from './document-participants'
import {WorkspaceSync} from './workspace-sync'
import {json,request} from './api'
import { Alert, ErrorAlert, Badge, Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator, Button,
  Dialog, DialogTrigger, DialogClose, DialogContent, DialogFooter, DialogTitle, DialogDescription, Empty, EmptyContent, EmptyDescription,
  EmptyHeader, EmptyTitle, Input, Item, ItemGroup, ItemMedia, Label, NativeSelect, NativeSelectOption, PopoverAnchor, Popover, PopoverContent,
  PopoverTrigger } from './ui'
import {SidebarHandle,restoreDesktopSidebarWidths} from './sidebar-handle'
import {ScrollArea} from './ui/scroll-area'
import {Toast} from 'radix-ui'
import {SettingsPanel} from './ui/settings-panel'
import {WorkspaceToast} from './ui/workspace-toast'
import './style.css'
import {projectHref,libraryPages,labeledFiles,labeledReferences,projectPaths,type Item as LibraryItem,type Library,type Page,type Tag,type ToolProposal,type WorkspaceCatalog} from '../shared/library'
import {ArchivedWorkspaces,WorkspaceStart,ZoneSelect,deviceZone} from './workspace-start'
import {uploadPageFile} from './page-files'
import {downloadBlob} from './download'
import {RemovedPageCopies} from './removed-page-copies'
import {PendingRecovery} from './pending-recovery'
import {ServerSettings} from './server-settings'
import {ServerPicker} from './server-picker'
import {desktopServer,selectCachedSession} from './offline-server'
import {useCreationRequest} from './use-creation-request'
import {usePendingSubmit} from './use-pending-submit'
import {SignIn} from './sign-in'
const railListsClass="rail-lists"
/** Keep only passages and file links whose visible text proves they match the refined query. */
function refineSearchHits(previous:Map<number,LibrarySearchHit>,literal:RegExp){
  const hits=new Map<number,LibrarySearchHit>(),exact=wholeLabel(literal)
  for(const hit of previous.values()){
    const {attachment,additionalAttachments,...document}=hit
    const files=attachment?[attachment,...(additionalAttachments??[])]:[]
    const matches=files.flatMap<LibraryAttachmentHit>(file=>{
      if(literal.test(file.excerpt))return [file]
      return literal.test(file.name)?[{id:file.id,name:file.name,availableOffline:file.availableOffline,matchedFilename:true,excerpt:''}]:[]
    }).sort((a,b)=>Number(exact.test(b.name))-Number(exact.test(a.name))||a.id-b.id)
    const passage=document.excerpt&&literal.test(document.excerpt)
    if(passage||matches.length)hits.set(hit.id,{
      ...(passage?document:pageSource(hit)),attachment:matches[0],additionalAttachments:matches.slice(1)
    })
  }
  return hits
}

/** Keep an active naming form reachable when the library scrolls or a catalog refresh replaces its opener. */
function namingAnchor(trigger:HTMLElement){
  let bounds=trigger.getBoundingClientRect()
  return {
    contextElement:trigger,
    getBoundingClientRect(){
      if(trigger.isConnected&&trigger.getClientRects().length)bounds=trigger.getBoundingClientRect()
      const width=document.documentElement.clientWidth,height=document.documentElement.clientHeight
      const left=Math.min(width,Math.max(0,bounds.left)),top=Math.min(height,Math.max(0,bounds.top))
      const right=Math.min(width,Math.max(0,bounds.right)),bottom=Math.min(height,Math.max(0,bounds.bottom))
      return new DOMRect(left,top,right-left,bottom-top)
    }
  }
}
const LIBRARY_REFRESH_MS=3500
type Attachment=LibraryItem & {availableOffline?:boolean}
function availabilityLabel(available?:boolean){return available===undefined?undefined:available?'Available offline':'Online only'}
/** Use the same availability label in search results and on the owning page. */
function OnlineOnlyAttachment({name}:{name:string}){
  return <Button size="sm" variant="ghost" disabled title="Download while online"><CloudDownload/>{name} · Online only</Button>
}
type DocumentFilesProps={
  pageId:number;workspace:number;replica?:string;offline?:boolean;revision:number;lastAttachmentId?:number|null
  download:(page:number,file:LibraryItem)=>Promise<void>;report:(message:string)=>void
}
/** Keep attachment rows mounted with their pane so changing editor focus preserves its layout. */
function DocumentFiles({pageId,workspace,replica,offline,revision,lastAttachmentId,download,report}:DocumentFilesProps){
  const [files,setFiles]=useState<Attachment[]>([])
  const path='pages/'+pageId+'/files'
  const suffix='?workspace='+workspace
  useEffect(()=>{
    let current=true
    const headers:Record<string,string>=replica?{'X-Chulane-Replica':replica}:{}
    void request(path+suffix,{headers}).then(response=>response.json()).then(items=>{
      if(current)setFiles(items)
    }).catch(error=>{if(current)report(error.message)})
    return ()=>{current=false}
  },[path,suffix,replica,offline,revision,lastAttachmentId,report])
  return <>{labeledFiles(files).map(({item:file,label})=>{
    const availability=availabilityLabel(file.availableOffline)
    if(offline&&file.availableOffline===false)return <OnlineOnlyAttachment key={file.id} name={label}/>
    return <Button asChild variant="link" size="sm" key={file.id}><a className="file" title={availability} aria-description={availability}
      href={'/api/'+path+'/'+file.id+suffix} download={file.name} onClick={event=>{
        if(file.availableOffline!==undefined){event.preventDefault();void download(pageId,file).catch(error=>report(error.message))}
      }}>{availability&&(file.availableOffline?<HardDrive/>:<CloudDownload/>)}{label}</a></Button>
  })}</>
}
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
type LinkedPageProps={target:Page;block?:string;surface?:DocumentTarget['surface'];label:string;workspace:number;offline?:boolean;open:()=>void}

/** Keep a reference readable while its target is trashed or unavailable on the disconnected device. */
function LinkedPage({target,block,surface,label,workspace,offline,open}:LinkedPageProps){
  if(target.deleted)return <span data-copyable="">{label} (in trash)</span>
  if(offline&&target.availableOffline===false)return <span role="link" aria-disabled="true" data-copyable=""
    title="Open this page while online to make it available offline">{label} · Online only</span>
  const availability=availabilityLabel(target.availableOffline)
  return <a href={sourceHref(workspace,{id:target.id,block,surface})} title={availability} aria-description={availability} onClick={event=>{
    if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
    event.preventDefault();open()
  }}>{label}</a>
}

type CopyPageReferenceProps={label:string;value:string;notify:(message:string,temporary?:boolean)=>void}

/** Keep the address selectable for native copy when the system denies clipboard access. */
function CopyPageReference({label,value,notify}:CopyPageReferenceProps){
  const input=useRef<HTMLInputElement>(null)
  async function copy(){
    try{
      await navigator.clipboard.writeText(value)
      notify(label+' copied.',true)
    }catch{
      if(!input.current)return
      input.current.focus({preventScroll:true})
      input.current.select()
      notify('Use the system Copy command to copy the selected '+label.toLowerCase()+'.')
    }
  }
  const action=label==='Page ID'?'Copy page ID':'Copy page link'
  return <div data-part="copy-page-reference">
    <Input ref={input} readOnly value={value} aria-label={label} title={value} onFocus={event=>event.currentTarget.select()}/>
    <Button type="button" size="icon-sm" variant="ghost" aria-label={action} title={action} onClick={copy}><Copy/></Button>
  </div>
}

// Reference grips copy links. Clearing the document-wide selection during their drop animation resets editor carets.
const referenceDragPlugins=defaultPreset.plugins.filter(plugin=>plugin!==PreventSelection)

function App(){
  const link=new URLSearchParams(location.search)
  const [ws,W]=useState(0),[lib,L]=useState<Library>(),[auth,A]=useState(false)
  const [libraryScope,S]=useState(()=>{
    const project=link.get('project')
    return !link.has('page')&&link.has('workspace')&&project&&/^[1-9]\d*$/.test(project)?project:'all'
  })
  const [target,I]=useState<DockTarget|undefined>(()=>Number(link.get('page'))||(link.get('view')==='journal'?'journal':undefined)),[searchInputValue,Q]=useState(''),[error,E]=useState(''),[dialog,G]=useState(''),[name,N]=useState(''),[mobile,M]=useState(false)
  const id=typeof target==='number'?target:undefined
  const scope=target==='journal'?'journal':libraryScope
  const [notice,setNotice]=useState<{message:string;temporary:boolean;revision:number}>()
  /** Reannounce repeated actions and keep warnings available until the user dismisses them. */
  function notify(message:string,temporary=false){
    setNotice(previous=>message?{message,temporary,revision:(previous?.revision??0)+1}:undefined)
  }
  const [citationTarget,setCitationTarget]=useState<EditorTarget|undefined>(()=>editorTarget(link))
  const [catalog,setCatalog]=useState<WorkspaceCatalog>(),[attempt,reload]=useState(0)
  const appearance=useDeviceTheme(window.chulaneAppearance?'desktop':auth?'signed-out':lib?.profile??catalog?.profile??'browser')
  const requested=link.get('workspace')
  const [newZone,setNewZone]=useState(deviceZone)
  const [activeSurface,setActiveSurface]=useState<'canvas'|'page'>('page')
  const [agentOpen,setAgentOpen]=useState(false)
  const [documentTools,setDocumentTools]=useState<HTMLDivElement|null>(null)
  const [closedViews,setClosedViews]=useState(0)
  const viewClosed=useCallback(()=>setClosedViews(count=>count+1),[])
  const views=useRef(new Map<string,ViewHandle>())
  const blockComposer=useRef<AttachBlockLinks|null>(null)
  const journalEditors=useRef<JournalEditors>(new Map())
  const focusedJournalPanel=useRef<string>('')
  function journalEditor(page:number){
    const matches=Array.from(journalEditors.current.values()).filter(entry=>entry.page===page)
    return matches.find(entry=>entry.panel===focusedJournalPanel.current)??matches[0]
  }
  const selectDock=useCallback((target?:DockTarget)=>{
    I(target)
    if(target===undefined)S(scope=>scope==='journal'?'all':scope)
  },[])
  const [journalAnchor,setJournalAnchor]=useState<JournalAnchor>()
  const [focusedDay,focusDay]=useState<number>()
  const selectJournalDay=useCallback((panel:string,id:number|undefined,surface:'page'|'canvas')=>{
    focusedJournalPanel.current=panel;focusDay(id);setActiveSurface(surface)
  },[])
  const handledJournalAnchor=useCallback((anchor:JournalAnchor)=>setJournalAnchor(current=>current===anchor?undefined:current),[])
  const attachment=useRef<HTMLInputElement>(null), markdown=useRef<HTMLInputElement>(null)
  const rail=useRef<HTMLElement>(null),railToggle=useRef<HTMLButtonElement>(null)
  const searchInput=useRef<HTMLInputElement>(null),libraryCrumb=useRef<HTMLButtonElement>(null)
  const metadataDelivery=useRef<{key:string;operationId:string}|null>(null)
  const renameBase=useRef<{target:number;title:string;workspace:number;replica?:string}|null>(null)
  const renaming=dialog.startsWith('Rename')
  const [actionsOpen,setActionsOpen]=useState(false)
  const [creationError,setCreationError]=useState('')
  const naming=usePendingSubmit()
  const creation=useCreationRequest()
  const markdownRequest=useCreationRequest(),importing=usePendingSubmit()
  useEffect(()=>{
    G(kind=>kind.startsWith('Rename')?'':kind)
    setActionsOpen(false)
  },[id,scope,ws,focusedDay])
  const pageActions=useRef<HTMLButtonElement>(null)
  const opener=useRef<HTMLElement|null>(null)
  const creationAnchor=useRef<ReturnType<typeof namingAnchor>|null>(null)
  const nameInput=useRef<HTMLInputElement>(null)
  useEffect(installShellSelection,[])
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

  const attaching=usePendingSubmit()
  const [fileRefresh,refreshFiles]=useState(0)
  const replica=lib?.replica
  const replicaHeaders:Record<string,string>=replica?{'X-Chulane-Replica':replica}:{}
  /** Keep every file in one picker selection bound to the same page throughout the upload. */
  async function attachFiles(target:Page,files:File[]){
    const failures:string[]=[]
    for(const file of files){
      try{await uploadPageFile(ws,target.id,replicaHeaders,file.name,file)}
      catch(error){failures.push(file.name+' — '+(error instanceof Error?error.message:String(error)))}
    }
    // Refresh even after a connection error: the server may have stored the last file before the response was lost.
    refreshFiles(n=>n+1)
    if(failures.length)throw Error('Confirmed '+(files.length-failures.length)+' of '+files.length+' attachments to '+target.title+'. '+failures.join('\n'))
    if(files.length>1)notify('Attached '+files.length+' files to '+target.title+'.',true)
  }
  async function downloadAttachment(pageId:number,file:LibraryItem){
    const path='pages/'+pageId+'/files/'+file.id+suffix
    const response=await request(path,{headers:replicaHeaders})
    downloadBlob(await response.blob(),file.name)
    const cached=response.headers.get('X-Chulane-File-Cached')
    if(cached!==null||response.headers.has('X-Chulane-Offline')){
      const availableOffline=cached==='1'||response.headers.has('X-Chulane-Offline')
      refreshFiles(revision=>revision+1)
      if(!availableOffline)notify('Downloaded. Offline storage is unavailable for this attachment.')
    }
  }
  /** Submit the Trash revision shown in the confirmation and reload the row after a conflict. */
  async function permanentlyDelete(page:Page){
    const headers={...replicaHeaders}
    if(page.trashRevision!==undefined)headers['X-Chulane-Trash-Revision']=String(page.trashRevision)
    try{
      await request('pages/'+page.id+suffix,{method:'DELETE',headers})
    }catch(error){
      if((error as {status?:number}).status===409)await refresh()
      throw error
    }
    await refresh()
  }
  const projects=Array.from(projectPaths(lib?.projects??[]))
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
  useEffect(()=>{
    if(lib&&/^\d+$/.test(scope)&&!activeProject){S('all');E('Project is unavailable.')}
  },[!!lib,scope,activeProject?.project.id])
  const parentProject=activeProject&&projects.find(entry=>entry.project.id===activeProject.project.parent)
  const query=searchInputValue.trim()
  const queryLower=query.toLowerCase()
  const tagFilter=scope!=='trash'&&tagSearchName(query)
  const workspaceProjectSearch=scope==='all'&&!!query&&!tagFilter
  const projectResults=workspaceProjectSearch
    ? projects.filter(({path})=>path.toLowerCase().includes(queryLower))
    : activeProject&&!tagFilter?projects.filter(({project})=>project.parent===activeProject.project.id&&project.name.toLowerCase().includes(queryLower)):[]
  const trashProjects=lib?.projects.filter(p=>scope==='trash'&&p.trashRoot===p.id&&!hiddenProjects.has(p.parent??0)&&p.name.toLowerCase().includes(query.toLowerCase()))??[]
  const visiblePages=lib?libraryPages(lib):[]
  const searchBlocks=useCallback(async(query:string,signal:AbortSignal):Promise<Source[]>=>{
    if(lib?.offline&&lib.profile&&lib.replica)return searchDevicePages(lib.profile,ws,lib.replica,!!write,query,signal,'sources')
    return (await request('search?workspace='+ws+'&q='+encodeURIComponent(query),{signal})).json()
  },[lib?.offline,lib?.profile,lib?.replica,ws,write])
  const inlineLinks=useMemo(()=>{
    const links=lib?.pages.flatMap(page=>page.deleted?[]:inlinePageLinks(page.plain,ws,location.origin,page.referenceBlockLengths).map(link=>({...link,source:page.id})))??[]
    const seen=new Set(links.filter(link=>!link.block&&!link.surface).map(link=>link.source+'/'+link.target))
    for(const ref of lib?.namedReferences??[]){
      const key=ref.source+'/'+ref.target
      if(!seen.has(key)){links.push({...ref,label:ref.name,block:undefined});seen.add(key)}
    }
    return links
  },[lib?.pages,lib?.namedReferences,ws])
  // Resolve names across the workspace so filtering the library never changes a tab's label.
  const pageLabel=useMemo(()=>{
    const references=[false,true].flatMap(deleted=>labeledReferences(
      lib?.pages.filter(page=>Boolean(page.deleted)===deleted)??[],page=>({id:page.id,name:page.title})))
    const labels=new Map(references.map(({item,label})=>[item.id,label]))
    return (page:Pick<Page,'id'|'title'>)=>labels.get(page.id)??page.title
  },[lib?.pages])
  const entries=visiblePages.filter(p=>p.day&&!p.deleted).sort((a,b)=>b.day!.localeCompare(a.day!))
  const [found,setFound]=useState<{ws:number;profile?:string;device?:string;write:boolean;query:string;error?:string;hits?:Map<number,LibrarySearchHit>}>()
  const pendingSearch=useRef<(()=>void)|null>(null)
  const searchProfile=lib?.profile
  const searchOnline=!!lib&&!page&&!tagsView&&!lib.offline&&scope!=='trash'&&!auth
  const device=lib?.offline&&scope!=='trash'&&!auth?lib.replica:undefined
  useEffect(()=>{
    if((!searchOnline&&!device)||!query){setFound(undefined);return}
    const controller=new AbortController()
    const search={ws,profile:searchProfile,device,write,query}
    let hits:Map<number,LibrarySearchHit>|undefined
    let timer=setTimeout(load,200)
    pendingSearch.current=()=>{clearTimeout(timer);void load()}
    async function load(){
      pendingSearch.current=null
      try{
        const results:LibrarySearchHit[]=device&&searchProfile
          ?await searchDevicePages(searchProfile,ws,device,write,query,controller.signal)
          :await (await request('library/search?workspace='+ws+'&q='+encodeURIComponent(query),{signal:controller.signal})).json()
        hits=new Map(results.map(hit=>[hit.id,hit]))
        if(!controller.signal.aborted)setFound({...search,hits})
      }catch(err){if(!controller.signal.aborted)setFound({...search,hits,error:(err as Error).message})}
      if(searchOnline&&!controller.signal.aborted)timer=setTimeout(load,LIBRARY_REFRESH_MS)
    }
    return ()=>{pendingSearch.current=null;clearTimeout(timer);controller.abort()}
  },[query,ws,searchProfile,searchOnline,device,write])
  const scopedSearch=(searchOnline||device)&&found?.device===device&&found?.ws===ws&&found.write===write&&found.profile===searchProfile?found:undefined
  const searchResult=scopedSearch?.query===query?scopedSearch:undefined
  const searchLiteral=useMemo(()=>query?literalQuery(query):null,[query])
  const searchHits=useMemo(()=>{
    if(searchResult)return searchResult.hits
    if(!tagFilter&&searchLiteral&&scopedSearch?.hits&&literalQuery(scopedSearch.query).test(query))
      return refineSearchHits(scopedSearch.hits,searchLiteral)
  },[scopedSearch,searchResult,searchLiteral,query,tagFilter])
  const searching=query&&(searchOnline||device)&&!searchResult
  const searchStatus=searching?'Searching…':searchResult?.error?'Search unavailable':undefined
  function matches(p:Page){
    if(!searchLiteral)return true
    if(tagFilter)return searchResult?.hits?.has(p.id)??false
    if(!searchResult?.hits)return searchHits?.has(p.id)||pageLabelMatches(p,searchLiteral)||searchLiteral.test(p.plain)
    // A queued device rename can be visible in the catalog before the host receives it.
    return searchResult.hits.has(p.id)||(!device&&pageLabelMatches(p,searchLiteral))
  }
  const filteredRows=scope==='journal'?entries.filter(matches):visiblePages.filter(p=>!hiddenProjects.has(p.project??0)&&Boolean(p.deleted)===(scope==='trash') && (scope==='all'||scope==='trash'||String(p.project)===scope) && matches(p)).reverse()
  const rows=searchLiteral?exactPageLabelsFirst(filteredRows,searchLiteral,page=>searchHits?.get(page.id)?.attachment?.name):filteredRows
  const journal=scope==='journal'&&!page
  const currentDocument=page??(journal&&!query?entries.find(entry=>entry.id>0&&entry.id===focusedDay):undefined)
  const windowTitle=workspace?[currentDocument?pageLabel(currentDocument):scopeTitle,workspace].join(' — '):'Chulane · Workspace'
  useEffect(()=>{if(document.documentElement.dataset.desktopWindow)document.title=windowTitle},[windowTitle])
  /** Persist every mounted day before navigation, including a day whose blur save is still running. */
  async function saveEditors(destination:Parameters<Checkpoint>[0]='device',sources?:ReadonlySet<number>){
    const editors=[...views.current.values(),...journalEditors.current.values()]
    await Promise.all(editors.filter(view=>!sources||sources.has(view.page)).map(view=>view.checkpoint.current?.(destination)))
  }
  /** Sync host reads and approval targets, including edits queued after a pane closed. */
  async function syncAgentPages(sources:readonly number[],signal=AbortSignal.timeout(30000)){
    const pages=new Set(sources)
    if(!pages.size)return
    await saveEditors('server',pages)
    signal.throwIfAborted()
    if(lib?.replica){
      await replayMetadata(lib.replica,ws,signal,lib.replica,undefined,new Set(sources.map(String)))
      await replayClosedDocuments(lib.replica,ws,id=>pages.has(id),signal)
    }
  }
  function savedText(id:number,plain:string,referenceBlockLengths?:number[]){L(l=>l&&({...l,pages:l.pages.map(p=>p.id===id?{...p,plain,referenceBlockLengths}:p)}))}

  // The rail precedes the breadcrumb toggle in DOM order, so enter it when the disclosure opens.
  useEffect(()=>{
    if(!mobile)return
    rail.current?.focus()
    function outside(event:PointerEvent){
      if(event.target instanceof Node&&!rail.current?.contains(event.target)&&!railToggle.current?.contains(event.target)
        &&!(event.target instanceof Element&&event.target.closest('[data-app-overlay], [role="listbox"]')))M(false)
    }
    function escape(event:KeyboardEvent){
      if(event.key==='Escape'&&!event.defaultPrevented&&rail.current?.contains(document.activeElement)){
        M(false);railToggle.current?.focus()
      }
    }
    document.addEventListener('pointerdown',outside)
    document.addEventListener('keydown',escape)
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[mobile])
  function navigate(next:string){if(mobile)railToggle.current?.focus();focusDay(undefined);if(next==='journal')setJournalAnchor({});setCitationTarget(undefined);I(next==='journal'?'journal':undefined);S(next);Q('');M(false);setNotice(undefined)}
  /** Reveal a dated page in the journal and move keyboard focus to its calendar heading. */
  function showJournalDay(item:Page){
    flushSync(()=>{navigate('journal');setJournalAnchor({day:item.day??undefined});focusDay(item.id)})
  }
  /** Provisional day IDs are device-local. Reveal their entry in the journal without publishing a page URL. */
  function openLibraryPage(item:Page,hit?:LibrarySearchHit,focusResult=false){
    if(item.id<0){
      showJournalDay(item)
    }else{I(item.id);M(false);setNotice(undefined);setCitationTarget(focusResult?{...hit,id:item.id,focusResult}:hit)}
  }
  /** Enter a child at its heading, or restore focus to that child's row when moving up. */
  function browseFolder(project:number,returnTo?:number){
    afterSave(()=>{
      flushSync(()=>navigate(String(project)))
      const row=returnTo===undefined?null:document.getElementById('subproject-'+returnTo)
      const destination=row??document.getElementById('project-heading-'+project)
      destination?.focus()
    })
  }
  /** Open a workspace without carrying over another workspace's editor, page link or cached library. */
  function chooseWorkspace(next:number){
    const url=new URL(location.href)
    url.searchParams.delete('project')
    if(next)url.searchParams.set('workspace',String(next));else url.searchParams.delete('workspace');url.searchParams.delete('page');url.searchParams.delete('block');url.searchParams.delete('view')
    history.replaceState(null,'',url)
    navigate('all');setCatalog(undefined);L(undefined);E('');W(next)
  }
  /** Wait for SQLite acknowledgment before an action can replace this editor. */
  function afterSave(action:()=>void|Promise<unknown>){act(async()=>{await saveEditors();await action()})}
  useEffect(()=>{
    if(!page?.id||!write)return
    function outside(event:Event){
      if(event.target instanceof Element&&!event.target.closest('.surface-body'))void saveEditors().catch(()=>{})
    }
    document.addEventListener('click',outside,true)
    document.addEventListener('focusin',outside,true)
    return ()=>{document.removeEventListener('click',outside,true);document.removeEventListener('focusin',outside,true)}
  },[page?.id,write])
  async function openSource(source:EditorTarget,signal?:AbortSignal){
    await saveEditors()
    signal?.throwIfAborted()
    const data=await refresh(signal)
    signal?.throwIfAborted()
    openCatalogSource(data,source)
  }
  /** Open a source already read from the current workspace catalog. */
  function openCatalogSource(data:Library,source:EditorTarget){
    const target=data.pages.find(p=>p.id===source.id&&!p.deleted)
    if(!target)throw Error(unavailableSource(data,source.id))
    if(data.offline&&target.availableOffline===false&&target.id!==page?.id)throw Error('Connect to open this source. This page is only available online.')
    showPage(target,source)
  }
  /** Checkpoint the source before navigating, including references opened immediately after editing. */
  async function openNamed(source:number,kind:string,name:string){
    await saveEditors()
    let data=await refresh()
    const target=()=>kind==='tag'?data.tags.find(tag=>tag.name===name&&!tag.deleted)?.id
      :data.namedReferences?.find(ref=>ref.source===source&&ref.name===name)?.target
    // An older saved document can be opened before its first checkpoint on this version.
    if(target()===undefined&&write&&!data.offline){
      await json('pages/'+source+'/references'+suffix,'POST')
      data=await refresh()
    }
    const matches=kind==='page'?data.pages.filter(p=>!p.deleted&&p.title===name):[]
    const destination=target()??(matches.length===1?matches[0]!.id:undefined)
    if(destination===undefined){
      if(data.offline)throw Error('Connect to sync this reference and open its destination.')
      if(matches.length>1)throw Error('Several pages share this title. Choose a page from the reference suggestions.')
      throw Error(kind==='tag'?'Tag unavailable.':'Page reference unavailable.')
    }
    if(kind==='tag')navigate('tag/'+destination)
    else openCatalogSource(data,{id:destination})
  }
  // A copied or modifier-clicked preview link carries the source so renamed targets retain their binding.
  useEffect(()=>{
    if(!lib||!ws||ws!==Number(requested))return
    const url=new URL(location.href),source=Number(url.searchParams.get('page'))
    const tag=url.searchParams.get('refTag'),name=tag??url.searchParams.get('refPage')
    if(!source||!name)return
    url.searchParams.delete('refTag');url.searchParams.delete('refPage')
    history.replaceState(history.state,'',url)
    act(()=>openNamed(source,tag?'tag':'page',name))
  },[!!lib,ws,requested])
  /** Select a page in its library scope and optionally reveal a cited block. */
  function showPage(target:Page,source?:EditorTarget){
    const destination=target.day?'journal':target.project===null?'all':String(target.project)
    if(scope!=='all'&&scope!==destination)navigate(destination)
    I(target.id);M(false)
    setCitationTarget(source)
  }
  useEffect(()=>{
    if(lib&&id&&!page){E(unavailableSource(lib,id));I(undefined);setCitationTarget(undefined)}
  },[!!lib,id,page?.id])
  function ask(kind:string,defaultName='',trigger=document.activeElement as HTMLElement){
    if(kind==='Workspace')setNewZone(deviceZone)
    opener.current=trigger
    if(!kind.startsWith('Rename')){
      setCreationError('')
      creation.reset()
      creationAnchor.current=namingAnchor(trigger)
    }
    G(kind);N(defaultName)
  }
  /** Bind retries to the same destination and contents until the created page can be opened. */
  async function create(title:string,content?:string){
    const project=/^\d+$/.test(scope)?Number(scope):null
    try{
      const page=content===undefined
        ?await creation.post('pages'+suffix,{title,project})
        :await markdownRequest.post('pages/import-markdown'+suffix,{title,project,content})
      await refresh()
      I(page.id);M(false)
      if(content!==undefined)markdownRequest.reset()
    }catch(error){
      if(content===undefined)throw error
      const status=(error as {status?:number}).status
      if(status&&status>=400&&status<500){markdownRequest.reset();throw error}
      throw Error('Import could not be confirmed. Select the same Markdown file again to retry.')
    }
  }
  async function change(data:object,target=id){await json('pages/'+target+suffix,'PATCH',data);await refresh()}
  /** Publish the durable device edit immediately, even before the next network probe detects an outage. */
  async function saveDeviceMetadata(replica:string,target:number|string,change:MetadataChange,operationId?:string){
    const apply=await queueMetadata(replica,target,change,operationId)
    L(current=>current?apply(current):current)
  }
  /** A transport error can follow a commit. Keep the operation ID when the same choice is submitted again. */
  async function deliverMetadata(path:string,data:object,send:(operationId:string)=>Promise<unknown>,deviceEdit?:{target:number|string;change:MetadataChange}){
    const key=JSON.stringify([lib?.replica,ws,path,data])
    if(metadataDelivery.current?.key!==key)metadataDelivery.current={key,operationId:metadataOperationId()}
    const delivery=metadataDelivery.current
    if(desktopServer&&lib?.replica&&deviceEdit){
      await saveDeviceMetadata(lib.replica,deviceEdit.target,deviceEdit.change,delivery.operationId)
    }else{
      await send(delivery.operationId)
      await refresh()
    }
    if(metadataDelivery.current===delivery)metadataDelivery.current=null
  }
  /** Use a durable queue for desktop project renames and deliver online changes directly. */
  async function submitProjectName(project:number,baseName:string,name:string,resolveName?:number){
    const path='projects/'+project+suffix,data={name,baseName,resolveName}
    await deliverMetadata(path,data,operationId=>json(path,'PATCH',{...data,operationId}),
      resolveName===undefined?{target:projectRenameKey(project),change:{baseTitle:baseName,title:name}}:undefined)
  }
  /** Bind a move or conflict decision to the placement shown to the editor. */
  async function submitPageMove(page:Page,project:number|null,resolveMove?:number){
    const path='pages/'+page.id+suffix,data={project,baseProject:page.project,resolveMove}
    await deliverMetadata(path,data,operationId=>json(path,'PATCH',{...data,operationId}),
      resolveMove===undefined?{target:page.id,change:{baseProject:page.project,project,pageTitle:page.title}}:undefined)
  }
  async function submit(){const title=name.trim();if(!title)return
    if(renaming&&title===renameBase.current?.title){G('');return}
    if(dialog==='Workspace'){const w=await creation.post('workspaces',{name:title,timeZone:newZone});chooseWorkspace(w.id)}
    if(dialog==='Project'||dialog==='Subproject'){const p=await creation.post('projects'+suffix,{name:title,parent:dialog==='Subproject'?Number(scope):null});await refresh();navigate(String(p.id))}
    if(dialog==='Page')await create(title)
    if(dialog==='Rename project'){
      const base=renameBase.current
      if(!base||base.workspace!==ws||base.target!==activeProject?.project.id||lib?.replica!==base.replica)throw Error('Reopen the project to rename it.')
      await submitProjectName(base.target,base.title,title)
    }
    if(dialog==='Rename'||dialog==='Rename library page'){
      const base=renameBase.current
      const target=dialog==='Rename'?currentDocument:rows.find(row=>row.id===base?.target&&!row.deleted)
      if(!base||ws!==base.workspace||target?.id!==base.target||lib?.replica!==base.replica)throw Error('Reopen the page to rename it.')
      if(lib?.replica){
        await saveDeviceMetadata(lib.replica,base.target,{baseTitle:base.title,title})
      }else await change({title,baseTitle:base.title},base.target)
    }
    G('')
  }
  /** Submit the displayed draft once, including the checkpoint that precedes the mutation. */
  function submitName(event:React.FormEvent){
    event.preventDefault()
    if(!name.trim())return
    const report=renaming?E:setCreationError
    report('')
    void naming.run(async()=>{
      await saveEditors()
      await submit()
      if(renaming)requestAnimationFrame(()=>{if(document.activeElement===document.body)opener.current?.focus({preventScroll:true})})
    }).catch(error=>report(error.message))
  }
  /** Checkpoint the open document before removing its project from navigation. */
  async function toggleProject(project:number,deleted:boolean){
    await saveEditors()
    await json('projects/'+project+suffix,'PATCH',{deleted})
    await refresh();navigate(deleted?'trash':String(project))
  }
  /** Export checkpointed writing from the connected host or the current authorized desktop copy. */
  async function download(target:Page){
    if(!lib)return
    const query=new URLSearchParams({workspace:String(ws),origin:location.origin})
    const result=lib.offline||target.id<0?await deviceMarkdown(lib,ws,target.id):await json('pages/'+target.id+'/markdown?'+query).catch(async error=>{
      // The connection can drop before the library's next poll marks this window offline.
      if(!desktopServer||!lib.profile||!(error instanceof TypeError||[502,503,504].includes(error.status)))throw error
      const latest:Library=await json('library'+suffix)
      if(!latest.offline||latest.profile!==lib.profile||latest.replica!==lib.replica)throw error
      return deviceMarkdown(latest,ws,target.id)
    })
    const {markdown,omitted}=result
    downloadBlob(new Blob([markdown],{type:'text/markdown'}),(result.title??target.title)+'.md')
    const notice=omitted.length?'Markdown exported. Omitted '+omitted.join(', ')+'.':'Markdown exported.'
    notify(result.metadataIncomplete?notice+' This older device copy cannot confirm attachment or field metadata.':notice,!result.metadataIncomplete&&!omitted.length)
  }
  async function logout(){await json('logout','POST',{});location.replace(location.pathname)}
  if(auth)return <SignIn openOffline={workspace=>{
    // Keep the requested destination when this device can reopen its owning workspace.
    if(requested===String(workspace)){L(undefined);W(workspace)}
    else chooseWorkspace(workspace)
    A(false);reload(n=>n+1)
  }} opened={()=>{W(0);L(undefined);setCatalog(undefined);E('');A(false);reload(n=>n+1)}}/>
  if(!ws&&catalog)return <WorkspaceStart catalog={catalog} updated={setCatalog} missing={requested!==null} logout={()=>act(logout)} choose={chooseWorkspace}/>
  if(!lib)return <main className="login">{error||'Opening workspace…'}</main>
  /** Resolve the current workspace date again after checkpointing the open journal. */
  function startPage(event:React.MouseEvent<HTMLButtonElement>){
    if(scope!=='journal'){ask('Page','',event.currentTarget);return}
    afterSave(async()=>{
      const library=await refresh()
      if(library.removedPages?.some(item=>item.day===library.today)){notify('Today’s journal entry was permanently deleted.');return}
      const draft=library.localJournalDays?.find(item=>item.day===library.today)
      if(draft){
        openLibraryPage(draft)
        return
      }
      const entry=library.pages.find(item=>item.day===library.today)
      if(library.offline&&(!entry||(!entry.deleted&&!entry.availableOffline))){
        notify('Today’s journal entry is unavailable on this device. Connect to open it.')
        return
      }
      if(!entry){notify('Today’s journal entry is unavailable.');return}
      if(entry.deleted){navigate('trash');notify(write?'This journal day is in the trash. Restore it to continue.':'This journal day is in the trash.');return}
      setNotice(undefined);I(entry.id);M(false)
    })
  }
  const listedProjectCount=projectResults.length+trashProjects.length
  const hasEntries=rows.length>0||listedProjectCount>0
  const createAction=(write||scope==='journal')&&scope!=='trash'&&<Button size={hasEntries||query?'icon-sm':'sm'} title={scope==='journal'?'Open today':'New page'} aria-label={scope==='journal'?'Open today':'New page'} onClick={startPage}>{scope==='journal'?<CalendarDays/>:<Plus/>}{!hasEntries&&!query&&(scope==='journal'?'Open today':'New page')}</Button>
  const importAction=write&&scope!=='trash'&&scope!=='journal'&&<Button variant="ghost" size="icon-sm" aria-label="Import Markdown" title="Import Markdown" disabled={importing.pending} onClick={()=>markdown.current?.click()}><Upload/></Button>
  const trashedTags=scope==='trash'?lib.tags.filter(tag=>tag.deleted&&tag.name.toLowerCase().includes(query.toLowerCase())):[]
  const showListTools=hasEntries||trashedTags.length>0||!!query
  const emptyState=query
    ? {title:activeProject?'No matching pages or subprojects':workspaceProjectSearch?'No matching pages or projects':'No matching pages',detail:'Try another name, filename, or word from the contents.'}
    : scope==='trash'
      ? {title:'Trash is empty',detail:'Pages moved to the trash appear here.'}
      : scope==='journal'
        ? {title:'No journal entries yet',detail:lib.offline?'Connect to open the first journal entry.':write?'Open today’s entry to start writing.':'Journal entries appear here by date.'}
        : scope==='all'
          ? {title:'No pages yet',detail:write?'Pages you create here belong to this workspace.':'Pages shared with this workspace appear here.'}
          : {title:'No pages in this project',detail:write?'Create a page here or move one into this project.':'Pages added to this project appear here.'}
  /** Mount the destination before committing so Rivto records the approved delta in that document's undo history. */
  async function applyPageEdit(target:number,commit:()=>Promise<AppliedEdit>){
    function destinationEditor(){
      const active=Array.from(views.current.values()).find(view=>view.page===target&&view.active)
      return active?.apply.current??(!query?journalEditor(target)?.apply.current:undefined)
    }
    let editor=destinationEditor()
    if(!editor){
      const destination=lib?.pages.find(item=>item.id===target&&!item.deleted)
      if(!destination)throw Error(unavailableSource(lib!,target))
      flushSync(()=>showPage(destination))
      editor=destinationEditor()
    }
    if(!editor)throw Error('The destination editor is unavailable.')
    await editor(target,commit)
  }
  async function decideProposal(proposal:ToolProposal,choice:'approve'|'dismiss',reviewedTitle?:string){
    const draft=proposal.draft
    const review=choice==='dismiss'?undefined:!draft?{reviewedTitle}
      :'day' in draft?{reviewedDay:draft.day}:{reviewedPath:destinationPath(draft.project)}
    if(choice==='approve'){
      if(proposal.page!==null)await syncAgentPages([proposal.page])
      else await saveEditors()
    }
    const commit=()=>json('proposals/'+proposal.id+'/'+choice+suffix,'POST',review)
    if(choice==='approve'&&proposal.edit&&proposal.page!==null){
      await applyPageEdit(proposal.page,commit)
      await refresh();M(false);notify('Paragraph edit applied.',true)
    }else{
      const result=await commit()
      await refresh();if(choice==='approve'){I(result.page);M(false)}
    }
  }
  function showTag(id?:number){afterSave(()=>navigate(id?'tag/'+id:'tags'))}
  const linkedIds=new Set(lib.links.filter(link=>link.source===currentDocument?.id).map(link=>link.target))
  const linkChoices=actionsOpen&&currentDocument&&write?lib.pages.filter(item=>!item.deleted&&item.id!==currentDocument.id&&!linkedIds.has(item.id)).map(item=>({id:item.id,
    name:lib.offline&&item.availableOffline===false?item.title+' · Online only':item.title})):[]
  /** Store the relationship by page ID so both views can resolve the current target title and availability. */
  async function changeLink(page:Page,target:number,method:'PUT'|'DELETE'){
    const path='pages/'+page.id+'/links/'+target+suffix
    await deliverMetadata(path,{method},operationId=>request(path,{method,headers:{'Idempotency-Key':operationId}}),
      lib?.offlinePageLinks?{target:page.id,change:{linkTarget:target,linked:method==='PUT',pageTitle:page.title}}:undefined)
  }
  /** Capture the originating pane's page ID and use the same assignment for server writes and replay. */
  async function setPageTag(page:Page,tag:Tag,active:boolean){
    const path='pages/'+page.id+'/tags'+suffix,data={tag:tag.id,active,block:''}
    await deliverMetadata(path,data,operationId=>json(path,'PUT',{...data,operationId}),
      lib?.offlinePageTags?{target:page.id,change:{tag:tag.id,tagName:tag.name,active,pageTitle:page.title}}:undefined)
  }
  /** Bind the draft to the observed title and the workspace where the user began editing. */
  function beginRename(kind:'Rename'|'Rename library page'|'Rename project',target:number,title:string,trigger:HTMLElement){
    metadataDelivery.current=null
    renameBase.current={target,title,workspace:ws,replica:lib!.replica}
    ask(kind,title,trigger)
    setActionsOpen(false)
  }
  /** Share keyboard handling and submission between a heading and a library row. */
  function renameForm(label:string){
    /** Restore the opener before returning focus to it. */
    function cancelRename(){
      flushSync(()=>G(''))
      opener.current?.focus({preventScroll:true})
    }
    return <form aria-label={label} onKeyDown={e=>{
        if(e.key==='Escape'&&!e.nativeEvent.isComposing&&!naming.pending){e.preventDefault();cancelRename()}
      }} aria-busy={naming.pending} onSubmit={submitName}>
        <Input aria-label="Name" readOnly={naming.pending} required maxLength={250} autoFocus onFocus={e=>e.currentTarget.select()} value={name} onChange={e=>N(e.target.value)}/>
        <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save" disabled={naming.pending||!name.trim()} title="Save name"><Check/></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" title="Cancel rename" disabled={naming.pending} onClick={cancelRename}><X/></Button>
      </form>
  }
  /** Edit in the title's existing footprint and retain the observed version until acknowledgement. */
  function titleHeading(title:string,kind:'Rename'|'Rename project',target:number){
    function start(event:React.SyntheticEvent<HTMLElement>){
      if(!write)return
      beginRename(kind,target,title,event.currentTarget)
    }
    const editing=write&&dialog===kind&&renameBase.current?.target===target
    return <div data-part="editable-title"><h1 id={kind==='Rename project'?'project-heading-'+target:undefined} tabIndex={-1}
      aria-keyshortcuts={write?'F2':undefined} title={write?'Press F2 to rename':undefined}
      onKeyDown={e=>{
        if(write&&e.key==='F2'&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();start(e)}
      }} style={editing?{visibility:'hidden'}:undefined}>{title}</h1>
      {write&&kind==='Rename'&&<Button data-part="rename-page" type="button" size="icon-sm" variant="ghost" hidden={editing}
        title="Rename page" aria-label="Rename page" onClick={start}><Pencil/></Button>}
      {editing&&renameForm(kind==='Rename'?'Rename page':kind)}
    </div>
  }
  /** Bind metadata and commands to this pane's page, including while another split has focus. */
  function documentProperties(document:Page,catalog:Library,showDate=false){
    const ids=new Set(catalog.links.filter(link=>link.source===document.id).map(link=>link.target))
    const linkedPages=labeledReferences(catalog.pages.filter(item=>ids.has(item.id)),page=>({id:page.id,name:page.title}))
    const inlineTargets=inlineLinks.filter(link=>link.source===document.id&&(link.block||link.surface||!ids.has(link.target))).flatMap(link=>{
      const target=catalog.pages.find(item=>item.id===link.target)
      if(!target)return []
      const detail=link.block?(link.label||link.block):link.surface==='canvas'?'Canvas':link.surface==='page'?'Page':undefined
      return [{target,block:link.block,surface:link.surface,label:detail?pageLabel(target)+' · '+detail:pageLabel(target)}]
    })
    const sources=new Set([...inlineLinks,...catalog.links].filter(link=>link.target===document.id).map(link=>link.source))
    const backlinks=catalog.pages.filter(item=>!item.deleted&&sources.has(item.id))
    return <ScrollArea key={document.id} data-part="document-properties" role="region" aria-label="Document properties">
    {showDate&&document.day&&<Button variant="ghost" size="sm" title="Show in journal" aria-label={'Show '+document.day+' in journal'}
      onClick={()=>afterSave(()=>showJournalDay(document))}><CalendarDays/><time data-copyable="" dateTime={document.day}>{document.day}</time></Button>}
    <PageTags page={document} setPageTag={setPageTag} ws={ws} lib={catalog} refresh={refresh} report={E} showTag={showTag}/>
    {linkedPages.length>0&&<nav aria-label="Linked pages" data-part="linked-pages">{linkedPages.map(({item:target,label})=><span key={target.id}>
      <Link2 size={14} aria-hidden="true"/><LinkedPage target={target} label={label} workspace={ws} offline={catalog.offline}
        open={()=>act(()=>openSource(target))}/>
      {write&&<Button variant="ghost" size="icon-sm" disabled={catalog.offline&&!catalog.offlinePageLinks} title={catalog.offline&&!catalog.offlinePageLinks?'Connect to remove this page link':'Unlink '+label} aria-label={'Unlink '+label} onClick={()=>act(()=>changeLink(document,target.id,'DELETE'))}><X/></Button>}
    </span>)}</nav>}
    {inlineTargets.length>0&&<nav aria-label="Inline references" data-part="linked-pages">{inlineTargets.map(({target,block,surface,label})=><LinkedPage key={sourceHref(ws,{id:target.id,block,surface})} target={target} block={block} surface={surface} label={label} workspace={ws} offline={catalog.offline} open={()=>act(()=>openSource({...target,block,surface}))}/>)}</nav>}
    {backlinks.length>0&&<nav aria-label="Referenced by" data-part="linked-pages"><small>Referenced by</small>{backlinks.map(source=><LinkedPage key={source.id} target={source} label={pageLabel(source)} workspace={ws} offline={catalog.offline} open={()=>act(()=>openSource(source))}/>)}</nav>}
    <DocumentFiles pageId={document.id} workspace={ws} replica={replica} offline={catalog.offline}
      revision={fileRefresh} lastAttachmentId={document.lastAttachmentId} download={downloadAttachment} report={E}/>
    </ScrollArea>
  }
  /** Bind every menu action to the selected day or docked page, including after asynchronous checkpoints. */
  function pageMenu(page:Page){
    if(!lib)return null
    return <Popover key={page.id} open={actionsOpen} onOpenChange={setActionsOpen}><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" ref={pageActions} title="Page actions" aria-label="Page actions"><Ellipsis/></Button></PopoverTrigger><PopoverContent align="end" aria-label="Page actions" className="page-actions" onCloseAutoFocus={event=>{if(renameBase.current&&dialog==='Rename')event.preventDefault()}}>
    {write&&<><DestinationPicker key={lib.offline&&!lib.offlinePageLinks?'unavailable':'available'} title="Link to page" search="Search pages to link" placeholder="Search by title or ID…" empty="No matching pages"
      trigger={<Button size="sm" variant="ghost" disabled={(lib.offline&&!lib.offlinePageLinks)||!linkChoices.length} title={lib.offline&&!lib.offlinePageLinks?'Connect to link pages':undefined}><Link2/>Link to page</Button>}
      choices={linkChoices} choose={target=>act(()=>changeLink(page,target,'PUT'))}/><Button variant="ghost" size="sm" onClick={()=>beginRename('Rename',page.id,page.title,pageActions.current!)}><Pencil/>Rename</Button>{!page.day&&<DestinationPicker title="Move to project" search="Search project destinations" placeholder="Search by folder path or ID…" empty="No matching projects"
        current={page.project} choices={[{id:null,name:'No project'},...projects.map(({project,path})=>({id:project.id,name:path}))]}
        trigger={<Button variant="ghost" size="sm" aria-label="Move to project" title={'Move to project · '+locationLabel(page.project)}
          aria-description={'Current location: '+locationLabel(page.project)}><FolderInput/><span data-part="move-location">{locationLabel(page.project)}</span></Button>}
        choose={project=>{if(project!==page.project)act(()=>submitPageMove(page,project))}}/>}<Button variant="ghost" size="sm" disabled={lib.offline||attaching.pending} aria-busy={attaching.pending} title={lib.offline?'Connect to upload an attachment':undefined} onClick={()=>attachment.current?.click()}><Paperclip/>{attaching.pending?'Attaching…':'Attach'}</Button><Button variant="ghost" size="sm" aria-label="Move to trash" disabled={lib.offline} title={lib.offline?'Connect to move this page to trash':'Move to trash'} onClick={()=>afterSave(async()=>{await change({deleted:true},page.id);if(journal)focusDay(undefined);else I(undefined)})}><Trash2/>Move to trash</Button></>}
    <Button variant="ghost" size="sm" onClick={()=>afterSave(()=>download(page))}><ArrowDownToLine/>Markdown</Button>
    <CopyPageReference label={lib.desktop?'Page ID':'Page link'} notify={notify} value={lib.desktop?'#'+page.id:
      new URL(sourceHref(ws,{id:page.id,surface:activeSurface==='canvas'?'canvas':'page'}),location.href).href}/>
    </PopoverContent></Popover>
  }
  const pendingCount=lib.proposals.length
  const reviewLabel=`Review ${pendingCount} pending request${pendingCount===1?'':'s'}`
  const pendingRequests=pendingCount>0&&<SettingsPanel title="Pending requests" trigger={
    <Button variant="ghost" size="icon-sm" data-part="request-count" aria-label={reviewLabel} title={reviewLabel}>
      <Inbox/><small aria-hidden="true">{pendingCount}</small>
    </Button>}>
    <ScrollArea data-part="pending-requests" role="region" aria-label="Requests to review" tabIndex={0}>
    {lib.proposals.map(proposal=>{
      const target=proposal.page===null?undefined:lib.pages.find(item=>item.id===proposal.page&&!item.deleted)
      const journalDay=proposal.draft&&'day' in proposal.draft?proposal.draft.day:null
      const occupied=!!journalDay&&(lib.pages.some(item=>item.day===journalDay)||lib.removedPages?.some(item=>item.day===journalDay))
      const rename=proposal.page!==null&&!proposal.edit
      const changed=rename&&target&&proposal.baseTitle!=null&&proposal.baseTitle!==target.title
      return <Alert className="message" key={proposal.id}>
      {proposal.profile?'Tool request from profile '+proposal.profile:'Tool request'}{proposal.requestedBy&&' · '+proposal.requestedBy} · {proposal.edit?(proposal.edit.block?'Edit a block in':'Append a paragraph to'):rename?'Rename':journalDay?'Create journal entry':'Create page'} {proposal.page!==null?<a data-copyable="" href={suffix+'&page='+proposal.page+(proposal.edit?.block?'&block='+encodeURIComponent(proposal.edit.block):'')}
        onClick={event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();act(()=>openSource({id:proposal.page!,block:proposal.edit?.block}))}}>{target?.title??(rename?'Page':proposal.title)} · #{proposal.page}</a>:'“'+proposal.title+'”'}
      {rename&&<> to “{proposal.title}”</>}
      {changed&&<p>The request was made when this page was “{proposal.baseTitle}”. {proposal.title===target.title||proposal.title===proposal.baseTitle?'Approval keeps the current title.':'Approval keeps the current title and saves the proposed title as an alternative.'}</p>}
      {(proposal.draft||proposal.edit)&&<ScrollArea role="region" aria-label="Requested content" tabIndex={0} data-part="request-preview">
      {proposal.draft&&<DraftPreview draft={proposal.draft} shown={'project' in proposal.draft?destinationPath(proposal.draft.project):undefined}/>}
      {proposal.edit&&<div data-part="proposal-text">{proposal.edit.block&&<div><small>Before</small><p>{proposal.edit.before||'(empty)'}</p></div>}
        <div><small>After</small><p>{proposal.edit.after||'(empty)'}</p></div></div>}
      </ScrollArea>}
      {occupied&&<p>This date already has a journal entry. Dismiss this request and review the existing page before editing it.</p>}
      {(['approve','dismiss'] as const).map(choice=><Button variant="ghost" size="sm" key={choice} disabled={choice==='approve'&&((proposal.page!==null&&!target)||occupied||(!!proposal.draft&&'project' in proposal.draft&&proposal.draft.project!==null&&destinationPath(proposal.draft.project)===null))} onClick={()=>act(()=>decideProposal(proposal,choice,target?.title))}>{choice}</Button>)}</Alert>})}
    </ScrollArea></SettingsPanel>
  const layoutKey=JSON.stringify(['chulane-editor-layout-v1',lib.installation,lib.profile??lib.role,lib.replica,ws])
  return <Toast.Provider swipeDirection="right"><InlineTagsContext.Provider value={{pages:lib.pages,namedReferences:lib.namedReferences,workspace:ws,pageLabel,searchBlocks,openNamed,open:openSource,tags:lib.tags,report:E,apply:lib.offline?undefined:async(page,block,choice)=>{
    await json('pages/'+page+'/tags'+suffix,'PUT',{block,active:true,fromWriting:true,...(choice.id?{tag:choice.id}:{name:choice.name})})
    await refresh()
  }}}><BlockLinkComposer.Provider value={blockComposer}><DragDropProvider plugins={referenceDragPlugins}><div className={'app'+(agentOpen?' agent-open':'')+(mobile?' menu-open':'')}>
    <nav ref={rail} tabIndex={-1} id="library-navigation" className="rail" aria-label="Library"><SidebarHandle side="library" report={E}/>
    <ScrollArea className={railListsClass} role="region" aria-label="Library navigation lists" tabIndex={0}><div data-part="rail-navigation"><div className="brand"><Layers size={23}/> Chulane</div><Label className="sr-only" htmlFor="workspace-select">Workspace</Label><div className="workspace-switcher">
      {appearance.glass&&<LiquiGlass data-part="workspace-lens" aria-hidden="true" radius={12} specular={.32} edgeShade={.08} hairline={.08} refraction={14} bezel={6} dispersion={0} blur={.5} frost={.12}/>}
      <NativeSelect id="workspace-select" title={workspace} value={ws} onChange={e=>{const next=Number(e.target.value);afterSave(()=>chooseWorkspace(next))}}>{lib.workspaces.map(w=><NativeSelectOption key={w.id} value={w.id}>{w.name}</NativeSelectOption>)}</NativeSelect>
    {lib.owner&&lib.profile&&<WorkspaceMembers key={ws} workspace={ws} offline={lib.offline} changed={refresh}/>}
    {lib.archivedWorkspaces&&<Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Manage workspace archive" title="Manage workspace archive"><Archive/></Button></PopoverTrigger>
      <PopoverContent>{lib.owner&&<Button variant="ghost" onClick={()=>afterSave(async()=>{
        const result:WorkspaceCatalog=await json('workspaces/archive'+suffix,'PUT',{archived:true})
        chooseWorkspace(result.workspaces[0]?.id??0)
      })}><Archive/>Archive {workspace}</Button>}
        <ArchivedWorkspaces local={lib.desktop} items={lib.archivedWorkspaces} deleted={lib.deletedWorkspaces} changed={result=>L(current=>current&&({...current,workspaces:result.workspaces,archivedWorkspaces:result.archivedWorkspaces,deletedWorkspaces:result.deletedWorkspaces}))} restore={id=>afterSave(async()=>{await json('workspaces/archive?workspace='+id,'PUT',{archived:false});chooseWorkspace(id)})}/>
      </PopoverContent></Popover>}
    {write&&<Button variant="ghost" size="icon-sm" className="workspace-add" aria-label="New workspace" title="New workspace" onClick={event=>ask('Workspace','',event.currentTarget)}><Plus/></Button>}</div>
    {!lib.offline&&<WorkspaceInvitations offers={lib.invitations??[]} changed={(catalog,id)=>{
      L(current=>current&&({...current,workspaces:catalog.workspaces,invitations:catalog.invitations}))
      if(id)afterSave(()=>chooseWorkspace(id))
    }}/>}
    {[['all','All pages',BookOpen],['journal','Journal',CalendarDays],['tags','Tags',Hash],['trash','Trash',Trash2]].map(([s,label,Icon]:any)=><Button variant="ghost" size="sm" key={s} aria-current={scope===s?'location':undefined} className={scope===s?'active':''} onClick={()=>afterSave(()=>navigate(s))}><Icon/>{label}</Button>)}
    <div className="caprow"><span>Projects</span>{write&&<Button variant="ghost" size="sm" title="New project" aria-label="New project" onClick={event=>ask('Project','',event.currentTarget)}><Plus/></Button>}</div>
    <ScrollArea className="project-index" aria-label="Projects">{labeledReferences(projects,entry=>entry.project).map(({item:{project:p,path,depth},label})=><Button title={label===p.name?path:path+' · #'+p.id} style={{paddingInlineStart:12+Math.min(depth,8)*12}} variant="ghost" size="sm" key={p.id} aria-current={scope===String(p.id)?'location':undefined} className={scope===String(p.id)?'active':''} onClick={()=>afterSave(()=>navigate(String(p.id)))}><Folder/><span>{label}</span></Button>)}</ScrollArea>
    {page&&rows.length>0&&<section className="page-index" aria-label="Pages in this view"><div className="caprow">Pages</div><ScrollArea aria-label="Page list">{rows.map(item=><div className="page-index-entry" key={item.id}><Button variant="ghost" size="sm" disabled={lib.offline&&item.availableOffline===false} title={availabilityLabel(item.availableOffline)} aria-description={availabilityLabel(item.availableOffline)} aria-current={item.id===page.id?'page':undefined} onClick={()=>afterSave(()=>openLibraryPage(item))}><PageIcon available={item.availableOffline}/><span>{pageLabel(item)}</span></Button>{agentOpen&&write&&item.id>0&&<PageDragHandle page={item}/>}</div>)}</ScrollArea></section>}
    </div></ScrollArea>
    <footer>{lib.serverAdmin&&!lib.offline&&<ServerSettings/>}<Appearance {...appearance}/><PendingRecovery catalog={lib}/>{lib.desktop&&<ServerPicker local={lib.workspaces} choose={id=>afterSave(()=>{if(id!==ws)chooseWorkspace(id)})}/>} <span data-part="workspace-location">{lib.desktop?'Local workspace':'Web workspace'}</span> <Badge variant="outline" className="role">{lib.owner?'owner':lib.role}</Badge>{!lib.desktop&&<Button variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out" onClick={()=>afterSave(logout)}><LogOut/></Button>}</footer></nav>
    <main className="work" data-journal={journal?(query?'search':'open'):undefined}><header className="crumb"><Button variant="ghost" size="sm" ref={railToggle} className="rail-toggle" aria-label="Toggle navigation" title="Toggle navigation" aria-expanded={mobile} aria-controls="library-navigation" onClick={()=>M(!mobile)}><PanelLeft/></Button><Breadcrumb><BreadcrumbList><BreadcrumbItem data-copyable="">{workspace}</BreadcrumbItem><BreadcrumbSeparator/>{!page&&parentProject&&activeProject&&<><BreadcrumbItem><Button variant="ghost" size="sm" aria-label={'Up to '+parentProject.project.name} title={parentProject.path} onClick={()=>browseFolder(parentProject.project.id,activeProject.project.id)}>{parentProject.project.name}</Button></BreadcrumbItem><BreadcrumbSeparator/></>}<BreadcrumbItem><Button ref={libraryCrumb} variant="ghost" size="sm" onClick={()=>afterSave(()=>navigate(scope))}>{scopeTitle}</Button></BreadcrumbItem></BreadcrumbList></Breadcrumb><div data-part="document-tools" ref={setDocumentTools}/>{lib.replica&&write&&<WorkspaceSync closedViews={closedViews} key={lib.replica} workspace={ws} lib={lib} page={id} mounted={source=>Array.from(views.current.values()).some(view=>view.page===source)||!!journalEditor(source)} checkpoint={()=>saveEditors('server')}/>}<div data-part="agent-commands">{currentDocument&&lib.presence&&lib.profile&&!lib.offline&&<DocumentParticipants key={lib.profile+'/'+ws+'/'+currentDocument.id} workspace={ws} page={currentDocument.id} replica={lib.replica} profile={lib.profile}/>}<span className="sr-only" aria-live="polite" aria-atomic="true">{pendingCount>0?reviewLabel:''}</span>{pendingRequests}<Button size="icon-sm" variant="ghost" aria-label="Agent" title="Workspace agent" aria-expanded={agentOpen} onClick={()=>setAgentOpen(!agentOpen)}><MessageSquareText/></Button></div>{currentDocument&&pageMenu(currentDocument)}</header>
    {lib.offline&&<Alert role="status" className="message">{lib.signInRequired?<>Session expired · Working offline. <Button size="sm" variant="outline" onClick={()=>afterSave(()=>{selectCachedSession(null);A(true);reload(n=>n+1)})}>Sign in to sync</Button></>:'Offline · Previously opened documents are available on this device.'}</Alert>}
    {desktopServer&&lib.profile&&lib.replica&&!!lib.removedPages?.length&&<RemovedPageCopies key={lib.replica} profile={lib.profile} workspace={ws} replica={lib.replica} removed={lib.removedPages} notify={notify}/>}
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
    {error&&<WorkspaceToast key={'error-'+error} message={error} error dismiss={()=>E('')}/>}
    {notice&&<WorkspaceToast key={'notice-'+notice.revision} message={notice.message} temporary={notice.temporary} dismiss={()=>setNotice(undefined)}/>}
    {!id&&<EditorAddress workspace={ws} project={activeProject?.project.id} journal={journal}/>}
    {page?null:tagsView?<TagsView key={scope} tag={currentTag} ws={ws} lib={lib} refresh={refresh} report={E} select={showTag} open={openSource}/>:<section className="library"><div className="heading">{activeProject?titleHeading(scopeTitle,'Rename project',activeProject.project.id):<h1>{scopeTitle}</h1>}<div className="actions">{scope==='journal'&&currentWorkspace&&<Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Journal time zone" title="Journal time zone"><Globe/></Button></PopoverTrigger><PopoverContent aria-label="Journal settings"><ZoneSelect value={currentWorkspace.timeZone} disabled={(!lib.desktop&&!lib.owner)||!write} onChange={timeZone=>act(async()=>{await json('workspaces'+suffix,'PATCH',{timeZone});await refresh()})}/></PopoverContent></Popover>}{activeProject&&write&&<><Button variant="ghost" size="icon-sm" aria-label="New subproject" title="New subproject" onClick={event=>ask('Subproject','',event.currentTarget)}><FolderPlus/></Button><Button variant="ghost" size="icon-sm" aria-label="Rename project" title="Rename project" onClick={event=>beginRename('Rename project',activeProject.project.id,activeProject.project.name,event.currentTarget)}><Pencil/></Button><Button variant="ghost" size="icon-sm" aria-label="Trash project" title="Move project and contents to trash" onClick={()=>act(()=>toggleProject(activeProject.project.id,true))}><Trash2/></Button></>}{showListTools&&<>{importAction}{createAction}</>}</div></div>
    {(showListTools||scope==='all'&&projects.length>0)&&<div data-part="library-filter"><div className="search"><Search/><Input ref={searchInput} maxLength={4096} aria-label={activeProject?'Search this project':scope==='all'?'Search pages and projects':'Search pages'} placeholder={activeProject?'Search pages, attachments and subprojects':journal?'Search entries by date or text':scope==='all'?'Search pages, projects, files or #tag':'Search pages and attachments'} value={searchInputValue} onChange={e=>Q(e.target.value)} enterKeyHint="search" onKeyDown={event=>{
      if(event.key==='Enter'&&!event.nativeEvent.isComposing&&!event.repeat)pendingSearch.current?.()
    }}/>{searchInputValue&&<Button variant="ghost" size="sm" className="search-clear" title="Clear search" aria-label="Clear search" onClick={()=>{Q('');searchInput.current?.focus()}}><X/></Button>}</div>
    <small role="status" aria-label="Library search" title={searchResult?.error}>{searchStatus??<>{trashedTags.length>0&&<>{trashedTags.length} {trashedTags.length===1?'tag':'tags'} · </>}{listedProjectCount>0&&<>{listedProjectCount} {listedProjectCount===1?'project':'projects'} · </>}{rows.length} {rows.length===1?'page':'pages'}</>}</small></div>}
    {projectResults.length>0&&<ItemGroup aria-label={workspaceProjectSearch?'Matching projects':'Subprojects'}>{labeledReferences(projectResults,({project,path})=>({id:project.id,name:workspaceProjectSearch?path:project.name})).map(({item:{project,path},label})=><Item role="listitem" size="sm" className="row" key={project.id}>
      <ItemMedia><Folder/></ItemMedia><Button asChild variant="ghost" size="sm"><a id={'subproject-'+project.id} title={path} href={projectHref(ws,project.id)} onClick={event=>{
        if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
        event.preventDefault();browseFolder(project.id)
      }}><strong>{label}</strong></a></Button>
    </Item>)}</ItemGroup>}
    {trashedTags.length>0&&<ItemGroup aria-label="Trashed tags">{trashedTags.map(tag=><Item role="listitem" key={tag.id}><Hash size={16}/><strong>#{tag.name}</strong>{write&&<Button variant="ghost" size="icon-sm" aria-label={'Restore tag '+tag.name} title={'Restore tag '+tag.name} onClick={()=>act(async()=>{await json('tags/'+tag.id+suffix,'PATCH',{deleted:false});await refresh()})}><RotateCcw/></Button>}</Item>)}</ItemGroup>}
    {trashProjects.length>0&&<ItemGroup aria-label="Trashed projects">{labeledReferences(trashProjects,p=>p).map(({item:p,label})=><Item role="listitem" key={p.id} className="row"><ItemMedia><Folder/></ItemMedia><strong>{label}</strong>{write&&<Button variant="ghost" size="icon-sm" aria-label={'Restore project '+label} title="Restore project and contents" onClick={()=>act(()=>toggleProject(p.id,false))}><RotateCcw/></Button>}</Item>)}</ItemGroup>}
    {rows.length>0&&(!journal||!!query)&&<ItemGroup aria-label="Page list">{rows.map(p=>{
      const label=pageLabel(p)
      const hit=searchHits?.get(p.id)
      const preview=hit?.excerpt??(hit?.attachment?[hit.attachment.name,hit.attachment.excerpt].filter(Boolean).join(' · '):p.plain)
      const canRename=write&&!p.deleted&&(!lib.offline||p.availableOffline!==false)
      const editing=canRename&&dialog==='Rename library page'&&renameBase.current?.target===p.id
      function startRename(trigger:HTMLElement){
        beginRename('Rename library page',p.id,p.title,trigger)
      }
      return <Item role="listitem" size="sm" className="row" key={p.id}><ItemMedia>{agentOpen&&write&&!p.deleted&&p.id>0?<PageDragHandle page={p}/>:<PageIcon available={p.availableOffline}/>}</ItemMedia>
        <div data-part="library-page-title" data-writable={canRename||undefined}>
          <Button variant="ghost" size="sm" style={editing?{visibility:'hidden'}:undefined}
            title={availabilityLabel(p.availableOffline)} aria-description={availabilityLabel(p.availableOffline)}
            disabled={!!p.deleted||lib.offline&&p.availableOffline===false} aria-keyshortcuts={canRename?'F2':undefined}
            onKeyDown={event=>{
              if(canRename&&event.key==='F2'&&!event.altKey&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey){
                event.preventDefault();startRename(event.currentTarget)
              }
            }}
            onClick={event=>afterSave(()=>openLibraryPage(p,hit,event.detail===0))}>
            <strong>{label}</strong>{preview&&<small>{preview.slice(0,160)}</small>}
          </Button>
          {canRename&&<Button type="button" data-part="row-pencil" hidden={editing} size="icon-sm" variant="ghost"
            title={'Rename '+label} aria-label="Rename page" onClick={event=>startRename(event.currentTarget)}><Pencil/></Button>}
          {editing&&renameForm('Rename page')}
        </div>{hit?.attachment&&<Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" title={'Matching attachments for '+p.title} aria-label={'Matching attachments for '+p.title}><Paperclip/></Button></PopoverTrigger><PopoverContent data-part="matching-attachments" aria-label={'Matching attachments for '+p.title}>
        <ScrollArea role="region" aria-label="Attachment results">{labeledFiles([hit.attachment,...(hit.additionalAttachments??[])]).map(({item:file,label})=>file.availableOffline===false
          ? <OnlineOnlyAttachment key={file.id} name={label}/>
          : <a key={file.id} href={'/api/pages/'+p.id+'/files/'+file.id+suffix} download={file.name} onClick={event=>{
          if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
          event.preventDefault();act(()=>downloadAttachment(p.id,file))
        }}><ArrowDownToLine size={15} aria-hidden="true"/><span><strong data-copyable="">{label}</strong>{file.excerpt&&<small data-copyable="">{file.excerpt}</small>}</span></a>)}</ScrollArea>
      </PopoverContent></Popover>}{p.deleted&&write?<Button variant="ghost" size="icon-sm" title={'Restore '+label} aria-label={'Restore '+label} onClick={()=>act(async()=>{await json('pages/'+p.id+suffix,'PATCH',{deleted:false});await refresh()})}><RotateCcw/></Button>:<small>{p.day||lib.projects.find(i=>i.id===p.project)?.name}</small>}{!!p.deleted&&lib.owner&&!lib.offline&&<Dialog key={p.trashRevision}><DialogTrigger asChild><Button variant="ghost" size="icon-sm" title={'Permanently delete '+label} aria-label={'Permanently delete '+label}><Trash2/></Button></DialogTrigger>
        <DialogContent><DialogTitle>Permanently delete “{label}”?</DialogTitle><DialogDescription>The page and its attachments will be removed from this workspace. This cannot be undone.</DialogDescription>
          <DialogFooter><DialogClose asChild><Button variant="outline" autoFocus>Cancel</Button></DialogClose><DialogClose asChild><Button variant="destructive" onClick={()=>act(()=>permanentlyDelete(p))}>Delete permanently</Button></DialogClose></DialogFooter>
        </DialogContent></Dialog>}</Item>})}</ItemGroup>}
    {!searchStatus&&!hasEntries&&!trashedTags.length&&<Empty><EmptyHeader><EmptyTitle>{emptyState.title}</EmptyTitle><EmptyDescription>{emptyState.detail}</EmptyDescription></EmptyHeader>{!query&&createAction&&<EmptyContent className="empty-actions">{createAction}{importAction}</EmptyContent>}</Empty>}</section>}
    <EditorDock key={layoutKey} layoutKey={layoutKey} pages={lib.pages} pageLabel={pageLabel} selected={page?.id??(journal?'journal':undefined)}
      renderJournal={(panel,active)=>{
        return entries.length>0&&<Journal installation={lib.installation} panel={panel} active={active} replica={lib.replica} workspace={ws}
          entries={entries} anchor={journalAnchor} handled={handledJournalAnchor} offline={!!lib.offline} writable={write} linkBlocks={agentOpen} editors={journalEditors.current}
          properties={day=>documentProperties(day,lib)} rename={day=>active&&dialog==='Rename'&&renameBase.current?.target===day.id?renameForm('Rename page'):null}
          select={selectJournalDay} exportEntry={download} saved={savedText} report={err=>E(err.message)} open={id=>afterSave(()=>I(id))}/>
      }} saveJournal={async panel=>{await Promise.all(Array.from(journalEditors.current.values()).filter(entry=>entry.panel===panel).map(entry=>entry.checkpoint.current?.()))}}
      select={selectDock} surfaceChanged={setActiveSurface} closed={viewClosed} focusLibrary={()=>(searchInput.current??libraryCrumb.current)?.focus()} handles={views.current} report={E} render={(document,active,view)=>(
        <article className="doc" data-source-page={document.id}>
          <BlockLinkPage.Provider value={write&&agentOpen?document:undefined}>
            <Editor id={document.id} title={document.title} initialText={document.plain} writable={write}
              installation={lib.installation} replica={lib.replica} workspace={ws}
              onFileAdded={()=>refreshFiles(n=>n+1)} onSaved={(plain,referenceBlockLengths)=>savedText(document.id,plain,referenceBlockLengths)}
              citationTarget={active&&citationTarget?.id===document.id?citationTarget:undefined}
              finishCitation={setCitationTarget} report={E} toolbar={active?documentTools:null}
              heading={<div className="doc-head">{active?titleHeading(document.title,'Rename',document.id):<h1>{document.title}</h1>}{documentProperties(document,lib,true)}</div>}
              view={view} checkpoint={view.checkpoint} applyInEditor={view.apply}/>
          </BlockLinkPage.Provider>
        </article>
      )}/>

    </main>
    <AgentSidebar permissionScope={layoutKey} surface={page||journal?activeSurface:'page'}
      receiveEdit={async edit=>{
        const mounted=Array.from(views.current.values()).filter(view=>view.page===edit.page)
        const view=mounted.find(view=>view.active)??mounted[0]
        const apply=view?.apply.current??journalEditor(edit.page)?.apply.current
        if(apply)await apply(edit.page,async()=>edit)
      }} pageLabel={pageLabel} destinationPath={destinationPath} openProject={async project=>{await saveEditors();const data=await refresh();if(!data.projects.some(item=>item.id===project&&item.trashRoot===null))throw Error('Project is unavailable');navigate(String(project))}} key={layoutKey} downloadAttachment={downloadAttachment} pages={lib.pages.filter(p=>!p.deleted)} ws={ws} page={currentDocument} write={!!write} offline={!!lib.offline} visible={agentOpen} close={()=>setAgentOpen(false)} open={openSource} applyPageEdit={applyPageEdit} checkpoint={syncAgentPages}/>
    <Input hidden ref={attachment} type="file" multiple onChange={e=>{
      const files=Array.from(e.currentTarget.files??[])
      e.currentTarget.value=''
      if(files.length&&currentDocument)act(()=>attaching.run(()=>attachFiles(currentDocument,files)))
    }}/>
    <Input hidden ref={markdown} type="file" accept=".md,.markdown,text/markdown" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)act(()=>importing.run(async()=>create(f.name.replace(/\.m(?:arkdown|d)$/i,'')||'Imported page',await readMarkdownFile(f))))}}/>
    <Popover open={Boolean(dialog)&&!renaming} onOpenChange={open=>{if(!open&&!naming.pending)G('')}}>
      <PopoverAnchor virtualRef={creationAnchor}/><PopoverContent align="start" collisionPadding={8} aria-label={'New '+dialog.toLowerCase()} onOpenAutoFocus={e=>{e.preventDefault();nameInput.current?.focus({preventScroll:true})}} onCloseAutoFocus={e=>{e.preventDefault();opener.current?.focus({preventScroll:true})}}>
        <h2>New {dialog.toLowerCase()}</h2>
        <form className="name-form" aria-describedby={creationError?'creation-error':undefined} aria-busy={naming.pending} onSubmit={submitName}>
          <Label htmlFor="page-name">Name</Label><Input id="page-name" readOnly={naming.pending} ref={nameInput} required maxLength={250} value={name} onChange={e=>N(e.target.value)}/>
          {dialog==='Workspace'&&<ZoneSelect disabled={naming.pending} value={newZone} onChange={setNewZone}/>}
          <DialogFooter><Button type="button" variant="outline" disabled={naming.pending} onClick={()=>G('')}>Cancel</Button><Button type="submit" disabled={naming.pending||!name.trim()}>Save</Button></DialogFooter>
          {creationError&&<ErrorAlert id="creation-error" message={creationError}/>}
        </form>
      </PopoverContent>
    </Popover>
  </div></DragDropProvider></BlockLinkComposer.Provider></InlineTagsContext.Provider><Toast.Viewport data-app-overlay="notifications" data-part="workspace-notifications" title="Notifications (F8)"/></Toast.Provider>
}
const root=createRoot(document.getElementById('root')!)
if(window.chulaneSidebarWidths){
  void restoreDesktopSidebarWidths().catch(error=>console.warn('Could not restore sidebar widths.',error)).finally(()=>root.render(<App/>))
}else root.render(<App/>)
