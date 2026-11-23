/** Workspace revision notifications and transient page participants share an authenticated WebSocket. */
import {randomBytes} from 'node:crypto'
import type {Server} from 'node:http'
import {WebSocketServer,type WebSocket} from 'ws'

type Grant={workspace:number;check:()=>void;name?:string}
type Client=Grant & {page:number;alive:boolean}

/** Grant document notifications through the HTTP session. Only the server supplies participant identities. */
export function documentEvents(presenceEnabled:()=>boolean,pageAvailable:(workspace:number,page:number)=>boolean){
  const sockets=new WebSocketServer({noServer:true,clientTracking:false,maxPayload:128})
  const tickets=new Map<string,Grant>(),clients=new Map<WebSocket,Client>()
  /** A ticket is single use and is sent in the handshake protocol header rather than the URL. */
  function issue(workspace:number,check:()=>void,name?:string){
    const ticket=randomBytes(32).toString('hex')
    tickets.set(ticket,{workspace,check,name})
    setTimeout(()=>tickets.delete(ticket),10000).unref()
    return {ticket,...(name&&{presence:true})}
  }
  /** Check read access at delivery; a failed check also excludes the account from outgoing rosters. */
  function authorized(socket:WebSocket,client:Client){
    if(socket.readyState!==socket.OPEN)return false
    try{client.check();return true}catch{socket.close(1008);return false}
  }
  function send(socket:WebSocket,message:string){
    if(socket.bufferedAmount>65536)socket.terminate()
    else socket.send(message)
  }
  /** Count each account once even when it opens multiple windows or devices. */
  function roster(workspace:number,page:number){
    if(!page)return
    const viewing=new Map<WebSocket,string>()
    for(const [socket,client] of clients){
      if(client.workspace===workspace&&client.page===page&&client.name&&authorized(socket,client))viewing.set(socket,client.name)
    }
    if(!viewing.size)return
    const names=presenceEnabled()&&pageAvailable(workspace,page)?[...new Set(viewing.values())].sort((a,b)=>a.localeCompare(b)):[]
    const message=JSON.stringify({page,participants:names})
    for(const socket of viewing.keys())send(socket,message)
  }
  /** Accept only same-origin connections. Named members may announce their selected page or leave with zero. */
  function attach(server:Server){
    server.on('upgrade',(req,socket,head)=>{
      const ticket=req.headers['sec-websocket-protocol']??'',grant=tickets.get(ticket)
      if(req.url!=='/api/document-events'||URL.parse(String(req.headers.origin))?.host!==req.headers.host||!grant){
        socket.destroy();return
      }
      tickets.delete(ticket)
      try{grant.check()}catch{socket.destroy();return}
      sockets.handleUpgrade(req,socket,head,connection=>{
        const client:Client={...grant,page:0,alive:true}
        clients.set(connection,client)
        connection.once('close',()=>{if(clients.delete(connection))roster(client.workspace,client.page)})
        connection.on('pong',()=>{client.alive=true})
        connection.on('error',()=>connection.terminate())
        connection.on('message',(data,binary)=>{
          if(!client.name||binary||!/^\d{1,16}$/.test(data.toString())){connection.close(1008);return}
          if(!authorized(connection,client))return
          const requested=Number(data)
          const page=Number.isSafeInteger(requested)&&requested&&presenceEnabled()&&pageAvailable(client.workspace,requested)?requested:0
          const previous=client.page
          if(page===previous)return
          client.page=page
          roster(client.workspace,previous);roster(client.workspace,page)
        })
      })
    })
  }
  // TCP can outlive an offline device. A missed pong expires its presence on the next check.
  const heartbeat=setInterval(()=>{
    for(const [socket,client] of clients){
      if(!client.alive){socket.terminate();continue}
      if(socket.readyState===socket.OPEN){client.alive=false;socket.ping()}
    }
  },30000).unref()
  function recheckAccess(workspace?:number){
    for(const [socket,client] of clients)if(workspace===undefined||client.workspace===workspace)authorized(socket,client)
  }
  /** Refresh occupied rooms on either policy transition, including rapid disable and enable. */
  function refreshPresence(){
    const rooms=new Map<number,Set<number>>()
    for(const {workspace,page} of clients.values()){
      if(!page)continue
      const pages=rooms.get(workspace)??new Set<number>()
      pages.add(page);rooms.set(workspace,pages)
    }
    for(const [workspace,pages] of rooms)for(const page of pages)roster(workspace,page)
  }
  function changed(workspace:number,page:number){
    for(const [socket,client] of clients)if(client.workspace===workspace&&authorized(socket,client))send(socket,String(page))
  }
  function close(){
    clearInterval(heartbeat);tickets.clear()
    for(const client of clients.keys())client.terminate()
    clients.clear();sockets.close()
  }
  return {issue,attach,changed,close,recheckAccess,refreshPresence}
}
