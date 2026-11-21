/** Electron owns a Cordis local-workspace plugin and authenticates only its isolated renderer. */
import {app,BrowserWindow,Menu,dialog} from 'electron'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {Context} from '../../../../vendor/cordis/src/index.ts'
import {desktopProvider} from './provider'
import {serve} from '../server/service.ts'
import {mountPlugins} from './plugins'

app.setName('Chulane POC')
const ctx=new Context()
let exiting=false
app.whenReady().then(async()=>{
  const plugin=ctx.plugin(async function localWorkspace(scope){
    const key=randomBytes(32).toString('hex')
    const host=await serve({context:scope,file:join(app.getPath('userData'),'workspace.sqlite'),assets:join(__dirname,'../dist'),editorKey:key,desktop:true,provider:await desktopProvider(app.getPath('userData'))})
    scope.effect(()=>()=>host.close())
    const window=new BrowserWindow({width:1280,height:850,minWidth:600,title:'Chulane',webPreferences:{partition:'chulane-local',sandbox:true,contextIsolation:true,nodeIntegration:false}})
    const session=window.webContents.session
    session.webRequest.onBeforeSendHeaders({urls:[host.url+'/*']},(details,done)=>{
      if(details.webContentsId===window.webContents.id && new URL(details.url).origin===host.url)details.requestHeaders.Authorization='Bearer '+key
      done({requestHeaders:details.requestHeaders})
    })
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
    window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==host.url)event.preventDefault()})
    await mountPlugins(scope,app.getPath('userData'))
    await window.loadURL(host.url)
  })
  await plugin.await()
}).catch(error=>{dialog.showErrorBox('Chulane startup failed',String(error));app.quit()})
app.on('window-all-closed',()=>app.quit())
app.on('before-quit',event=>{if(!exiting){event.preventDefault();exiting=true;Promise.resolve(ctx.fiber.dispose()).finally(()=>app.quit())}})
