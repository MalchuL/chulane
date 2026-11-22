/** Workspace chat data exposed to the shared renderer. Keys stay in the host. */
export type Chat = {id:number; title:string; agent?:LocalAgent|null; canDelete:boolean}
export type AttachmentExcerpt={id:number;name:string;excerpt:string;matchOffset?:number}
export type Source = {id:number; title:string; surface?:'canvas'; block?:string; excerpt?:string; readFrom?:{block:string|null;offset:number}; attachment?:AttachmentExcerpt}
export type LibrarySearchHit=Source & {additionalAttachments?:AttachmentExcerpt[]}
export type CitationTarget=Pick<Source,'id'|'block'|'surface'>
/** Link to the surface that supplied the passage. Older citations open the page as before. */
export function sourceHref(workspace:number,source:CitationTarget){
  const query=new URLSearchParams({workspace:String(workspace),page:String(source.id)})
  if(source.block)query.set('block',source.block)
  else if(source.surface)query.set('view',source.surface)
  return '?'+query
}
export type BlockSource = Source & {block:string;excerpt:string}
export const MAX_BLOCK_LINKS=32
export type PluginDraft={name:string;nativeModule:string;rendererModule:string|null}
export type Message = {requestedBy?:string|null;pluginDraft?:PluginDraft;id:number; role:'assistant'|'user'; text:string; status:string; sources:Source[]}
export type EditPreview = {reviewedBy?:string|null;kind:'text'|'rename';id:number; message:number; page:number; title:string; block:string; before:string; after:string; status:string}
export type ProjectRequest={beforeName?:string|null;reviewedBy?:string|null;id:number;message:number;name:string;parent:number|null;parentName:string|null;reviewedPath?:string|null;project:number|null;status:string}
export type PageRequest={reviewedBy?:string|null;id:number;message:number;title:string;markdown:string;parent:number|null;parentName:string|null;reviewedPath?:string|null;page:number|null;status:string}
export type Conversation = {pages:PageRequest[];projects:ProjectRequest[];messages:Message[]; edits:EditPreview[]}
export type AppliedEdit = {base:string; delta:string; block:string}

/** Executables selected by the host. Browser requests can only name one of these installed agents. */
export const LOCAL_AGENTS=['codex','claude','hermes'] as const
export type LocalAgent=typeof LOCAL_AGENTS[number]
