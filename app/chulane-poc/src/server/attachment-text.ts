/** Derive searchable text from supported attachments while keeping the original file bytes canonical. */
import type {DatabaseSync} from 'node:sqlite'
import type {AttachmentRead} from '../shared/attachment-read.ts'
import type {AttachmentExcerpt} from '../shared/agent.ts'

import {attachmentText,attachmentFormats,tabularFormats,attachmentExcerpt} from '../shared/attachment-text.ts'

/** Format 2 adds tabular text. Decode only newly supported files when upgrading a previously indexed library. */
export function installAttachmentText(db:DatabaseSync,version:number){
  const indexed=db.prepare('PRAGMA table_info(files)').all().some(column=>column.name==='extractedText')
  if(indexed&&version>=2)return
  const formats=indexed?tabularFormats:attachmentFormats
  db.exec('BEGIN IMMEDIATE')
  try{
    if(!indexed)db.exec('ALTER TABLE files ADD COLUMN extractedText TEXT')
    const supported=formats.map(()=> 'lower(name) GLOB ?').join(' OR ')
    const rows=db.prepare('SELECT id,name,bytes FROM files WHERE extractedText IS NULL AND ('+supported+') ORDER BY id')
    const update=db.prepare('UPDATE files SET extractedText=? WHERE id=?')
    for(const row of rows.iterate(...formats.map(extension=>'*.'+extension))){
      const text=attachmentText(String(row.name),row.bytes as Uint8Array)
      if(text!==null)update.run(text,row.id)
    }
    db.exec('COMMIT')
  }catch(error){db.exec('ROLLBACK');throw error}
}

/** Find bounded excerpts in file ID order for each eligible page without loading attachment bytes into the page catalog. */
export function matchingAttachments(db:DatabaseSync,ws:number,literal:RegExp|null,perPage:number){
  const hits=new Map<number,AttachmentExcerpt[]>()
  if(!literal)return hits
  const rows=db.prepare('SELECT f.id,f.name,f.page,f.extractedText FROM files f JOIN pages p ON p.id=f.page WHERE p.workspace=? AND p.deleted=0 AND f.extractedText IS NOT NULL ORDER BY f.id')
  for(const row of rows.iterate(ws)){
    const page=Number(row.page)
    const matches=hits.get(page)
    if(matches&&matches.length>=perPage)continue
    const match=attachmentExcerpt(String(row.extractedText),literal)
    if(!match)continue
    const hit={id:Number(row.id),name:String(row.name),...match}
    if(matches)matches.push(hit)
    else hits.set(page,[hit])
  }
  return hits
}

/** List text sources on an active workspace page, or read a bounded passage without fetching binary file data. */
export function readAttachment(db:DatabaseSync,workspace:number,page:number,file:number|null,offset:number):AttachmentRead{
  if(!Number.isSafeInteger(offset)||offset<0)throw Object.assign(Error('Invalid attachment offset'),{status:400})
  const unavailable=()=>Object.assign(Error('Attachment unavailable'),{status:404})
  if(file===null){
    if(!db.prepare('SELECT 1 FROM pages WHERE id=? AND workspace=? AND deleted=0').get(page,workspace))throw unavailable()
    const rows=db.prepare(`SELECT f.id,f.name FROM files f JOIN pages p ON p.id=f.page
      WHERE p.id=? AND p.workspace=? AND p.deleted=0 AND f.extractedText IS NOT NULL ORDER BY f.id LIMIT 41 OFFSET ?`).all(page,workspace,offset)
    const files=rows.slice(0,40).map(row=>({id:Number(row.id),name:String(row.name)}))
    return {files,nextOffset:rows.length>files.length?offset+files.length:null}
  }
  // SQLite substr counts Unicode code points. Fetch one extra to distinguish an exact final chunk.
  const row=db.prepare(`SELECT p.title,f.name,substr(f.extractedText,?+1,12001) AS passage FROM files f JOIN pages p ON p.id=f.page
    WHERE p.id=? AND p.workspace=? AND p.deleted=0 AND f.id=? AND f.extractedText IS NOT NULL`).get(offset,page,workspace,file)
  if(!row)throw unavailable()
  const characters=Array.from(String(row.passage))
  return {title:String(row.title),name:String(row.name),text:characters.slice(0,12000).join(''),nextOffset:characters.length>12000?offset+12000:null}
}
