/** Snapshot one installation's committed SQLite workspace, excluding device credentials and profiles. */
import {chmod,link,mkdtemp,rm} from 'node:fs/promises'
import {dirname,join} from 'node:path'
import {openWorkspaceDatabase} from '../server/workspace-database.ts'

/** Publish the snapshot only after SQLite finishes and the staged file has private permissions. */
async function main(){
  const [source,destination]=process.argv.slice(2)
  if(process.argv.length!==4||!source||!destination)throw Error('Usage: backup <workspace.sqlite> <new snapshot file> or backup --verify <snapshot>')
  const verify=source==='--verify'
  const {db,version}=openWorkspaceDatabase(verify?destination:source,true)
  try{
    if(!db.prepare('SELECT identity FROM installation WHERE id=1').get())throw Error('Missing Chulane installation identity')
    if(verify){
      const check=db.prepare('PRAGMA integrity_check(1)').get()
      if(check?.integrity_check!=='ok')throw Error('SQLite integrity check failed: '+check?.integrity_check)
      const violation=db.prepare('PRAGMA foreign_key_check').get()
      if(violation)throw Error('Broken foreign key in '+violation.table+' referencing '+violation.parent)
      console.log('Verified Chulane workspace format '+version+', installation identity, SQLite integrity and foreign keys.')
      return
    }
    const staging=await mkdtemp(join(dirname(destination),'.chulane-backup-'))
    try{
      const snapshot=join(staging,'workspace.sqlite')
      // Compact the snapshot so free pages from older installations cannot carry deleted content.
      db.prepare('VACUUM INTO ?').run(snapshot)
      await chmod(snapshot,0o600)
      // Expose only the completed snapshot and never overwrite an existing backup.
      await link(snapshot,destination)
    }finally{await rm(staging,{recursive:true,force:true})}
  }finally{db.close()}
}
// Electron utility processes keep their message port alive after the CLI finishes.
main().then(()=>process.exit(0),error=>{
  console.error(error.message)
  process.exit(error.code==='EEXIST'?2:1)
})
