/** Project hierarchy and reversible subtree deletion in the workspace SQLite store. */
import type {DatabaseSync} from 'node:sqlite'
import {alreadyApplied} from './metadata-receipts.ts'
import {checkpointDrafts,type LiveDrafts} from './document-checkpoint.ts'

/** Upgrade flat libraries atomically. Existing projects stay at the workspace root. */
export function installProjects(db:DatabaseSync){
  db.exec('BEGIN IMMEDIATE')
  try{
    if(!db.prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name='parent'").get()){
      db.exec(`ALTER TABLE projects ADD COLUMN parent INTEGER REFERENCES projects(id);
        ALTER TABLE projects ADD COLUMN trashRoot INTEGER REFERENCES projects(id);
        ALTER TABLE pages ADD COLUMN projectTrash INTEGER REFERENCES projects(id);
        CREATE INDEX projects_parent ON projects(workspace,parent);`)
    }
    db.exec(`CREATE TABLE IF NOT EXISTS page_move_conflicts(
      id INTEGER PRIMARY KEY AUTOINCREMENT,page INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      project INTEGER REFERENCES projects(id) ON DELETE CASCADE);
      CREATE UNIQUE INDEX IF NOT EXISTS page_move_destinations ON page_move_conflicts(page,COALESCE(project,0));
      CREATE TABLE IF NOT EXISTS project_name_conflicts(
      id INTEGER PRIMARY KEY AUTOINCREMENT, project INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL, UNIQUE(project,name));
      CREATE TABLE IF NOT EXISTS project_name_receipts(project INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        operation TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(project,operation)) WITHOUT ROWID`)
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
}

/** Checkpoint live drafts and mark active descendants in one transaction, preserving independent trash decisions. */
export function setProjectTrashed(db:DatabaseSync,workspace:number,id:number,deleted:boolean,drafts:LiveDrafts=new Map()){
  checkpointDrafts(db,drafts,{workspace,include:deleted?page=>page.projectTrash===id:undefined,change(){
    const root=db.prepare('SELECT parent,trashRoot FROM projects WHERE workspace=? AND id=?').get(workspace,id)
    if(!root)throw Object.assign(Error('Project unavailable'),{status:404})
    if(deleted){
      if(root.trashRoot!==null)throw Object.assign(Error('Project is already in trash'),{status:409})
      db.prepare(`WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT p.id FROM projects p JOIN tree ON p.parent=tree.id WHERE p.workspace=? AND p.trashRoot IS NULL)
        UPDATE projects SET trashRoot=? WHERE id IN (SELECT id FROM tree)`).run(id,workspace,id)
      db.prepare('UPDATE pages SET deleted=1,projectTrash=? WHERE workspace=? AND deleted=0 AND project IN (SELECT id FROM projects WHERE trashRoot=?)').run(id,workspace,id)
    }else{
      if(root.trashRoot!==id || db.prepare('SELECT id FROM projects WHERE id=? AND trashRoot IS NOT NULL').get(root.parent))
        throw Object.assign(Error('Restore the parent project first'),{status:409})
      db.prepare('UPDATE projects SET trashRoot=NULL WHERE workspace=? AND trashRoot=?').run(workspace,id)
      db.prepare('UPDATE pages SET deleted=0,projectTrash=NULL WHERE workspace=? AND projectTrash=?').run(workspace,id)
    }
  }})
}

/** Resolve the workspace root or a live project for page moves, project creation and agent reads. */
export function activeProject(db:DatabaseSync,workspace:number,id:unknown):number|null{
  if(id==null)return null
  if(typeof id!=='number'||!Number.isSafeInteger(id)||id<=0)throw Object.assign(Error('Invalid project'),{status:400})
  if(!db.prepare('SELECT 1 FROM projects WHERE id=? AND workspace=? AND trashRoot IS NULL').get(id,workspace))
    throw Object.assign(Error('Unknown project'),{status:400})
  return id
}

/** List the active hierarchy without including document contents in a tool response. */
export function activeProjects(db:DatabaseSync,workspace:number){
  return db.prepare('SELECT id,workspace,name,parent,trashRoot FROM projects WHERE workspace=? AND trashRoot IS NULL ORDER BY id').all(workspace)
}

/** Capture the destination shown to the reviewer, including ancestors with potentially repeated folder names. */
export function reviewProjectPath(db:DatabaseSync,workspace:number,project:number|null){
  if(project===null)return null
  const entry=db.prepare(`WITH RECURSIVE ancestors(parent,path) AS (
    SELECT parent,name FROM projects WHERE id=? AND workspace=? AND trashRoot IS NULL
    UNION ALL SELECT p.parent,p.name || ' / ' || a.path FROM projects p JOIN ancestors a ON p.id=a.parent
    WHERE p.workspace=? AND p.trashRoot IS NULL)
    SELECT path FROM ancestors WHERE parent IS NULL`).get(project,workspace,workspace)
  if(!entry)throw Object.assign(Error('Unknown project'),{status:400})
  return String(entry.path)
}

/** Bind approval to the displayed path of the stored folder ID, including any ancestor rename. */
export function confirmProjectPath(db:DatabaseSync,workspace:number,project:number|null,original:string|null,input:unknown){
  const current=reviewProjectPath(db,workspace,project)
  const seen=input&&typeof input==='object'&&'reviewedPath' in input?input.reviewedPath:original
  if(seen!==current)throw Object.assign(Error('The destination folder changed. Review the updated path and try again.'),{status:409})
  return current
}

type ProjectEntry={kind:'project'|'page';id:number;name:string}
/** List immediate subprojects and writing pages, excluding journal days and trash, in bounded batches. */
export function browseProject(db:DatabaseSync,workspace:number,parent:number|null,offset:number){
  const project=activeProject(db,workspace,parent)
  const rows=db.prepare(`SELECT 'project' AS kind,id,name FROM projects WHERE workspace=? AND parent IS ? AND trashRoot IS NULL
    UNION ALL SELECT 'page',id,title FROM pages WHERE workspace=? AND project IS ? AND deleted=0 AND day IS NULL
    ORDER BY kind DESC,name COLLATE NOCASE,id LIMIT 41 OFFSET ?`).all(workspace,project,workspace,project,offset) as ProjectEntry[]
  return {entries:rows.slice(0,40),nextOffset:rows.length>40?offset+40:null}
}

/** Validate a project name for creation, manual renaming and agent review. */
export function projectName(name:unknown){
  if(typeof name!=='string'||!name.trim()||name.length>250)throw Object.assign(Error('Enter a name of 1–250 characters.'),{status:400})
  return name.trim()
}

/** Apply a reviewed rename strictly. Interactive editors can also retain and resolve competing names. */
export function renameProject(db:DatabaseSync,workspace:number,id:number,base:unknown,name:unknown,editor?:{resolve?:unknown;operationId?:unknown;includeTrashed?:boolean}){
  const next=projectName(name)
  if(typeof base!=='string'||!base.length)throw Object.assign(Error('Supply the current project name.'),{status:400})
  // Agent approvals already have an outer transaction. Savepoints also cover standalone editor requests.
  db.exec('SAVEPOINT rename_project')
  try{
    const project=db.prepare('SELECT name FROM projects WHERE workspace=? AND id=? AND (trashRoot IS NULL OR ?=1)').get(workspace,id,Number(!!editor?.includeTrashed))
    if(!project)throw Object.assign(Error('Project unavailable.'),{status:409})
    if(alreadyApplied(db,'project',id,editor?.operationId,[next,base,editor?.resolve])){
      db.exec('RELEASE rename_project')
      return id
    }
    if(editor?.resolve!==undefined){
      if(typeof editor.resolve!=='number'||!Number.isSafeInteger(editor.resolve))throw Object.assign(Error('Invalid project name choice.'),{status:400})
      const choice=db.prepare('SELECT name FROM project_name_conflicts WHERE id=? AND project=?').get(editor.resolve,id)
      if(!choice||project.name!==base)throw Object.assign(Error('The names changed. Review the current choices.'),{status:409})
      if(next!==project.name&&next!==choice.name)throw Object.assign(Error('Choose one of the reviewed names.'),{status:400})
      db.prepare('DELETE FROM project_name_conflicts WHERE id=?').run(editor.resolve)
    }
    if(project.name===base){
      db.prepare('UPDATE projects SET name=? WHERE id=?').run(next,id)
      db.prepare('DELETE FROM project_name_conflicts WHERE project=? AND name=?').run(id,next)
    }else if(!editor)throw Object.assign(Error('Project changed. Review its current name.'),{status:409})
    else if(next!==base&&next!==project.name)
      db.prepare('INSERT INTO project_name_conflicts(project,name) VALUES(?,?) ON CONFLICT DO NOTHING').run(id,next)
    db.exec('RELEASE rename_project')
  }catch(error){db.exec('ROLLBACK TO rename_project; RELEASE rename_project');throw error}
  return id
}

/** Create one project in a live workspace folder, preserving UI name validation on every entry point. */
export function createProject(db:DatabaseSync,workspace:number,name:unknown,parent:unknown){
  return Number(db.prepare('INSERT INTO projects(workspace,name,parent) VALUES(?,?,?)').run(workspace,projectName(name),activeProject(db,workspace,parent)).lastInsertRowid)
}

/** Move a page by identity. Preserve a competing destination until an editor reviews the current placement. */
export function movePage(db:DatabaseSync,workspace:number,page:number,destination:unknown,base:unknown,resolve:unknown,operationId?:unknown,fromReplica=false){
  db.exec('BEGIN IMMEDIATE')
  try{
    const row=db.prepare('SELECT project,day,deleted FROM pages WHERE workspace=? AND id=?').get(workspace,page)
    if(!row||row.deleted===2||(row.deleted&&!fromReplica))throw Object.assign(Error('Restore the page before moving it.'),{status:410})
    if(row.day!==null)throw Object.assign(Error('Journal entries cannot be moved into projects.'),{status:400})
    if(alreadyApplied(db,'page',page,operationId,{project:destination,baseProject:base,resolveMove:resolve})){
      db.exec('COMMIT')
      return
    }
    const trashedDestination=fromReplica&&typeof destination==='number'&&Number.isSafeInteger(destination)&&
      db.prepare('SELECT 1 FROM projects WHERE workspace=? AND id=? AND trashRoot IS NOT NULL').get(workspace,destination)
    const project=trashedDestination?destination:activeProject(db,workspace,destination)
    if(base!==undefined&&base!==null&&(typeof base!=='number'||!Number.isSafeInteger(base)||
      !db.prepare('SELECT 1 FROM projects WHERE workspace=? AND id=?').get(workspace,base)))
      throw Object.assign(Error('Invalid original project.'),{status:400})
    if(resolve!==undefined){
      if(typeof resolve!=='number'||!Number.isSafeInteger(resolve)||base===undefined)throw Object.assign(Error('Invalid move resolution.'),{status:400})
      const choice=db.prepare('SELECT project FROM page_move_conflicts WHERE id=? AND page=?').get(resolve,page)
      if(!choice||row.project!==base)throw Object.assign(Error('The page location changed. Review the current choices.'),{status:409})
      if(project!==row.project&&project!==choice.project)throw Object.assign(Error('Choose one of the reviewed locations.'),{status:400})
      db.prepare('DELETE FROM page_move_conflicts WHERE id=?').run(resolve)
    }
    // Recovery must not move a page out of its trashed subtree or place an active page inside one.
    if(!row.deleted&&!trashedDestination&&(base===undefined||base===row.project)){
      db.prepare('UPDATE pages SET project=? WHERE id=?').run(project,page)
      db.prepare('DELETE FROM page_move_conflicts WHERE page=? AND project IS ?').run(page,project)
    }else if(project!==base&&project!==row.project){
      db.prepare('INSERT INTO page_move_conflicts(page,project) VALUES(?,?) ON CONFLICT DO NOTHING').run(page,project)
    }
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
}
