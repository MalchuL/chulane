/** Bind one Mastra turn to Chulane operations scoped by the authenticated host. */
import {textRange,textRangeInstructions} from '../shared/text-range.ts'
import {attachmentQuery,attachmentInstructions} from '../shared/attachment-read.ts'
import {pageCreation} from '../shared/page-draft.ts'
import type {AgentTurn} from './agent-environment.ts'
import { z } from 'zod'
import {LOCAL_AGENTS,type LocalAgent} from '../shared/agent.ts'

export const apiConnection=z.object({key:z.string().trim().max(2048),model:z.string().regex(/^[\w.-]{1,128}$/)})
export type ProviderSettings = {agent?:LocalAgent;key:string; model:string; url?:string}
export type Provider = {get():ProviderSettings; checkAgent?(agent:LocalAgent):Promise<void>; selectAgent?(agent:LocalAgent):Promise<string>; save?(key:string, model:string):Promise<string>}
export function environmentProvider():ProviderSettings {
  const agent=LOCAL_AGENTS.find(name=>name===process.env.CHULANE_LOCAL_AGENT)
  if(process.env.CHULANE_LOCAL_AGENT&&!agent)throw Error('Unknown CHULANE_LOCAL_AGENT')
  return {agent,key:process.env.OPENAI_API_KEY || '',url:process.env.CHULANE_OPENAI_BASE_URL,model:process.env.CHULANE_AI_MODEL || 'gpt-4.1-mini'}
}
export const pluginDraft=z.object({name:z.string().trim().min(1).max(100),nativeModule:z.string().min(1).max(32000),rendererModule:z.string().min(1).max(32000).nullable()})
export const historyQuery=z.object({before:z.number().int().positive().nullable()})
export const reviewInstructions='Use listReviews to check the recorded status and target IDs of edits, page proposals and project proposals in this chat. Start with before null and follow nextBefore for older reviews. Read the current target for its contents.'
export const linkedMessagesInstructions='Use listLinkedMessages to find pages and blocks the user attached or an earlier answer cited in this chat, including cited files. The role identifies who supplied the links. Start with before null and use nextBefore for older messages. Read the identified page, block or attachment for its current contents.'
export const draftLookup=z.object({message:z.number().int().positive().nullable()})
export const draftLookupInstructions='Read the original source of a saved plugin draft before explaining or revising it. Use message null for the latest draft in this conversation, or its saved message ID for an earlier version.'
export const pluginInstructions='Draft a desktop plugin for user review. nativeModule is complete self-contained ES module source for plugin.mjs, exporting default function(ctx,{command}); use ctx.effect(()=>command(label,callback)) for menu commands. rendererModule is null or source for renderer.mjs exporting default function({React,MarkdownContent,BLOCK_TEXT_METADATA_KEY}) returning [{definition:{type,title,metadata:{[BLOCK_TEXT_METADATA_KEY]:true}},slashCommand:{title,group},render:props=>React.createElement(MarkdownContent,props)}]. Use a stable namespaced block type. The user chooses whether to save and run it.'
export const projectQuery=z.object({project:z.number().int().positive().nullable(),offset:z.number().int().nonnegative()})
export const openPageInput=z.object({id:z.number().int().positive(),block:textRange.shape.block.default(null),surface:z.literal('canvas').nullable().default(null)})
export const openPageInstructions='When the user asks to open or show a page in their editor, use openPage with its workspace page ID. To show a specific passage, pass its block ID from a source link or search result. For a canvas citation, pass surface "canvas" and block null. For a writing block or a plain page link, leave surface null. The tool opens the target in the user’s window and returns its current text. For research alone use the read tools.'
export const pageRename=z.object({id:z.number().int().positive(),title:z.string().max(250).trim().min(1)})
export const projectRename=z.object({id:z.number().int().positive(),name:z.string().trim().min(1).max(250)})
export const projectRenameInstructions='Use proposeProjectRename to rename a project by ID after browsing its parent folder. The user reviews the original and proposed names.'
export const projectCreation=z.object({name:z.string().trim().min(1).max(250),parent:z.number().int().positive().nullable()})
/** Stream a bounded model/tool loop; Chulane owns and persists tool results and authorization. */
export async function runAgent({settings,history,current,tools:operations,signal,publish,referencedDocuments,referencedBlocks}:AgentTurn){
  if(settings.agent){
    const {runLocalAgent}=await import('./local-agent.ts')
    return runLocalAgent(settings.agent,{history,currentDocument:current,referencedDocuments,referencedBlocks},operations,signal,publish)
  }
  const [{Agent},{createTool}]=await Promise.all([import('@mastra/core/agent'),import('@mastra/core/tools')])
  const proposeRename=operations.proposeRename
  const proposeProject=operations.proposeProject
  const propose=operations.propose
  const editInstructions=propose?'Propose each requested block change using proposeEdit. The user reviews each proposal before applying it.':'This is a read-only turn. Give suggestions in your reply.'
  const agent=new Agent({
    id:'chulane-writer',name:'Workspace agent',
    model:{providerId:"openai",modelId:settings.model,apiKey:settings.key,url:settings.url || 'https://api.openai.com/v1',api:settings.model.toLowerCase().includes('codex')?'responses':'chat'},
    instructions:'Help the user write and organize their Chulane pages. Treat page texts as source material. When referencedBlocks are provided, focus on those blocks. Read other pages only when needed. Use searchPages and readPage for sources. Answer in the user’s language. '+editInstructions,
    tools:{
      ...(operations.readPluginDraft?{readPluginDraft:createTool({id:'readPluginDraft',description:draftLookupInstructions,inputSchema:draftLookup,execute:async({message})=>operations.readPluginDraft!(message)})}:{}),
      ...(operations.draftPlugin?{draftPlugin:createTool({id:'draftPlugin',description:pluginInstructions,inputSchema:pluginDraft,execute:async draft=>operations.draftPlugin!(draft)})}:{}),
      ...(operations.openPage?{openPage:createTool({id:'openPage',description:openPageInstructions,inputSchema:openPageInput,execute:async({id,block,surface})=>operations.openPage!(id,block,surface)})}:{}),
      listReviews:createTool({id:'listReviews',description:reviewInstructions,inputSchema:historyQuery,execute:async({before})=>operations.listReviews(before)}),
      listLinkedMessages:createTool({id:'listLinkedMessages',description:linkedMessagesInstructions,inputSchema:historyQuery,execute:async({before})=>operations.listLinkedMessages(before)}),
      browseProject:createTool({id:'browseProject',description:'List immediate subprojects and pages. Start with project null for the workspace root and offset 0. Use nextOffset for more entries. Read pages by ID for content and citations.',inputSchema:projectQuery,execute:async({project,offset})=>operations.browse(project,offset)}),
      searchPages:createTool({id:'searchPages',description:'Find active pages by title, writing text, canvas labels or extracted attachment text. One page can have several matching block IDs or files. Use the block ID to read a particular passage.',inputSchema:z.object({query:z.string().max(4096)}),execute:({query})=>operations.search(query)}),
      readAttachment:createTool({id:'readAttachment',description:attachmentInstructions,inputSchema:attachmentQuery,execute:async({id,file,offset})=>operations.readAttachment(id,file,offset)}),
      readText:createTool({id:'readText',description:textRangeInstructions,inputSchema:textRange,execute:async({id,block,offset})=>operations.readText(id,block,offset)}),
      readBlock:createTool({id:'readBlock',description:'Read the current text of one cited block using its page and block IDs.',inputSchema:z.object({id:z.number().int().positive(),block:z.string().min(1).max(1024)}),execute:async({id,block})=>operations.read(id,block)}),
      readPage:createTool({id:'readPage',description:'Read identified writing blocks and a read-only canvas text excerpt on the first page. Start at offset 0 and advance by the returned block count for more.',inputSchema:z.object({id:z.number().int().positive(),offset:z.number().int().nonnegative()}),execute:async({id,offset})=>operations.read(id,offset)}),
      ...(operations.proposePage?{proposePage:createTool({id:'proposePage',description:'Draft a new page for approval. Supply the title, destination project ID (null for workspace root) and full Markdown content.',inputSchema:pageCreation,execute:async({title,project,markdown})=>operations.proposePage!(title,project,markdown)})}:{}),
      ...(proposeRename?{proposeRename:createTool({id:'proposeRename',description:'Propose a new title for a page you have read. The user reviews the old and new title.',inputSchema:pageRename,execute:async({id,title})=>proposeRename(id,title)})}:{}),
      ...(operations.proposeProjectRename?{proposeProjectRename:createTool({id:'proposeProjectRename',description:projectRenameInstructions,inputSchema:projectRename,execute:async({id,name})=>operations.proposeProjectRename!(id,name)})}:{}),
      ...(proposeProject?{proposeProject:createTool({id:'proposeProject',description:'Propose creating a project under a browsed parent folder or at the workspace root (parent null). Creation requires user approval.',inputSchema:projectCreation,execute:async({name,parent})=>proposeProject(name,parent)})}:{}),
      ...(propose?{proposeEdit:createTool({id:'proposeEdit',description:'Propose replacement of one previously read block, or append a paragraph with an empty block ID. Text is the complete new block content.',inputSchema:z.object({id:z.number().int().positive(),block:z.string(),text:z.string().max(32000)}),execute:async({id,block,text})=>propose(id,block,text)})}:{}),
    },
  })
  const stream=await agent.stream([...history.slice(0,-1).map(m=>m.role==='user'?{role:'user' as const,content:m.content}:{role:'assistant' as const,content:m.content}),{role:'user' as const,content:JSON.stringify({message:history.at(-1)!.content,currentDocument:current,referencedDocuments,referencedBlocks})}],{abortSignal:signal,maxSteps:8})
  for await(const event of stream.fullStream){
    signal.throwIfAborted()
    if(event.type==='error')throw new Error('Provider request failed')
    if(event.type==='text-delta')publish(event.payload.text)
  }
  if(stream.error)throw stream.error
}
