/** Workspace library response shared by the renderer and external tools. */
import type {JournalCreation,ReviewedPageDraft} from './page-draft.ts'
import type {WorkspaceTagFields} from './tag-fields.ts'
export const memberRoles=['owner','editor','viewer'] as const
export type MemberRole=typeof memberRoles[number]
export type WorkspaceMember={id:number;name:string;role:MemberRole}
export type Item={id:number;name:string}
export type Project=Item & {parent:number|null;trashRoot:number|null}
export type Page={referenceBlockLengths?:number[];lastAttachmentId?:number|null;trashRevision?:number;hasFiles?:number;hasFieldValues?:number;availableOffline?:boolean;id:number;title:string;project:number|null;day:string|null;deleted:number;plain:string}
export type PageLink={source:number;target:number}
export type Tag=Item & {deleted:number}
export type TagApplication={tag:number;page:number;block:string}
export type ParagraphEdit={block:string;before:string;after:string}
export type ToolProposal={baseTitle?:string|null;draft?:ReviewedPageDraft|Pick<JournalCreation,'day'|'content'>|null;id:number;page:number|null;title:string;profile:string|null;requestedBy?:string|null;edit:ParagraphEdit|null}
export type DecisionKind='create'|'rename'|'replace'|'append'|'page'
export type ProposalDecision=ToolProposal & {titleAtApproval?:string|null;reviewedBy?:string|null;sequence:number;kind:DecisionKind;block:string|null;status:'approve'|'dismiss';decidedAt:string|null}
export type DecisionPage={items:ProposalDecision[];next:number|null}
export type WorkspaceInvitation=Item & {workspace:number;role:MemberRole}
export type WorkspaceCatalog={invitations?:WorkspaceInvitation[];serverAdmin?:boolean;deletedWorkspaces?:Item[];profile?:string;role:string;desktop:boolean;archivedWorkspaces?:Item[];workspaces:(Item & {timeZone:string;role?:string;restoration?:number})[]}
export type TitleConflict={id:number;page:number;title:string}
export type RemovedPage={id:number;day:string|null;title?:string}
export type Library=WorkspaceCatalog & {offlinePageLinks?:boolean;offlinePageTags?:boolean;presence?:boolean;namedReferences?:(PageLink & {name:string})[];installation?:string;tagFields?:WorkspaceTagFields;removedPages?:RemovedPage[];localJournalDays?:Page[];pendingMetadataRevision?:number;moveConflicts?:{id:number;page:number;project:number|null}[];projectNameConflicts?:(Item & {project:number})[];titleConflicts?:TitleConflict[];offline?:boolean;signInRequired?:boolean;replica?:string;owner:boolean;tags:Tag[];applications:TagApplication[];links:PageLink[];proposals:ToolProposal[];today:string;projects:Project[];pages:Page[]}

/** Use stable IDs when several destinations have the same visible text. Preserve original names for downloads. */
export function labeledReferences<T>(items:readonly T[],describe:(item:T)=>Item & {qualifier?:string}){
  const seen=new Set<string>(),repeated=new Set<string>()
  const references=items.map(item=>{
    const {name,id,qualifier}=describe(item)
    // Whitespace collapses in rendered HTML links.
    const visible=name.replace(/\s+/g,' ').trim()
    if(seen.has(visible))repeated.add(visible)
    seen.add(visible)
    return {item,name,visible,suffix:' · '+(qualifier??'#'+id)}
  })
  return references.map(({item,name,visible,suffix})=>{
    let label=name
    if(repeated.has(visible)){
      label=visible+suffix
      // A real filename or page title may already end with this exact ID suffix.
      while(seen.has(label))label+=suffix
    }
    return {item,label}
  })
}

/** Label attachment choices without changing the file passed to the download handler. */
export function labeledFiles<T extends Item>(files:readonly T[]){
  return labeledReferences(files,file=>file)
}

/** Prefer the device's pending journal document when the catalog already knows the same calendar day. */
export function libraryPages(lib:Library){
  if(!lib.localJournalDays?.length)return lib.pages
  const days=new Set(lib.localJournalDays.map(page=>page.day))
  return [...lib.pages.filter(page=>!page.day||!days.has(page.day)),...lib.localJournalDays]
}

/** Gregorian date on the workspace clock, independent of the browser and server process zones. */
export function workspaceDay(zone:string){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now())
}

/** Link to a project in the owning workspace so renaming the project preserves its address. */
export function projectHref(workspace:number,project:number){
  return '?'+new URLSearchParams({workspace:String(workspace),project:String(project)})
}

/** Walk active projects in library order. Callers can stop as soon as a search page is full. */
export function* projectPaths(projects:Project[]){
  const children=new Map<number|null,Project[]>()
  for(const project of projects){
    if(project.trashRoot!==null)continue
    const siblings=children.get(project.parent)
    if(siblings)siblings.push(project)
    else children.set(project.parent,[project])
  }
  // Keep the traversal off the call stack even for deeply nested imported projects.
  const stack=[{siblings:children.get(null)??[],index:0,prefix:''}]
  while(stack.length){
    const level=stack[stack.length-1]!
    const project=level.siblings[level.index++]
    if(!project){stack.pop();continue}
    const path=level.prefix+project.name
    yield {project,path,depth:stack.length-1}
    const siblings=children.get(project.id)
    if(siblings)stack.push({siblings,index:0,prefix:path+' / '})
  }
}

/** Preserve legacy replica IDs until a deletion has been reversed by the administrator. */
export function workspaceReplica(profile:string,workspace:number,restoration=0){
  return profile+'/'+workspace+(restoration?'~'+restoration:'')
}
