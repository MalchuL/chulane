/** Shared CLI and MCP operations. All data and proposals go through the authenticated web service. */
import type {PropertyBatch,PropertyQuery} from '../shared/tag-fields.ts'
import type {LinkedPages,PageLinksQuery} from '../shared/page-links.ts'
import type {TextPassage,TextRange} from '../shared/text-range.ts'
import type {AttachmentQuery,AttachmentRead} from '../shared/attachment-read.ts'
import type {JournalList,JournalCreation,PageCreation} from '../shared/page-draft.ts'
import {projectHref,type Project,type ParagraphEdit,type WorkspaceCatalog} from '../shared/library.ts'
import {sourceHref,type Source} from '../shared/agent.ts'
import type {ProjectLookup} from '../shared/project-lookup.ts'
import type {ToolProfile} from './profile.ts'

type CreatePageArgument={title:string}&Partial<Omit<PageCreation,'title'>>
type BrowseArgument={project:number|null;offset:number;name?:string}
type PageTarget={id:string|number}
type OperationArgument=PageLinksQuery|PropertyQuery|ProjectLookup|JournalCreation|{id:number;offset:number}|BrowseArgument|TextRange|AttachmentQuery|string|number|CreatePageArgument|(PageTarget&{title:string;baseTitle?:string})|(PageTarget&ParagraphEdit)

/** Require an existing-page operand before JSON can turn a non-finite number into a create request's null target. */
function proposalPageId(value:PageTarget['id']){
  const id=Number(value)
  if(!Number.isSafeInteger(id)||id<=0||(typeof value==='string'&&!/^\d+$/.test(value)))throw Error('Supply a positive page ID in decimal digits from browse or search')
  return id
}

