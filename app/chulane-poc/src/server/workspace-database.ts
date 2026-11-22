/** Identify the SQLite workspace format before any host changes the journal, schema, or account data. */
import {DatabaseSync} from 'node:sqlite'

// SQLite reserves these two header fields for applications. CHLN identifies a Chulane workspace.
const applicationId=0x43484c4e
const currentVersion=2

/** Open a new installation, a supported legacy database, or a database stamped by this host. */
export function openWorkspaceDatabase(file:string,readOnly=false){
  const db=new DatabaseSync(file,{readOnly})
  try{
    const id=Number(db.prepare('PRAGMA application_id').get()!.application_id)
    const version=Number(db.prepare('PRAGMA user_version').get()!.user_version)
    if(id!==0&&id!==applicationId)throw Error('This SQLite file belongs to another application.')
    if(version>currentVersion)throw Error('Workspace format '+version+' is newer than supported format '+currentVersion+'. Open it with a compatible Chulane release.')
    if(version<0||(id===0&&version!==0))throw Error('Unrecognized workspace database format.')
    if(id===0){
      const tables=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*'").all().map(row=>String(row.name)))
      // create-admin used to initialize just these account tables before the first service launch.
      const bootstrap=tables.size===3&&['accounts','memberships','server_settings'].every(name=>tables.has(name))
      if(tables.size&&!bootstrap&&!['workspaces','projects','pages'].every(name=>tables.has(name)))throw Error('Unrecognized legacy workspace database.')
    }
    return {db,version}
  }catch(error){db.close();throw error}
}

/** Stamp only after all workspace services have successfully installed their schema. */
export function recordWorkspaceFormat(db:DatabaseSync,version:number){
  if(version===currentVersion)return
  db.exec('BEGIN IMMEDIATE')
  try{
    db.exec('PRAGMA application_id='+applicationId+'; PRAGMA user_version='+currentVersion)
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
}
