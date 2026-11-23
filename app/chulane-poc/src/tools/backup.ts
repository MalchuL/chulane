/** Create and verify SQLite snapshots of committed workspace data, or restore one into a new data directory. */
import {chmod,link,mkdir,mkdtemp,rm,rmdir} from 'node:fs/promises'
import {dirname,join,resolve} from 'node:path'
import {openDocumentSnapshot} from '../server/document-snapshot.ts'
import {openWorkspaceDatabase,verifyWorkspaceSchema} from '../server/workspace-database.ts'

/** Inspect the actual snapshot read-only before another installation can open it. */
function verifySnapshot(file:string){
  const {db,version}=openWorkspaceDatabase(file,true)
  try{
    db.exec('BEGIN')
    // Legacy installations can open for migration, but a portable snapshot must already contain its identity.
    if(version===0)verifyWorkspaceSchema(db,version)
    const check=db.prepare('PRAGMA integrity_check(1)').get()
    if(check?.integrity_check!=='ok')throw Error('SQLite integrity check failed: '+check?.integrity_check)
    const violation=db.prepare('PRAGMA foreign_key_check').get()
    if(violation)throw Error('Broken foreign key in '+violation.table+' referencing '+violation.parent)
    // Legacy text-only pages can predate the state column and live journal.
    const sources=[
      {table:'pages',sql:'SELECT id AS page,state FROM pages WHERE state IS NOT NULL'},
      {table:'live_document_drafts',sql:'SELECT page,state FROM live_document_drafts'},
    ]
    for(const {table,sql} of sources){
      if(version===0&&!db.prepare("SELECT 1 FROM pragma_table_info(?) WHERE name='state'").get(table))continue
      for(const row of db.prepare(sql).iterate()){
        try{
          if(!(row.state instanceof Uint8Array))throw Error('Expected binary state.')
          openDocumentSnapshot(row.state).destroy()
        }catch{throw Error('Invalid document state in '+table+' for page '+row.page)}
      }
    }
    return version
  }finally{db.close()}
}

/** Publish only a verified, privately staged file. Both backup and restore refuse to replace existing data. */
async function main(){
  const args=process.argv.slice(2)
  if(args[0]==='--verify'&&args.length===2){
    const version=verifySnapshot(args[1])
    console.log('Verified Chulane workspace format '+version+', core workspace schema, installation identity, SQLite integrity, foreign keys and standalone editor snapshots.')
    return
  }
  const restore=args[0]==='--restore'
  if(args.length!==(restore?3:2)||args[0]==='--verify')
    throw Error('Usage: backup <workspace.sqlite> <new snapshot file> | backup --verify <snapshot> | backup --restore <snapshot> <new data directory>')
  const [source,target]=restore?args.slice(1):args
  if(!source||!target)throw Error('Supply a source file and a destination.')
  const destination=resolve(target)
  const {db}=openWorkspaceDatabase(source,true)
  try{
    const staging=await mkdtemp(join(dirname(destination),'.chulane-backup-'))
    try{
      const snapshot=join(staging,'workspace.sqlite')
      // VACUUM INTO captures committed WAL data and excludes free pages containing deleted records.
      db.prepare('VACUUM INTO ?').run(snapshot)
      await chmod(snapshot,0o600)
      verifySnapshot(snapshot)
      if(restore)await mkdir(destination,{mode:0o700})
      try{
        await link(snapshot,restore?join(destination,'workspace.sqlite'):destination)
      }catch(error){
        // Remove only the empty directory we created. Another process may already be using it.
        if(restore)await rmdir(destination).catch(()=>{})
        throw error
      }
    }finally{await rm(staging,{recursive:true,force:true})}
  }finally{db.close()}
}
// Electron utility processes keep their message port alive after the CLI finishes.
main().then(()=>process.exit(0),error=>{
  process.stderr.write(error.message+'\n',()=>process.exit(error.code==='EEXIST'?2:1))
})
