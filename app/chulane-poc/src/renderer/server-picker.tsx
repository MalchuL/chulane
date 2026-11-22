/** Show local and authorized remote workspaces together; ask the native host to open each remote origin in isolation. */
import {useEffect,useState} from 'react'
import {Server,ArrowUpRight,Plus,Unplug} from 'lucide-react'
import {Button,Dialog,DialogContent,DialogTitle,DialogTrigger,Input,Label} from './ui'
import type {Item} from '../shared/library'
import type {ServerProfile} from '../shared/server-profiles'

const pickerClass='server-picker'
const headingClass='server-heading'

type PickerProps={local:Item[];choose:(id:number)=>void}
/** Fetch live catalogues on opening or returning from a server sign-in. Offline servers remain removable. */
export function ServerPicker({local,choose}:PickerProps){
  const host=window.chulaneServers
  const [open,setOpen]=useState(false),[profiles,setProfiles]=useState<ServerProfile[]>([]),[address,setAddress]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0)
  useEffect(()=>{
    if(!open||!host)return
    let latest=0,active=true
    function load(){
      const request=++latest
      setProfiles([])
      void host!.list().then(data=>{if(active&&request===latest)setProfiles(data)}).catch(err=>{if(active)setError(err.message)})
    }
    load();window.addEventListener('focus',load)
    return ()=>{active=false;window.removeEventListener('focus',load)}
  },[host,open,refresh])
  if(!host)return null
  async function run(action:()=>Promise<void>){
    setBusy(true);setError('')
    try{await action()}catch(err){setError((err as Error).message)}finally{setBusy(false);setRefresh(n=>n+1)}
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Workspace connections" title="Workspace connections"><Server/></Button></DialogTrigger>
    <DialogContent className={pickerClass} aria-describedby={undefined}><DialogTitle>Workspace connections</DialogTitle>
      <section aria-label="Local workspaces"><h3>On this device</h3>{local.length?local.map(item=><Button key={item.id} variant="ghost" onClick={()=>{setOpen(false);choose(item.id)}}>{item.name}</Button>):<p>No local workspaces yet</p>}</section>
      {profiles.map(profile=><section key={profile.origin} aria-label={profile.origin}>
        <div className={headingClass}><h3>{profile.origin}</h3>
          <Button size="icon-sm" variant="ghost" disabled={busy} aria-label={'Open '+profile.origin} title="Open server" onClick={()=>void run(()=>host.open(profile.origin))}><ArrowUpRight/></Button>
          <Button size="icon-sm" variant="ghost" disabled={busy} aria-label={'Forget '+profile.origin} title="Forget server" onClick={()=>void run(()=>host.forget(profile.origin))}><Unplug/></Button></div>
        {profile.status!=='connected'?<p>{profile.status==='signed-out'?'Sign in on this server':'Server unavailable'}</p>:profile.workspaces.length?profile.workspaces.map(item=><Button variant="ghost" key={item.id} disabled={busy} onClick={()=>void run(()=>host.open(profile.origin,item.id))}>{item.name}</Button>):<p>No accessible workspaces</p>}
      </section>)}
      <form onSubmit={event=>{event.preventDefault();void run(async()=>{await host.open(address);setAddress('')})}}>
        <Label htmlFor="server-origin">Server address</Label><div className={headingClass}><Input id="server-origin" type="url" required placeholder="https://chulane.example.org" value={address} onChange={e=>setAddress(e.target.value)}/>
        <Button size="icon-sm" type="submit" disabled={busy||!address.trim()} aria-label="Connect to server" title="Connect to server"><Plus/></Button></div>
      </form>{error&&<p role="alert">{error.replace(/^Error invoking remote method '[^']+': Error: /,'')}</p>}
    </DialogContent></Dialog>
}
