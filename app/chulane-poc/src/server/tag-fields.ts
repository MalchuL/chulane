/** Store workspace field definitions independently of tag membership so that hiding a column retains its values. */
import type {DatabaseSync} from 'node:sqlite'
import {z} from 'zod'
import {fieldKinds,type FieldValue,type TagField,type TagTable,type WorkspaceTagFields} from '../shared/tag-fields.ts'
import type {Source} from '../shared/agent.ts'

const definition=z.object({name:z.string().trim().min(1).max(100),kind:z.enum(fieldKinds),options:z.array(z.string().trim().min(1).max(100)).max(100).default([])})
/** Reject invalid or stale field operations through the HTTP boundary. */
function fail(status:number,message:string):never{throw Object.assign(Error(message),{status})}
/** Validate a scalar without coercing empty, zero and false into each other. */
function valid(field:Pick<TagField,'kind'|'options'>,value:unknown):value is FieldValue{
  if(value===null)return true
  switch(field.kind){
    case 'checkbox':return typeof value==='boolean'
    case 'number':return typeof value==='number'&&Number.isFinite(value)
    case 'text':return typeof value==='string'&&value.length<=32000
    case 'choice':return typeof value==='string'&&field.options.includes(value)
    case 'date':return z.iso.date().safeParse(value).success
  }
}

/** Read attached columns and current assignments once per desktop library refresh. */
export function workspaceTagFields(db:DatabaseSync,workspace:number):WorkspaceTagFields{
  const columns=db.prepare(`SELECT link.tag,f.id,f.name,f.kind,f.options FROM tag_fields link JOIN fields f ON f.id=link.field
    JOIN tags t ON t.id=link.tag WHERE t.workspace=? AND t.deleted=0 AND f.workspace=t.workspace ORDER BY f.id`).all(workspace)
  const cells=db.prepare(`SELECT v.* FROM tag_values v JOIN tag_fields USING(tag,field) JOIN tag_applications a USING(tag,page,block)
    JOIN tags t ON t.id=v.tag JOIN pages p ON p.id=v.page
    WHERE t.workspace=? AND p.workspace=t.workspace AND t.deleted=0 AND p.deleted=0 AND a.active=1`).all(workspace)
  return {columns:columns.map(f=>({tag:Number(f.tag),id:Number(f.id),name:String(f.name),kind:f.kind as TagField['kind'],options:JSON.parse(String(f.options)),attached:true})),
    cells:cells.map(v=>({tag:Number(v.tag),page:Number(v.page),block:String(v.block),field:Number(v.field),value:JSON.parse(String(v.value))}))}
}

