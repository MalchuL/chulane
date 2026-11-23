/** Preserve divergent page titles until an editor chooses between the saved and incoming values. */
import type {DatabaseSync} from 'node:sqlite'

type Rename={title:string;base?:string;reviewedTitle?:string;resolve?:number}

/** Apply one rename inside the caller's transaction. A stale base preserves a distinct proposed title for review. */
export function renamePage(db:DatabaseSync,workspace:number,page:number,change:Rename,includeTrashed=false){
  const current=db.prepare('SELECT title FROM pages WHERE id=? AND workspace=? AND deleted IN (0,?)').get(page,workspace,Number(includeTrashed))
  if(!current)throw Object.assign(Error('Page unavailable'),{status:410})
  const {title,base,resolve}=change
  if(change.reviewedTitle!==undefined&&current.title!==change.reviewedTitle)
    throw Object.assign(Error('The page title changed. Review the current title and try again.'),{status:409})
  if(resolve!==undefined){
    const candidate=db.prepare('SELECT title FROM page_title_conflicts WHERE id=? AND page=?').get(resolve,page)
    if(!candidate||current.title!==base)throw Object.assign(Error('The titles changed. Review the current choices.'),{status:409})
    if(title!==current.title&&title!==candidate.title)throw Object.assign(Error('Choose one of the reviewed titles.'),{status:400})
    db.prepare('DELETE FROM page_title_conflicts WHERE id=?').run(resolve)
  }else if(base!==undefined&&current.title!==base){
    if(title!==current.title&&title!==base)
      db.prepare('INSERT INTO page_title_conflicts(page,title) VALUES(?,?) ON CONFLICT(page,title) DO NOTHING').run(page,title)
    return
  }
  db.prepare('UPDATE pages SET title=? WHERE id=?').run(title,page)
  db.prepare('DELETE FROM page_title_conflicts WHERE page=? AND title=?').run(page,title)
}
