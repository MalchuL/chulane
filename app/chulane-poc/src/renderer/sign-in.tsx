/** Authenticate against the current server using one of the methods its operator enabled. */
import {useEffect,useState} from 'react'
import {Layers} from 'lucide-react'
import {Button,Input,Label} from './ui'
import {cachedSignInWorkspaces,selectCachedSession} from './offline-server'
import {json} from './api'

type Method='key'|'account'|'register'
type AuthOptions={accounts:boolean;keys:boolean;registration:boolean}

/** Keep credentials in this form only and expose registration only when the server accepts it. */
export function SignIn({opened,openOffline}:{opened:()=>void;openOffline:(workspace:number)=>void}){
  const [options,setOptions]=useState<AuthOptions>(),[method,setMethod]=useState<Method>('account')
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{void json('auth').then((data:AuthOptions)=>{setOptions(data);setMethod(data.keys?'key':'account')}).catch(e=>setError(e.message))},[])
  const [copies,setCopies]=useState<Awaited<ReturnType<typeof cachedSignInWorkspaces>>>()
  useEffect(()=>{
    let current=true
    function load(){void cachedSignInWorkspaces().then(result=>{if(current)setCopies(result)}).catch(()=>{if(current)setCopies(undefined)})}
    load();window.addEventListener('storage',load)
    return ()=>{current=false;window.removeEventListener('storage',load)}
  },[])
  function select(next:Method){setMethod(next);setPassword('');setError('')}
  async function submit(){
    setBusy(true);setError('')
    try{await json(method==='register'?'register':'login','POST',method==='key'?{key:password}:{username,password});opened()}
    catch(err){setError((err as Error).message)}finally{setBusy(false)}
  }
  const methods:Method[]=options?[...(options.keys?['key' as const]:[]),...(options.accounts?['account' as const]:[]),...(options.registration?['register' as const]:[])]:[]
  const label={key:'Use access key',account:'Sign in with account',register:'Create account'}
  return <main className="login"><div className="login-heading"><div className="brand"><Layers aria-hidden="true"/> Chulane</div><h1>{method==='register'?'Create an account':'Open your workspace'}</h1></div>
    {options&&<form onSubmit={event=>{event.preventDefault();void submit()}}>
      {method!=='key'&&<><Label htmlFor="username">Username</Label><Input id="username" name="username" autoComplete="username" required maxLength={64} value={username} onChange={e=>setUsername(e.target.value)}/></>}
      <Label htmlFor="credential">{method==='key'?'Workspace access key':'Password'}</Label>
      <Input id="credential" name="password" type="password" autoComplete={method==='register'?'new-password':'current-password'} required minLength={method==='register'?12:1} value={password} onChange={e=>setPassword(e.target.value)}/>
      {method==='register'&&<p className="login-help">Use at least 12 characters for your password.</p>}
      {method==='key'&&<p className="login-help">Use the editor or viewer key for this server’s shared library.</p>}
      <Button disabled={busy}>{method==='register'?'Register':'Open library'}</Button>
      {methods.filter(item=>item!==method).map(item=><Button type="button" key={item} variant="ghost" disabled={busy} onClick={()=>select(item)}>{label[item]}</Button>)}
    </form>}
    {!!copies?.workspaces.length&&<section aria-label="Work offline"><h2>Work offline</h2>{copies.workspaces.map(item=><Button key={item.id} type="button" variant="outline" disabled={busy} aria-label={'Open offline copy of '+item.name} onClick={()=>{if(selectCachedSession(copies.generation))openOffline(item.id)}}>{item.name}</Button>)}</section>}
    {error&&<p role="alert">{error}</p>}
  </main>
}
