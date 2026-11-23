/** Save and restore local workspace profiles through the desktop File menu and packaged SQLite worker. */
import {app,dialog,utilityProcess,type MenuItemConstructorOptions} from 'electron'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {join,parse} from 'node:path'
import {finished} from 'node:stream/promises'

/** Run the snapshot operation off the main thread and drain its diagnostic before reporting the result. */
async function runBackup(args:string[],existingDestination:string){
  const worker=utilityProcess.fork(join(app.getAppPath(),'dist-host/backup.mjs'),args,{stdio:'pipe'})
  let details=''
  const stderr=worker.stderr
  stderr?.setEncoding('utf8').on('data',chunk=>{details=(details+chunk).slice(-4096)})
  const [code]=await Promise.all([
    new Promise<number>(resolve=>worker.once('exit',resolve)),
    stderr&&finished(stderr),
  ])
  if(code===2)throw Error(existingDestination)
  if(code!==0)throw Error(details.trim()||'Check available disk space and choose a writable folder on a drive that supports hard links.')
}

/** Save all local workspaces into a new snapshot file. */
export function localBackupCommand(database:string):MenuItemConstructorOptions{
  return {id:'backup-local-workspaces',label:'Back up local workspaces…',click:async()=>{
    try{
      const destination=await dialog.showSaveDialog({
        title:'Back up saved local workspaces',buttonLabel:'Create backup',
        defaultPath:'chulane-'+new Date().toISOString().replaceAll(':','-')+'.sqlite',
        filters:[{name:'SQLite snapshot',extensions:['sqlite']}],
      })
      if(destination.canceled||!destination.filePath)return
      await runBackup([database,destination.filePath],'A file with that name already exists. Choose a new filename.')
      await dialog.showMessageBox({type:'info',message:'Local workspace backup saved',detail:destination.filePath})
    }catch(error){dialog.showErrorBox('Local workspace backup failed',String(error))}
  }}
}

/** Restore a verified snapshot to a new profile folder beside the backup or at the user's chosen path. */
export function localRestoreCommand():MenuItemConstructorOptions{
  return {id:'restore-local-workspaces',label:'Restore backup to new profile…',click:async()=>{
    try{
      const source=await dialog.showOpenDialog({title:'Choose a local workspace backup',properties:['openFile'],
        filters:[{name:'SQLite snapshot',extensions:['sqlite']},{name:'All files',extensions:['*']}]})
      const snapshot=source.filePaths[0]
      if(source.canceled||!snapshot)return
      const {dir,name}=parse(snapshot)
      const target=await dialog.showSaveDialog({title:'Name the new profile folder',buttonLabel:'Restore here',
        defaultPath:join(dir,name+'-restored')})
      if(target.canceled||!target.filePath)return
      await runBackup(['--restore',snapshot,target.filePath],'That profile location already exists. Choose a new folder name.')
      const {response}=await dialog.showMessageBox({type:'info',message:'Local workspace backup restored',detail:target.filePath,
        buttons:['Open restored copy','Done'],defaultId:0,cancelId:1})
      if(response===0)await openRestoredCopy(target.filePath)
    }catch(error){dialog.showErrorBox('Local workspace restore failed',String(error))}
  }}
}

/** Start the restored profile independently so both windows can keep editing and close in either order. */
async function openRestoredCopy(profile:string){
  try{
    const args=app.isPackaged?[]:[app.getAppPath()]
    const child=spawn(process.execPath,[...args,'--user-data-dir='+profile],{detached:true,stdio:'ignore',windowsHide:true})
    await once(child,'spawn')
    child.unref()
  }catch(error){
    dialog.showErrorBox('Could not open the restored copy',profile+'\n'+String(error))
  }
}
