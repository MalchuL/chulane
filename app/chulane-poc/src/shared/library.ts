/** Workspace library response shared by the renderer and external tools. */
import type {ReviewedPageDraft} from './page-draft.ts'
import type {WorkspaceTagFields} from './tag-fields.ts'
export const memberRoles=['owner','editor','viewer'] as const
export type MemberRole=typeof memberRoles[number]
export type WorkspaceMember={id:number;name:string;role:MemberRole}
export type Item={id:number;name:string}
export type Project=Item & {parent:number|null;trashRoot:number|null}
export type Page={trashRevision?:number;hasFiles?:number;hasFieldValues?:number;availableOffline?:boolean;id:number;title:string;project:number|null;day:string|null;deleted:number;plain:string}
export type PageLink={source:number;target:number}
export type Tag=Item & {deleted:number}
export type TagApplication={tag:number;page:number;block:string}
export type ParagraphEdit={block:string;before:string;after:string}
export type ToolProposal={draft?:ReviewedPageDraft|null;id:number;page:number|null;title:string;profile:string|null;requestedBy?:string|null;edit:ParagraphEdit|null}
export type DecisionKind='create'|'rename'|'replace'|'append'|'page'
export type ProposalDecision=ToolProposal & {reviewedBy?:string|null;sequence:number;kind:DecisionKind;block:string|null;status:'approve'|'dismiss';decidedAt:string|null}
export type DecisionPage={items:ProposalDecision[];next:number|null}
export type WorkspaceInvitation=Item & {workspace:number;role:MemberRole}
export type WorkspaceCatalog={invitations?:WorkspaceInvitation[];serverAdmin?:boolean;deletedWorkspaces?:Item[];profile?:string;role:string;desktop:boolean;archivedWorkspaces?:Item[];workspaces:(Item & {timeZone:string;role?:string;restoration?:number})[]}
export type TitleConflict={id:number;page:number;title:string}
export type RemovedPage={id:number;day:string|null;title?:string}
export type Library=WorkspaceCatalog & {installation?:string;tagFields?:WorkspaceTagFields;removedPages?:RemovedPage[];localJournalDays?:Page[];pendingRename?:number;moveConflicts?:{id:number;page:number;project:number|null}[];projectNameConflicts?:(Item & {project:number})[];titleConflicts?:TitleConflict[];offline?:boolean;signInRequired?:boolean;replica?:string;owner:boolean;tags:Tag[];applications:TagApplication[];links:PageLink[];proposals:ToolProposal[];today:string;projects:Project[];pages:Page[]}

/** Gregorian date on the workspace clock, independent of the browser and server process zones. */
export function workspaceDay(zone:string){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now())
}

/** Flatten active projects in parent-first order for navigation and destination pickers. */
export function projectPaths(projects:Project[]){
  const children=new Map<number|null,Project[]>()
  for(const project of projects){
    if(project.trashRoot!==null)continue
    const siblings=children.get(project.parent)
    if(siblings)siblings.push(project)
    else children.set(project.parent,[project])
  }
  const ordered:{project:Project;path:string;depth:number}[]=[]
  function visit(parent:number|null,prefix:string,depth:number){
    for(const project of children.get(parent)??[]){
      const path=prefix+project.name
      ordered.push({project,path,depth})
      visit(project.id,path+' / ',depth+1)
    }
  }
  visit(null,'',0)
  return ordered
}

/** Preserve legacy replica IDs until a deletion has been reversed by the administrator. */
export function workspaceReplica(profile:string,workspace:number,restoration=0){
  return profile+'/'+workspace+(restoration?'~'+restoration:'')
}
