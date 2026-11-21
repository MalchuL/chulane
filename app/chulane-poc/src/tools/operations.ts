/** Shared CLI and MCP operations. All data and proposals go through the authenticated web service. */
import type {Library} from '../shared/library.ts'
const origin=new URL(process.env.CHULANE_URL||'http://127.0.0.1:4173').origin
const ws=Number(process.env.CHULANE_WORKSPACE||1)
let cookie=''
async function api<T>(path:string,body?:object,retry=true):Promise<T>{
  const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',redirect:'error',headers:{'Content-Type':'application/json',Cookie:cookie},body:body&&JSON.stringify(body)})
  if(r.status===401 && retry){
    const login=await fetch(origin+'/api/login',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:process.env.CHULANE_ACCESS_KEY})})
    if(!login.ok)throw Error('Workspace access key rejected')
    const session=login.headers.get('set-cookie');if(!session)throw Error('Missing session cookie');cookie=session.split(';')[0];return api<T>(path,body,false)
  }
  const value=await r.json();if(!r.ok)throw Error(value.error);return value
}
/** Use the workspace selected by the operator for all model-visible operations. */
export async function operation(command:string,arg:string|number|{id:number;title:string}=''){
  const suffix='?workspace='+ws
  if(command==='propose_create')return api<{pending:number}>('proposals'+suffix,{title:arg})
  if(command==='propose_rename' && typeof arg==='object')return api<{pending:number}>('proposals'+suffix,{page:arg.id,title:arg.title})
  const link=<T extends {id:number}>(page:T)=>({...page,url:origin+'/?workspace='+ws+'&page='+page.id})
  if(command==='search'){
    const hits=await api<{id:number;title:string}[]>('search'+suffix+'&q='+encodeURIComponent(String(arg)))
    return hits.map(link)
  }
  if(command==='read')return link(await api<{id:number;title:string;text:string}>('source'+suffix+'&id='+Number(arg)))
  const lib=await api<Library>('library'+suffix)
  if(command==='workspaces')return lib.workspaces
  if(command==='projects')return lib.projects
  throw Error('Use workspaces, projects, search QUERY, read ID, propose_create TITLE or propose_rename ID TITLE')
}
