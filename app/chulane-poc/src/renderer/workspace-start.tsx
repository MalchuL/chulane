/** Choose or explicitly create a workspace before mounting a workspace-scoped library and editor. */
import {useRef,useState} from 'react'
import {Layers,LogOut,ArchiveRestore,Trash2} from 'lucide-react'
import type {WorkspaceCatalog} from '../shared/library'
import {Button,Dialog,DialogContent,DialogTitle,DialogFooter,Input,Label,NativeSelect,NativeSelectOption} from './ui'
import {ScrollArea} from './ui/scroll-area'
import {PendingRecovery} from './pending-recovery'
import {ServerSettings} from './server-settings'
import {WorkspaceInvitations} from './workspace-members'
import {ServerPicker} from './server-picker'
import {useCreationRequest} from './use-creation-request'
import {usePendingSubmit} from './use-pending-submit'
import {json} from './api'

export const deviceZone=Intl.DateTimeFormat().resolvedOptions().timeZone
const journalZones=[...new Set(['UTC',deviceZone,...Intl.supportedValuesOf('timeZone')])]
/** Choose a geographical clock for the workspace while retaining legacy ICU zone aliases. */
export function ZoneSelect({value,disabled,onChange}:{value:string;disabled?:boolean;onChange:(zone:string)=>void}){
  return <Label>Workspace time zone<NativeSelect aria-label="Workspace time zone" value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>
    {(journalZones.includes(value)?journalZones:[value,...journalZones]).map(zone=><NativeSelectOption key={zone} value={zone}>{zone}</NativeSelectOption>)}
  </NativeSelect></Label>
}

/** Restore an archived workspace by its stable ID, then open it in the library. */
export function ArchivedWorkspaces({items,deleted,restore,changed,local}:{local:boolean;items:NonNullable<WorkspaceCatalog['archivedWorkspaces']>;deleted?:WorkspaceCatalog['deletedWorkspaces'];restore:(id:number)=>void;changed:(catalog:WorkspaceCatalog,restored?:number)=>void}){
  const [decision,setDecision]=useState<{id:number;name:string;action:'mark'|'purge'}>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const cancel=useRef<HTMLButtonElement>(null)
  async function change(id:number,action:'mark'|'purge'|'restore'){
    setBusy(true);setError('')
    try{
      const catalog=await json('workspaces/deletion?workspace='+id,'PUT',{action})
      setDecision(undefined);changed(catalog,action==='restore'&&catalog.workspaces.some(item=>item.id===id)?id:undefined)
    }catch(err){setError((err as Error).message)}finally{setBusy(false)}
  }
  return <>{items.length>0&&<section aria-label="Archived workspaces"><h2>Archived workspaces</h2>
    <ScrollArea data-part="workspace-list" role="region" aria-label="Archived workspace list" tabIndex={0}>{items.map(item=><div data-part="workspace-row" key={item.id}><Button variant="ghost" aria-label={'Restore '+item.name} title={'Restore '+item.name} onClick={()=>restore(item.id)}><ArchiveRestore/><span data-copyable="">{item.name}</span></Button>
      <Button variant="ghost" size="icon-sm" aria-label={'Mark '+item.name+' for deletion'} title="Mark for deletion" onClick={()=>{setError('');setDecision({...item,action:'mark'})}}><Trash2/></Button></div>)}</ScrollArea>
  </section>}
  {!!deleted?.length&&<section aria-label="Marked for deletion"><h2>Marked for deletion</h2>
    <ScrollArea data-part="workspace-list" role="region" aria-label="Workspaces marked for deletion" tabIndex={0}>{deleted.map(item=><div data-part="workspace-row" key={item.id}><Button variant="ghost" disabled={busy} aria-label={'Recover '+item.name} title="Restore workspace" onClick={()=>void change(item.id,'restore')}><ArchiveRestore/><span data-copyable="">{item.name}</span></Button>
      <Button variant="ghost" size="icon-sm" aria-label={'Permanently delete '+item.name} title="Permanently delete workspace" onClick={()=>{setError('');setDecision({...item,action:'purge'})}}><Trash2/></Button></div>)}</ScrollArea>
  </section>}
  {error&&!decision&&<p role="alert">{error}</p>}
  <Dialog open={!!decision} onOpenChange={open=>{if(!open&&!busy)setDecision(undefined)}}>
    <DialogContent aria-describedby="workspace-deletion-effect" onOpenAutoFocus={event=>{event.preventDefault();cancel.current?.focus()}}>
      <DialogTitle>{decision?.action==='mark'?'Mark '+decision.name+' for deletion?':'Permanently delete '+decision?.name+'?'}</DialogTitle>
      <p id="workspace-deletion-effect">{decision?.action==='mark'?'This workspace will leave the archive. The '+(local?'device':'server')+' administrator can recover it or permanently delete it.':'This removes its documents, attachments, conversations and settings from this '+(local?'device':'server')+'. Recovery requires an existing backup.'}</p>
      {error&&<p role="alert">{error}</p>}<DialogFooter><Button ref={cancel} disabled={busy} variant="outline" onClick={()=>setDecision(undefined)}>Cancel</Button>
        <Button variant="destructive" disabled={busy} onClick={()=>decision&&void change(decision.id,decision.action)}>{decision?.action==='mark'?'Mark for deletion':'Permanently delete'}</Button></DialogFooter>
    </DialogContent>
  </Dialog></>
}

