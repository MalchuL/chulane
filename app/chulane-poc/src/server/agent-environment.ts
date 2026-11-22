/** The host lends one turn its authenticated workspace tools. Returning or cancellation ends access. */
import type {TextPassage} from '../shared/text-range.ts'
import type {AttachmentRead} from '../shared/attachment-read.ts'
import type {browseProject} from './projects.ts'
import type {ProviderSettings} from './mastra.ts'
import type {EditPreview,PageRequest,ProjectRequest,PluginDraft,Source} from '../shared/agent.ts'

export type DocumentContext = Source & {canvasText?:string;canvasTextTruncated?:boolean;canvasNextOffset?:number;blocks:{id:string;text:string;truncated?:boolean;nextOffset?:number}[]; more:boolean}
export type CitedAttachment={id:number;file:number;name:string;matchOffset?:number}
export type LinkedMessage={
  message:number
  role:'user'|'assistant'
  prompt:string
  links:Pick<Source,'id'|'title'|'block'|'surface'>[]
  attachments?:CitedAttachment[]
}
export type MessageReviews={
  message:number
  edits:(Pick<EditPreview,'id'|'page'|'title'|'block'|'kind'|'status'>&{proposedTitle:string|null})[]
  pages:Pick<PageRequest,'id'|'title'|'parent'|'parentName'|'reviewedPath'|'page'|'status'>[]
  projects:Pick<ProjectRequest,'id'|'name'|'beforeName'|'parent'|'parentName'|'reviewedPath'|'project'|'status'>[]
}
export type TurnTools = {
  listReviews(before:number|null):{messages:MessageReviews[];nextBefore:number|null}
  listLinkedMessages(before:number|null):{messages:LinkedMessage[];nextBefore:number|null}
  openPage?(id:number,block?:string|null,surface?:Source['surface']|null):DocumentContext
  readPluginDraft?(message:number|null):PluginDraft
  draftPlugin?(draft:PluginDraft):{drafted:boolean}
  proposeRename?(id:number,title:string):{pending:number}
  proposePage?(title:string,project:number|null,markdown:string):{pending:number}
  proposeProjectRename?(id:number,name:string):{pending:number}
  proposeProject?(name:string,parent:number|null):{pending:number}
  browse(project:number|null,offset:number):ReturnType<typeof browseProject>
  search(query:string):Promise<Source[]>
  readAttachment(id:number,file:number|null,offset:number):AttachmentRead
  readText(id:number,block:string|null,offset:number):TextPassage
  read(id:number,offsetOrBlock:number|string):DocumentContext
  propose?(id:number,block:string,text:string):{pending:number}
}

export type AgentTurn={
  settings:ProviderSettings
  history:{role:'user'|'assistant';content:string}[]
  current:DocumentContext|null
  referencedDocuments:DocumentContext[]
  referencedBlocks:{page:number;block:string;text:string;truncated:boolean;nextOffset?:number}[]
  tools:TurnTools
  signal:AbortSignal
  publish:(text:string)=>void
}

/** Execute one turn. Observe cancellation and resolve only after execution and cleanup have finished. */
export interface AgentEnvironment {
  run(turn:AgentTurn):Promise<void>
}
