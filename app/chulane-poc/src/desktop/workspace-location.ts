/** Locate local workspace data separately from Electron settings. Explicit and restored profiles stay self-contained. */
import {access,chmod,link,mkdir,mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {openWorkspaceDatabase} from '../server/workspace-database.ts'

/** Treat only a missing file as absent. A denied legacy profile must not silently become an empty workspace. */
async function exists(file:string){
  try{await access(file);return true}catch(error){if(error.code==='ENOENT')return false;throw error}
}

/** Publish a consistent first-launch snapshot without replacing an existing destination or consuming the original. */
export async function localWorkspaceFile(profile:string,home:string,explicitProfile:boolean){
  const legacy=join(profile,'workspace.sqlite')
  if(explicitProfile)return legacy
  const directory=join(home,'.local','chulane_poc'),target=join(directory,'workspace.sqlite')
  await mkdir(directory,{recursive:true,mode:0o700})
  if(await exists(target)||!await exists(legacy))return target
  const {db}=openWorkspaceDatabase(legacy)
  try{
    // WAL connections keep a shared lock even when idle. Prevent an older host from writing to a forked copy.
    try{db.exec('PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT')}
    catch(error){if(error.errcode===5)throw Error('Close the previous Chulane desktop app, then reopen it to move local workspaces.');throw error}
    const stage=await mkdtemp(join(directory,'.migration-'))
    try{
      const snapshot=join(stage,'workspace.sqlite')
      db.prepare('VACUUM INTO ?').run(snapshot)
      await chmod(snapshot,0o600)
      const copy=openWorkspaceDatabase(snapshot,true)
      try{if(copy.db.prepare('PRAGMA integrity_check(1)').get()?.integrity_check!=='ok')throw Error('Workspace migration failed its integrity check.')}
      finally{copy.db.close()}
      try{await link(snapshot,target)}catch(error){if(error.code!=='EEXIST')throw error}
    }finally{await rm(stage,{recursive:true,force:true})}
  }finally{db.close()}
  return target
}
