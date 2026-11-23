/** Same-origin API operations. Rejections carry the server status so callers can recover conflicts. */
import {serverRequest} from './offline-server'

/** Preserve HTTP failures even when a reverse proxy supplies HTML or an empty response. */
export async function request(path:string, init?:RequestInit){
  const r=await serverRequest(path,init)
  if(!r.ok){
    const details=await r.json().catch(()=>null)
    const reason=r.status===413?'This request exceeds the server’s size limit':r.statusText||'Request failed'
    const message=typeof details?.error==='string'&&details.error.trim()?details.error:reason+' (HTTP '+r.status+')'
    const missing=details?.unavailableBlocks??(details?.unavailableBlock?[details.unavailableBlock]:undefined)
    throw Object.assign(new Error(message),{status:r.status,unavailableBlocks:missing})
  }
  return r
}

/** Send a JSON operation and mark library results served from the device cache. */
export async function json(path:string,method='GET',value?:unknown){
  const response=await request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})
  const data=await response.json()
  if(path.startsWith('library?')&&response.headers.has('X-Chulane-Offline'))data.offline=true
  return data
}
