/** Back up the active local Electron profile with the same SQLite snapshot command used by server operators. */
import {app,dialog,utilityProcess,type MenuItemConstructorOptions} from 'electron'
import {join} from 'node:path'

/** Build the local backup menu item. The utility process keeps SQLite compaction off the desktop host thread. */
export function localBackupCommand(profile:string):MenuItemConstructorOptions{
  return {id:'backup-local-workspaces',label:'Back up local workspaces…',click:async()=>{
    try{
      const destination=await dialog.showSaveDialog({
        title:'Back up saved local workspaces',buttonLabel:'Create backup',
        defaultPath:'chulane-'+new Date().toISOString().replaceAll(':','-')+'.sqlite',
        filters:[{name:'SQLite snapshot',extensions:['sqlite']}],
      })
      if(destination.canceled||!destination.filePath)return
      const worker=utilityProcess.fork(join(app.getAppPath(),'src/tools/backup.ts'),[join(profile,'workspace.sqlite'),destination.filePath])
      const code=await new Promise<number>(resolve=>worker.once('exit',resolve))
      if(code===2)throw Error('A file with that name already exists. Choose a new filename.')
      if(code!==0)throw Error('Check available disk space and choose a writable folder on a drive that supports hard links.')
      await dialog.showMessageBox({type:'info',message:'Local workspace backup saved',detail:destination.filePath})
    }catch(error){dialog.showErrorBox('Local workspace backup failed',String(error))}
  }}
}
