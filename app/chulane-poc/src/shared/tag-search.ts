/** Exact tag queries use assignment identity on the host and in authorized offline copies. */
import type {Source} from './agent.ts'

/** Keep bare numeric hashes available for direct page IDs. Explicit tag syntax also accepts numeric names. */
export function tagSearchName(input:string){
  const match=/^(tag:)?#([^#\s\p{Cc}]+)$/u.exec(input.trim())
  if(!match||(!match[1]&&/^\d+$/.test(match[2])))return
  return match[2].normalize('NFC')
}

/** Show each library page once. For agent citations, include additional assigned blocks within its result budget. */
export function tagSearchHits(sources:Iterable<Source>,scope:'pages'|'sources'){
  const first=new Map<number,Source>(),extra:Source[]=[]
  for(const source of sources){
    if(!first.has(source.id))first.set(source.id,source)
    else if(scope==='sources'&&extra.length<30)extra.push(source)
    if(scope==='sources'&&first.size===30)break
  }
  return scope==='pages'?[...first.values()]:[...first.values(),...extra].slice(0,30)
}
