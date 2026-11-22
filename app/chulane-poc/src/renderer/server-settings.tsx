/** Installation-wide registration and shared agent configuration are editable by the authenticated server administrator. */
import {useEffect,useState} from 'react'
import {RotateCcw,Save,Settings2} from 'lucide-react'
import {Button,Dialog,DialogContent,DialogTitle,DialogTrigger,Input,Label} from './ui'
import {json} from './api'

/** Read on each opening and show the policy the server acknowledged. */
function RegistrationSetting(){
  const [enabled,setEnabled]=useState<boolean>(),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{
    let open=true
    void json('server/settings').then(data=>{if(open)setEnabled(data.registration)}).catch(err=>{if(open)setError(err.message)})
    return ()=>{open=false}
  },[])
  async function change(registration:boolean){
    const previous=enabled
    setEnabled(registration);setBusy(true);setError('')
    try{setEnabled((await json('server/settings','PATCH',{registration})).registration)}
    catch(err){setEnabled(previous);setError((err as Error).message)}finally{setBusy(false)}
  }
  return <><Label><input type="checkbox" checked={enabled??false} disabled={enabled===undefined||busy} onChange={event=>void change(event.target.checked)}/>Allow public account registration</Label>
    {error&&<p role="alert">{error}</p>}</>
}

const providerFormClass='grid gap-2'
type Connection={model:string;hasApiKey:boolean;agent?:string;custom:boolean;endpoint:string}

/** Show connection metadata while keeping the administrator's replacement credential write-only. */
function ProviderSetting(){
  const [connection,setConnection]=useState<Connection>(),[model,setModel]=useState(''),[key,setKey]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  useEffect(()=>{
    let open=true
    void json('server/provider').then((data:Connection)=>{if(open){setConnection(data);setModel(data.model)}}).catch(err=>{if(open)setError(err.message)})
    return ()=>{open=false}
  },[])
  async function commit(reset:boolean){
    setBusy(true);setError('');setNotice('')
    try{
      const data:Connection=await json('server/provider',reset?'DELETE':'PUT',reset?undefined:{model,key})
      setConnection(data);setModel(data.model);setKey('')
      setNotice(reset?'Host defaults restored.':'Shared provider saved.')
    }catch(err){setError((err as Error).message)}finally{setBusy(false)}
  }
  return <form aria-labelledby="server-provider-heading" className={providerFormClass} onSubmit={event=>{event.preventDefault();void commit(false)}}>
    <h3 id="server-provider-heading">Shared AI provider</h3>
    {connection&&<><p>{connection.agent?'Current connection: local '+connection.agent+'. ':''}API requests send messages and selected document context to {connection.endpoint}.</p>
      <Label htmlFor="server-ai-model">Model</Label><Input id="server-ai-model" required maxLength={128} value={model} onChange={event=>setModel(event.target.value)}/>
      <Label htmlFor="server-ai-key">API key</Label><Input id="server-ai-key" type="password" autoComplete="off" maxLength={2048} required={!connection.hasApiKey} placeholder={connection.hasApiKey?'Keep current key':undefined} value={key} onChange={event=>setKey(event.target.value)}/>
      <div><Button type="submit" size="icon-sm" title="Save shared provider" aria-label="Save shared provider" disabled={busy}><Save/></Button>
      {connection.custom&&<Button type="button" variant="ghost" size="icon-sm" title="Restore host provider defaults" aria-label="Restore host provider defaults" disabled={busy} onClick={()=>void commit(true)}><RotateCcw/></Button>}</div></>}
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </form>
}

/** Open the same control from the workspace picker or a signed-in workspace. */
export function ServerSettings(){
  return <Dialog><DialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Server settings" title="Server settings"><Settings2/></Button></DialogTrigger>
    <DialogContent aria-describedby={undefined}><DialogTitle>Server settings</DialogTitle><RegistrationSetting/><ProviderSetting/></DialogContent></Dialog>
}
