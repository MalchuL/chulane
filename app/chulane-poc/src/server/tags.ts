/** Workspace-owned tag definitions and page/block applications. Soft removal retains their identities and associations. */
import type {DatabaseSync} from 'node:sqlite'
import {tagFields} from './tag-fields.ts'
import {agentDocument,type PageBody} from './agent-document.ts'
import type {Source} from '../shared/agent.ts'

/** Report a rejected workspace operation through the shared HTTP boundary. */
function reject(status:number,message:string):never{throw Object.assign(Error(message),{status})}

/** Install tag storage and bind reads to the same live Rivto states used by the editor and chat. */
export function workspaceTags(db:DatabaseSync,drafts:ReadonlyMap<number,{state:Uint8Array}>){
  db.exec(`CREATE TABLE IF NOT EXISTS tags(id INTEGER PRIMARY KEY,workspace INTEGER NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,UNIQUE(workspace,name));
    CREATE TABLE IF NOT EXISTS tag_applications(tag INTEGER NOT NULL REFERENCES tags(id),page INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    block TEXT NOT NULL,active INTEGER NOT NULL,PRIMARY KEY(tag,page,block));`)

  /** Read writing blocks with durable identity. Legacy text receives real block IDs at its first checkpoint. */
  function blocks(page:number,ws:number){
    const row=db.prepare('SELECT id,title,state,plain FROM pages WHERE workspace=? AND id=? AND deleted=0').get(ws,page) as PageBody|undefined
    if(!row)reject(404,'Page unavailable')
    const state=drafts.get(page)?.state??row.state
    return state?agentDocument({...row,state}).blocks:[]
  }
  /** Return active tagged objects with current page titles and navigable block excerpts. */
  function sources(tag:number,ws:number){
    const rows=db.prepare(`SELECT p.id,p.title,a.block FROM tag_applications a JOIN pages p ON p.id=a.page
      WHERE a.active=1 AND a.tag=? AND p.workspace=? AND p.deleted=0 ORDER BY p.id,a.block`).all(tag,ws)
    const result:Source[]=[]
    let previousPage:number|undefined
    let textById=new Map<string,string>()
    for(const row of rows){
      const id=Number(row.id),title=String(row.title),block=String(row.block)
      if(!block){result.push({id,title});continue}
      if(id!==previousPage){textById=new Map(blocks(id,ws).map(b=>[b.id,b.text]));previousPage=id}
      if(textById.has(block))result.push({id,title,block,excerpt:textById.get(block)!.slice(0,120)||'Empty block'})
    }
    return result
  }
  const fields=tagFields(db,sources,(page,ws,block)=>blocks(page,ws).some(item=>item.id===block))
  /** Resolve a workspace-owned name, restoring its identity when a user defines it again. */
  function define(ws:number,input:unknown){
    const name=typeof input==='string'?input.trim().replace(/^#/,'').normalize('NFC'):''
    if(!name||name.length>100||/[\s#\p{Cc}]/u.test(name))reject(400,'Enter a tag name of up to 100 characters without spaces or #')
    const row=db.prepare('INSERT INTO tags(workspace,name) VALUES(?,?) ON CONFLICT(workspace,name) DO UPDATE SET deleted=0 RETURNING id').get(ws,name)!
    return Number(row.id)
  }
  /** Load a tag within the authenticated workspace before reading or changing its state. */
  function lookup(ws:number,id:unknown){
    if(typeof id!=='number'||!Number.isSafeInteger(id)||id<=0)reject(400,'Invalid tag')
    const tag=db.prepare('SELECT id,deleted FROM tags WHERE id=? AND workspace=?').get(id,ws)
    if(!tag)reject(404,'Tag unavailable')
    return {id,deleted:!!tag.deleted}
  }
  /** Apply a validated route after the request body has arrived so concurrent trash operations take effect. */
  function handle(path:string,method:string,ws:number,data:Record<string,unknown>){
    if(path==='/api/tags'&&method==='POST')return {id:define(ws,data.name)}
    const definition=/^\/api\/tags\/(\d+)(\/.*)?$/.exec(path)
    const target=/^\/api\/pages\/(\d+)\/tags(\/blocks)?$/.exec(path)
    if(target?.[2]&&method==='GET')return blocks(Number(target[1]),ws).map(b=>({...b,text:b.text.slice(0,120)}))
    if(target&&!target[2]&&method==='PUT'){
      const page=Number(target[1]),{active,block}=data
      if(typeof active!=='boolean'||typeof block!=='string'||block.length>1024)reject(400,'Invalid tag application')
      if(!db.prepare('SELECT id FROM pages WHERE workspace=? AND id=? AND deleted=0').get(ws,page))reject(404,'Page unavailable')
      if(block&&!blocks(page,ws).some(b=>b.id===block))reject(404,'Block unavailable')
      db.exec('BEGIN')
      try{
        const tag=active&&data.tag===undefined?{id:define(ws,data.name),deleted:false}:lookup(ws,data.tag)
        if(tag.deleted)reject(410,'Tag is in trash')
        db.prepare(`INSERT INTO tag_applications(tag,page,block,active) VALUES(?,?,?,?)
          ON CONFLICT(tag,page,block) DO UPDATE SET active=excluded.active`).run(tag.id,page,block,Number(active))
        db.exec('COMMIT');return {id:tag.id}
      }catch(error){db.exec('ROLLBACK');throw error}
    }
    if(!definition)reject(405,'Tag operation unavailable')
    const tag=lookup(ws,Number(definition[1])),id=tag.id
    if(definition&&!definition[2]&&method==='PATCH'){
      if(typeof data.deleted!=='boolean')reject(400,'Invalid tag change')
      db.prepare('UPDATE tags SET deleted=? WHERE id=?').run(Number(data.deleted),id)
      return {}
    }
    if(tag.deleted)reject(410,'Tag is in trash')
    if(definition?.[2]==='/sources'&&method==='GET')return sources(id,ws)
    if(definition?.[2])return fields(definition[2],method,ws,id,data)
    reject(405,'Tag operation unavailable')
  }
  return {handle}
}
