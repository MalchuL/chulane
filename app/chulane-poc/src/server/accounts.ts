/** Persist server identities and workspace memberships. Password verification never blocks the HTTP event loop. */
import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto'
import {memberRoles,type MemberRole} from '../shared/library.ts'
import type {DatabaseSync} from 'node:sqlite'

/** Derive a 64-byte credential verifier with a 32 MiB working set per request. */
function derive(password:string,salt:Buffer){
  return new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:48*1024*1024},
    (error,key)=>error?reject(error):resolve(key)))
}
function reject(status:number,message:string):never{throw Object.assign(new Error(message),{status})}

/** Recheck the initiating member inside the approval transaction. Shared-key workspaces retain their key-based review policy. */
export function requireRequesterWrite(db:DatabaseSync,workspace:number,requester:number|null){
  const allowed=db.prepare(`SELECT 1 FROM workspaces w WHERE w.id=? AND (w.accessMode='key' OR EXISTS(
    SELECT 1 FROM memberships m WHERE m.workspace=w.id AND m.account=? AND m.role IN ('owner','editor')))`).get(workspace,requester)
  if(!allowed)reject(403,'Current requester access could not be verified. Dismiss this request or submit it again from an authorized account.')
}

/** Bind credential checks and membership lookups to this installation's database. */
export function serverAccounts(db:DatabaseSync,registration=false){
  db.exec(`CREATE TABLE IF NOT EXISTS accounts(
    id INTEGER PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE,salt BLOB NOT NULL,digest BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS memberships(workspace INTEGER NOT NULL REFERENCES workspaces,
    account INTEGER NOT NULL REFERENCES accounts,role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),PRIMARY KEY(workspace,account));`)
  db.exec(`CREATE TABLE IF NOT EXISTS server_settings(id INTEGER PRIMARY KEY CHECK(id=1),
    administrator INTEGER NOT NULL REFERENCES accounts,registration INTEGER NOT NULL CHECK(registration IN (0,1)))`)
  const settings=db.prepare('SELECT administrator,registration FROM server_settings WHERE id=1')
  const registrationOpen=()=>Boolean(settings.get()?.registration??registration)
  const isAdmin=(account:number|null)=>account!==null&&settings.get()?.administrator===account
  let checking=0
  /** Register or verify a username/password pair, returning the durable account ID. */
  async function authenticate(username:unknown,password:unknown,mode:'login'|'register'|'bootstrap'){
    const register=mode!=='login'
    const name=typeof username==='string'?username.trim():''
    if(!/^[A-Za-z0-9_.-]{1,64}$/.test(name)||typeof password!=='string'||!password.length||password.length>256)
      reject(400,'Use a username of 1–64 letters, numbers, dots, dashes or underscores and a password up to 256 characters.')
    if(register&&password.length<12)reject(400,'Choose a password of at least 12 characters.')
    if(checking>=4)reject(429,'Too many account requests. Try again shortly.')
    checking++
    try{
      const saved=db.prepare('SELECT id,salt,digest FROM accounts WHERE name=?').get(name)
      const salt=register||!saved?randomBytes(16):Buffer.from(saved.salt as Uint8Array)
      const digest=await derive(password,salt)
      if(register){
        db.exec('BEGIN IMMEDIATE')
        try{
          if(mode==='bootstrap'&&settings.get())reject(409,'A server administrator already exists.')
          if(mode==='register'&&!registrationOpen())reject(403,'Registration is closed')
          const inserted=db.prepare('INSERT INTO accounts(name,salt,digest) VALUES(?,?,?) ON CONFLICT(name) DO NOTHING').run(name,salt,digest)
          if(!inserted.changes)reject(409,'Username unavailable.')
          const id=Number(inserted.lastInsertRowid)
          if(mode==='bootstrap')db.prepare('INSERT INTO server_settings VALUES(1,?,0)').run(id)
          db.exec('COMMIT')
          return id
        }catch(error){db.exec('ROLLBACK');throw error}
      }
      if(!saved||!timingSafeEqual(digest,Buffer.from(saved.digest as Uint8Array)))reject(403,'Invalid username or password.')
      return Number(saved.id)
    }finally{checking--}
  }
  /** Return the member roster for a named workspace after the host checks owner access. */
  function members(workspace:number){
    return db.prepare('SELECT a.id,a.name,m.role FROM memberships m JOIN accounts a ON a.id=m.account WHERE m.workspace=? ORDER BY a.name').all(workspace)
  }

  /** Check authority and preserve the last owner in the same transaction as a role change or removal. */
  function changeMember(workspace:number,actor:number,target:number,role:MemberRole|null){
    if(role!==null&&!memberRoles.includes(role))reject(400,'Choose an existing workspace role.')
    db.exec('BEGIN IMMEDIATE')
    try{
      const member=db.prepare('SELECT role FROM memberships WHERE workspace=? AND account=?')
      if(member.get(workspace,actor)?.role!=='owner')reject(403,'Workspace owner access required.')
      const current=member.get(workspace,target)
      if(!current)reject(404,'Member no longer belongs to this workspace.')
      if(current.role==='owner'&&role!=='owner'&&!db.prepare("SELECT 1 FROM memberships WHERE workspace=? AND account<>? AND role='owner'").get(workspace,target))
        reject(409,'Assign another owner first.')
      if(role===null)db.prepare('DELETE FROM memberships WHERE workspace=? AND account=?').run(workspace,target)
      else db.prepare('UPDATE memberships SET role=? WHERE workspace=? AND account=?').run(role,workspace,target)
      db.exec('COMMIT')
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  return {authenticate,members,changeMember,isAdmin,registrationOpen,setRegistration(account:number|null,enabled:boolean){
    if(!isAdmin(account))reject(403,'Server administrator access required.')
    db.prepare('UPDATE server_settings SET registration=? WHERE id=1').run(Number(enabled))
  }}
}
