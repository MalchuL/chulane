/** Record page and project metadata deliveries atomically with the caller's metadata change. */
import {createHash} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'

/** Return true for an identical retry. Reusing an operation ID with different arguments is a conflict. */
export function alreadyApplied(db:DatabaseSync,kind:'page'|'project',id:number,operation:unknown,payload:readonly unknown[]|Record<string,unknown>){
  if(operation===undefined)return false
  if(typeof operation!=='string'||!/^[0-9a-f]{32}$/.test(operation))throw Object.assign(Error('Invalid metadata operation ID.'),{status:400})
  // Keep the original receipt tables and rename fingerprints so queued operations survive upgrades.
  const table=kind==='page'?'page_title_receipts':'project_name_receipts'
  const fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  const receipt=db.prepare(`SELECT fingerprint FROM ${table} WHERE ${kind}=? AND operation=?`).get(id,operation)
  if(receipt&&receipt.fingerprint!==fingerprint)throw Object.assign(Error('Metadata operation ID already used.'),{status:409})
  if(!receipt)db.prepare(`INSERT INTO ${table}(${kind},operation,fingerprint) VALUES(?,?,?)`).run(id,operation,fingerprint)
  return !!receipt
}