/** Bind credentials and the reauthentication cookie to one operator-selected server for the process lifetime. */
export function connectTools({origin,workspace:ws,credentials,name}:ToolProfile){
  let cookie=''
  async function api<T>(path:string,body?:object,retry=true):Promise<T>{
    const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',redirect:'error',headers:{'Content-Type':'application/json',Cookie:cookie},body:body&&JSON.stringify(body)})
    if(r.status===401 && retry){
      const login=await fetch(origin+'/api/login',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({...credentials,profile:name})})
      if(!login.ok)throw Error('Workspace sign-in failed')
      const session=login.headers.get('set-cookie');if(!session)throw Error('Missing session cookie');cookie=session.split(';')[0];return api<T>(path,body,false)
    }
    const value=await r.json();if(!r.ok)throw Error(value.error);return value
  }
  /** Use the workspace selected by the operator for all model-visible operations. */
  return async function operation(command:string,arg:OperationArgument=''){
    const suffix='?workspace='+ws
    const fileUrl=(page:number,file:number)=>origin+'/api/pages/'+page+'/files/'+file+suffix
    if(command==='proposal_status'){
      const id=Number(arg)
      if(!Number.isSafeInteger(id)||id<=0)throw Error('Supply a positive request ID')
      const result=await api<{id:number;status:string;page:number|null;block:string|null}>('proposals/'+id+suffix)
      const url=result.page===null?null:origin+'/'+suffix+'&page='+result.page+(result.block?'&block='+encodeURIComponent(result.block):'')
      return {...result,url}
    }
    if(command==='propose_journal'&&typeof arg==='object'&&'day' in arg)return api<{pending:number}>('proposals'+suffix,arg)
    if(command==='propose_create')return api<{pending:number}>('proposals'+suffix,typeof arg==='object'?arg:{title:arg})
    if(command==='propose_edit' && typeof arg==='object' && 'before' in arg){
      const {id,...edit}=arg
      return api<{pending:number}>('proposals'+suffix,{page:proposalPageId(id),edit})
    }
    if(command==='propose_rename' && typeof arg==='object' && 'title' in arg && 'id' in arg)return api<{pending:number}>('proposals'+suffix,{page:proposalPageId(arg.id),title:arg.title,baseTitle:arg.baseTitle})
    const link=<T extends {id:number;block?:string}>(page:T)=>({...page,url:origin+'/'+sourceHref(ws,page)})
    if(command==='read_properties'&&typeof arg==='object'&&'block' in arg&&'offset' in arg){
      return link(await api<PropertyBatch>('properties'+suffix+'&id='+arg.id+'&offset='+arg.offset+(arg.block?'&block='+encodeURIComponent(arg.block):'')))
    }
    if(command==='list_page_links'&&typeof arg==='object'&&'after' in arg&&typeof arg.after==='number'){
      const batch=await api<LinkedPages>('pages/'+arg.id+'/links'+suffix+'&after='+arg.after+('direction' in arg?'&direction='+arg.direction:'')+'&origin='+encodeURIComponent(origin))
      return {...batch,entries:batch.entries.map(link)}
    }
    if(command==='list_journal'){
      const batch=await api<JournalList>('journal/entries'+suffix+(arg?'&before='+encodeURIComponent(String(arg)):''))
      return {...batch,entries:batch.entries.map(link)}
    }
    if(command==='read_journal'){
      const page=await api<Source|null>('source'+suffix+'&blocks=1&offset=0&day='+encodeURIComponent(String(arg)))
      return page&&link(page)
    }
    if(command==='search'){
      const hits=await api<Source[]>('search'+suffix+'&q='+encodeURIComponent(String(arg)))
      return hits.map(hit=>{
        const source=link(hit)
        if(!hit.attachment)return source
        const url=fileUrl(hit.id,hit.attachment.id)
        return {...source,attachment:{...hit.attachment,url}}
      })
    }
    if(command==='read_text'&&typeof arg==='object'&&'block' in arg&&'offset' in arg){
      const {id,block,offset}=arg
      const field='field' in arg?arg.field:null
      const query=block===null?'':'&block='+encodeURIComponent(block)
      const result=await api<TextPassage&{id:number;title:string}>('document-text'+suffix+'&id='+id+'&offset='+offset+query+(field?'&field='+field:''))
      return link({...result,...(block!==null?{block}:{surface:'canvas' as const})})
    }
    if(command==='read_attachment'&&typeof arg==='object'&&'file' in arg){
      const {id,file,offset}=arg
      const result=await api<AttachmentRead>('attachment-text'+suffix+'&id='+id+'&offset='+offset+(file===null?'':'&file='+file))
      if('files' in result){
        if(file==='all')return {...result,files:result.files.map(item=>({...item,url:fileUrl(id,item.id)}))}
        return result
      }
      return typeof file==='number'?{...result,url:fileUrl(id,file)}:result
    }
    if(command==='read'){
      const batch=typeof arg==='object'&&'id' in arg&&'offset' in arg?arg:null
      const path='source'+suffix+'&blocks=1&id='+(batch?batch.id:Number(arg))+(batch?'&offset='+batch.offset:'')
      return link(await api<{id:number;title:string}>(path))
    }
    if(command==='workspaces')return (await api<WorkspaceCatalog>('workspaces')).workspaces
    if(command==='find_projects'&&typeof arg==='object'&&'name' in arg&&typeof arg.name==='string'&&'offset' in arg){
      const result=await api<{entries:{id:number;name:string;path:string}[];nextOffset:number|null}>('projects/find'+suffix+'&name='+encodeURIComponent(arg.name)+'&offset='+arg.offset+('match' in arg?'&match='+arg.match:''))
      return {...result,entries:result.entries.map(entry=>({...entry,url:origin+'/'+projectHref(ws,entry.id)}))}
    }
    if(command==='projects')return api<Project[]>('projects'+suffix)
    if(command==='browse'&&typeof arg==='object'&&'project' in arg&&'offset' in arg){
      const folder=arg.project===null?'':'&project='+arg.project
      const name=arg.name===undefined?'':'&name='+encodeURIComponent(arg.name)
      return api('projects/browse'+suffix+folder+'&offset='+arg.offset+name)
    }
    throw Error('Use workspaces, projects, find_projects NAME [OFFSET] [exact|path], browse [PROJECT_ID_OR_root] [OFFSET] [EXACT_NAME], search QUERY, read_properties PAGE_ID [OFFSET [BLOCK_ID]], list_page_links PAGE_ID [AFTER_ID] [incoming|outgoing], list_journal [BEFORE_DATE], read_journal YYYY-MM-DD|today, read ID [BLOCK_OFFSET], read_text PAGE OFFSET [BLOCK [description]], read_attachment PAGE [FILE_ID|list|all] [OFFSET], propose_create TITLE, propose_journal [--operation-id KEY] YYYY-MM-DD TITLE TEXT, propose_draft PROJECT_ID_OR_root TITLE MARKDOWN, propose_rename [--from OBSERVED_TITLE] ID TITLE, propose_edit ID BLOCK BEFORE AFTER or proposal_status REQUEST_ID')
  }
}
