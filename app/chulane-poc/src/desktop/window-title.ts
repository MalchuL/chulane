/** Give each workspace a draggable custom caption while Electron owns the system buttons and application menu. */
import {Menu,type BrowserWindow,type BrowserWindowConstructorOptions} from 'electron'

export const titleBarOptions={
  titleBarStyle:'hidden',autoHideMenuBar:true,
  titleBarOverlay:{height:34,color:'#f3f3f7',symbolColor:'#242332'},
} satisfies BrowserWindowConstructorOptions

/** Scope menu presentation and caption colors to the window whose top-level preload requested them. */
export function mountWindowTitle(win:BrowserWindow,origin:string){
  const contents=win.webContents
  contents.ipc.on('window:caption-colors',(event,color,ink)=>{
    if(event.senderFrame!==contents.mainFrame||URL.parse(contents.getURL())?.origin!==origin||process.platform==='darwin')return
    if(typeof color==='string'&&typeof ink==='string'&&/^#[0-9a-f]{6}$/i.test(color)&&/^#[0-9a-f]{6}$/i.test(ink))
      win.setTitleBarOverlay({color,symbolColor:ink})
  })
  contents.ipc.on('window:application-menu',(event,x,y)=>{
    if(event.senderFrame!==contents.mainFrame||URL.parse(contents.getURL())?.origin!==origin||!Number.isFinite(x)||!Number.isFinite(y))return
    const zoom=contents.getZoomFactor()
    Menu.getApplicationMenu()?.popup({window:win,x:Math.round(x*zoom),y:Math.round(y*zoom)})
  })
  const fullscreen=()=>contents.send('window:fullscreen',win.isFullScreen())
  win.on('enter-full-screen',fullscreen)
  win.on('leave-full-screen',fullscreen)
  contents.on('did-finish-load',fullscreen)
}
