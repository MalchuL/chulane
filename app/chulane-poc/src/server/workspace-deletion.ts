/** Apply authorized workspace deletion decisions in SQLite. Archived values 0, 1 and 2 mean active, archived and marked for deletion. */
import type {DatabaseSync} from 'node:sqlite'

/** Require the expected prior state and finish all dependent deletes before retiring the workspace ID. */
export function changeWorkspaceDeletion(db:DatabaseSync,workspace:number,action:'mark'|'restore'|'purge'){
  db.exec('BEGIN IMMEDIATE')
  try{
    const row=db.prepare('SELECT archived FROM workspaces WHERE id=?').get(workspace)
    if(!row)throw Object.assign(Error('Unknown workspace'),{status:404})
    if(row.archived!==(action==='mark'?1:2))throw Object.assign(Error(action==='mark'?'Archive this workspace first.':'Workspace is not marked for deletion.'),{status:409})
    if(action==='purge'){
      const tables=[
        ['chat_edits','message IN (SELECT m.id FROM chat_messages m JOIN chats c ON c.id=m.chat WHERE c.workspace=?)'],
        ['chat_messages','chat IN (SELECT id FROM chats WHERE workspace=?)'],
        ['chats','workspace=?'],
        ['proposal_decisions','proposal IN (SELECT id FROM proposals WHERE workspace=?)'],
        ['proposals','workspace=?'],
        ['files','page IN (SELECT id FROM pages WHERE workspace=?)'],
        ['tag_fields','tag IN (SELECT id FROM tags WHERE workspace=?)'],
        // Page deletion cascades to title receipts, conflicts, links, tag applications and their field values.
        ['pages','workspace=?'],['fields','workspace=?'],['tags','workspace=?'],['projects','workspace=?'],
        ['memberships','workspace=?'],['workspaces','id=?']
      ]
      for(const [table,condition] of tables)db.prepare('DELETE FROM '+table+' WHERE '+condition).run(workspace)
      db.prepare('INSERT INTO retired_workspaces(id) VALUES(?)').run(workspace)
    }else db.prepare('UPDATE workspaces SET archived=?,restoration=restoration+? WHERE id=?').run(action==='mark'?2:0,action==='restore'?1:0,workspace)
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
}
