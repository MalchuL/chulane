/** The host lends one turn its authenticated workspace tools. Returning or cancellation ends access. */
import type {PropertyBatch,PropertyQuery} from '../shared/tag-fields.ts'
import type {CanvasEdit} from '../shared/agent-canvas.ts'
import type {inspectCanvas} from './agent-canvas.ts'
import type {AgentMode} from '../shared/agent.ts'
import type {ActivityEvent} from './chat-activity.ts'
import type {LinkedPages,LinkDirection} from '../shared/page-links.ts'
import type {JournalList} from '../shared/page-draft.ts'
import type {TextPassage} from '../shared/text-range.ts'
import type {AttachmentRead,AttachmentQuery} from '../shared/attachment-read.ts'
import type {ProjectLookup} from '../shared/project-lookup.ts'
import type {browseProject,findProjects} from './projects.ts'
import type {ProviderSettings} from './mastra.ts'
import type {EditPreview,PageRequest,ProjectRequest,PluginDraft,Source} from '../shared/agent.ts'

export type DescriptionPreview={description?:string;descriptionNextOffset?:number}
export type DocumentContext = Source & {canvas?:ReturnType<typeof inspectCanvas>;canvasText?:string;canvasTextTruncated?:boolean;canvasNextOffset?:number;blocks:({id:string;text:string;truncated?:boolean;nextOffset?:number}&DescriptionPreview)[]; more:boolean;nextBlockOffset:number|null}
export type CitedAttachment={id:number;file:number;name:string;matchOffset?:number;readOffset?:number}
export type LinkedMessage={
  message:number
  role:'user'|'assistant'
  prompt:string
  links:Pick<Source,'id'|'title'|'block'|'surface'|'readFrom'>[]
  attachments?:CitedAttachment[]
}
export type MessageReviews={
  message:number
  edits:(Pick<EditPreview,'id'|'page'|'title'|'block'|'requestedBlock'|'kind'|'status'>&{proposedTitle:string|null})[]
  pages:Pick<PageRequest,'id'|'title'|'parent'|'parentName'|'reviewedPath'|'page'|'status'>[]
  projects:Pick<ProjectRequest,'id'|'name'|'beforeName'|'parent'|'parentName'|'reviewedPath'|'project'|'status'>[]
}
export type ToolDecision={pending:number}|{applied:number;block?:string;element?:string;page?:number;project?:number}
export type TurnTools = {
  readCanvas?(id:number,offset:number):ReturnType<typeof inspectCanvas>
  editCanvas?(edit:CanvasEdit):ToolDecision
  listReviews(before:number|null):{messages:MessageReviews[];nextBefore:number|null}
  listLinkedMessages(before:number|null):{messages:LinkedMessage[];nextBefore:number|null}
  openPage?(id:number,block?:string|null,surface?:Source['surface']|null):DocumentContext
  readPluginDraft?(message:number|null):PluginDraft
  draftPlugin?(draft:PluginDraft):{drafted:boolean}
  proposeRename?(id:number,title:string):ToolDecision
  proposePage?(title:string,project:number|null,markdown:string):ToolDecision
  proposeProjectRename?(id:number,name:string):ToolDecision
  proposeProject?(name:string,parent:number|null):ToolDecision
  findProjects(name:string,offset:number,match?:ProjectLookup['match']):ReturnType<typeof findProjects>
  browse(project:number|null,offset:number,name?:string|null):ReturnType<typeof browseProject>
  search(query:string):Promise<Source[]>
  readAttachment(id:number,file:AttachmentQuery['file'],offset:number):AttachmentRead
  readText(id:number,block:string|null,offset:number,message?:number|null,field?:'description'|null):TextPassage
  readProperties(query:PropertyQuery):PropertyBatch
  listPageLinks(id:number,after:number,direction?:LinkDirection):LinkedPages
  listJournal(before:string|null):JournalList
  readJournalDay(day:string):DocumentContext|null
  read(id:number,offsetOrBlock:number|string):DocumentContext
  propose?(id:number,block:string,text:string):ToolDecision
}

export type AgentTurn={
  mode?:AgentMode
  settings:ProviderSettings
  history:{role:'user'|'assistant';content:string}[]
  workspaceCalendar:{today:string;timeZone:string}
  current:DocumentContext|null
  referencedDocuments:DocumentContext[]
  referencedBlocks:({page:number;day?:string;block:string;text:string;truncated:boolean;nextOffset?:number}&DescriptionPreview)[]
  tools:TurnTools
  signal:AbortSignal
  activity?:(event:ActivityEvent)=>void
  publish:(text:string)=>void
}

/** Execute one turn. Observe cancellation and resolve only after execution and cleanup have finished. */
export interface AgentEnvironment {
  run(turn:AgentTurn):Promise<void>
}