type StartProps={catalog:WorkspaceCatalog;updated:(catalog:WorkspaceCatalog)=>void;missing:boolean;logout:()=>void;choose:(id:number)=>void}
/** Keep the name and calendar editable on a recoverable failure. Viewers can enter available workspaces. */
export function WorkspaceStart({catalog,updated,missing,choose,logout}:StartProps){
  const [name,setName]=useState(''),[zone,setZone]=useState(deviceZone),[error,setError]=useState('')
  const {pending:busy,run}=usePendingSubmit()
  const creation=useCreationRequest()
  const canCreate=catalog.role==='editor'
  async function create(){
    if(!name.trim())return
    setError('')
    try{const result=await creation.post('workspaces',{name:name.trim(),timeZone:zone});choose(result.id)}
    catch(err){setError((err as Error).message)}
  }
  return <main className="login"><div className="brand"><Layers aria-hidden="true"/> Chulane</div>
    <h1>{missing?'Workspace unavailable':catalog.workspaces.length||catalog.archivedWorkspaces?.length||catalog.deletedWorkspaces?.length?'Choose a workspace':canCreate?'Create your first workspace':'No workspaces yet'}</h1>
    <WorkspaceInvitations offers={catalog.invitations??[]} changed={(data,id)=>{updated(data);if(id)choose(id)}}/>
    {catalog.workspaces.length>0&&<nav aria-label="Available workspaces"><ScrollArea data-part="workspace-list" aria-label="Workspace choices" tabIndex={0}>{catalog.workspaces.map(item=><Button key={item.id} variant="outline" title={item.name} onClick={()=>choose(item.id)}><span data-copyable="">{item.name}</span></Button>)}</ScrollArea></nav>}
    {catalog.archivedWorkspaces&&<ArchivedWorkspaces local={catalog.desktop} items={catalog.archivedWorkspaces} deleted={catalog.deletedWorkspaces} changed={(result,id)=>{updated(result);if(id)choose(id)}} restore={id=>{
      void json('workspaces/archive?workspace='+id,'PUT',{archived:false}).then(()=>choose(id)).catch(err=>setError(err.message))
    }}/>}
    {catalog.serverAdmin&&<ServerSettings/>}
    {catalog.desktop&&<ServerPicker local={catalog.workspaces} choose={choose}/>}
    <PendingRecovery catalog={catalog}/>
    {canCreate?<form aria-label="Create workspace" data-part="first-workspace" aria-busy={busy} onSubmit={event=>{event.preventDefault();void run(create)}}>
      <Label htmlFor="first-workspace-name">Workspace name</Label><Input id="first-workspace-name" readOnly={busy} autoFocus required maxLength={250} value={name} onChange={event=>setName(event.target.value)}/>
      <ZoneSelect disabled={busy} value={zone} onChange={setZone}/>
      <Button type="submit" disabled={!name.trim()||busy}>{busy?'Creating…':'Create workspace'}</Button>
    </form>:!catalog.workspaces.length&&<p>A workspace editor can create the first workspace.</p>}
    {!catalog.desktop&&<Button variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut/></Button>}
    {error&&<p role="alert">{error}</p>}
  </main>
}
