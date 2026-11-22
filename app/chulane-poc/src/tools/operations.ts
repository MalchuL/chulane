/** Shared CLI and MCP operations. All data and proposals go through the authenticated web service. */
import type {TextPassage,TextRange} from '../shared/text-range.ts'
import type {AttachmentQuery,AttachmentRead} from '../shared/attachment-read.ts'
import type {PageCreation} from '../shared/page-draft.ts'
import type {Project,ParagraphEdit,WorkspaceCatalog} from '../shared/library.ts'
import {sourceHref,type Source} from '../shared/agent.ts'
import type {ToolProfile} from './profile.ts'

type CreatePageArgument={title:string}&Partial<Omit<PageCreation,'title'>>
type BrowseArgument={project:number|null;offset:number}
type OperationArgument=BrowseArgument|TextRange|AttachmentQuery|string|number|CreatePageArgument|{id:number;title:string}|({id:number}&ParagraphEdit)

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
    if(command==='proposal_status'){
      const id=Number(arg)
      if(!Number.isSafeInteger(id)||id<=0)throw Error('Supply a positive request ID')
      const result=await api<{id:number;status:string;page:number|null;block:string|null}>('proposals/'+id+suffix)
      const url=result.page===null?null:origin+'/'+suffix+'&page='+result.page+(result.block?'&block='+encodeURIComponent(result.block):'')
      return {...result,url}
    }
    if(command==='propose_create')return api<{pending:number}>('proposals'+suffix,typeof arg==='object'?arg:{title:arg})
    if(command==='propose_edit' && typeof arg==='object' && 'before' in arg){
      const {id,...edit}=arg
      return api<{pending:number}>('proposals'+suffix,{page:id,edit})
    }
    if(command==='propose_rename' && typeof arg==='object' && 'title' in arg && 'id' in arg)return api<{pending:number}>('proposals'+suffix,{page:arg.id,title:arg.title})
    const link=<T extends {id:number;block?:string}>(page:T)=>({...page,url:origin+'/'+sourceHref(ws,page)})
    if(command==='search'){
      const hits=await api<Source[]>('search'+suffix+'&q='+encodeURIComponent(String(arg)))
      return hits.map(hit=>{
        const source=link(hit)
        if(!hit.attachment)return source
        const url=origin+'/api/pages/'+hit.id+'/files/'+hit.attachment.id+suffix
        return {...source,attachment:{...hit.attachment,url}}
      })
    }
    if(command==='read_text'&&typeof arg==='object'&&'block' in arg&&'offset' in arg){
      const {id,block,offset}=arg
      const query=block===null?'':'&block='+encodeURIComponent(block)
      const result=await api<TextPassage&{id:number;title:string}>('document-text'+suffix+'&id='+id+'&offset='+offset+query)
      return link({...result,...(block!==null?{block}:{surface:'canvas' as const})})
    }
    if(command==='read_attachment'&&typeof arg==='object'&&'file' in arg){
      const {id,file,offset}=arg
      const result=await api<AttachmentRead>('attachment-text'+suffix+'&id='+id+'&offset='+offset+(file===null?'':'&file='+file))
      if('files' in result)return result
      return {...result,url:origin+'/api/pages/'+id+'/files/'+file+suffix}
    }
    if(command==='read')return link(await api<{id:number;title:string;text:string;canvasText?:string;blocks:{id:string;text:string}[]}>('source'+suffix+'&blocks=1&id='+Number(arg)))
    if(command==='workspaces')return (await api<WorkspaceCatalog>('workspaces')).workspaces
    if(command==='projects')return api<Project[]>('projects'+suffix)
    if(command==='browse'&&typeof arg==='object'&&'project' in arg&&'offset' in arg){
      const folder=arg.project===null?'':'&project='+arg.project
      return api('projects/browse'+suffix+folder+'&offset='+arg.offset)
    }
    throw Error('Use workspaces, projects, browse [PROJECT_ID_OR_root] [OFFSET], search QUERY, read ID, read_text PAGE OFFSET [BLOCK], read_attachment PAGE [FILE_OR_list] [OFFSET], propose_create TITLE propose_rename ID TITLE propose_edit ID BLOCK BEFORE AFTER or proposal_status REQUEST_ID')
  }
}
