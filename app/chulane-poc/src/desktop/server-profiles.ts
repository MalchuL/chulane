/** Own saved server addresses and isolate each remote site's cookies and windows from the local Electron host. */
import {titleBarOptions,mountWindowTitle} from './window-title'
import {mountAgentWebLinks} from './agent-web-links'
import {BrowserWindow,ipcMain,session,type IpcMainInvokeEvent} from 'electron'
import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {validSidebarWidth,type SidebarWidths} from '../shared/sidebar-widths'
import {themeSchema} from '../shared/theme'
import type {ServerProfile} from '../shared/server-profiles'

/** Normalize a server origin before storing it or opening an authenticated connection. */
function serverOrigin(address:unknown){
  if(typeof address!=='string'||address.length>2048)throw Error('Enter a server address.')
  const url=new URL(address)
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname)
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw Error('Enter an HTTPS server origin, or a local HTTP loopback address.')
  return url.origin
}

/** Register local-window-only IPC handlers. Disposing the host closes its server windows and profile storage. */
export function mountServerProfiles(local:BrowserWindow,localOrigin:string,dir:string){
  const db=new DatabaseSync(join(dir,'server-profiles.sqlite'))
  db.exec('CREATE TABLE IF NOT EXISTS servers(origin TEXT PRIMARY KEY)')
  const windows=new Map<BrowserWindow,string>()
  function authorize(event:IpcMainInvokeEvent){
    if(event.sender!==local.webContents||event.senderFrame!==local.webContents.mainFrame||new URL(event.senderFrame.url).origin!==localOrigin)
      throw Error('Open server profiles from the local window.')
  }
  function partition(origin:string){return session.fromPartition('persist:chulane-server-'+createHash('sha256').update(origin).digest('hex'))}
  async function catalog(origin:string):Promise<ServerProfile>{
    try{
      const url=origin+'/api/workspaces'
      const isolated=partition(origin)
      const response=await isolated.fetch(url,{credentials:'include',redirect:'error',signal:AbortSignal.timeout(4000)})
      if(response.status===401){await response.body?.cancel();return {origin,status:'signed-out',workspaces:[],invitationCount:0}}
      if(!response.ok){await response.body?.cancel();throw Error()}
      // A server address is user-selected. Bound its untrusted response before parsing in Electron main.
      const reader=response.body?.getReader()
      if(!reader)throw Error()
      const chunks:Uint8Array[]=[]
      let size=0
      for(;;){
        const part=await reader.read()
        if(part.done)break
        size+=part.value.length
        if(size>1024*1024){await reader.cancel();throw Error()}
        chunks.push(part.value)
      }
      const value=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if(!Array.isArray(value.workspaces))throw Error()
      const workspaces=value.workspaces.map(({id,name})=>{
        if(!Number.isSafeInteger(id)||id<=0||typeof name!=='string'||name.length>250)throw Error()
        return {id,name}
      })
      const invitationCount=Array.isArray(value.invitations)?value.invitations.length:0
      return {origin,status:'connected',workspaces,invitationCount}
    }catch{return {origin,status:'unavailable',workspaces:[],invitationCount:0}}
  }
  // The loopback origin changes after restart; keep local appearance with device settings.
  db.exec('CREATE TABLE IF NOT EXISTS appearance(id INTEGER PRIMARY KEY CHECK(id=1),theme TEXT NOT NULL)')
  ipcMain.handle('appearance:read',event=>{
    authorize(event)
    const row=db.prepare('SELECT theme FROM appearance WHERE id=1').get()
    return row?themeSchema.parse(JSON.parse(String(row.theme))):null
  })
  ipcMain.handle('appearance:save',(event,value)=>{
    authorize(event)
    if(value===null)db.prepare('DELETE FROM appearance WHERE id=1').run()
    else db.prepare('INSERT INTO appearance VALUES(1,?) ON CONFLICT(id) DO UPDATE SET theme=excluded.theme').run(JSON.stringify(themeSchema.parse(value)))
  })
  db.exec("CREATE TABLE IF NOT EXISTS sidebar_widths(side TEXT PRIMARY KEY CHECK(side IN ('library','agent')),width INTEGER NOT NULL)")
  ipcMain.handle('sidebar-widths:read',event=>{
    authorize(event)
    const widths:SidebarWidths={}
    for(const {side,width} of db.prepare('SELECT side,width FROM sidebar_widths').all()){
      if((side==='library'||side==='agent')&&validSidebarWidth(side,width))widths[side]=width
    }
    return widths
  })
  ipcMain.handle('sidebar-widths:save',(event,side,width)=>{
    authorize(event)
    if((side!=='library'&&side!=='agent')||!validSidebarWidth(side,width))throw Error('Invalid sidebar width.')
    db.prepare('INSERT INTO sidebar_widths(side,width) VALUES(?,?) ON CONFLICT(side) DO UPDATE SET width=excluded.width').run(side,width)
  })
  ipcMain.handle('servers:list',async event=>{
    authorize(event)
    return Promise.all(db.prepare('SELECT origin FROM servers ORDER BY origin').all().map(row=>catalog(String(row.origin))))
  })
  ipcMain.handle('servers:open',async(event,address,workspace)=>{
    authorize(event)
    const origin=serverOrigin(address)
    if(origin===localOrigin)throw Error('This is your local workspace.')
    if(workspace!==undefined&&(!Number.isSafeInteger(workspace)||workspace<=0))throw Error('Invalid workspace')
    db.prepare('INSERT INTO servers(origin) VALUES(?) ON CONFLICT DO NOTHING').run(origin)
    // Opening a different workspace in a fresh window keeps unsaved edits in existing windows intact.
    const url=origin+'/'+(workspace===undefined?'':'?workspace='+workspace)
    const existing=Array.from(windows).find(([window,server])=>{
      if(server!==origin)return false
      const current=window.webContents.getURL()
      return workspace===undefined||(current&&new URL(current).searchParams.get('workspace')===String(workspace))
    })?.[0]
    if(existing){existing.show();existing.focus();return}
    const isolated=partition(origin)
    isolated.setPermissionRequestHandler((_contents,_permission,respond)=>respond(false))
    isolated.setPermissionCheckHandler(()=>false)
    const window=new BrowserWindow({...titleBarOptions,width:1180,height:820,title:origin,webPreferences:{additionalArguments:['--chulane-server-window'],session:isolated,preload:join(__dirname,'agent-link-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}})
    windows.set(window,origin)
    window.on('closed',()=>windows.delete(window))
    const contents=window.webContents
    contents.on('page-title-updated',event=>event.preventDefault())
    mountWindowTitle(window,origin)
    mountAgentWebLinks(contents,origin)
    contents.setWindowOpenHandler(()=>({action:'deny'}))
    contents.on('will-navigate',(event,target)=>{if(new URL(target).origin!==origin)event.preventDefault()})
    contents.on('will-redirect',(event,target)=>{if(new URL(target).origin!==origin)event.preventDefault()})
    try{await window.loadURL(url)}catch{if(!window.isDestroyed())window.destroy();throw Error('Could not open this server. Check its address and connection.')}
  })
  ipcMain.handle('servers:forget',async(event,address)=>{
    authorize(event)
    const origin=serverOrigin(address)
    if([...windows.values()].includes(origin))throw Error('Close this server’s windows before removing its profile.')
    // Pending account-bound edits survive disconnection. Reconnecting as that account can still deliver them.
    await partition(origin).clearStorageData({storages:['cookies','filesystem','localstorage','shadercache','serviceworkers','cachestorage']})
    db.prepare('DELETE FROM servers WHERE origin=?').run(origin)
  })
  return ()=>{
    for(const channel of ['servers:list','servers:open','servers:forget','appearance:read','appearance:save','sidebar-widths:read','sidebar-widths:save'])ipcMain.removeHandler(channel)
    for(const window of windows.keys())window.destroy()
    db.close()
  }
}
