/** Pending offers belong to a named account and workspace. Membership starts only after the recipient accepts. */
import type {DatabaseSync} from 'node:sqlite'
import {memberRoles,type MemberRole} from '../shared/library.ts'

/** Install invitation storage and bind all operations to this server database. */
export function workspaceInvitations(db:DatabaseSync){
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_invitations(
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace INTEGER NOT NULL REFERENCES workspaces ON DELETE CASCADE,
    account INTEGER NOT NULL REFERENCES accounts, role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
    UNIQUE(workspace,account));
    CREATE INDEX IF NOT EXISTS invitations_for_account ON workspace_invitations(account)`)
  function reject(status:number,message:string):never{throw Object.assign(Error(message),{status})}
  /** Show the recipient offers from active workspaces, including before their first membership. */
  function incoming(account:number){
    return db.prepare(`SELECT i.id,i.workspace,w.name,i.role FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace
      WHERE i.account=? AND w.archived=0 ORDER BY w.name,i.id`).all(account)
  }
  /** List outstanding offers for the owner who manages this workspace. */
  function pending(workspace:number){
    return db.prepare(`SELECT i.id,a.name,i.role FROM workspace_invitations i JOIN accounts a ON a.id=i.account
      WHERE i.workspace=? ORDER BY a.name`).all(workspace)
  }
  /** Offer one explicit role to an existing account. A repeated send cannot alter a pending offer. */
  function invite(workspace:number,username:unknown,role:MemberRole){
    if(typeof username!=='string'||!memberRoles.includes(role))reject(400,'Enter an account username and select a workspace role.')
    const account=db.prepare('SELECT id FROM accounts WHERE name=?').get(username.trim())
    if(!account)reject(404,'No registered account with that username.')
    if(db.prepare('SELECT 1 FROM memberships WHERE workspace=? AND account=?').get(workspace,account.id))
      reject(409,'That account is already a member.')
    const result=db.prepare('INSERT INTO workspace_invitations(workspace,account,role) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(workspace,account.id,role)
    if(!result.changes)reject(409,'That account already has a pending invitation.')
    return {id:Number(result.lastInsertRowid)}
  }
  /** Replace a pending offer atomically so acceptance applies only to the role the recipient saw. */
  function revise(workspace:number,id:number,role:MemberRole){
    if(!memberRoles.includes(role))reject(400,'Choose an existing workspace role.')
    db.exec('BEGIN IMMEDIATE')
    try{
      const offer=db.prepare('SELECT account,role FROM workspace_invitations WHERE workspace=? AND id=?').get(workspace,id)
      if(!offer)reject(404,'Invitation unavailable.')
      if(offer.role!==role){
        revoke(workspace,id)
        const result=db.prepare('INSERT INTO workspace_invitations(workspace,account,role) VALUES(?,?,?)').run(workspace,offer.account,role)
        id=Number(result.lastInsertRowid)
      }
      db.exec('COMMIT')
      return {id}
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  /** Scope cancellation to the workspace whose owner made the request. */
  function revoke(workspace:number,id:number){
    if(!db.prepare('DELETE FROM workspace_invitations WHERE workspace=? AND id=?').run(workspace,id).changes)
      reject(404,'Invitation unavailable.')
  }
  /** Consume this account’s invitation atomically with membership creation. An existing role takes precedence. */
  function respond(account:number,id:number,accept:boolean){
    db.exec('BEGIN IMMEDIATE')
    try{
      const offer=db.prepare(`SELECT i.workspace,i.role FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace
        WHERE i.id=? AND i.account=? AND w.archived=0`).get(id,account)
      if(!offer)reject(404,'Invitation unavailable.')
      if(accept)db.prepare('INSERT INTO memberships(workspace,account,role) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(offer.workspace,account,offer.role)
      db.prepare('DELETE FROM workspace_invitations WHERE id=?').run(id)
      db.exec('COMMIT')
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  return {incoming,pending,invite,revise,revoke,respond}
}
