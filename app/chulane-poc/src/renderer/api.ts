/** Same-origin API operations. Rejections carry the server status so callers can recover conflicts. */
import {serverRequest} from './offline-server'
export async function request(path:string, init?:RequestInit){
  const r=await serverRequest(path,init)
  if(!r.ok) throw Object.assign(new Error((await r.json()).error),{status:r.status})
  return r
}
export async function json(path:string,method='GET',value?:unknown){
  const response=await request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})
  const data=await response.json()
  if(path.startsWith('library?')&&response.headers.has('X-Chulane-Offline'))data.offline=true
  return data
}
