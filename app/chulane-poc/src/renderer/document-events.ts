/** Share revision notifications and optional active-document presence across editors in this window. */
import {request} from './api'

type Listener=(page?:number)=>void
type Presence={page:number;update:(names?:string[])=>void}
type Subscription={listeners:Set<Listener>;presence?:Presence;announce:()=>void;release:()=>void}
const subscriptions=new Map<string,Subscription>()

/** One authenticated connection covers splits, journal entries and the currently selected document. */
function subscriptionFor(workspace:number,replica:string|undefined){
  const key=JSON.stringify([workspace,replica])
  const existing=subscriptions.get(key)
  if(existing)return existing
  const controller=new AbortController()
  let socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,supportsPresence=false
  const shared:Subscription={listeners:new Set(),announce(){
    if(supportsPresence&&socket?.readyState===WebSocket.OPEN)socket.send(String(shared.presence?.page??0))
  },release(){
    if(shared.listeners.size||shared.presence)return
    controller.abort();clearTimeout(retry);socket?.close();subscriptions.delete(key)
  }}
  function reconnect(){if(!controller.signal.aborted)retry=setTimeout(connect,5000)}
  async function connect(){
    try{
      const response=await request('document-events?workspace='+workspace,{signal:controller.signal,headers:replica?{'X-Chulane-Replica':replica}:undefined})
      const {ticket,presence}=await response.json()
      if(controller.signal.aborted)return
      supportsPresence=presence===true
      socket=new WebSocket(new URL('/api/document-events',location.href),ticket)
      socket.onopen=()=>{if(shared.presence)shared.announce();shared.listeners.forEach(listener=>listener())}
      socket.onmessage=event=>{
        if(typeof event.data!=='string')return
        if(/^\d+$/.test(event.data)){shared.listeners.forEach(listener=>listener(Number(event.data)));return}
        if(!shared.presence)return
        try{
          const data=JSON.parse(event.data)
          if(data.page===shared.presence.page&&Array.isArray(data.participants)&&data.participants.every((n:unknown)=>typeof n==='string'))
            shared.presence.update(data.participants)
        }catch{/* Ignore an unknown extension frame. */}
      }
      socket.onclose=()=>{shared.presence?.update();reconnect()}
    }catch(error){
      if(![401,403,404,405,410].includes((error as {status:number}).status))reconnect()
    }
  }
  subscriptions.set(key,shared)
  void connect()
  return shared
}

/** Reconcile on connect to cover edits received between the initial read and the upgrade. */
export function watchDocumentChanges(workspace:number,replica:string|undefined,listen:Listener){
  const shared=subscriptionFor(workspace,replica)
  shared.listeners.add(listen)
  return ()=>{shared.listeners.delete(listen);shared.release()}
}

/** Only the active document in this window publishes presence; split views still receive every revision. */
export function watchDocumentPresence(workspace:number,replica:string|undefined,presence:Presence){
  const shared=subscriptionFor(workspace,replica)
  shared.presence=presence;shared.announce()
  return ()=>{
    if(shared.presence===presence){shared.presence=undefined;shared.announce()}
    shared.release()
  }
}
