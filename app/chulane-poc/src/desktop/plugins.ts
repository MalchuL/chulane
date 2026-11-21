/** Native plugin menu. Confirmed local folders export a Cordis plugin from plugin.mjs. */
import {Menu,dialog,type MenuItemConstructorOptions} from 'electron'
import {readFile,writeFile,rename} from 'node:fs/promises'
import {join,basename} from 'node:path'
import {pathToFileURL} from 'node:url'
import type {Context} from '../../../../vendor/cordis/src/index.ts'

/** Restore enabled folders and tie every loaded plugin and command to its owning fiber. */
export async function mountPlugins(ctx:Context,dir:string){
  const settings=join(dir,'plugins.json')
  let folders:Record<string,boolean>
  try{folders=JSON.parse(await readFile(settings,'utf8'))}catch(e:any){if(e.code!=='ENOENT')throw e;folders={}}
  const live=new Map<string,ReturnType<Context['plugin']>>()
  const commands=new Map<symbol,MenuItemConstructorOptions>()
  const report=(work:()=>Promise<void>)=>()=>void work().catch(e=>dialog.showErrorBox('Plugin operation failed',String(e)))
  async function save(){await writeFile(settings+'.tmp',JSON.stringify(folders));await rename(settings+'.tmp',settings);draw()}
  async function enable(folder:string){
    const module=await import(pathToFileURL(join(folder,'plugin.mjs')).href)
    const fiber=ctx.plugin(module.default,{command:(label:string,click:()=>void)=>{
      const key=Symbol();commands.set(key,{label,click});draw();return ()=>{commands.delete(key);draw()}
    }})
    try{await fiber.await()}catch(e){await fiber.dispose();throw e}
    live.set(folder,fiber);folders[folder]=true
  }
  async function disable(folder:string){await live.get(folder)?.dispose();live.delete(folder);folders[folder]=false}
  async function install(){
    const {filePaths,canceled}=await dialog.showOpenDialog({properties:['openDirectory']});if(canceled)return
    const folder=filePaths[0];if(live.has(folder))return
    const choice=await dialog.showMessageBox({type:'warning',message:'Run this trusted desktop plugin?',detail:join(folder,'plugin.mjs')+' will run with your desktop account permissions.',buttons:['Cancel','Run plugin'],defaultId:0,cancelId:0})
    if(choice.response!==1)return
    await enable(folder);await save()
  }
  function draw(){Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'editMenu'},{role:'viewMenu'},{label:'Plugins',submenu:[
    {label:'Install from folder…',click:report(install)},
    ...Object.keys(folders).map(folder=>({label:basename(folder),submenu:[
      {label:live.has(folder)?'Disable':'Enable',click:report(async()=>{if(live.has(folder))await disable(folder);else await enable(folder);await save()})},
      {label:'Remove',click:report(async()=>{await disable(folder);delete folders[folder];await save()})}]})),...commands.values()]}]))}
  for(const [folder,on] of Object.entries(folders))if(on){try{await enable(folder)}catch(e){dialog.showErrorBox('Plugin could not start',folder+'\n'+String(e))}}
  draw()
}
