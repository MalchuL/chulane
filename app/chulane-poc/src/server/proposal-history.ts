/** Persist external tool decisions alongside their mutations and page through the workspace's completed reviews. */
import type {DatabaseSync} from 'node:sqlite'
import type {DecisionKind} from '../shared/library.ts'

/** Recover old outcomes using only facts retained by the earlier proposal schema. */
export function proposalHistory(db:DatabaseSync){
  db.exec('BEGIN IMMEDIATE')
  try{
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='proposal_decisions'").get()){
      db.exec(`CREATE TABLE proposal_decisions(sequence INTEGER PRIMARY KEY,proposal INTEGER NOT NULL UNIQUE REFERENCES proposals(id),
        kind TEXT NOT NULL,block TEXT,decidedAt TEXT);
        INSERT INTO proposal_decisions(proposal,kind,block)
        SELECT id,CASE WHEN edit IS NOT NULL THEN CASE json_extract(edit,'$.block') WHEN '' THEN 'append' ELSE 'replace' END
          WHEN page IS NULL THEN 'create' WHEN status='dismiss' THEN 'rename' ELSE 'page' END,
          CASE WHEN json_extract(edit,'$.block') NOT IN ('','@import') THEN json_extract(edit,'$.block') END
        FROM proposals WHERE status IN ('approve','dismiss') ORDER BY id`)
    }
    if(!db.prepare('PRAGMA table_info(proposal_decisions)').all().some(column=>column.name==='reviewer'))
      db.exec('ALTER TABLE proposal_decisions ADD COLUMN reviewer INTEGER REFERENCES accounts(id)')
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}

  /** Called inside the document transaction so that an outcome can never be published twice or ahead of the edit. */
  function resolve(id:number,page:number|null,status:'approve'|'dismiss',kind:DecisionKind,block:string|null,reviewer:number|null=null){
    const saved=db.prepare("UPDATE proposals SET page=?,status=? WHERE id=? AND status='pending'").run(page,status,id)
    if(!saved.changes)throw Object.assign(Error('Request already resolved'),{status:409})
    db.prepare('INSERT INTO proposal_decisions(proposal,kind,block,decidedAt,reviewer) VALUES(?,?,?,?,?)')
      .run(id,kind,block,new Date().toISOString(),reviewer)
  }
  /** Keyset pagination keeps older decisions reachable when another editor resolves a request between reads. */
  function list(ws:number,before:string|null){
    if(before!==null&&(!/^\d+$/.test(before)||!Number.isSafeInteger(Number(before))||Number(before)<1))
      throw Object.assign(Error('Invalid history cursor'),{status:400})
    const limit=20
    const rows=db.prepare(`SELECT d.sequence,d.kind,d.block,d.decidedAt,p.id,p.title,p.status,p.profile,(SELECT name FROM accounts WHERE id=p.requester) AS requestedBy,(SELECT name FROM accounts WHERE id=d.reviewer) AS reviewedBy,p.page,p.edit,p.draft
      FROM proposal_decisions d JOIN proposals p ON p.id=d.proposal WHERE p.workspace=? AND d.sequence<?
      ORDER BY d.sequence DESC LIMIT ?`).all(ws,before===null?Number.MAX_SAFE_INTEGER:Number(before),limit+1)
    const items=rows.slice(0,limit).map(row=>({...row,draft:row.draft?JSON.parse(String(row.draft)):null,edit:row.edit?JSON.parse(String(row.edit)):null}))
    return {items,next:rows.length>limit?rows[limit-1].sequence:null}
  }
  /** Return an existing request's outcome without retrying it; pending requests have no decision record yet. */
  function status(ws:number,id:number){
    const row=db.prepare(`SELECT p.id,p.status,p.page,p.title,p.profile,(SELECT name FROM accounts WHERE id=p.requester) AS requestedBy,(SELECT name FROM accounts WHERE id=d.reviewer) AS reviewedBy,d.block,d.decidedAt FROM proposals p
      LEFT JOIN proposal_decisions d ON d.proposal=p.id WHERE p.id=? AND p.workspace=?`).get(id,ws)
    if(!row)throw Object.assign(Error('Request unavailable'),{status:404})
    return {...row,status:row.status==='approve'?'approved':row.status==='dismiss'?'dismissed':row.status}
  }
  return {resolve,list,status}
}
