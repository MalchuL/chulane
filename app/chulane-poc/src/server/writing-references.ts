/** Bind named references and block tags to their workspace when a document checkpoint commits. */
import type {DatabaseSync} from 'node:sqlite'
import {namedReferences} from '../shared/named-references.ts'
import {agentDocument,type PageBody} from './agent-document.ts'

/** Subscribe to committed page writes, including imports and crash recovery, inside their existing transaction. */
export function installWritingReferences(db:DatabaseSync){
  db.exec(`CREATE TABLE IF NOT EXISTS named_page_references(
    source INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,name TEXT NOT NULL,
    target INTEGER NOT NULL REFERENCES pages(id),PRIMARY KEY(source,name));
    CREATE INDEX IF NOT EXISTS named_references_by_target ON named_page_references(target,source);
    CREATE INDEX IF NOT EXISTS reference_page_titles ON pages(workspace,title) WHERE deleted=0;`)
  if(!db.prepare('PRAGMA table_info(tag_applications)').all().some(col=>col.name==='fromWriting'))
    db.exec('ALTER TABLE tag_applications ADD COLUMN fromWriting INTEGER NOT NULL DEFAULT 0')
  const bindings=db.prepare('SELECT name,target FROM named_page_references WHERE source=?')
  const byTitle=db.prepare('SELECT id FROM pages WHERE workspace=? AND title=? AND deleted=0 ORDER BY id LIMIT 2')
  const create=db.prepare('INSERT INTO pages(workspace,title) VALUES(?,?)')
  const bind=db.prepare('INSERT INTO named_page_references(source,name,target) VALUES(?,?,?)')
  const unbind=db.prepare('DELETE FROM named_page_references WHERE source=? AND name=?')
  const define=db.prepare('INSERT INTO tags(workspace,name) VALUES(?,?) ON CONFLICT(workspace,name) DO NOTHING')
  const tagId=db.prepare('SELECT id FROM tags WHERE workspace=? AND name=? AND deleted=0')
  const apply=db.prepare(`INSERT INTO tag_applications(tag,page,block,active,fromWriting) VALUES(?,?,?,1,1)
    ON CONFLICT(tag,page,block) DO UPDATE SET active=1 WHERE fromWriting=1 AND active=0`)
  const previous=db.prepare('SELECT tag,block FROM tag_applications WHERE page=? AND fromWriting=1 AND active=1')
  const detach=db.prepare('UPDATE tag_applications SET active=0 WHERE page=? AND tag=? AND block=?')
  const read=db.prepare('SELECT id,title,workspace,state,plain FROM pages WHERE id=? AND deleted=0')
  /** Resolve every name once per save. A stored binding follows its page through title changes. */
  function sync(id:number){
    const page=read.get(id) as (PageBody & {workspace:number})|undefined
    if(!page)return
    const names=new Set<string>(),tags=new Map<string,Set<number>>()
    if(/[#[\]]/.test(page.plain)){
      const blocks=page.state?agentDocument(page).blocks:[{id:'@import',text:page.plain}]
      const definitions=new Map<string,number|undefined>()
      for(const block of blocks){
        for(const {kind,name} of namedReferences(block.text)){
          if(kind==='page'){names.add(name);continue}
          if(!definitions.has(name)){
            define.run(page.workspace,name)
            const row=tagId.get(page.workspace,name)
            definitions.set(name,row?Number(row.id):undefined)
          }
          const tag=definitions.get(name)
          if(tag===undefined)continue
          const found=tags.get(block.id)??new Set<number>()
          if(!found.has(tag))apply.run(tag,id,block.id)
          found.add(tag);tags.set(block.id,found)
        }
      }
    }
    for(const row of previous.all(id)){
      if(!tags.get(String(row.block))?.has(Number(row.tag)))detach.run(id,row.tag,row.block)
    }
    for(const row of bindings.all(id)){
      if(!names.delete(String(row.name)))unbind.run(id,row.name)
    }
    for(const name of names){
      const matches=byTitle.all(page.workspace,name)
      // The completion picker offers explicit IDs when two pages share a title.
      if(matches.length>1)continue
      const target=matches[0]?.id??create.run(page.workspace,name).lastInsertRowid
      bind.run(id,name,target)
    }
  }
  db.function('chulane_sync_writing',id=>{sync(Number(id));return null})
  const hasMarkers="(instr(NEW.plain,'[')>0 OR instr(NEW.plain,'#')>0)"
  // Connection-local triggers keep backups portable and drafts free of speculative destinations.
  db.exec(`CREATE TEMP TRIGGER insert_writing_references AFTER INSERT ON pages WHEN NEW.deleted=0 AND ${hasMarkers}
    BEGIN SELECT chulane_sync_writing(NEW.id); END;
    CREATE TEMP TRIGGER save_writing_references AFTER UPDATE OF plain,state,deleted ON pages WHEN NEW.deleted=0 AND
      (${hasMarkers} OR instr(OLD.plain,'[')>0 OR instr(OLD.plain,'#')>0)
    BEGIN SELECT chulane_sync_writing(NEW.id); END`)
  return sync
}
