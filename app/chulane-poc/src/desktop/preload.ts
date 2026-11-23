/** Expose the server picker and device appearance settings to the local workspace's isolated renderer. */
import './agent-link-preload'
import {contextBridge,ipcRenderer} from 'electron'
import type {ServerProfiles} from '../shared/server-profiles'
const profiles:ServerProfiles={
  list:()=>ipcRenderer.invoke('servers:list'),
  open:(address,workspace)=>ipcRenderer.invoke('servers:open',address,workspace),
  forget:origin=>ipcRenderer.invoke('servers:forget',origin)
}
contextBridge.exposeInMainWorld('chulaneServers',profiles)

contextBridge.exposeInMainWorld('chulaneAppearance',{
  read:()=>ipcRenderer.invoke('appearance:read'),
  save:(value)=>ipcRenderer.invoke('appearance:save',value)
} satisfies import('../shared/theme').DesktopAppearance)

contextBridge.exposeInMainWorld('chulaneSidebarWidths',{
  read:()=>ipcRenderer.invoke('sidebar-widths:read'),
  save:(side,width)=>ipcRenderer.invoke('sidebar-widths:save',side,width)
} satisfies import('../shared/sidebar-widths').DesktopSidebarWidths)

// Keep Electron's IPC event and sender out of plugin callbacks.
contextBridge.exposeInMainWorld('chulanePluginBlocks',{subscribe(listener:(modules:string[])=>void){
  const changed=(_event:unknown,modules:string[])=>listener(modules)
  ipcRenderer.on('plugins:changed',changed)
  return ()=>{ipcRenderer.off('plugins:changed',changed)}
}})
