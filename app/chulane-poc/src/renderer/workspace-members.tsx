/** Let named workspace owners inspect and update existing memberships through the authenticated host. */
import {useEffect,useState} from 'react'
import {Users,UserMinus,UserPlus,Check,X} from 'lucide-react'
import {memberRoles,type MemberRole,type WorkspaceInvitation,type WorkspaceCatalog,type WorkspaceMember} from '../shared/library'
import {json} from './api'
import {Button,Dialog,DialogContent,DialogTitle,DialogTrigger,Input,Label,NativeSelect,NativeSelectOption} from './ui'

/** Keep the confirmation and roster local to the open dialog. The server enforces the owner invariant. */
function Roster({workspace,changed}:{workspace:number;changed:()=>Promise<unknown>}){
  const [offers,setOffers]=useState<{id:number;name:string;role:MemberRole}[]>([])
  const [username,setUsername]=useState(''),[offeredRole,setOfferedRole]=useState<MemberRole>('viewer')
  const offersPath='workspaces/invitations'
  const [members,setMembers]=useState<WorkspaceMember[]>([]),[error,setError]=useState('')
  const [confirm,setConfirm]=useState<number>(),[busy,setBusy]=useState(false),[revision,refresh]=useState(0)
  const path='workspaces/members',suffix='?workspace='+workspace
  useEffect(()=>{
    let current=true
    let pending=false
    async function load(){
      if(pending)return
      pending=true
      try{
        const [roster,invited]=await Promise.all([json(path+suffix),json(offersPath+suffix)])
        if(current){setMembers(roster);setOffers(invited)}
      }catch(err){if(current)setError((err as Error).message)}
      finally{pending=false}
    }
    void load()
    const timer=setInterval(load,3500)
    return ()=>{current=false;clearInterval(timer)}
  },[workspace,revision])
  async function update(member:WorkspaceMember,role:MemberRole|null){
    setBusy(true);setError('')
    try{
      await json(path+'/'+member.id+suffix,role?'PATCH':'DELETE',role?{role}:undefined)
      setConfirm(undefined);await changed()
    }catch(err){setError((err as Error).message)}
    finally{refresh(value=>value+1);setBusy(false)}
  }
  async function changeOffer(id?:number){
    setBusy(true);setError('')
    try{
      if(id)await json(offersPath+'/'+id+suffix,'DELETE')
      else{await json(offersPath+suffix,'POST',{username,role:offeredRole});setUsername('')}
    }catch(err){setError((err as Error).message)}
    finally{refresh(value=>value+1);setBusy(false)}
  }
  const owners=members.filter(member=>member.role==='owner').length
  return <div data-part="member-roster">
    <form aria-label="Invite an account" onSubmit={event=>{event.preventDefault();void changeOffer()}}>
      <Label htmlFor="invite-account">Account username</Label>
      <div><Input id="invite-account" maxLength={64} required value={username} onChange={e=>setUsername(e.target.value)}/>
        <NativeSelect aria-label="Invitation role" value={offeredRole} onChange={e=>setOfferedRole(e.target.value as MemberRole)}>
          {memberRoles.map(role=><NativeSelectOption key={role} value={role}>{role}</NativeSelectOption>)}</NativeSelect>
        <Button type="submit" size="icon-sm" disabled={busy||!username.trim()} aria-label="Send invitation" title="Send invitation"><UserPlus/></Button></div>
    </form>
    {offers.map(offer=><div key={'offer'+offer.id}><strong>{offer.name}</strong><small>Invited · {offer.role}</small>
      <Button size="icon-sm" variant="ghost" disabled={busy} aria-label={'Revoke invitation to '+offer.name} title="Revoke invitation" onClick={()=>void changeOffer(offer.id)}><X/></Button>
    </div>)}{members.map(member=>{
    const last=member.role==='owner'&&owners===1
    return <div key={member.id}><strong>{member.name}</strong>
      <NativeSelect aria-label={'Role for '+member.name} title={last?'Assign another owner first':undefined} disabled={busy||last} value={member.role}
        onChange={event=>void update(member,event.target.value as MemberRole)}>{memberRoles.map(role=><NativeSelectOption key={role} value={role}>{role}</NativeSelectOption>)}</NativeSelect>
      {confirm===member.id?<><Button size="sm" variant="destructive" disabled={busy||last} onClick={()=>void update(member,null)}>Remove {member.name}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={()=>setConfirm(undefined)}>Cancel</Button></>:
        <Button size="icon-sm" variant="ghost" disabled={busy||last} aria-label={'Remove '+member.name} title={last?'Assign another owner first':'Remove member'} onClick={()=>setConfirm(member.id)}><UserMinus/></Button>}
    </div>})}{error&&<p role="alert">{error}</p>}</div>
}

/** Load account names only when an owner opens member settings. */
export function WorkspaceMembers({workspace,offline,changed}:{workspace:number;offline?:boolean;changed:()=>Promise<unknown>}){
  return <Dialog><DialogTrigger asChild><Button variant="ghost" size="icon-sm" disabled={offline} aria-label="Manage members" title="Manage members"><Users/></Button></DialogTrigger>
    <DialogContent aria-describedby={undefined}><DialogTitle>Workspace members</DialogTitle><Roster workspace={workspace} changed={changed}/></DialogContent></Dialog>
}

/** Present active offers to the signed-in recipient, including accounts with no workspaces. */
export function WorkspaceInvitations({offers,changed}:{offers:WorkspaceInvitation[];changed:(catalog:WorkspaceCatalog,opened?:number)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function respond(offer:WorkspaceInvitation,accept:boolean){
    setBusy(true);setError('')
    try{
      const catalog=await json('invitations/'+offer.id+'/'+(accept?'accept':'decline'),'POST')
      changed(catalog,accept?offer.workspace:undefined)
    }catch(err){setError((err as Error).message)}
    finally{setBusy(false)}
  }
  if(!offers.length)return null
  return <section aria-label="Workspace invitations" data-part="incoming-invitations">
    <h2>Invitations</h2>{offers.map(offer=><div key={offer.id}><span>{offer.name} · {offer.role}</span>
      <Button size="icon-sm" disabled={busy} title="Accept invitation" aria-label={'Accept invitation to '+offer.name} onClick={()=>void respond(offer,true)}><Check/></Button>
      <Button size="icon-sm" variant="ghost" disabled={busy} title="Decline invitation" aria-label={'Decline invitation to '+offer.name} onClick={()=>void respond(offer,false)}><X/></Button>
    </div>)}{error&&<p role="alert">{error}</p>}
  </section>
}
