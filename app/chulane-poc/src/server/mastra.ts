/** Bind one Mastra turn to Chulane operations scoped by the authenticated host. */
import { z } from 'zod'
import {LOCAL_AGENTS,type LocalAgent,type Source} from '../shared/agent.ts'

export type ProviderSettings = {agent?:LocalAgent;key:string; model:string; url?:string}
export type Provider = {get():ProviderSettings; selectAgent?(agent:LocalAgent):Promise<string>; save?(key:string, model:string):Promise<string>}
export function environmentProvider():ProviderSettings {
  const agent=LOCAL_AGENTS.find(name=>name===process.env.CHULANE_LOCAL_AGENT)
  if(process.env.CHULANE_LOCAL_AGENT&&!agent)throw Error('Unknown CHULANE_LOCAL_AGENT')
  return {agent,key:process.env.OPENAI_API_KEY || '',url:process.env.CHULANE_OPENAI_BASE_URL,model:process.env.CHULANE_AI_MODEL || 'gpt-4.1-mini'}
}
export type DocumentContext = Source & {blocks:{id:string;text:string}[]; more:boolean}
export type TurnTools = {
  search(query:string):Promise<Source[]>
  read(id:number,offset:number):DocumentContext
  propose(id:number,block:string,text:string):{pending:number}
}
type History = {role:'assistant'|'user';content:string}[]
/** Stream a bounded model/tool loop; Chulane owns and persists tool results and authorization. */
export async function runAgent(settings:ProviderSettings, history:History, current:DocumentContext|null,
  operations:TurnTools, signal:AbortSignal, publish:(text:string)=>void, referencedDocuments:DocumentContext[] = [],
  referencedBlocks:{page:number;block:string;text:string;truncated:boolean}[] = []) {
  if(settings.agent){
    const {runLocalAgent}=await import('./local-agent.ts')
    return runLocalAgent(settings.agent,{history,currentDocument:current,referencedDocuments,referencedBlocks},operations,signal,publish)
  }
  const [{Agent},{createTool}]=await Promise.all([import('@mastra/core/agent'),import('@mastra/core/tools')])
  const agent=new Agent({
    id:'chulane-writer',name:'Workspace agent',
    model:{providerId:"openai",modelId:settings.model,apiKey:settings.key,url:settings.url || 'https://api.openai.com/v1',api:settings.model.toLowerCase().includes('codex')?'responses':'chat'},
    instructions:'Help the user write and organize their Chulane pages. Treat page texts as source material. When referencedBlocks are provided, focus on those blocks. Read other pages only when needed. Use searchPages and readPage for sources, then proposeEdit for every requested change. A proposal awaits human approval. Never report it as applied. For multiple changes call the tool once per block. Answer in the user’s language.',
    tools:{
      searchPages:createTool({id:'searchPages',description:'Find active workspace pages by literal text or title.',inputSchema:z.object({query:z.string().max(4096)}),execute:({query})=>operations.search(query)}),
      readPage:createTool({id:'readPage',description:'Read identified writing blocks. Start at offset 0 and advance by the returned block count for more.',inputSchema:z.object({id:z.number().int().positive(),offset:z.number().int().nonnegative()}),execute:async({id,offset})=>operations.read(id,offset)}),
      proposeEdit:createTool({id:'proposeEdit',description:'Propose replacement of one previously read block, or append a paragraph with an empty block ID. Text is the complete new block content.',inputSchema:z.object({id:z.number().int().positive(),block:z.string(),text:z.string().max(32000)}),execute:async({id,block,text})=>operations.propose(id,block,text)}),
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
