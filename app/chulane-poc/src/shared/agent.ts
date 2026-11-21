/** Workspace chat data exposed to the shared renderer. Keys stay in the host. */
export type Chat = {id:number; title:string}
export type Source = {id:number; title:string; block?:string; excerpt?:string}
export type BlockSource = Source & {block:string;excerpt:string}
export const MAX_BLOCK_LINKS=32
export type Message = {id:number; role:'assistant'|'user'; text:string; status:string; sources:Source[]}
export type EditPreview = {id:number; message:number; page:number; title:string; block:string; before:string; after:string; status:string}
export type Conversation = {messages:Message[]; edits:EditPreview[]}
export type AppliedEdit = {base:string; delta:string; block:string}

/** Executables selected by the host. Browser requests can only name one of these installed agents. */
export const LOCAL_AGENTS=['codex','claude','hermes'] as const
export type LocalAgent=typeof LOCAL_AGENTS[number]
