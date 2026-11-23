/** Commit resource creation and its retry receipt together. The receipt contains a digest and a result ID. */
import {createHash} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'

/** Skip external setup on a retry. createOnce still verifies the fingerprint and access before replaying. */
export function hasCreationReceipt(db:DatabaseSync,account:number|null,operation:string){
  return !!db.prepare('SELECT 1 FROM creation_receipts WHERE actor=? AND operation=?').get(account??0,operation)
}

/** Identical retries by the same principal receive the original result, including after a host restart. */
export function createOnce(db:DatabaseSync,account:number|null,operation:unknown,args:readonly unknown[],create:()=>number,canReplay:(id:number)=>boolean){
  if(operation!==undefined&&(typeof operation!=='string'||!/^[0-9a-f]{32}$/.test(operation)))throw Object.assign(Error('Invalid creation operation ID.'),{status:400})
  const actor=account??0
  db.exec('BEGIN IMMEDIATE')
  try{
    let id:number
    if(operation===undefined)id=create()
    else{
      const fingerprint=createHash('sha256').update(JSON.stringify(args)).digest('hex')
      const receipt=db.prepare('SELECT fingerprint,result FROM creation_receipts WHERE actor=? AND operation=?').get(actor,operation)
      if(receipt){
        if(receipt.fingerprint!==fingerprint)throw Object.assign(Error('Creation operation ID already used for another request.'),{status:409})
        id=Number(receipt.result)
        if(!canReplay(id))throw Object.assign(Error('The created item is no longer available.'),{status:404})
      }else{
        id=create()
        db.prepare('INSERT INTO creation_receipts(actor,operation,fingerprint,result) VALUES(?,?,?,?)').run(actor,operation,fingerprint,id)
      }
    }
    db.exec('COMMIT')
    return id
  }catch(error){db.exec('ROLLBACK');throw error}
}
