/** The workspace sidebar owns chat selection and the foreground response connection across document switches. */
import {agentWebLink} from '../shared/agent-web-link'
import {editorLinkTarget,type EditorTarget} from './editor-address'
import {AgentModeBadge,AgentModePicker} from './agent-mode-picker'
import {AgentMessage} from './agent-message'
import {Disclosure} from './ui/disclosure'
import {GlassSurface} from './ui/glass-surface'
import {useContext,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react'
import {useDragDropMonitor,useDroppable} from '@dnd-kit/react'
import {ArrowUp,ArrowUpRight,BookOpen,Check,Clock3,Download,FileText,FolderPlus,Layers,Link2,MessageSquare,CornerUpRight,Paperclip,Pencil,Plus,Settings2,Square,Trash2,Users,X} from 'lucide-react'
import {labeledReferences} from '../shared/library'
import {SidebarHandle} from './sidebar-handle'
import {ScrollArea} from './ui/scroll-area'
import {Command,CommandInput,CommandItem,CommandList,CommandEmpty,ErrorAlert,Badge,Button,Dialog,DialogClose,DialogContent,DialogFooter,DialogTitle,DialogTrigger,Input,Label,NativeSelect,NativeSelectOption,Popover,PopoverContent,PopoverTrigger,Textarea} from './ui'
import {BLOCK_REFERENCE,BlockLinkComposer} from './block-links'
import {sourceHref,MAX_BLOCK_LINKS,MAX_PAGE_REFERENCES,type QueuedTurn,type ChatActivity,type BlockSource,type LocalAgent} from '../shared/agent'
import {CHAT_COMPOSER,PAGE_REFERENCE} from './page-drag'
import {ProposalHistory,ReviewDestination} from './proposal-history'
import {AgentTasks} from './agent-tasks'
import {json,request} from './api'
import {metadataOperationId} from './document-outbox'
import {useCreationRequest} from './use-creation-request'
import {agentModes,type AgentMode} from '../shared/agent'
import type {CanvasValue} from '../shared/agent-canvas'
import type {AppliedEdit,Chat,Conversation,EditPreview,Source} from '../shared/agent'

type Settings={canSavePlugin:boolean;hasApiKey:boolean;agent?:LocalAgent;localAgents:LocalAgent[];configured:boolean;configurable:boolean;model:string;chats:Chat[]}
export type ApplyInEditor=(page:number,commit:()=>Promise<AppliedEdit>)=>Promise<void>
type Props={permissionScope:string;surface:'canvas'|'page';receiveEdit:(edit:AppliedEdit)=>Promise<void>;pageLabel:(page:Pick<Source,'id'|'title'>)=>string;destinationPath:(id:number|null)=>string|null;openProject:(id:number)=>Promise<void>;downloadAttachment:(page:number,file:{id:number;name:string})=>Promise<void>;ws:number;pages:Source[];page?:Source;write:boolean;offline:boolean;visible:boolean;close:()=>void;open:(source:EditorTarget,signal?:AbortSignal)=>Promise<void>;checkpoint:(sources:readonly number[],signal?:AbortSignal)=>Promise<void>;applyPageEdit:ApplyInEditor}
/** Label saved citations using only the titles and destinations recorded in this answer. */
function labeledCitations(sources:Source[]){
  const pages=new Map(sources.map(source=>[source.id,source.title]))
  const pageNames=new Map(labeledReferences([...pages],([id,name])=>({id,name})).map(({item:[id],label})=>[id,label]))
  return labeledReferences(sources,source=>{
    const title=pageNames.get(source.id)!
    if(source.attachment)return {id:source.attachment.id,name:title+' · '+source.attachment.name}
    const name=source.excerpt?title+' · '+source.excerpt:title
    const qualifier=source.block?'Block #'+source.block:source.surface?'Canvas':'Page #'+source.id
    return {id:source.id,name,qualifier}
  })
}
/** Describe geometry changes in the review without exposing internal version metadata. */
function canvasDescription(json:string){
  const {type,text,x,y,width,height}=JSON.parse(json) as CanvasValue
  return [type,text&&'“'+text+'”',width+' × '+height,'at ('+x+', '+y+')'].filter(Boolean).join(' · ')
}
type DraftBlockLink=BlockSource & {unavailable?:boolean}
type QueuedEdit={entry:QueuedTurn;draft:ComposerDraft;caret:[number,number]}
type ComposerDraft={text:string;attachments:Pick<Source,'id'|'title'>[];blockLinks:DraftBlockLink[];background:boolean}
const emptyDraft:ComposerDraft={text:'',attachments:[],blockLinks:[],background:false}
const PANEL='agent-panel',LOG='agent-log',REVIEW='agent-review'
/** Render shared history, model setup, streamed text and durable block-level review. */
export function AgentSidebar({permissionScope,surface,receiveEdit,pageLabel,destinationPath,openProject,downloadAttachment,ws,pages,page,write,offline,visible,close,open,checkpoint,applyPageEdit}:Props){
  const pageById=useMemo(()=>new Map(pages.map(source=>[source.id,source])),[pages])
  const storageKey='chulane.chat-tabs.'+permissionScope
  const [saved]=useState(()=>{try{return JSON.parse(localStorage.getItem(storageKey)??'null') as {chat:number;tabs:number[];drafts:Record<number,ComposerDraft>;seen:Record<number,number>;edits?:Record<number,QueuedEdit>}|null}catch{return null}})
  const chooseInitial=useRef(!saved)
  const [tabs,setTabs]=useState<number[]>(saved?.tabs??[])
  const [seen,setSeen]=useState<Record<number,number>>(saved?.seen??{})
  const [settings,S]=useState<Settings>(),[chat,C]=useState(saved?.chat??0),[view,V]=useState<Conversation>({messages:[],edits:[],projects:[],pages:[]})
  const [busy,B]=useState(false),[error,E]=useState(''),[setup,G]=useState(false),[key,K]=useState(''),[model,M]=useState(''),[notice,N]=useState('')
  const [refreshError,setRefreshError]=useState('')
  const [drafts,setDrafts]=useState<Record<number,ComposerDraft>>(saved?.drafts??{})
  const [edits,setEdits]=useState<Record<number,QueuedEdit>>(saved?.edits??{})
  const editing=edits[chat]
  const currentDraft=editing?.draft??drafts[chat]??emptyDraft
  const {text:draft,attachments,blockLinks,background}=currentDraft
  const queue=view.queue??[]
  const staleEdit=!!editing&&!!view.queue&&!queue.some(row=>row.id===editing.entry.id&&row.revision===editing.entry.revision)
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify({tabs,chat,drafts,seen,edits}))}catch{/* Storage may be unavailable. */}},[tabs,chat,drafts,seen,edits,storageKey])
  const initial=drafts[0]
  const hasInitialDraft=!!(initial&&(initial.text||initial.attachments.length||initial.blockLinks.length||initial.background))
  const canWriteChat=write&&!offline
  /** Keep unsent text and explicit context local to the selected conversation. */
  function updateDraft(patch:Partial<ComposerDraft>){
    if(editing){setEdits(all=>({...all,[chat]:{...editing,draft:{...editing.draft,...patch}}}));return}
    setDrafts(current=>({...current,[chat]:{...(current[chat]??emptyDraft),...patch}}))
  }
  const result=useRef<number|null>(null)
  const runningMessage=view.messages.find(m=>m.status==='running')?.id
  const running=runningMessage!==undefined
  const permissionKey='chulane.agent.mode.'+permissionScope
  const [mode,setMode]=useState<AgentMode>(()=>{
    const saved=sessionStorage.getItem(permissionKey)
    return agentModes.find(value=>value===saved)??(sessionStorage.getItem('chulane.agent.allowEdits.'+ws)==='false'?'ask':'suggest')
  })
  const [connection,setConnection]=useState<LocalAgent|'api'|null>(null)
  const selectedProvider=connection??settings?.agent??(settings?.hasApiKey?'api':settings?.localAgents[0]??'api')
  const [switching,setSwitching]=useState(false),[savingPlugin,setSavingPlugin]=useState(false)
  const pinned=settings?.chats.find(item=>item.id===chat)?.agent
  const ready=!!(settings?.configured||pinned)
  const active=useRef<AbortController|null>(null),selected=useRef(chat),alive=useRef(true),sequence=useRef(0)
  const streams=useRef(new Map<number,AbortController>())
  const observer=useRef<AbortController|null>(null)
  const [dragging,drag]=useState(false),[picker,P]=useState(false)
  const pickedPage=useRef(false)
  const composer=useRef<HTMLTextAreaElement>(null),log=useRef<HTMLDivElement>(null),follow=useRef(true)
  const attachedIds=new Set(attachments.map(source=>source.id))
  const contextPage=editing?pageById.get(editing.entry.turn.page??0):page
  const missingPage=!!(editing?.entry.turn.page&&!contextPage)||[...attachments,...blockLinks].some(source=>!pageById.has(source.id))
  const panel=useRef<HTMLElement>(null)
  const {isDropTarget}=useDroppable({id:CHAT_COMPOSER,element:panel,accept:[PAGE_REFERENCE,BLOCK_REFERENCE],disabled:!visible||!write||busy})
  /** Keep an explicit attachment even while it is also the active document. */
  function addPage(id:number){
    const item=pageById.get(id)
    if(!write||busy||!item)return
    if(attachedIds.has(id)){N('Page already attached.');return}
    if(attachments.length>=MAX_PAGE_REFERENCES){N('Remove a page to add another.');return}
    updateDraft({attachments:[...attachments,{id,title:item.title}]})
    pickedPage.current=picker
    P(false);N('')
  }
  /** Merge references from either the keyboard grip or a completed composer drop. */
  function addBlockLinks(incoming:BlockSource[],hit?:Element){
    if(!visible||!write||busy||!incoming.length||(hit&&!panel.current?.contains(hit)))return false
    const unique=new Map([...blockLinks,...incoming].map(s=>[s.id+'/'+s.block,s]))
    if(unique.size>MAX_BLOCK_LINKS){N('A message can include up to '+MAX_BLOCK_LINKS+' block links.');return false}
    updateDraft({blockLinks:[...unique.values()]});N('')
    composer.current?.focus()
    return true
  }
  useImperativeHandle(useContext(BlockLinkComposer),()=>addBlockLinks)
  useDragDropMonitor({
    onDragStart:e=>{
      const source=e.operation.source
      // A pointer released over its original grip can generate a click even after cancelling the drag.
      if(source?.type===BLOCK_REFERENCE)source.data.dragged.current=true
      if(source?.type===PAGE_REFERENCE||source?.type===BLOCK_REFERENCE)drag(true)
    },
    onDragEnd:e=>{
      drag(false)
      if(e.canceled || e.operation.target?.id!==CHAT_COMPOSER || busy || !write)return
      if(e.operation.source?.type===BLOCK_REFERENCE)addBlockLinks(e.operation.source.data.links.current)
      if(e.operation.source?.type===PAGE_REFERENCE)
        addPage(Number(e.operation.source.data.pageId))
    },
  })
  useEffect(()=>{
    const target=result.current&&log.current?.querySelector<HTMLElement>('[data-message="'+result.current+'"]')
    if(target){target.focus();target.scrollIntoView({block:'nearest'});result.current=null;follow.current=false}
    else if(follow.current&&log.current)log.current.scrollTop=log.current.scrollHeight
  },[view,visible])
  // A long-running turn may request navigation after the user has already changed documents.
  const currentOpen=useRef(open)
  useEffect(()=>{currentOpen.current=open},[open])
  const suffix='?workspace='+ws
  const path=(id:number)=>'agent/chats/'+id
  async function settingsNow(){const data:Settings=await json('agent'+suffix);if(alive.current)S(data);return data}
  async function load(id:number){
    const seq=selected.current===id?++sequence.current:sequence.current
    try{
      const data:Conversation=await json(path(id)+suffix)
      if(alive.current&&selected.current===id&&sequence.current===seq)V(data)
      return data
    }catch(error){
      if((error as {status?:number}).status!==404)throw error
      if(alive.current&&selected.current===id&&sequence.current===seq)select(tabs.filter(tab=>tab!==id).at(-1)??0)
    }
  }
  function select(id:number){chooseInitial.current=false;if(id)setTabs(previous=>previous.includes(id)?previous:[...previous,id]);N('');E('');P(false);follow.current=true;selected.current=id;C(id);V({messages:[],edits:[],projects:[],pages:[]});if(id)void load(id).catch(e=>E(e.message))}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.abort();for(const stream of streams.current.values())stream.abort()}},[])
  useEffect(()=>{
    if(!visible||offline)return
    let live=true
    async function refresh(){try{const before=selected.current;const data=await settingsNow();if(!live||before!==selected.current||active.current)return
      if(!data.chats.some(item=>item.id===selected.current)){
        const next=selected.current||chooseInitial.current&&!hasInitialDraft?data.chats[0]?.id??0:0
        chooseInitial.current=false
        if(selected.current!==next)select(next)
      }
      else if(selected.current)await load(selected.current)
      if(live)setTabs(open=>open.some(id=>!data.chats.some(item=>item.id===id))?open.filter(id=>data.chats.some(item=>item.id===id)):open)
      if(live)setRefreshError('')
    }catch(e){if(live)setRefreshError((e as Error).message)}}
    void refresh();const timer=setInterval(refresh,2500)
    return()=>{live=false;clearInterval(timer)}
  },[visible,offline,hasInitialDraft])
  /** Reconcile the initial history snapshot with later text and activity on either connection. */
  async function readTurn(response:Response,id:number,signal:AbortSignal,initiator:boolean){
    const reader=response.body!.pipeThrough(new TextDecoderStream()).getReader()
    let buffer=''
    for(;;){
      const {done,value}=await reader.read();if(done)break
      buffer+=value
      let newline:number
      while((newline=buffer.indexOf('\n'))>=0){
        const event=JSON.parse(buffer.slice(0,newline));buffer=buffer.slice(newline+1)
        if(signal.aborted||!alive.current)return
        if(selected.current!==id){if(event.appliedEdit&&initiator)await receiveEdit(event.appliedEdit);continue}
        if(event.openPage&&initiator){
          try{await currentOpen.current(event.openPage,signal)}catch(error){if(!signal.aborted)E((error as Error).message)}
        }
        if(event.appliedEdit&&initiator){
          try{await receiveEdit(event.appliedEdit)}catch(e){if(!signal.aborted)E((e as Error).message)}
        }
        if(event.error)E(event.error)
        if(event.delta||event.part){
          V(prev=>({...prev,messages:prev.messages.map(m=>{
            if(m.id!==event.message)return m
            // The initial history read may already include several queued wire events.
            if(event.delta){
              const overlap=Math.max(0,m.text.length-(event.offset??m.text.length))
              return {...m,text:m.text+event.delta.slice(overlap)}
            }
            const part:ChatActivity=event.part,activity=[...(m.activity??[])]
            const index=activity.findIndex(item=>item.id===part.id)
            const previous=activity[index]
            if(previous&&previous.revision>=part.revision)return m
            if(event.detailOffset!==undefined&&event.detailOffset!==(previous?.detail.length??0))return m
            const next=event.detailOffset===undefined?part:{...part,detail:(previous?.detail??'')+part.detail}
            if(index===-1)activity.push(next)
            else activity[index]=next
            return {...m,activity}
          })}))
        }else if(event.message || event.proposal)await load(id)
      }
    }
  }
  useEffect(()=>{
    if(!visible||offline||busy||!chat||!runningMessage||streams.current.has(chat))return
    const controller=new AbortController(),{signal}=controller
    let retry:ReturnType<typeof setTimeout>
    /** Reconnect to the same running turn after a network interruption. */
    async function watch(){
      observer.current=controller
      try{
        const response=await request(path(chat)+'/turn'+suffix,{signal})
        if(response.status!==204)await readTurn(response,chat,signal,false)
      }catch{/* The snapshot below also recovers from a dropped stream. */}
      finally{
        if(observer.current===controller)observer.current=null
      }
      if(signal.aborted)return
      try{await load(chat)}catch(e){if(!signal.aborted)setRefreshError((e as Error).message)}
      if(!signal.aborted)retry=setTimeout(watch,2500)
    }
    void watch()
    return()=>{controller.abort();clearTimeout(retry)}
  },[visible,offline,busy,chat,runningMessage,ws])
  const creation=useCreationRequest()
  const pendingTurns=useRef(new Map<number,{signature:string;operationId:string;queued:boolean}>())
  /** The first server-created chat takes ownership of the initial unsent composer. */
  async function newChat(agent?:LocalAgent){
    const first=selected.current===0
    const {id}=await creation.post('agent/chats'+suffix,agent?{agent}:{}).catch(error=>{
      // A deleted chat cannot receive the draft. A later explicit retry may start a fresh chat.
      if(error.status===404)creation.reset()
      throw error
    })
    creation.reset()
    if(first)setDrafts(current=>{
      if(!current[0])return current
      const {0:initial,...rest}=current
      return {...rest,[id]:initial}
    })
    await settingsNow();select(id)
    return id as number
  }
  useEffect(()=>{
    const latest=settings?.chats.find(item=>item.id===chat)?.latest
    if(visible&&latest)setSeen(prev=>prev[chat]===latest?prev:{...prev,[chat]:latest})
  },[visible,chat,settings])
  function editEntry(entry:QueuedTurn){
    const t=entry.turn
    const title=(id:number)=>pageById.get(id)?.title??('Page #'+id)
    setEdits(all=>({...all,[chat]:{entry,caret:[composer.current?.selectionStart??0,composer.current?.selectionEnd??0],
      draft:{text:t.text,background:t.background,attachments:t.references.map(id=>({id,title:title(id)})),blockLinks:t.blockLinks.map(link=>({...link,title:title(link.id),excerpt:link.excerpt??link.block}))}}}))
    composer.current?.focus()
  }
  function finishEdit(){
    setEdits(all=>{const next={...all};delete next[chat];return next})
    requestAnimationFrame(()=>{if(selected.current===chat&&editing){composer.current?.focus();composer.current?.setSelectionRange(...editing.caret)}})
  }
  async function send(){
    if(editing&&!view.queue)return
    if(!canWriteChat || !ready || active.current || switching || missingPage || !draft.trim())return
    // Follow this turn until the reader scrolls away, including while delivery is pending.
    follow.current=true
    const controller=new AbortController();active.current=controller;B(true);E('')
    let id=chat
    try{
      const sources=[...attachments,...blockLinks].map(source=>source.id)
      const originPage=editing?editing.entry.turn.page:page?.id??null
      if(originPage)sources.push(originPage)
      try{await checkpoint(sources,controller.signal)}
      catch(error){throw Error('Could not sync the documents for this message. '+(error as Error).message+' Send again to retry.')}
      controller.signal.throwIfAborted()
      if(!id)id=await newChat()
      const turnMode=editing?.entry.turn.mode??mode
      const turn={mode:turnMode,allowEdits:turnMode!=='ask',surface:editing?.entry.turn.surface??surface,background,text:draft,page:originPage,references:attachments.map(p=>p.id).filter(id=>id!==originPage),blockLinks:blockLinks.map(({id,block,excerpt})=>({id,block,excerpt}))}
      const signature=JSON.stringify(turn)
      let delivery=pendingTurns.current.get(id)
      if(delivery?.signature!==signature){
        delivery={signature,operationId:metadataOperationId(),queued:!!(running||streams.current.has(id)||queue.some(item=>!item.error)||editing)}
        pendingTurns.current.set(id,delivery)
      }
      if(editing&&!staleEdit){
        await json(path(id)+'/queue/'+editing.entry.id+'/edit'+suffix,'POST',{...turn,revision:editing.entry.revision})
        pendingTurns.current.delete(id);finishEdit();return
      }
      const enqueue=()=>json(path(id)+'/queue'+suffix,'POST',{...turn,operationId:delivery!.operationId})
      let response:Response|undefined
      if(delivery!.queued)await enqueue()
      else try{
        response=await request(path(id)+'/turn'+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...turn,managed:true,operationId:delivery.operationId}),signal:controller.signal})
      }catch(error){
        if((error as Error).message!=='A turn is already running in this chat')throw error
        delivery!.queued=true;await enqueue()
      }
      pendingTurns.current.delete(id)
      if(editing)finishEdit()
      else setDrafts(current=>{
        if(current[id]!==currentDraft)return current
        const next={...current};delete next[id];return next
      })
      N('')
      if(response?.status===202){N((await response.json()).replayed?'Background task already submitted.':'Background task started.');return}
      if(response){
        streams.current.set(id,controller)
        void readTurn(response,id,controller.signal,true).catch(e=>{if(selected.current===id&&!controller.signal.aborted)E(e.message)}).finally(()=>{
          streams.current.delete(id)
          if(alive.current&&selected.current===id)void load(id).catch(e=>E(e.message))
        })
      }
    }catch(e){
      if(alive.current&&!controller.signal.aborted){
        const failure=e as Error & {unavailableBlocks?:Pick<BlockSource,'id'|'block'>[]}
        const missing=new Set(failure.unavailableBlocks?.map(link=>link.id+'/'+link.block))
        if(missing.size&&editing)updateDraft({blockLinks:blockLinks.map(link=>({...link,unavailable:missing.has(link.id+'/'+link.block)}))})
        else if(missing.size)setDrafts(current=>{
          const saved=current[id]
          if(!saved)return current
          return {...current,[id]:{...saved,blockLinks:saved.blockLinks.map(link=>({...link,unavailable:missing.has(link.id+'/'+link.block)}))}}
        })
        else E(failure.message)
      }
    }
    finally{active.current=null;if(alive.current){B(false);if(id)await load(id).catch(e=>E(e.message));await settingsNow().catch(e=>E(e.message))}}
  }
  /** Reconcile a lost or contested decision against its own chat record without replaying the write. */
  async function submitReview(kind:'edits'|'pages'|'projects',id:number,choice:'apply'|'dismiss',review?:{reviewedPath:string|null}|{reviewedTitle:string},editorPage?:number){
    let responseError:unknown
    const commit=()=>json(path(chat)+'/'+kind+'/'+id+'/'+choice+suffix,'POST',review).catch(error=>{responseError=error;throw error})
    N('')
    try{
      if(editorPage!==undefined)await applyPageEdit(editorPage,commit)
      else await commit()
    }catch(error){
      const status=(error as {status?:number}).status
      if(error!==responseError||(status&&status<500&&status!==409))throw error
      const snapshot=await load(chat).catch(()=>undefined)
      if(!alive.current||selected.current!==chat)return
      const recorded=snapshot?.[kind].find(item=>item.id===id)?.status
      if(recorded==='applied'||recorded==='dismissed'){
        N('The host recorded this proposal as '+recorded+'.')
        return
      }
      if(status===409)throw error
      if(recorded==='pending')throw Error('The proposal is still pending. Check its target before trying again.')
      throw Error('The host could not confirm this decision. Check the proposal status and its target before trying again.')
    }
    await load(chat)
  }
  async function decide(edit:EditPreview,choice:'apply'|'dismiss',reviewedTitle?:string){
    if(choice==='apply'){
      if(edit.kind==='canvas'&&(page?.id!==edit.page||surface!=='canvas'))await open({id:edit.page,surface:'canvas'})
      await checkpoint([edit.page])
    }
    await submitReview('edits',edit.id,choice,reviewedTitle===undefined?undefined:{reviewedTitle},choice==='apply'&&edit.kind!=='rename'?edit.page:undefined)
  }
  function act(fn:()=>Promise<unknown>){E('');void fn().catch(e=>E(e.message))}
  if(!visible)return null
  const providerCard=settings&&<section data-part="provider-card">
        <strong><Settings2 size={15}/>Provider setup</strong>
        <p>Messages and selected page excerpts go to the provider you choose.</p>
        {!!settings.localAgents?.length&&write&&<div><Label htmlFor="agent-connection">Connection</Label><NativeSelect id="agent-connection" value={selectedProvider} onChange={e=>setConnection(e.target.value as LocalAgent|'api')}>
          {settings.localAgents.map(agent=><NativeSelectOption key={agent} value={agent}>{agent==='codex'?'Local Codex':agent==='claude'?'Local Claude Code':'Local Hermes'}</NativeSelectOption>)}
          <NativeSelectOption value="api">OpenAI API key</NativeSelectOption>
        </NativeSelect></div>}
        {settings.configurable&&write&&selectedProvider!=='api'?<Button size="sm" disabled={busy} onClick={()=>act(async()=>{
          const result=await json('agent/provider'+suffix,'POST',{agent:selectedProvider})
          await settingsNow();G(false);N(result.message)
        })}>Use local {selectedProvider}</Button>:settings.configurable&&write?<form aria-label="OpenAI connection" onSubmit={e=>{e.preventDefault();act(async()=>{const result=await json('agent/provider'+suffix,'POST',{key,model:model||settings.model});K('');G(false);N(result.message);await settingsNow()})}}>
          <Label>OpenAI API key<Input type="password" required={!settings.hasApiKey} placeholder={settings.hasApiKey?'Saved key':undefined} autoComplete="off" value={key} onChange={e=>K(e.target.value)}/></Label>
          <Label>Model<Input required defaultValue={settings.model} onChange={e=>M(e.target.value)}/></Label>
          <Button size="sm">Save provider</Button></form>:<p>Ask the server operator to configure a local agent or an API key.</p>}
      </section>
  const draftLinks=labeledReferences(blockLinks,source=>{
    const owner=pageById.get(source.id)
    const title=owner?pageLabel(owner):source.title+' · #'+source.id
    return {id:source.id,name:source.excerpt,qualifier:title+' · Block #'+source.block}
  })
  return <aside id="workspace-agent" ref={panel} className={PANEL} aria-label="Workspace agent"><SidebarHandle side="agent" report={E}/>
    <header data-part="agent-heading">
      <span data-part="agent-mark"><Layers size={20}/></span>
      <div><h2>Workspace agent</h2><small><Users size={12}/>Shared workspace chat</small></div>
      {ready&&settings?.configurable&&canWriteChat&&<Popover open={setup} onOpenChange={opened=>{G(opened);if(opened)setConnection(null)}}>
        <PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Provider settings" title="Provider settings"><Settings2/></Button></PopoverTrigger>
        <PopoverContent align="end" aria-label="Provider settings" container={panel.current}>{providerCard}</PopoverContent>
      </Popover>}
      <Button size="icon-sm" variant="ghost" onClick={close} aria-label="Close agent" title="Close agent"><X/></Button>
    </header>
    <div data-part="conversation-bar"><GlassSurface kind="toolbar"/><MessageSquare size={15}/>
      <NativeSelect aria-label="Conversation" value={chat} disabled={busy||switching||offline} size="sm" onChange={e=>select(Number(e.target.value))}>
        {(!chat||hasInitialDraft)&&<NativeSelectOption value={0}>New conversation</NativeSelectOption>}{settings?.chats.map(c=><NativeSelectOption key={c.id} value={c.id}>{c.title}</NativeSelectOption>)}</NativeSelect>
      {canWriteChat&&<ProposalHistory ws={ws} openSource={source=>act(()=>open(source))}/>}
      {!offline&&<AgentTasks ws={ws} write={write} disabled={busy} openResult={task=>{result.current=task.id;select(task.chat)}}/>}
      {canWriteChat&&settings?.chats.find(item=>item.id===chat)?.canDelete&&<Dialog key={chat}><DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" title="Delete conversation" aria-label="Delete conversation"><Trash2/></Button>
      </DialogTrigger><DialogContent aria-describedby="delete-chat-detail"><DialogTitle>Delete this conversation?</DialogTitle>
        <p id="delete-chat-detail">This removes the conversation and its pending edits for everyone in this workspace. Any running response will stop.</p>
        <DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><DialogClose asChild><Button variant="destructive" onClick={()=>act(async()=>{
          await json(path(chat)+suffix,'DELETE')
          pendingTurns.current.delete(chat)
          setDrafts(current=>{const {[chat]:removed,...rest}=current;return rest})
          const data=await settingsNow()
          if(selected.current===chat||!selected.current)select(tabs.filter(tab=>tab!==chat&&data.chats.some(item=>item.id===tab)).at(-1)??data.chats[0]?.id??0)
        })}>Delete conversation</Button></DialogClose></DialogFooter></DialogContent></Dialog>}
      {write&&<Button size="icon-sm" variant="ghost" title="New chat" aria-label="New chat" disabled={busy||switching||offline} onClick={()=>act(newChat)}><Plus/></Button>}
    </div>
    <nav data-part="chat-tabs" aria-label="Open conversations">{tabs.flatMap(id=>{
      const item=settings?.chats.find(c=>c.id===id)
      if(!item)return []
      return <span key={id}><Button size="sm" variant={chat===id?'secondary':'ghost'} aria-current={chat===id?'page':undefined} title={item.title} onClick={()=>select(id)}>{item.title}{item.running?' …':''}{item.queued?' ('+item.queued+')':''}{chat!==id&&(item.latest??0)>(seen[id]??0)?' •':''}</Button>
        <Button size="icon-sm" variant="ghost" aria-label={'Close tab '+item.title} title="Close tab" onClick={()=>{const next=tabs.filter(tab=>tab!==id);setTabs(next);if(chat===id)select(next.at(-1)??0)}}><X size={12}/></Button></span>
    })}</nav>
    <ScrollArea role="log" aria-label="Chat messages" className={LOG} ref={log} onClick={event=>{
      if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return
      const anchor=event.target instanceof Element?event.target.closest('[data-part=agent-markdown] a[href]'):null
      const target=anchor instanceof HTMLAnchorElement&&!agentWebLink(anchor.getAttribute('href'),location.href)&&editorLinkTarget(anchor,ws)
      if(target){event.preventDefault();act(()=>open(target))}
    }} onScroll={e=>{const n=e.currentTarget;follow.current=n.scrollHeight-n.scrollTop-n.clientHeight<60}}>
      {!offline&&!ready&&providerCard}
      {ready&&!view.messages.length&&!busy&&canWriteChat&&<div data-part="start-chat">
        <BookOpen size={26}/><h3>{surface==='canvas'?'Work with this canvas':page?'Work with this page':'Work with your pages'}</h3>
        {(surface==='canvas'?['Describe this canvas','Suggest a layout']:page?['Summarize this page','Suggest a clearer introduction']:['Find a page about…','Compare two pages']).map(text=><Button variant="ghost" size="sm" key={text} onClick={()=>{updateDraft({text});composer.current?.focus()}}>{text}<ArrowUpRight size={14}/></Button>)}
      </div>}
      {view.messages.map(m=><article key={m.id} data-message={m.id} tabIndex={-1} data-author={m.role}>
        <small data-part="author">{m.role==='assistant'?<><Layers size={13}/>Agent{(m.mode==='append'||m.mode==='full')&&<AgentModeBadge mode={m.mode}/>}</>:(m.requestedBy||'User')}</small>
        {m.role==='assistant'?<AgentMessage message={m}/>:<p data-part="message">{m.text}</p>}
        {m.status==='running'&&<small>{m.text||m.activity?.length?'Responding…':'Thinking…'}</small>}{m.status==='interrupted'&&<small>Turn interrupted</small>}
        {m.status==='unknown'&&<small>Turn outcome unknown after the host restarted. Check the saved proposals and their targets before starting another turn.</small>}
        {m.status==='cancelled'&&<small>Task cancelled</small>}
        {m.status==='failed'&&<small>Provider request failed. Check the connection settings.</small>}
        {m.pluginDraft&&<div role="group" aria-label={m.pluginDraft.name} className={REVIEW}>
          <header><strong data-copyable="">{m.pluginDraft.name}</strong></header>
          {Object.entries({'plugin.mjs':m.pluginDraft.nativeModule,'renderer.mjs':m.pluginDraft.rendererModule}).map(([name,source])=>source&&<Disclosure key={name} label={name}><pre>{source}</pre></Disclosure>)}
          {settings?.canSavePlugin&&canWriteChat&&<Button size="icon-sm" variant="ghost" aria-label="Save plugin folder" title="Save plugin folder" disabled={savingPlugin} onClick={()=>act(async()=>{
            setSavingPlugin(true)
            try{
              const saved=await json(path(chat)+'/plugins/'+m.id+'/save'+suffix,'POST',{})
              if(saved.folder)N('Plugin saved in '+saved.folder)
            }finally{setSavingPlugin(false)}
          })}><Download/></Button>}
        </div>}
        {!!m.sources.length&&<div data-part="sources">{labeledCitations(m.sources).map(({item:s,label})=>s.attachment?<a key={'file/'+s.attachment.id} href={'/api/pages/'+s.id+'/files/'+s.attachment.id+'?workspace='+ws} download={s.attachment.name} title={s.attachment.excerpt} onClick={event=>{event.preventDefault();act(()=>downloadAttachment(s.id,s.attachment!))}}><FileText size={12}/>{label}</a>:<a key={s.id+'/'+(s.block??'')} href={sourceHref(ws,s)} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();act(()=>open(s))}}><FileText size={12}/>{label}</a>)}</div>}
        {view.pages?.filter(item=>item.message===m.id).map(item=>{
          const shown=item.status==='pending'?destinationPath(item.parent):item.reviewedPath??item.parentName
          return <section aria-label="New page proposal" className={REVIEW} key={'page-'+item.id}>
          <header><FileText size={14}/><strong data-copyable="">{item.title}</strong><Badge variant="outline">{item.status==='pending'?'Review':item.status}{item.reviewedBy&&' by '+item.reviewedBy}</Badge></header>
          <p><ReviewDestination id={item.parent} original={item.parentName} shown={shown}/></p>
          <pre>{item.markdown||'(empty page)'}</pre>
          <footer>{item.page!==null&&<a href={'?workspace='+ws+'&page='+item.page} onClick={e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();act(()=>open({id:item.page!}))}}>Open page<ArrowUpRight size={12}/></a>}
          {canWriteChat&&item.status==='pending'&&(['dismiss','apply'] as const).map(choice=><Button size="icon-sm" key={choice} disabled={choice==='apply'&&item.parent!==null&&shown===null} title={choice==='apply'?'Create page':'Dismiss page proposal'} aria-label={choice==='apply'?'Create page':'Dismiss page proposal'} onClick={()=>act(async()=>{
            await submitReview('pages',item.id,choice,choice==='apply'?{reviewedPath:shown}:undefined)
          })}>{choice==='apply'?<Check/>:<X/>}</Button>)}</footer>
        </section>})}
        {view.projects.filter(item=>item.message===m.id).map(item=>{
          const shown=item.status==='pending'?destinationPath(item.parent):item.reviewedPath??item.parentName
          return <section aria-label="Project proposal" className={REVIEW} key={'project-'+item.id}>
          <header>{item.beforeName?<Pencil size={14}/>:<FolderPlus size={14}/>}<strong>{item.beforeName?'Rename project':<>Create <span data-copyable="">{item.name}</span></>}</strong><Badge variant="outline">{item.status==='pending'?'Review':item.status}{item.reviewedBy&&' by '+item.reviewedBy}</Badge></header>
          <p><ReviewDestination id={item.parent} original={item.parentName} shown={shown}/>{item.beforeName&&' · #'+item.project}</p>
          {item.beforeName&&<><del>{item.beforeName}</del><ins>{item.name}</ins></>}
          <footer>{item.project!==null&&<Button size="sm" variant="ghost" onClick={()=>act(()=>openProject(item.project!))}>Open project<ArrowUpRight size={12}/></Button>}
          {canWriteChat&&item.status==='pending'&&(['dismiss','apply'] as const).map(choice=><Button size="icon-sm" key={choice} disabled={choice==='apply'&&item.parent!==null&&shown===null} title={choice==='apply'?(item.beforeName?'Apply project rename':'Create project'):'Dismiss project proposal'} aria-label={choice==='apply'?(item.beforeName?'Apply project rename':'Create project'):'Dismiss project proposal'} onClick={()=>act(async()=>{
            await submitReview('projects',item.id,choice,choice==='apply'?{reviewedPath:shown}:undefined)
          })}>{choice==='apply'?<Check/>:<X/>}</Button>)}</footer>
        </section>})}
        {view.edits.filter(e=>e.message===m.id).map(edit=>{
          const pending=edit.status==='pending'
          const target=pageById.get(edit.page)
          const rename=edit.kind==='rename'
          const requestedBlock=edit.requestedBlock??(pending||edit.status==='dismissed'?edit.block:null)
          const canvas=edit.kind==='canvas'
          const action=canvas?(edit.after?(requestedBlock?'Edit canvas element':'Add canvas element'):'Remove canvas element'):rename?'Rename page':requestedBlock===null?'Paragraph edit':requestedBlock?'Replace block text':'Append paragraph'
          const resultTitle=rename&&edit.status==='applied'?edit.after:edit.reviewedTitle??edit.title
          const title=target?.title??resultTitle
          const staleRename=pending&&rename&&target&&target.title!==edit.before
          const source={id:edit.page,title,...(canvas?{surface:'canvas' as const}:{block:edit.block})}
          return <section aria-label={action} className={REVIEW} key={edit.id}>
            <header><FileText size={14}/><strong>{action}</strong><Badge variant="outline">{pending?'Review':edit.status}{edit.reviewedBy&&' by '+edit.reviewedBy}</Badge></header>
            {pending&&target&&target.title!==edit.title&&<p>Requested for “{edit.title}”.{staleRename&&' Ask for a fresh rename.'}</p>}
            {edit.status==='applied'&&target&&target.title!==resultTitle&&(edit.reviewedTitle!=null||rename)&&<p>Approved as “{resultTitle}”.</p>}
            {edit.before&&<del>{canvas?canvasDescription(edit.before):edit.before}</del>}
            {edit.after||!canvas?<ins>{canvas?canvasDescription(edit.after):edit.after||'(remove block text)'}</ins>:null}
            <footer>{target?<a data-copyable="" href={sourceHref(ws,source)} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();act(()=>open(source))}}>{title} · #{edit.page}<ArrowUpRight size={12}/></a>:<span>{title} · #{edit.page} (unavailable)</span>}
            {pending&&canWriteChat&&<><Button size="icon-sm" aria-label="Dismiss" title="Dismiss edit" variant="ghost" onClick={()=>act(()=>decide(edit,'dismiss'))}><X/></Button><Button size="sm" disabled={!target||!!staleRename} onClick={()=>act(()=>decide(edit,'apply',title))}><Check/>Apply</Button></>}</footer>
          </section>})}</article>)}
    </ScrollArea>
    <footer data-part="compose-area">
    {offline?<small role="status">{write?'Reconnect to send a message.':'Reconnect to load shared conversations.'}</small>:(error||refreshError)&&<ErrorAlert message={error||refreshError}/>}
    {editing&&<small role="status">{staleEdit?'Message changed or started. Queue your edit as new.':'Editing queued message'}</small>}
    {notice&&<small role="status">{notice}</small>}
    {!!queue.length&&<ScrollArea data-part="queue-scroll" aria-label="Queued messages">{queue.map(item=><div data-part="queue-row" key={item.id}>
      <span title={item.turn.text}>{item.turn.text}</span><small title="Attached references">{item.turn.references.length+item.turn.blockLinks.length}</small>
      {item.error&&<small role="alert">{item.error}</small>}{write&&item.mine&&<>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Edit queued message" title="Edit queued message" disabled={!!editing||busy} onClick={()=>editEntry(item)}><Pencil/></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Steer now" title="Steer now" disabled={!view.canStop||!running||!!item.error} onClick={()=>act(async()=>{await json(path(chat)+'/queue/'+item.id+'/steer'+suffix,'POST',{revision:item.revision,message:runningMessage});await load(chat)})}><CornerUpRight/></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Delete queued message" title="Delete queued message" onClick={()=>act(async()=>{await json(path(chat)+'/queue/'+item.id+'/delete'+suffix,'POST',{revision:item.revision});await load(chat)})}><Trash2/></Button>
      </>}</div>)}</ScrollArea>}
    {write?<form aria-label="Chat composer" data-part="composer" data-drag={busy?'disabled':isDropTarget?'over':dragging?'ready':'idle'} onSubmit={e=>{e.preventDefault();void send()}}>
      <span className="sr-only" role="status" aria-label="Attached context">
        {attachments.length} {attachments.length===1?'page':'pages'} and {blockLinks.length} {blockLinks.length===1?'block link':'block links'} attached.
      </span>
      <ScrollArea data-part="context-scroll" aria-label="Message context"><div data-part="context"><small>Context</small>{contextPage&&!attachedIds.has(contextPage.id)&&<Badge variant="secondary" title={'Current document: '+pageLabel(contextPage)}><FileText size={12}/>{pageLabel(contextPage)}{(editing?.entry.turn.surface??surface)==='canvas'?' · Canvas':''}</Badge>}
      {attachments.map(attachment=>{
        const available=pageById.get(attachment.id)
        const source=available??attachment
        const label=available?pageLabel(available):source.title+' · #'+source.id+' (unavailable)'
        const current=source.id===contextPage?.id
        return <Button type="button" key={source.id} size="sm" variant={current?'secondary':'outline'} disabled={busy}
          title={current?'Current document: '+label:'Remove '+label} aria-label={'Remove '+label}
          aria-description={current?'Remove the attachment. The active document stays in context.':undefined}
          onClick={()=>{
            updateDraft({attachments:attachments.filter(item=>item.id!==source.id)})
            N('');composer.current?.focus()
          }}>{current&&<FileText size={12}/>}{label}<X size={12}/></Button>
      })}
      {draftLinks.map(({item:s,label:excerpt})=>{
        const owner=pageById.get(s.id)
        const unavailable=!owner||s.unavailable
        const label=excerpt+(unavailable?' (unavailable)':'')
        return <span data-part="block-link" data-qualified={excerpt!==s.excerpt||undefined} key={s.id+'/'+s.block}>
          {unavailable?<span>{label}</span>:<a href={sourceHref(ws,s)} title={excerpt===s.excerpt?pageLabel(owner)+' · '+excerpt:excerpt} onClick={e=>{
            if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return
            e.preventDefault();act(()=>open(s))
          }}><Link2 size={12}/><span>{excerpt}</span></a>}
          <Button type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={'Remove block link: '+label} title={'Remove block link: '+label}
            onClick={()=>{updateDraft({blockLinks:blockLinks.filter(item=>item!==s)});N('');composer.current?.focus()}}><X size={12}/></Button>
        </span>
      })}
      {!contextPage&&!blockLinks.length&&!attachments.length&&<small>Workspace library</small>}</div></ScrollArea>
      {missingPage?<small role="status">Restore the unavailable page or remove its links before sending.</small>
        :blockLinks.some(link=>link.unavailable)&&<small role="status">Restore the unavailable blocks and retry, or remove their links.</small>}
      <Textarea ref={composer} aria-label="Message the agent" enterKeyHint="send" title="Enter sends. Shift+Enter, Alt+Enter, or Ctrl+Enter adds a new line."
        placeholder={dragging?'Drop context here…':'Ask about your pages…'} rows={2} maxLength={12000} value={draft} onChange={e=>updateDraft({text:e.target.value})}
        onKeyDown={event=>{
          if(event.key==='Escape'&&editing&&!busy){event.preventDefault();finishEdit();return}
          if(event.key!=='Enter'||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||event.metaKey)return
          if(event.ctrlKey||event.altKey){
            event.preventDefault()
            // A native text edit preserves the selection, undo history, and textarea length limit.
            event.currentTarget.ownerDocument.execCommand('insertText',false,'\n')
          }else if(!event.shiftKey){
            event.preventDefault()
            if(!event.repeat)event.currentTarget.form?.requestSubmit()
          }
        }}/>
      <div data-part="compose-tools"><Popover open={picker} onOpenChange={P}><PopoverTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Add page" disabled={busy} title="Add a page to this message"><Paperclip/></Button></PopoverTrigger>
        <PopoverContent data-part="destination-picker" aria-label="Add page to context" align="start" onCloseAutoFocus={event=>{
          // A successful selection continues in the draft. Escape still returns to the picker trigger.
          if(pickedPage.current){event.preventDefault();pickedPage.current=false;composer.current?.focus()}
        }}>
          <Command label="Find a page"><CommandInput placeholder="Find a page by title or ID…"/>
            <ScrollArea data-part="destination-choices"><CommandList><CommandEmpty>No matching pages</CommandEmpty>
              {pages.map(item=><CommandItem key={item.id} value={'#'+item.id} keywords={[item.title,pageLabel(item)]}
                disabled={attachedIds.has(item.id)||attachments.length>=MAX_PAGE_REFERENCES}
                title={item.id===page?.id?'Keep this page in context when switching documents':undefined}
                onSelect={()=>addPage(item.id)}><FileText/><span>{pageLabel(item)}</span></CommandItem>)}
            </CommandList></ScrollArea>
          </Command></PopoverContent></Popover>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Run in background" aria-pressed={background} disabled={busy}
          title="Run in background after closing this window" onClick={()=>updateDraft({background:!background})}><Clock3/></Button>
        <AgentModePicker mode={editing?.entry.turn.mode??mode} disabled={busy||!!editing} onChange={next=>{
          setMode(next);sessionStorage.setItem(permissionKey,next)
        }}/>
        {editing&&<Button type="button" variant="ghost" size="icon-sm" title="Cancel edit" aria-label="Cancel edit" onClick={finishEdit}><X/></Button>}
        {running&&view.canStop&&<Button type="button" size="icon-sm" aria-label="Stop response" title="Stop response" onClick={()=>act(()=>json(path(chat)+'/stop'+suffix,'POST',{message:runningMessage}))}><Square/></Button>}
        <Button size="icon-sm" aria-label={editing?(staleEdit?'Queue as new':'Save queued message'):running?'Queue message':'Send'} title={editing?(staleEdit?'Queue as new':'Save queued message'):running?'Queue message':'Send'} disabled={busy||offline||switching||missingPage||!draft.trim()||!ready}>{editing?<Check/>:<ArrowUp/>}</Button></div>
    </form>:<small>Read-only conversation</small>}
    {settings&&ready&&write&&settings.localAgents.length>0?<div data-part="chat-provider"><Label htmlFor="chat-agent">Agent for this chat</Label>
      <NativeSelect id="chat-agent" value={pinned??''} size="sm" disabled={offline||busy||running||switching} onChange={event=>{
        const agent=event.target.value as LocalAgent|''
        setSwitching(true)
        act(async()=>{
          try{
            if(chat){
              await json(path(chat)+'/provider'+suffix,'POST',{agent:agent||null})
              await settingsNow()
            }else if(agent)await newChat(agent)
          }finally{setSwitching(false)}
        })
      }}>
        <NativeSelectOption value="">Device default · {settings.agent??(settings.hasApiKey?'OpenAI':'Unconfigured')}</NativeSelectOption>
        {settings.localAgents.map(agent=><NativeSelectOption key={agent} value={agent}>{agent==='codex'?'Codex':agent==='claude'?'Claude Code':'Hermes'}</NativeSelectOption>)}
      </NativeSelect>
    </div>:settings?.configured&&write&&<small data-part="disclosure">Messages and page context are sent to {settings.agent?'local '+settings.agent:'OpenAI'}.</small>}
    </footer>
  </aside>
}
