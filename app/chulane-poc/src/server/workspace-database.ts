/** Identify the SQLite workspace format before any host changes the journal, schema, or account data. */
import {DatabaseSync} from 'node:sqlite'

// SQLite reserves these two header fields for applications. CHLN identifies a Chulane workspace.
const applicationId=0x43484c4e
const currentVersion=7

// All stamped formats contain these canonical records. Search indexes can be rebuilt on startup.
const stampedWorkspaceSchema={
  workspaces:['id','name','accessMode','timeZone'],
  projects:['id','workspace','name','parent','trashRoot'],
  pages:['id','workspace','title','project','day','deleted','state','rev','plain'],
  files:['id','page','name','bytes'],
  accounts:['id','name','salt','digest'],
  memberships:['workspace','account','role'],
  server_settings:['id','administrator','registration'],
  page_links:['source','target'],
  live_document_drafts:['page','state','plain'],
  installation:['id','identity'],
}

// These stores were installed before format 3 was stamped, even in an empty workspace.
// Missing leaf tables can pass SQLite integrity and foreign-key checks while losing user data.
const formatThreeSchema={
  ...stampedWorkspaceSchema,
  workspaces:[...stampedWorkspaceSchema.workspaces,'archived','restoration'],
  pages:[...stampedWorkspaceSchema.pages,'projectTrash','trashRevision'],
  retired_workspaces:['id'],
  workspace_invitations:['id','workspace','account','role'],
  tags:['id','workspace','name','deleted'],
  tag_applications:['tag','page','block','active'],
  fields:['id','workspace','name','kind','options'],
  tag_fields:['tag','field'],
  tag_values:['tag','page','block','field','value'],
  chats:['id','workspace','title','author','deleted'],
  chat_messages:['id','chat','role','text','status','sources','background','requester'],
  chat_edits:['id','message','page','title','block','before','after','status','kind','reviewer'],
  chat_page_requests:['id','message','title','markdown','parent','parentName','page','status','reviewedPath','reviewer'],
  chat_project_requests:['id','message','name','parent','parentName','project','status','reviewedPath','beforeName','reviewer'],
  proposals:['id','workspace','page','title','status','profile','edit','baseTitle','requester','draft'],
  proposal_decisions:['sequence','proposal','kind','block','decidedAt','reviewer'],
  page_title_conflicts:['id','page','title'],
  page_title_receipts:['page','operation','fingerprint'],
  page_move_conflicts:['id','page','project'],
  project_name_conflicts:['id','project','name'],
  project_name_receipts:['project','operation','fingerprint'],
}

// Unversioned snapshots predate account and project migrations.
const legacySnapshotSchema={workspaces:['id','name'],projects:['id','workspace','name'],pages:['id','workspace','title'],installation:['id','identity']}

/** The installation ID keys offline replicas and exported references across restarts and restores. */
function verifyInstallationIdentity(db:DatabaseSync){
  const identity=db.prepare('SELECT identity FROM installation WHERE id=1').get()?.identity
  if(!identity)throw Error('Missing Chulane installation identity')
  if(typeof identity!=='string'||!/^[0-9a-f]{32}$/.test(identity))throw Error('Invalid Chulane installation identity')
}

/** Check the durable schema and identity before a missing store can be recreated empty by a migration. */
export function verifyWorkspaceSchema(db:DatabaseSync,version:number){
  const tables=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row=>row.name))
  const columns=db.prepare('SELECT name FROM pragma_table_info(?)')
  const base=version>=4?{...formatThreeSchema,creation_receipts:['actor','operation','fingerprint','result']}:version>=3?formatThreeSchema:version===0?legacySnapshotSchema:stampedWorkspaceSchema
  const schema=version>=5?{...base,...(version>=7&&{chat_queue:['id','chat','author','payload','origin','plugin','agent','revision','priority','error']}),...(version>=6&&{chat_edits:[...formatThreeSchema.chat_edits,'canvas'],chat_messages:[...formatThreeSchema.chat_messages,'mode']}),named_page_references:['source','name','target'],tag_applications:[...formatThreeSchema.tag_applications,'fromWriting']}:base
  for(const [table,required] of Object.entries(schema)){
    if(!tables.has(table))throw Error('Missing workspace table: '+table)
    const names=new Set(columns.all(table).map(row=>row.name))
    for(const column of required){
      if(!names.has(column))throw Error('Missing workspace column: '+table+'.'+column)
    }
  }
  verifyInstallationIdentity(db)
}

/** Open a new installation, a supported legacy database, or a database stamped by this host. */
export function openWorkspaceDatabase(file:string,readOnly=false){
  const db=new DatabaseSync(file,{readOnly})
  try{
    const header=db.prepare('SELECT application_id,user_version FROM pragma_application_id,pragma_user_version').get()!
    const id=Number(header.application_id),version=Number(header.user_version)
    if(id!==0&&id!==applicationId)throw Error('This SQLite file belongs to another application.')
    if(version>currentVersion)throw Error('Workspace format '+version+' is newer than supported format '+currentVersion+'. Open it with a compatible Chulane release.')
    // A legacy file has neither header field. A stamped file has both, written in the same transaction.
    const legacy=id===0
    if(version<0||legacy!==(version===0))throw Error('Unrecognized workspace database format.')
    if(legacy){
      const tables=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*'").all().map(row=>String(row.name)))
      // create-admin used to initialize just these account tables before the first service launch.
      const bootstrap=tables.size===3&&['accounts','memberships','server_settings'].every(name=>tables.has(name))
      if(tables.size&&!bootstrap&&!['workspaces','projects','pages'].every(name=>tables.has(name)))throw Error('Unrecognized legacy workspace database.')
      if(tables.has('installation'))verifyInstallationIdentity(db)
    }else verifyWorkspaceSchema(db,version)
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
