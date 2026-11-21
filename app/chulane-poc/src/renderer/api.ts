/** Same-origin API operations. Rejections carry the server status so callers can recover conflicts. */
export async function request(path:string, init?:RequestInit){
  const r=await fetch('/api/'+path,init)
  if(!r.ok) throw Object.assign(new Error((await r.json()).error),{status:r.status})
  return r
}
export async function json(path:string,method='GET',value?:unknown){
  return (await request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})).json()
}