/** Bind field storage to the tag service's source enumeration and single-block validation. */
export function tagFields(db:DatabaseSync,sources:(tag:number,ws:number)=>Source[],blockExists:(page:number,ws:number,block:string)=>boolean){
  db.exec(`CREATE TABLE IF NOT EXISTS fields(id INTEGER PRIMARY KEY,workspace INTEGER NOT NULL REFERENCES workspaces(id),name TEXT NOT NULL,kind TEXT NOT NULL,options TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tag_fields(tag INTEGER NOT NULL REFERENCES tags(id),field INTEGER NOT NULL REFERENCES fields(id),PRIMARY KEY(tag,field));
    CREATE TABLE IF NOT EXISTS tag_values(tag INTEGER NOT NULL,page INTEGER NOT NULL,block TEXT NOT NULL,field INTEGER NOT NULL REFERENCES fields(id),value TEXT NOT NULL,
      PRIMARY KEY(tag,page,block,field),FOREIGN KEY(tag,page,block) REFERENCES tag_applications(tag,page,block) ON DELETE CASCADE);`)
  /** Dispatch only after the owning tag and authenticated workspace have been checked. */
  return function handle(route:string,method:string,ws:number,tag:number,data:Record<string,unknown>){
    if(route==='/table'&&method==='GET'){
      const fields=db.prepare(`SELECT f.*,link.field IS NOT NULL AS attached FROM fields f LEFT JOIN tag_fields link ON link.field=f.id AND link.tag=? WHERE workspace=? ORDER BY f.id`).all(tag,ws)
      const rows=sources(tag,ws).map(source=>({...source,values:{} as Record<number,FieldValue>}))
      const objects=new Map(rows.map(row=>[row.id+'/'+(row.block??''),row]))
      for(const cell of db.prepare('SELECT v.* FROM tag_values v JOIN tag_fields f USING(tag,field) WHERE v.tag=?').iterate(tag)){
        const row=objects.get(cell.page+'/'+cell.block)
        if(row)row.values[Number(cell.field)]=JSON.parse(String(cell.value))
      }
      return {fields:fields.map(f=>({id:Number(f.id),name:String(f.name),kind:f.kind as TagField['kind'],options:JSON.parse(String(f.options)),attached:!!f.attached})),rows} satisfies TagTable
    }
    const match=/^\/fields(?:\/(\d+)(\/value)?)?$/.exec(route)
    if(!match)fail(405,'Unknown field operation')
    const attach=method==='POST'&&!match[1]
    const id=match[1]?Number(match[1]):data.field
    if(attach&&id===undefined||method==='PATCH'&&match[1]&&!match[2]){
      const parsed=definition.safeParse(data)
      if(!parsed.success)fail(400,'Invalid field definition')
      const {name,kind,options}=parsed.data
      if((kind==='choice')!==!!options.length||new Set(options).size!==options.length)fail(400,'Provide distinct options for a choice field')
      if(attach){
        db.exec('BEGIN')
        try{
          const field=Number(db.prepare('INSERT INTO fields(workspace,name,kind,options) VALUES(?,?,?,?)').run(ws,name,kind,JSON.stringify(options)).lastInsertRowid)
          db.prepare('INSERT INTO tag_fields VALUES(?,?)').run(tag,field)
          db.exec('COMMIT');return {id:field}
        }catch(error){db.exec('ROLLBACK');throw error}
      }
      const old=db.prepare('SELECT kind FROM fields JOIN tag_fields ON field=id WHERE workspace=? AND tag=? AND id=?').get(ws,tag,Number(id))
      if(!old)fail(404,'Field unavailable')
      for(const row of db.prepare('SELECT DISTINCT value FROM tag_values WHERE field=?').iterate(Number(id))){
        if(old.kind!==kind||!valid(parsed.data,JSON.parse(String(row.value))))fail(409,'Existing values require the current field type and choices')
      }
      db.prepare('UPDATE fields SET name=?,kind=?,options=? WHERE id=?').run(name,kind,JSON.stringify(options),Number(id))
      return {}
    }
    if(typeof id!=='number'||!Number.isSafeInteger(id))fail(400,'Invalid field')
    const field=db.prepare('SELECT kind,options FROM fields WHERE id=? AND workspace=?').get(id,ws)
    if(!field)fail(404,'Field unavailable')
    if(attach){db.prepare('INSERT OR IGNORE INTO tag_fields VALUES(?,?)').run(tag,id);return {id}}
    if(!db.prepare('SELECT 1 FROM tag_fields WHERE tag=? AND field=?').get(tag,id))fail(404,'Field unavailable')
    if(method==='DELETE'&&!match[2]){db.prepare('DELETE FROM tag_fields WHERE tag=? AND field=?').run(tag,id);return {}}
    if(method==='PUT'&&match[2]){
      const {page,block,value}=data
      if(typeof page!=='number'||!Number.isSafeInteger(page)||typeof block!=='string')fail(400,'Invalid field target')
      if(!db.prepare('SELECT 1 FROM tag_applications a JOIN pages p ON p.id=a.page WHERE tag=? AND page=? AND block=? AND active=1 AND workspace=? AND deleted=0').get(tag,page,block,ws)
        ||(block&&!blockExists(page,ws,block)))fail(404,'Tagged object unavailable')
      if(!valid({kind:field.kind as TagField['kind'],options:JSON.parse(String(field.options))},value))fail(400,'Invalid field value')
      const key=[tag,page,block,id] as const
      if('previous' in data){
        const stored=db.prepare('SELECT value FROM tag_values WHERE tag=? AND page=? AND block=? AND field=?').get(...key)
        if((stored?JSON.parse(String(stored.value)):null)!==data.previous)fail(409,'Value changed. Review the latest value and try again.')
      }
      if(value===null)db.prepare('DELETE FROM tag_values WHERE tag=? AND page=? AND block=? AND field=?').run(...key)
      else db.prepare('INSERT INTO tag_values VALUES(?,?,?,?,?) ON CONFLICT(tag,page,block,field) DO UPDATE SET value=excluded.value').run(...key,JSON.stringify(value))
      return {}
    }
    fail(405,'Unknown field operation')
  }
}
