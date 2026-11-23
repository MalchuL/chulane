/** Derive searchable text from supported attachments while keeping the original file bytes canonical. */
import type {DatabaseSync} from 'node:sqlite'
import type {AttachmentRead,AttachmentQuery} from '../shared/attachment-read.ts'
import type {AttachmentExcerpt} from '../shared/agent.ts'

import {wholeLabel} from '../shared/document-text.ts'
import {attachmentText,attachmentFormats,tabularFormats,attachmentMatch} from '../shared/attachment-text.ts'

/** Index newly supported files on upgrade. Version 2 added tabular files and version 3 adds marked UTF-16. */
export function installAttachmentText(db:DatabaseSync,version:number){
  const indexed=db.prepare('PRAGMA table_info(files)').all().some(column=>column.name==='extractedText')
  if(indexed&&version>=3)return
  db.exec('BEGIN IMMEDIATE')
  try{
    if(!indexed)db.exec('ALTER TABLE files ADD COLUMN extractedText TEXT')
    const supported=attachmentFormats.map(()=> 'lower(name) GLOB ?').join(' OR ')
    const patterns=attachmentFormats.map(extension=>'*.'+extension)
    // Existing indexed stores need only files with UTF-16 signatures plus any tabular files predating format 2.
    const candidates=["substr(bytes,1,2) IN (x'FFFE',x'FEFF')"]
    if(indexed&&version<2){
      for(const extension of tabularFormats){candidates.push('lower(name) GLOB ?');patterns.push('*.'+extension)}
    }
    const filter=indexed?' AND ('+candidates.join(' OR ')+')':''
    const rows=db.prepare('SELECT id,name,bytes FROM files WHERE extractedText IS NULL AND ('+supported+')'+filter+' ORDER BY id')
    const update=db.prepare('UPDATE files SET extractedText=? WHERE id=?')
    for(const row of rows.iterate(...patterns)){
      const text=attachmentText(String(row.name),row.bytes as Uint8Array)
      if(text!==null)update.run(text,row.id)
    }
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
}

/** Keep exact filenames ahead of passages before applying the per-page limit. File IDs break ties in both groups. */
export function matchingAttachments(db:DatabaseSync,ws:number,literal:RegExp|null,perPage:number){
  const hits=new Map<number,AttachmentExcerpt[]>()
  if(!literal)return hits
  const exactName=wholeLabel(literal)
  const exactFiles=new Map<number,AttachmentExcerpt[]>()
  const rows=db.prepare('SELECT f.id,f.name,f.page,f.extractedText FROM files f JOIN pages p ON p.id=f.page WHERE p.workspace=? AND p.deleted=0 ORDER BY f.id')
  for(const row of rows.iterate(ws)){
    const page=Number(row.page)
    const name=String(row.name)
    const bucket=exactName.test(name)?exactFiles:hits
    const matches=bucket.get(page)
    if(matches&&matches.length>=perPage)continue
    const match=attachmentMatch(name,row.extractedText as string|null,literal)
    if(!match)continue
    const hit={id:Number(row.id),name,...match}
    if(matches)matches.push(hit)
    else bucket.set(page,[hit])
  }
  for(const [page,files] of exactFiles)hits.set(page,files.concat(hits.get(page)??[]).slice(0,perPage))
  return hits
}

/** List attachment metadata on an active workspace page, or read a bounded passage without fetching binary file data. */
export function readAttachment(db:DatabaseSync,workspace:number,page:number,file:AttachmentQuery['file'],offset:number):AttachmentRead{
  if(!Number.isSafeInteger(offset)||offset<0)throw Object.assign(Error('Invalid attachment offset'),{status:400})
  const unavailable=()=>Object.assign(Error('Attachment unavailable'),{status:404})
  if(typeof file!=='number'){
    if(!db.prepare('SELECT 1 FROM pages WHERE id=? AND workspace=? AND deleted=0').get(page,workspace))throw unavailable()
    const rows=db.prepare(`SELECT f.id,f.name,f.extractedText IS NOT NULL AS readable FROM files f JOIN pages p ON p.id=f.page
      WHERE p.id=? AND p.workspace=? AND p.deleted=0 AND (? OR f.extractedText IS NOT NULL) ORDER BY f.id LIMIT 41 OFFSET ?`).all(page,workspace,Number(file==='all'),offset)
    const files=rows.slice(0,40).map(row=>({id:Number(row.id),name:String(row.name),...(file==='all'&&{readable:!!row.readable})}))
    return {files,nextOffset:rows.length>files.length?offset+files.length:null}
  }
  // SQLite substr counts Unicode code points. Fetch one extra to distinguish an exact final chunk.
  const row=db.prepare(`SELECT p.title,f.name,substr(f.extractedText,?+1,12001) AS passage FROM files f JOIN pages p ON p.id=f.page
    WHERE p.id=? AND p.workspace=? AND p.deleted=0 AND f.id=? AND f.extractedText IS NOT NULL`).get(offset,page,workspace,file)
  if(!row)throw unavailable()
  const characters=Array.from(String(row.passage))
  return {title:String(row.title),name:String(row.name),text:characters.slice(0,12000).join(''),nextOffset:characters.length>12000?offset+12000:null}
}
