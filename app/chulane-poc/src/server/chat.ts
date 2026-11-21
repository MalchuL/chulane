/** SQLite owns conversations, partial responses and review decisions. Every request supplies its authenticated workspace. */
import type { DatabaseSync } from 'node:sqlite'
import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import { agentDocument, type PageBody } from './agent-document.ts'
import { environmentProvider, runAgent, type Provider, type DocumentContext } from './mastra.ts'
import type { PageRetriever, SearchablePage } from './retrieval.ts'
import {LOCAL_AGENTS,MAX_BLOCK_LINKS,type Source} from '../shared/agent.ts'

function reject(status:number, message:string):never { throw Object.assign(new Error(message),{status}) }
function valid<T>(schema:z.ZodType<T>, data:unknown):T {
  const parsed=schema.safeParse(data)
  return parsed.success ? parsed.data : reject(400,'Invalid agent request')
}
type Drafts = Map<number,{rev:number;state:Buffer}>
/** Install the agent storage and return request and shutdown operations owned by this service. */
export function workspaceAgent(db:DatabaseSync,drafts:Drafts,retriever:PageRetriever,provider:Provider={get:environmentProvider}){
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats(id INTEGER PRIMARY KEY, workspace INTEGER NOT NULL REFERENCES workspaces, title TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY, chat INTEGER NOT NULL REFERENCES chats, role TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, sources TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS chat_edits(id INTEGER PRIMARY KEY,message INTEGER NOT NULL REFERENCES chat_messages,page INTEGER NOT NULL REFERENCES pages,title TEXT NOT NULL,block TEXT NOT NULL,before TEXT NOT NULL,after TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
    UPDATE chat_messages SET status='interrupted' WHERE status='running';`)
  const runs=new Map<number,AbortController>()
  function body(ws:number,id:number):PageBody {
    const row=db.prepare('SELECT id,title,state,plain FROM pages WHERE id=? AND workspace=? AND deleted=0').get(id,ws)
    if(!row)reject(404,'Page unavailable')
    return {...row,state:drafts.get(id)?.state ?? row.state} as PageBody
  }
  async function handle(path:string,method:string,ws:number,input:()=>Promise<unknown>,res:ServerResponse){
    if(path==='/api/agent' && method==='GET'){
      const settings=provider.get()
      return {configured:!!(settings.agent||settings.key),agent:settings.agent,hasApiKey:!!settings.key,localAgents:provider.selectAgent?LOCAL_AGENTS:[],model:settings.model,configurable:!!provider.save,chats:db.prepare('SELECT id,title FROM chats WHERE workspace=? ORDER BY id DESC').all(ws)}
    }
    if(path==='/api/agent/provider' && method==='POST'){
      if(!provider.save)reject(403,'The server operator configures the provider')
      const data=await input()
      const selection=z.object({agent:z.enum(LOCAL_AGENTS)}).safeParse(data)
      if(selection.success){
        if(!provider.selectAgent)reject(403,'Only the host can select a local agent')
        return {message:await provider.selectAgent(selection.data.agent)}
      }
      const {key,model}=valid(z.object({key:z.string().trim().max(2048),model:z.string().regex(/^[\w.-]{1,128}$/)}),data)
      const apiKey=key||provider.get().key
      if(!apiKey)reject(400,'Enter an OpenAI API key')
      return {message:await provider.save(apiKey,model)}
    }
    if(path==='/api/agent/chats' && method==='POST')
      return {id:Number(db.prepare("INSERT INTO chats(workspace,title) VALUES(?,'New chat')").run(ws).lastInsertRowid)}
    const route=/^\/api\/agent\/chats\/(\d+)(?:\/(turn|edits)(?:\/(\d+)\/(apply|dismiss))?)?$/.exec(path)
    if(!route)reject(404,'Unknown chat operation')
    const chat=Number(route[1])
    if(!db.prepare('SELECT id FROM chats WHERE id=? AND workspace=?').get(chat,ws))reject(404,'Chat unavailable')
    if(!route[2] && method==='GET')return {
      messages:db.prepare('SELECT id,role,text,status,sources FROM chat_messages WHERE chat=? ORDER BY id').all(chat).map(m=>({...m,sources:JSON.parse(String(m.sources))})),
      edits:db.prepare('SELECT e.* FROM chat_edits e JOIN chat_messages m ON m.id=e.message WHERE m.chat=? ORDER BY e.id').all(chat),
    }
    if(route[2]==='edits' && route[3] && method==='POST'){
      const edit=db.prepare('SELECT e.* FROM chat_edits e JOIN chat_messages m ON m.id=e.message WHERE m.chat=? AND e.id=?').get(chat,Number(route[3]))
      if(!edit || edit.status!=='pending')reject(409,'This proposal is no longer pending')
      if(route[4]==='dismiss'){db.prepare("UPDATE chat_edits SET status='dismissed' WHERE id=?").run(edit.id);return {}}
      const page=body(ws,Number(edit.page))
      const changed=agentDocument(page,{page:page.id,block:String(edit.block),before:String(edit.before),after:String(edit.after)})
      if(changed.state!.length+Buffer.byteLength(changed.plain)>16*1024*1024)reject(413,'Edited document exceeds the size limit')
      db.exec('BEGIN IMMEDIATE')
      try{
        db.prepare('UPDATE pages SET state=?,plain=?,rev=rev+1 WHERE id=?').run(changed.state!,changed.plain,page.id)
        db.prepare("UPDATE chat_edits SET status='applied',block=? WHERE id=?").run(changed.changedBlock!,edit.id)
        db.exec('COMMIT')
      }catch(error){db.exec('ROLLBACK');throw error}
      drafts.delete(page.id)
      return {base:Buffer.from(changed.base!).toString('base64'),delta:Buffer.from(changed.delta!).toString('base64'),block:changed.changedBlock}
    }
    if(route[2]!=='turn' || route[3] || method!=='POST')reject(405,'Chat operation unavailable')
    const {text,page,references,blockLinks}=valid(z.object({text:z.string().trim().min(1).max(12000),page:z.number().int().positive().nullable(),references:z.array(z.number().int().positive()).max(3).default([]),blockLinks:z.array(z.object({id:z.number().int().positive(),block:z.string().min(1).max(1024)})).max(MAX_BLOCK_LINKS).default([])}),await input())
    const config=provider.get()
    if(!config.agent&&!config.key)reject(503,'Configure the OpenAI provider to start a turn')
    if(runs.has(chat))reject(409,'A turn is already running in this chat')
    if(page!==null)body(ws,page)
    const attached=[...new Set(references)].filter(id=>id!==page).map(id=>{const target=body(ws,id);return {id,title:target.title}})
    // Resolve each linked page once, before accepting the turn. Only stable identities come from the client.
    const linkedPages=new Map<number,{title:string;blocks:Map<string,string>}>()
    const linkedSources:Source[]=[]
    const referencedBlocks:{page:number;block:string;text:string;truncated:boolean}[]=[]
    for(const {id,block} of blockLinks){
      if(referencedBlocks.some(item=>item.page===id && item.block===block))continue
      let target=linkedPages.get(id)
      if(!target){
        const pageBody=body(ws,id)
        target={title:pageBody.title,blocks:new Map(agentDocument(pageBody).blocks.map(b=>[b.id,b.text]))}
        linkedPages.set(id,target)
      }
      const content=target.blocks.get(block)
      if(content===undefined)reject(409,'A linked block is unavailable. Remove its link and try again.')
      const text=content.slice(0,2400)
      referencedBlocks.push({page:id,block,text,truncated:text!==content})
      linkedSources.push({id,title:target.title,block,excerpt:content.slice(0,60)||'Empty block'})
    }
    const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])
    const close=()=>controller.abort()
    const sources=new Map<number,Source>(), observed=new Map<number,Map<string,string>>()
    const add=db.prepare('INSERT INTO chat_messages(chat,role,text,status) VALUES(?,?,?,?)')
    db.exec('BEGIN IMMEDIATE')
    let message:number
    try{
      db.prepare("UPDATE chats SET title=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM chat_messages WHERE chat=?)").run(text.slice(0,64),chat,chat)
      const user=add.run(chat,'user',text,'sent')
      db.prepare('UPDATE chat_messages SET sources=? WHERE id=?').run(JSON.stringify([...attached,...linkedSources]),user.lastInsertRowid)
      message=Number(add.run(chat,'assistant','','running').lastInsertRowid)
      db.exec('COMMIT')
    }catch(error){db.exec('ROLLBACK');throw error}
    runs.set(chat,controller);res.once('close',close)
    res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'})
    const notify=(event:object)=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n')}
    try{
      const read=(id:number,offset:number):DocumentContext=>{
        signal.throwIfAborted()
        const target=body(ws,id), all=agentDocument(target).blocks
        const blocks:{id:string;text:string}[]=[]
        let budget=24000
        for(const block of all.slice(offset,offset+40)){
          const text=block.text.slice(0,12000)
          if(blocks.length && text.length>budget)break
          blocks.push({id:block.id,text});budget-=text.length
        }
        const known=observed.get(id) ?? new Map<string,string>()
        blocks.forEach((b,i)=>{known.delete(b.id);if(b.text===all[offset+i].text)known.set(b.id,b.text)})
        observed.set(id,known);sources.set(id,{id,title:target.title})
        db.prepare('UPDATE chat_messages SET sources=? WHERE id=?').run(JSON.stringify([...sources.values()]),message)
        return {id,title:target.title,blocks,more:offset+blocks.length<all.length}
      }
      notify({message})
      const current=page===null?null:read(page,0)
      const referencedDocuments=attached.map(source=>read(source.id,0))
      const history=db.prepare("SELECT id,role,text AS content FROM chat_messages WHERE chat=? AND id<? AND text<>'' ORDER BY id DESC LIMIT 24").all(chat,message).reverse() as {id:number;role:'assistant'|'user';content:string}[]
      for(const item of history){
        if(item.role==='assistant'){
          const decisions=db.prepare('SELECT title,block,status FROM chat_edits WHERE message=?').all(item.id)
          if(decisions.length)item.content+='\nRecorded edit decisions: '+JSON.stringify(decisions)
        }
      }
      await runAgent(config,history,current,{
        read,
        async search(query){
          signal.throwIfAborted()
          const pages=db.prepare('SELECT id,title,plain FROM pages WHERE workspace=? AND deleted=0').all(ws) as SearchablePage[]
          const matches=await retriever.search(ws,query,pages)
          const ids=new Set(matches)
          return pages.filter(p=>ids.has(p.id)).slice(0,30).map(({id,title})=>({id,title}))
        },
        propose(id,block,after){
          signal.throwIfAborted()
          const target=body(ws,id),known=observed.get(id)
          if(!known || (block && !known.has(block)))reject(409,'Read the complete target block before proposing an edit')
          const before=block?known.get(block)!:''
          if(after===before)reject(400,'The edit makes no change')
          const result=db.prepare('INSERT INTO chat_edits(message,page,title,block,before,after) VALUES(?,?,?,?,?,?)').run(message,id,target.title,block,before,after)
          notify({proposal:Number(result.lastInsertRowid)})
          return {pending:Number(result.lastInsertRowid)}
        },
      },signal,delta=>{
        db.prepare('UPDATE chat_messages SET text=text||? WHERE id=?').run(delta,message)
        notify({message,delta})
      },referencedDocuments,referencedBlocks)
      signal.throwIfAborted()
      db.prepare("UPDATE chat_messages SET status='complete' WHERE id=?").run(message)
    }catch{
      const status=signal.aborted?'interrupted':'failed'
      db.prepare('UPDATE chat_messages SET status=? WHERE id=?').run(status,message)
      notify({error:status==='failed'?(config.agent?'Local '+config.agent+' request failed. Check the CLI version, login and connection.':'Provider request failed. Verify the host API key, model, network and quota.'):'Turn interrupted'})
    }finally{
      runs.delete(chat);res.off('close',close);if(!res.destroyed)res.end()
    }
  }
  return {handle,stop(){for(const controller of runs.values())controller.abort()},async settle(){while(runs.size)await new Promise(done=>setTimeout(done,20))}}
}
