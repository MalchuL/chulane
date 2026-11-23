/** Workspace chat data exposed to the shared renderer. Keys stay in the host. */
export const agentModes=['ask','suggest','append','full'] as const
export type AgentMode=typeof agentModes[number]
export const modeDescriptions:Record<AgentMode,string>={
  ask:'Read and answer questions.',
  suggest:'Review each workspace change before applying it.',
  append:'New paragraphs and canvas elements are applied immediately. Other changes need approval.',
  full:'Apply supported page, project and canvas edits immediately with your workspace permissions.',
}
export type Chat = {id:number; title:string; agent?:LocalAgent|null; canDelete:boolean;running?:boolean;queued?:number;latest?:number}
export type AttachmentExcerpt={matchedFilename?:true;id:number;name:string;excerpt:string;matchOffset?:number}
export type Source = {id:number; title:string; day?:string|null; surface?:'canvas'; block?:string; excerpt?:string; excerptOffset?:number; readFrom?:{block:string|null;offset:number;field?:'description'}; attachment?:AttachmentExcerpt & {readOffset?:number}}
/** Include the permanent calendar date on journal sources, even when their display title changes. */
export function pageSource({id,title,day}:Pick<Source,'id'|'title'|'day'>){
  return {id,title,...(day&&{day})}
}
export type LibraryAttachmentHit=AttachmentExcerpt & {availableOffline?:boolean}
export type LibrarySearchHit=Omit<Source,'attachment'> & {attachment?:LibraryAttachmentHit;additionalAttachments?:LibraryAttachmentHit[]}
export type CitationTarget=Pick<Source,'id'|'block'|'surface'>
export type DocumentTarget=Pick<CitationTarget,'id'|'block'> & {surface?:'page'|'canvas'}
/** Link to the surface that supplied the passage. Older citations open the page as before. */
export function sourceHref(workspace:number,source:DocumentTarget){
  const query=new URLSearchParams({workspace:String(workspace),page:String(source.id)})
  if(source.block)query.set('block',source.block)
  else if(source.surface)query.set('view',source.surface)
  return '?'+query
}
export type BlockSource = Source & {block:string;excerpt:string}
export const MAX_PAGE_REFERENCES=3
export const MAX_BLOCK_LINKS=32
export type PluginDraft={name:string;nativeModule:string;rendererModule:string|null}
export type ChatActivity={id:number;offset:number;revision:number;kind:'reasoning'|'commentary'|'progress'|'tool';state:'running'|'done'|'failed';name:string;input:string;detail:string}
export type Message = {mode?:AgentMode|null;activity?:ChatActivity[];requestedBy?:string|null;pluginDraft?:PluginDraft;id:number; role:'assistant'|'user'; text:string; status:string; sources:Source[]}
export type EditPreview = {requestedBlock?:string|null;reviewedTitle?:string|null;reviewedBy?:string|null;kind:'text'|'rename'|'canvas';id:number; message:number; page:number; title:string; block:string; before:string; after:string; status:string}
export type ProjectRequest={beforeName?:string|null;reviewedBy?:string|null;id:number;message:number;name:string;parent:number|null;parentName:string|null;reviewedPath?:string|null;project:number|null;status:string}
export type PageRequest={reviewedBy?:string|null;id:number;message:number;title:string;markdown:string;parent:number|null;parentName:string|null;reviewedPath?:string|null;page:number|null;status:string}
export type QueuedTurn={id:number;revision:number;mine:boolean;error:string|null;turn:{text:string;page:number|null;surface?:'page'|'canvas';mode?:AgentMode;background:boolean;references:number[];blockLinks:{id:number;block:string;excerpt?:string}[]}}
export type Conversation = {queue?:QueuedTurn[];canStop?:boolean;pages:PageRequest[];projects:ProjectRequest[];messages:Message[]; edits:EditPreview[]}
export type AppliedEdit = {page:number; base:string; delta:string; block:string}

/** Executables selected by the host. Browser requests can only name one of these installed agents. */
export const LOCAL_AGENTS=['codex','claude','hermes'] as const
export type LocalAgent=typeof LOCAL_AGENTS[number]
