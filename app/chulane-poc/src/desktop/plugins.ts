/** Native plugin menu. Confirmed local folders export a Cordis plugin from plugin.mjs. */
import {Menu,dialog,type MenuItemConstructorOptions} from 'electron'
import {localBackupCommand} from './backup.ts'
import type {PluginDraft} from '../shared/agent'
import {mkdtemp,readFile,rm,writeFile,rename} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {join,basename} from 'node:path'
import {pathToFileURL} from 'node:url'
import type {Context} from '../../../../vendor/cordis/src/index.ts'

/** Restore enabled folders and tie every loaded plugin and command to its owning fiber. */
export async function mountPlugins(ctx:Context,dir:string,rendererModules:Map<string,string>,changed:()=>void){
  const settings=join(dir,'plugins.json')
  let folders:Record<string,boolean>
  try{folders=JSON.parse(await readFile(settings,'utf8'))}catch(e:any){if(e.code!=='ENOENT')throw e;folders={}}
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
  async function save(){await writeFile(settings+'.tmp',JSON.stringify(folders));await rename(settings+'.tmp',settings);draw()}
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
    live.set(folder,fiber);folders[folder]=true;failures.delete(folder)
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
  async function disable(folder:string){
    await live.get(folder)?.dispose();live.delete(folder);failures.delete(folder);folders[folder]=false
  }
  async function install(){
    const {filePaths,canceled}=await dialog.showOpenDialog({properties:['openDirectory']});if(canceled)return
    await confirmInstall(filePaths[0])
  }
  /** Both manually selected and generated folders need native consent before executing any source. */
  async function confirmInstall(folder:string,authorize?:()=>void){
    if(live.has(folder))return
    const choice=await dialog.showMessageBox({type:'warning',message:'Run this trusted desktop plugin?',detail:folder+' contains desktop plugin code and can contribute editor blocks. Its native code runs with your desktop account permissions.',buttons:['Cancel','Run plugin'],defaultId:0,cancelId:0})
    if(choice.response!==1)return
    authorize?.()
    await enable(folder);await save()
  }
  function draw(){Menu.setApplicationMenu(Menu.buildFromTemplate([...(process.platform==='darwin'?[{role:'appMenu' as const}]:[]),{label:'File',submenu:[localBackupCommand(dir)]},{role:'editMenu'},{role:'viewMenu'},{label:'Plugins',submenu:[
    {label:'Install from folder…',click:report(install)},
    ...Object.keys(folders).map(folder=>({id:folder,label:basename(folder)+(failures.has(folder)?' (unavailable)':''),toolTip:folder,submenu:[
      ...(failures.has(folder)?[{label:failures.get(folder),enabled:false},{label:'Retry',click:report(async()=>{await restore(folder);draw()})}]:[]),
      {label:folders[folder]?'Disable':'Enable',click:report(async()=>{if(folders[folder])await disable(folder);else await enable(folder);await save()})},
      {label:'Remove',click:report(async()=>{await disable(folder);delete folders[folder];await save()})}]})),...commands.values()]}]))}
  for(const [folder,on] of Object.entries(folders))if(on)await restore(folder)
  draw()
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
