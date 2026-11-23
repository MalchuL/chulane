/** Native plugin menu. Confirmed local folders export a Cordis plugin from plugin.mjs. */
import {Menu,dialog,shell,type MenuItemConstructorOptions} from 'electron'
import {localBackupCommand,localRestoreCommand} from './backup.ts'
import type {PluginDraft} from '../shared/agent'
import {mkdtemp,readFile,rm,writeFile,rename} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {join,basename,isAbsolute} from 'node:path'
import {pathToFileURL} from 'node:url'
import type {Context} from '../../../../vendor/cordis/src/index.ts'

/** Restore enabled folders and tie every loaded plugin and command to its owning fiber. */
export async function mountPlugins(ctx:Context,dir:string,database:string,rendererModules:Map<string,string>,changed:()=>void){
  const settings=join(dir,'plugins.json')
  let folders:Record<string,boolean>={}
  let settingsError=''
  const live=new Map<string,ReturnType<Context['plugin']>>()
  const failures=new Map<string,string>()
  const importAttempts=new Map<string,number>()
  const commands=new Map<symbol,MenuItemConstructorOptions>()
  let pending=Promise.resolve()
  /** Serialize native menu and sidebar operations that update the same plugin registry. */
  function enqueue<T>(work:()=>Promise<T>){
    const result=pending.then(work)
    pending=result.then(()=>{},()=>{})
    return result
  }
  const report=(work:()=>Promise<void>)=>()=>void enqueue(work).catch(e=>dialog.showErrorBox('Plugin operation failed',String(e)))
  async function enable(folder:string){
    if(live.has(folder))return
    const source=await readFile(join(folder,'renderer.mjs'),'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return undefined})
    const entry=join(folder,'plugin.mjs')
    const version=createHash('sha256').update(await readFile(entry)).digest('hex')
    const attempt=importAttempts.get(folder)??0
    // Node caches rejected module evaluations. Retry the same entry after its local resources are repaired.
    const module=await import(pathToFileURL(entry).href+'?v='+version+'&attempt='+attempt).catch(error=>{
      importAttempts.set(folder,attempt+1)
      throw error
    })
    const fiber=ctx.plugin(module.default,{command:(label:string,click:()=>void)=>{
      const key=Symbol();commands.set(key,{label,click});draw();return ()=>{commands.delete(key);draw()}
    }})
    try{await fiber.await()}catch(e){await fiber.dispose();throw e}
    live.set(folder,fiber);failures.delete(folder)
    if(source!==undefined){
      const id=createHash('sha256').update(folder).update('\0').update(source).digest('hex')
      fiber.effect(()=>{
        rendererModules.set(id,source);changed()
        return ()=>{rendererModules.delete(id);changed()}
      })
    }
  }
  /** A missing or broken enabled folder stays retryable without blocking other plugins or the library window. */
  async function restore(folder:string){
    if(!folders[folder])return
    try{await enable(folder)}catch(error){failures.set(folder,error instanceof Error?error.message:String(error))}
  }
  /** Load the whole registry before activating any folder. Keep unreadable settings intact for repair. */
  async function restoreSettings(){
    try{
      const raw=await readFile(settings,'utf8')
      const saved=JSON.parse(raw)
      if(!saved||typeof saved!=='object'||Array.isArray(saved)||!Object.entries(saved).every(([folder,on])=>isAbsolute(folder)&&typeof on==='boolean'))
        throw Error('Expected plugin folder paths with true or false settings.')
      folders=saved
      settingsError=''
    }catch(error){
      if((error as NodeJS.ErrnoException).code==='ENOENT'){folders={};settingsError=''}
      else settingsError=error instanceof Error?error.message:String(error)
    }
    if(!settingsError)for(const folder of Object.keys(folders))await restore(folder)
    draw()
  }
  /** Commit the requested folder state before starting or disposing its Cordis resources. */
  async function changeFolder(folder:string,enabled:boolean|null){
    const next={...folders}
    if(enabled===null)delete next[folder]
    else next[folder]=enabled
    const temp=settings+'.'+randomUUID()+'.tmp'
    try{
      await writeFile(temp,JSON.stringify(next),{flush:true,mode:0o600})
      await rename(temp,settings)
    }catch(error){
      await rm(temp,{force:true})
      throw error
    }
    folders=next
    try{
      if(enabled){
        await restore(folder)
        if(failures.has(folder))throw Error(failures.get(folder))
      }else{
        const fiber=live.get(folder)
        live.delete(folder);failures.delete(folder)
        await fiber?.dispose()
      }
    }finally{draw()}
  }
  async function install(){
    const {filePaths,canceled}=await dialog.showOpenDialog({properties:['openDirectory']});if(canceled)return
    await confirmInstall(filePaths[0])
  }
  /** Both manually selected and generated folders need native consent before executing any source. */
  async function confirmInstall(folder:string,authorize?:()=>void){
    if(live.has(folder))return
    if(settingsError)throw Error('Repair plugins.json and choose Retry loading settings in the Plugins menu.')
    const choice=await dialog.showMessageBox({type:'warning',message:'Run this trusted desktop plugin?',detail:folder+' contains desktop plugin code and can contribute editor blocks. Its native code runs with your desktop account permissions.',buttons:['Cancel','Run plugin'],defaultId:0,cancelId:0})
    if(choice.response!==1)return
    authorize?.()
    await changeFolder(folder,true)
  }
  function draw(){Menu.setApplicationMenu(Menu.buildFromTemplate([...(process.platform==='darwin'?[{role:'appMenu' as const}]:[]),{label:'File',submenu:[
    {id:'show-local-database',label:'Show local workspace database',click:()=>shell.showItemInFolder(database)},
    localBackupCommand(database),localRestoreCommand()]},{role:'editMenu'},{role:'viewMenu'},{label:'Plugins',submenu:[
    {label:'Install from folder…',enabled:!settingsError,click:report(install)},
    ...(settingsError?[
      {id:'plugin-settings-error',label:'Plugin settings unavailable',toolTip:settingsError,enabled:false},
      {label:'Show settings file',click:()=>shell.showItemInFolder(settings)},
      {id:'retry-plugin-settings',label:'Retry loading settings',click:report(restoreSettings)},
    ]:[]),
    ...Object.entries(folders).map(([folder,enabled])=>({id:folder,label:basename(folder)+(failures.has(folder)?' (unavailable)':''),toolTip:folder,submenu:[
      ...(failures.has(folder)?[{label:failures.get(folder),enabled:false},{label:'Retry',click:report(async()=>{await restore(folder);draw()})}]:[]),
      {label:enabled?'Disable':'Enable',click:report(()=>changeFolder(folder,!enabled))},
      {label:'Remove',click:report(()=>changeFolder(folder,null))}]})),...commands.values()]}]))}
  await restoreSettings()
  /** Save only the two supported entry files into a fresh folder under the user-selected parent. */
  return (draft:PluginDraft,authorize:()=>void)=>enqueue(async()=>{
    authorize()
    const choice=await dialog.showOpenDialog({title:'Choose where to save the plugin folder',properties:['openDirectory','createDirectory']})
    if(choice.canceled||!choice.filePaths[0])return null
    authorize()
    const slug=draft.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,48)
    const folder=await mkdtemp(join(choice.filePaths[0],'chulane-'+slug+'-'))
    try{
      await writeFile(join(folder,'plugin.mjs'),draft.nativeModule,{mode:0o600})
      if(draft.rendererModule)await writeFile(join(folder,'renderer.mjs'),draft.rendererModule,{mode:0o600})
    }catch(error){await rm(folder,{recursive:true,force:true});throw error}
    try{authorize();await confirmInstall(folder,authorize)}catch(error){throw Error('Plugin saved in '+folder+'. Installation failed: '+String(error))}
    return folder
  })
}
