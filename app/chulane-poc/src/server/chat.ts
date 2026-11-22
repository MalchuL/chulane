/** SQLite owns conversations, partial responses and review decisions. Every request supplies its authenticated workspace. */
import type { DatabaseSync } from 'node:sqlite'
import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import type {reviewedDocuments} from './reviewed-documents.ts'
import {textPrefix} from '../shared/document-text.ts'
import {readAttachment} from './attachment-text.ts'
import { agentDocument } from './agent-document.ts'
import { apiConnection, pageRename, pluginDraft, environmentProvider, runAgent, type Provider } from './mastra.ts'
import {createMarkdownPage,reviewPageDraft} from './markdown.ts'
import {renamePage} from './page-titles.ts'
import {requireRequesterWrite} from './accounts.ts'
import type {AgentEnvironment,AgentTurn,CitedAttachment,DocumentContext,LinkedMessage,MessageReviews} from './agent-environment.ts'
import {browseProject,confirmProjectPath,createProject,projectName,renameProject,reviewProjectPath} from './projects.ts'
import {searchWorkspace,type PageRetriever} from './retrieval.ts'
import {LOCAL_AGENTS,MAX_BLOCK_LINKS,type PluginDraft,type Source} from '../shared/agent.ts'

const foregroundEnvironment:AgentEnvironment={run:runAgent}

/** Keep historical file references small. Reading a cited passage checks current workspace access. */
function citedAttachments(sources:Source[]):CitedAttachment[]{
  return sources.flatMap(({id,attachment})=>attachment
    ?[{id,file:attachment.id,name:attachment.name,matchOffset:attachment.matchOffset}]:[])
}

export type SavePluginFolder=(draft:PluginDraft,authorize:()=>void)=>Promise<string|null>
type ChatActor={savePlugin?:SavePluginFolder;account:number|null;owner:boolean;write:boolean}

function reject(status:number, message:string):never { throw Object.assign(new Error(message),{status}) }
function valid<T>(schema:z.ZodType<T>, data:unknown):T {
  const parsed=schema.safeParse(data)
  return parsed.success ? parsed.data : reject(400,'Invalid agent request')
}
/** Install the agent storage and return request and shutdown operations owned by this service. */
export function workspaceAgent(db:DatabaseSync,documents:ReturnType<typeof reviewedDocuments>,retriever:PageRetriever,provider:Provider={get:environmentProvider},backgroundEnvironment:AgentEnvironment=foregroundEnvironment){
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats(id INTEGER PRIMARY KEY, workspace INTEGER NOT NULL REFERENCES workspaces, title TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY, chat INTEGER NOT NULL REFERENCES chats, role TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, sources TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS chat_edits(id INTEGER PRIMARY KEY,message INTEGER NOT NULL REFERENCES chat_messages,page INTEGER NOT NULL REFERENCES pages,title TEXT NOT NULL,block TEXT NOT NULL,before TEXT NOT NULL,after TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS chat_page_requests(id INTEGER PRIMARY KEY,message INTEGER NOT NULL REFERENCES chat_messages ON DELETE CASCADE,
      title TEXT NOT NULL,markdown TEXT NOT NULL,parent INTEGER REFERENCES projects,parentName TEXT,page INTEGER REFERENCES pages,status TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS chat_project_requests(id INTEGER PRIMARY KEY,message INTEGER NOT NULL REFERENCES chat_messages ON DELETE CASCADE,
      name TEXT NOT NULL,parent INTEGER REFERENCES projects,parentName TEXT,project INTEGER REFERENCES projects,status TEXT NOT NULL DEFAULT 'pending');
    CREATE INDEX IF NOT EXISTS linked_chat_messages ON chat_messages(chat,id) WHERE role='user' AND sources<>'[]';
    UPDATE chat_messages SET status='unknown' WHERE status='running';`)
  if(!db.prepare('PRAGMA table_info(chat_edits)').all().some(column=>column.name==='kind'))
    db.exec("ALTER TABLE chat_edits ADD COLUMN kind TEXT NOT NULL DEFAULT 'text' CHECK(kind IN ('text','rename'))")
  if(!db.prepare('PRAGMA table_info(chats)').all().some(column=>column.name==='author')){
    db.exec('BEGIN IMMEDIATE')
    try{
      db.exec("ALTER TABLE chats ADD COLUMN author TEXT; ALTER TABLE chats ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0; UPDATE chats SET author='shared-key' WHERE workspace IN (SELECT id FROM workspaces WHERE accessMode='key')")
      db.exec('COMMIT')
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  if(!db.prepare('PRAGMA table_info(chat_messages)').all().some(column=>column.name==='background'))
    db.exec('ALTER TABLE chat_messages ADD COLUMN background INTEGER NOT NULL DEFAULT 0')
  for(const table of ['chat_project_requests','chat_page_requests']){
    if(!db.prepare(`PRAGMA table_info(${table})`).all().some(column=>column.name==='reviewedPath'))
      db.exec(`ALTER TABLE ${table} ADD COLUMN reviewedPath TEXT`)
  }
  if(!db.prepare('PRAGMA table_info(chat_project_requests)').all().some(column=>column.name==='beforeName'))
    db.exec('ALTER TABLE chat_project_requests ADD COLUMN beforeName TEXT')
  for(const table of ['chat_edits','chat_page_requests','chat_project_requests']){
    db.exec(`CREATE INDEX IF NOT EXISTS ${table}_by_message ON ${table}(message)`)
    if(!db.prepare(`PRAGMA table_info(${table})`).all().some(column=>column.name==='reviewer'))
      db.exec(`ALTER TABLE ${table} ADD COLUMN reviewer INTEGER REFERENCES accounts(id)`)
  }
  if(!db.prepare('PRAGMA table_info(chat_messages)').all().some(column=>column.name==='requester'))
    db.exec('ALTER TABLE chat_messages ADD COLUMN requester INTEGER REFERENCES accounts(id)')
  db.exec('CREATE INDEX IF NOT EXISTS chat_message_history ON chat_messages(chat,id)')
  if(!db.prepare('PRAGMA table_info(chats)').all().some(column=>column.name==='localAgent'))
    db.exec('ALTER TABLE chats ADD COLUMN localAgent TEXT')
  if(!db.prepare('PRAGMA table_info(chat_messages)').all().some(column=>column.name==='pluginDraft'))
    db.exec('ALTER TABLE chat_messages ADD COLUMN pluginDraft TEXT')
  const runs=new Map<number,{workspace:number;controller:AbortController;canRun:()=>boolean;finished:Promise<void>}>()
  let stopped=false
  const body=documents.read
  async function handle(path:string,method:string,ws:number,input:(limit?:number,allowEmpty?:boolean)=>Promise<unknown>,res:ServerResponse,canRun:()=>boolean,actor:ChatActor){
    const author=actor.account===null?'shared-key':String(actor.account)
    if(path==='/api/agent' && method==='GET'){
      const settings=provider.get()
      return {canSavePlugin:!!actor.savePlugin,configured:!!(settings.agent||settings.key),agent:settings.agent,hasApiKey:!!settings.key,localAgents:provider.selectAgent?LOCAL_AGENTS:[],model:settings.model,configurable:!!provider.save,chats:db.prepare('SELECT id,title,author,localAgent FROM chats WHERE workspace=? AND deleted=0 ORDER BY id DESC').all(ws).map(row=>({id:row.id,title:row.title,agent:provider.checkAgent?LOCAL_AGENTS.find(agent=>agent===row.localAgent):undefined,canDelete:actor.write&&(actor.owner||author===row.author)}))}
    }
    if(path==='/api/agent/tasks'&&method==='GET')return db.prepare(`SELECT m.id,m.chat,m.status,
      COALESCE((SELECT substr(u.text,1,100) FROM chat_messages u WHERE u.chat=m.chat AND u.id<m.id AND u.role='user' ORDER BY u.id DESC LIMIT 1),c.title) AS title,
      (EXISTS(SELECT 1 FROM chat_edits e WHERE e.message=m.id AND e.status='pending') OR EXISTS(SELECT 1 FROM chat_project_requests r WHERE r.message=m.id AND r.status='pending') OR EXISTS(SELECT 1 FROM chat_page_requests p WHERE p.message=m.id AND p.status='pending')) AS pending
      FROM chat_messages m JOIN chats c ON c.id=m.chat WHERE c.workspace=? AND c.deleted=0 AND m.background=1 ORDER BY m.id DESC`).all(ws)
    const cancel=/^\/api\/agent\/tasks\/(\d+)\/cancel$/.exec(path)
    if(cancel&&method==='POST'){
      const task=db.prepare('SELECT m.chat,m.status FROM chat_messages m JOIN chats c ON c.id=m.chat WHERE c.workspace=? AND c.deleted=0 AND m.id=? AND m.background=1').get(ws,Number(cancel[1]))
      if(!task)reject(404,'Task unavailable')
      if(task.status==='running')runs.get(Number(task.chat))?.controller.abort('cancelled')
      return {}
    }
    if(path==='/api/agent/provider' && method==='POST'){
      if(!provider.save)reject(403,'The server operator configures the provider')
      const data=await input()
      const selection=z.object({agent:z.enum(LOCAL_AGENTS)}).safeParse(data)
      if(selection.success){
        if(!provider.selectAgent)reject(403,'Only the host can select a local agent')
        return {message:await provider.selectAgent(selection.data.agent)}
      }
      const {key,model}=valid(apiConnection,data)
      const apiKey=key||provider.get().key
      if(!apiKey)reject(400,'Enter an OpenAI API key')
      return {message:await provider.save(apiKey,model)}
    }
    if(path==='/api/agent/chats' && method==='POST')
      return {id:Number(db.prepare("INSERT INTO chats(workspace,title,author) VALUES(?,'New chat',?)").run(ws,author).lastInsertRowid)}
    const route=/^\/api\/agent\/chats\/(\d+)(?:\/(turn|edits|pages|projects|provider|plugins)(?:\/(\d+)\/(apply|dismiss|save))?)?$/.exec(path)
    if(!route)reject(404,'Unknown chat operation')
    const chat=Number(route[1])
    const getChat=db.prepare('SELECT author,localAgent FROM chats WHERE id=? AND workspace=? AND deleted=0')
    const conversation=getChat.get(chat,ws)
    if(!conversation)reject(404,'Chat unavailable')
    if(route[2]==='plugins'&&route[3]&&route[4]==='save'&&method==='POST'){
      if(!actor.savePlugin||!canRun())reject(403,'Save plugin folders from a local desktop workspace.')
      const row=db.prepare("SELECT pluginDraft FROM chat_messages WHERE id=? AND chat=? AND role='assistant'").get(Number(route[3]),chat)
      if(!row?.pluginDraft)reject(404,'Plugin draft unavailable')
      const authorize=()=>{
        if(!canRun()||!getChat.get(chat,ws))reject(403,'The workspace or conversation is unavailable.')
      }
      return {folder:await actor.savePlugin(valid(pluginDraft,JSON.parse(String(row.pluginDraft))),authorize)}
    }
    if(route[4]==='save')reject(404,'Unknown chat operation')
    if(route[2]==='provider'&&!route[3]&&method==='POST'){
      if(!provider.checkAgent)reject(403,'The server operator configures the provider')
      const {agent}=valid(z.object({agent:z.enum(LOCAL_AGENTS).nullable()}),await input())
      if(agent)await provider.checkAgent(agent)
      if(!canRun())reject(403,'Editor access required')
      if(runs.has(chat))reject(409,'Wait for the current response before switching agents')
      const saved=db.prepare('UPDATE chats SET localAgent=? WHERE id=? AND workspace=? AND deleted=0').run(agent,chat,ws)
      if(!saved.changes)reject(404,'Chat unavailable')
      return {}
    }
    if(!route[2]&&method==='DELETE'){
      if(!actor.write||(!actor.owner&&conversation.author!==author))reject(403,'Only the chat author or workspace owner can delete this conversation.')
      db.exec('BEGIN IMMEDIATE')
      try{
        db.prepare('DELETE FROM chat_page_requests WHERE message IN (SELECT id FROM chat_messages WHERE chat=?)').run(chat)
        db.prepare('DELETE FROM chat_project_requests WHERE message IN (SELECT id FROM chat_messages WHERE chat=?)').run(chat)
        db.prepare('DELETE FROM chat_edits WHERE message IN (SELECT id FROM chat_messages WHERE chat=?)').run(chat)
        // Keep allocated chat and task IDs so stale URLs or cancellation requests cannot target a new conversation.
        db.prepare("UPDATE chat_messages SET text='',sources='[]',pluginDraft=NULL,requester=NULL,background=0,status='deleted' WHERE chat=?").run(chat)
        db.prepare("UPDATE chats SET deleted=1,title='',author=NULL WHERE id=?").run(chat)
        db.exec('COMMIT')
      }catch(error){db.exec('ROLLBACK');throw error}
      runs.get(chat)?.controller.abort('deleted')
      return {}
    }
    if(!route[2] && method==='GET')return {
      messages:db.prepare('SELECT id,role,text,status,sources,pluginDraft,(SELECT name FROM accounts WHERE id=requester) AS requestedBy FROM chat_messages WHERE chat=? ORDER BY id').all(chat).map(({pluginDraft,...m})=>({...m,sources:JSON.parse(String(m.sources)),...(pluginDraft?{pluginDraft:JSON.parse(String(pluginDraft))}:{})})),
      pages:db.prepare('SELECT r.id,r.message,r.title,r.markdown,r.parent,r.parentName,r.reviewedPath,r.page,r.status,(SELECT name FROM accounts WHERE id=r.reviewer) AS reviewedBy FROM chat_page_requests r JOIN chat_messages m ON m.id=r.message WHERE m.chat=? ORDER BY r.id').all(chat),
      projects:db.prepare('SELECT r.id,r.message,r.name,r.beforeName,r.parent,r.parentName,r.reviewedPath,r.project,r.status,(SELECT name FROM accounts WHERE id=r.reviewer) AS reviewedBy FROM chat_project_requests r JOIN chat_messages m ON m.id=r.message WHERE m.chat=? ORDER BY r.id').all(chat),
      edits:db.prepare('SELECT e.id,e.message,e.page,e.title,e.block,e.before,e.after,e.status,e.kind,(SELECT name FROM accounts WHERE id=e.reviewer) AS reviewedBy FROM chat_edits e JOIN chat_messages m ON m.id=e.message WHERE m.chat=? ORDER BY e.id').all(chat),
    }
    if((route[2]==='projects'||route[2]==='pages')&&route[3]&&(route[4]==='apply'||route[4]==='dismiss')&&method==='POST'){
      const apply=route[4]==='apply',review=apply?await input(undefined,true):{}
      const page=route[2]==='pages',table=page?'chat_page_requests':'chat_project_requests',resultKey=page?'page':'project'
      db.exec('BEGIN IMMEDIATE')
      try{
        const item=db.prepare(`SELECT r.*,m.requester FROM ${table} r JOIN chat_messages m ON m.id=r.message WHERE m.chat=? AND r.id=? AND r.status='pending'`).get(chat,Number(route[3]))
        if(!item)reject(409,'This proposal is no longer pending')
        if(apply)requireRequesterWrite(db,ws,item.requester===null?null:Number(item.requester))
        const reviewedPath=apply?confirmProjectPath(db,ws,item.parent===null?null:Number(item.parent),item.parentName as string|null,review):null
        let result:number|null=item.beforeName?Number(item.project):null
        if(apply&&item.beforeName)result=renameProject(db,ws,Number(item.project),item.beforeName,item.name)
        else if(apply)result=page?createMarkdownPage(db,ws,String(item.title),item.parent,String(item.markdown)):createProject(db,ws,item.name,item.parent)
        db.prepare(`UPDATE ${table} SET ${resultKey}=?,status=?,reviewer=?,reviewedPath=? WHERE id=?`).run(result,apply?'applied':'dismissed',actor.account,reviewedPath,item.id)
        db.exec('COMMIT');return {[resultKey]:result}
      }catch(error){db.exec('ROLLBACK');throw error}
    }
    if(route[2]==='edits' && route[3] && method==='POST'){
      const edit=db.prepare('SELECT e.*,m.requester FROM chat_edits e JOIN chat_messages m ON m.id=e.message WHERE m.chat=? AND e.id=?').get(chat,Number(route[3]))
      if(!edit || edit.status!=='pending')reject(409,'This proposal is no longer pending')
      if(route[4]==='dismiss'){
        const saved=db.prepare("UPDATE chat_edits SET status='dismissed',reviewer=? WHERE id=? AND status='pending'").run(actor.account,edit.id)
        if(!saved.changes)reject(409,'This proposal is no longer pending')
        return {}
      }
      // Commit the decision with its mutation so a concurrent dismissal or access change rolls both back.
      const markApplied=(block:string)=>{
        requireRequesterWrite(db,ws,edit.requester===null?null:Number(edit.requester))
        const saved=db.prepare("UPDATE chat_edits SET status='applied',block=?,reviewer=? WHERE id=? AND status='pending'").run(block,actor.account,edit.id)
        if(!saved.changes)reject(409,'This proposal is no longer pending')
      }
      if(edit.kind==='rename'){
        db.exec('BEGIN IMMEDIATE')
        try{
          markApplied('')
          if(body(ws,Number(edit.page)).title!==edit.before)reject(409,'The page title changed. Ask for a fresh rename.')
          renamePage(db,ws,Number(edit.page),{title:String(edit.after),base:String(edit.before)})
          db.exec('COMMIT');return {}
        }catch(error){db.exec('ROLLBACK');throw error}
      }
      return documents.apply(ws,{page:Number(edit.page),block:String(edit.block),before:String(edit.before),after:String(edit.after)},markApplied)
    }
    if(route[2]!=='turn' || route[3] || method!=='POST')reject(405,'Chat operation unavailable')
    const {text,page,references,blockLinks,allowEdits,background}=valid(z.object({background:z.boolean().default(false),allowEdits:z.boolean().default(true),text:z.string().trim().min(1).max(12000),page:z.number().int().positive().nullable(),references:z.array(z.number().int().positive()).max(3).default([]),blockLinks:z.array(z.object({id:z.number().int().positive(),block:z.string().min(1).max(1024)})).max(MAX_BLOCK_LINKS).default([])}),await input())
    if(stopped)reject(503,'Agent service stopped')
    if(!canRun())reject(403,'Editor access required')
    const currentChat=getChat.get(chat,ws)
    if(!currentChat)reject(404,'Chat unavailable')
    const defaults=provider.get()
    // A restored desktop database never enables local executables on a hosted server.
    const pinned=provider.checkAgent&&LOCAL_AGENTS.find(agent=>agent===currentChat.localAgent)
    const config=pinned?{...defaults,agent:pinned}:defaults
    if(!config.agent&&!config.key)reject(503,'Configure the OpenAI provider to start a turn')
    if(runs.has(chat))reject(409,'A turn is already running in this chat')
    if(page!==null)body(ws,page)
    const attached=[...new Set(references)].filter(id=>id!==page).map(id=>{const target=body(ws,id);return {id,title:target.title}})
    // Resolve each linked page once, before accepting the turn. Only stable identities come from the client.
    const linkedPages=new Map<number,{title:string;blocks:Map<string,string>}>()
    const linkedSources:Source[]=[]
    const referencedBlocks:AgentTurn['referencedBlocks']=[]
    type ObservedBlock={prefix:string;complete:boolean}
    const observed=new Map<number,Map<string,ObservedBlock>>()
    /** An edit requires a contiguous read from the start of the same version of the block. */
    function observe(id:number,block:string,content:string,start:number,end:number){
      const known=observed.get(id)??new Map<string,ObservedBlock>()
      const previous=known.get(block)?.prefix??''
      const prefix=content.startsWith(previous)?previous:''
      const seen=start<=prefix.length&&end>prefix.length?content.slice(0,end):prefix
      known.set(block,{prefix:seen,complete:seen===content})
      observed.set(id,known)
    }
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
      const text=textPrefix(content,2400)
      referencedBlocks.push({page:id,block,text,truncated:text!==content,...(text!==content&&{nextOffset:text.length})})
      observe(id,block,content,0,text.length)
      linkedSources.push({id,title:target.title,block,excerpt:textPrefix(content,60)||'Empty block'})
    }
    const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])
    const close=()=>controller.abort()
    // A search citation can describe a page that the agent has never opened.
    const browsedProjects=new Map<number,string>()
    const readTitles=new Map<number,string>()
    const sources=new Map<number,Source>()
    const attachmentSources=new Map<number,Source>()
    const saveSources=()=>db.prepare('UPDATE chat_messages SET sources=? WHERE id=?').run(JSON.stringify([...sources.values(),...linkedSources,...attachmentSources.values()]),message)
    const add=db.prepare('INSERT INTO chat_messages(chat,role,text,status,sources,requester) VALUES(?,?,?,?,?,?)')
    db.exec('BEGIN IMMEDIATE')
    let message:number,userMessage:number
    try{
      db.prepare("UPDATE chats SET title=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM chat_messages WHERE chat=?)").run(textPrefix(text,64),chat,chat)
      userMessage=Number(add.run(chat,'user',text,'sent',JSON.stringify([...attached,...linkedSources]),actor.account).lastInsertRowid)
      message=Number(add.run(chat,'assistant','','running',JSON.stringify(linkedSources),actor.account).lastInsertRowid)
      if(background)db.prepare('UPDATE chat_messages SET background=1 WHERE id=?').run(message)
      db.exec('COMMIT')
    }catch(error){db.exec('ROLLBACK');throw error}
    const notify=(event:object)=>{if(!background&&!res.destroyed)res.write(JSON.stringify(event)+'\n')}
    /** Bind each tool and each published result to the initiating session throughout the run. */
    function requireAccess(){
      if(!signal.aborted&&!canRun())controller.abort()
      signal.throwIfAborted()
    }
    // Reserve the chat before the environment starts, including environments that finish synchronously.
    const finished=Promise.resolve().then(executeTurn)
    runs.set(chat,{workspace:ws,controller,canRun,finished})
    return finished

    async function executeTurn(){
      try{
        if(background){
          res.writeHead(202,{'Content-Type':'application/json','Cache-Control':'no-store'})
          res.end(JSON.stringify({task:message,chat}))
        }else{
          res.once('close',close)
          res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'})
        }
        if(!background&&res.destroyed)controller.abort()
        requireAccess()
        /** Persist the source when either a document preview or a text range is read. */
        function cite(id:number,title:string,block?:{id:string;text:string},surface?:Source['surface']){
          readTitles.set(id,title)
          sources.set(id,{...sources.get(id),id,title,...(surface&&{surface})})
          if(block&&!linkedSources.some(source=>source.id===id&&source.block===block.id)){
            linkedSources.push({id,title,block:block.id,excerpt:textPrefix(block.text,60)||'Empty block'})
          }
          saveSources()
        }
        const read=(id:number,offsetOrBlock:number|string,surface?:Source['surface']):DocumentContext=>{
          requireAccess()
          const target=body(ws,id), {blocks:all,canvasText}=agentDocument(target)
          const linked=typeof offsetOrBlock==='string'
          const offset=linked?all.findIndex(block=>block.id===offsetOrBlock):offsetOrBlock
          if(offset<0)reject(404,'Block unavailable')
          const blocks:DocumentContext['blocks']=[]
          const canvas=!linked&&offset===0?textPrefix(canvasText,4000):''
          let budget=24000-canvas.length
          for(const block of all.slice(offset,offset+(linked?1:40))){
            const text=textPrefix(block.text,12000)
            if(blocks.length && text.length>budget)break
            blocks.push(text===block.text?{id:block.id,text}:{id:block.id,text,truncated:true,nextOffset:text.length});budget-=text.length
          }
          blocks.forEach((b,i)=>observe(id,b.id,all[offset+i].text,0,b.text.length))
          cite(id,target.title,linked?all[offset]:undefined,surface)
          return {id,title:target.title,blocks,...(canvas&&{canvasText:canvas,canvasTextTruncated:canvas.length<canvasText.length,...(canvas.length<canvasText.length&&{canvasNextOffset:canvas.length})}),more:!linked&&offset+blocks.length<all.length}
        }
        notify({message})
        const current=page===null?null:read(page,0)
        const referencedDocuments=attached.map(source=>read(source.id,0))
        /** Include stable target and request IDs. The current turn must still read the document before editing. */
        function reviews(message:number):MessageReviews{
          const edits=db.prepare("SELECT id,page,title,block,kind,CASE WHEN kind='rename' THEN after END AS proposedTitle,status FROM chat_edits WHERE message=? ORDER BY id").all(message) as MessageReviews['edits']
          const pages=db.prepare('SELECT id,title,parent,parentName,reviewedPath,page,status FROM chat_page_requests WHERE message=? ORDER BY id').all(message) as MessageReviews['pages']
          const projects=db.prepare('SELECT id,name,beforeName,parent,parentName,reviewedPath,project,status FROM chat_project_requests WHERE message=? ORDER BY id').all(message) as MessageReviews['projects']
          return {message,edits,pages,projects}
        }
        const rows=db.prepare("SELECT id,role,status,text AS content,sources,json_extract(pluginDraft,'$.name') AS draftName FROM chat_messages WHERE chat=? AND id<? AND (text<>'' OR status='unknown' OR pluginDraft IS NOT NULL) ORDER BY id DESC LIMIT 24").all(chat,message).reverse() as {id:number;role:'assistant'|'user';status:string;content:string;sources:string;draftName:string|null}[]
        const history=rows.map(({id,role,status,content,sources,draftName},index)=>{
          // A previous link identifies the source to read again. Its old excerpt is not current document text.
          if(role==='user'&&index<rows.length-1){
            const links=(JSON.parse(sources) as Source[]).map(({id,block})=>({id,block}))
            if(links.length)content+='\nLinked workspace sources: '+JSON.stringify(links)
          }
          if(role==='assistant'){
            const citations=citedAttachments(JSON.parse(sources))
            if(citations.length)content+='\nCited attachments: '+JSON.stringify(citations)
            if(status==='unknown')content+='\nThe host restarted during this turn. Its final outcome is unknown. Check the recorded decisions and current workspace before taking further action.'
            if(draftName&&actor.savePlugin)content+='\nSaved plugin draft: '+JSON.stringify({message:id,name:draftName})
            const {edits:decisions,pages,projects}=reviews(id)
            if(pages.length)content+='\nRecorded page creation decisions: '+JSON.stringify(pages)
            if(projects.length)content+='\nRecorded project decisions: '+JSON.stringify(projects)
            if(decisions.length)content+='\nRecorded edit decisions: '+JSON.stringify(decisions)
          }
          return {role,content}
        })
        const environment=background?backgroundEnvironment:foregroundEnvironment
        await environment.run({settings:config,history,current,referencedDocuments,referencedBlocks,signal,tools:{
          read,
          listReviews(before){
            requireAccess()
            const rows=db.prepare(`SELECT m.id FROM chat_messages m WHERE m.chat=? AND m.id<? AND m.role='assistant' AND
              (EXISTS(SELECT 1 FROM chat_edits WHERE message=m.id) OR EXISTS(SELECT 1 FROM chat_page_requests WHERE message=m.id)
              OR EXISTS(SELECT 1 FROM chat_project_requests WHERE message=m.id)) ORDER BY m.id DESC LIMIT 5`).all(chat,Math.min(before??userMessage,userMessage))
            const messages=rows.slice(0,4).map(row=>reviews(Number(row.id)))
            return {messages,nextBefore:rows.length>4?messages[3].message:null}
          },
          listLinkedMessages(before){
            requireAccess()
            const rows=db.prepare(`SELECT id,role,substr(text,1,240) AS prompt,sources FROM chat_messages
              WHERE chat=? AND id<? AND sources<>'[]'
              ORDER BY id DESC LIMIT 5`).all(chat,Math.min(before??userMessage,userMessage))
            const messages=rows.slice(0,4).map((row):LinkedMessage=>{
              const sources=JSON.parse(String(row.sources)) as Source[]
              const links=sources.filter(source=>!source.attachment).map(({id,title,block,surface})=>({id,title,block,surface}))
              return {message:Number(row.id),role:row.role==='user'?'user':'assistant',prompt:String(row.prompt),links,
                ...(row.role==='assistant'&&{attachments:citedAttachments(sources)})}
            })
            return {messages,nextBefore:rows.length>4?messages[3].message:null}
          },
          openPage:background?undefined:(id,block,surface)=>{
            if(block&&surface)reject(400,'Choose a writing block or Canvas view.')
            const document=read(id,block??0,surface??undefined)
            // Navigation is delivered once to the initiating window. Reopening shared history only shows the citation.
            notify({openPage:{id,title:document.title,...(block&&{block}),...(surface&&{surface})}})
            return document
          },
          readAttachment(id,file,offset){
            requireAccess()
            const result=readAttachment(db,ws,id,file,offset)
            if(file!==null&&'text' in result){
              const previous=attachmentSources.get(file)?.attachment
              attachmentSources.set(file,{id,title:result.title,attachment:{...previous,id:file,name:result.name,excerpt:textPrefix(result.text,320)||previous?.excerpt||''}})
              saveSources()
            }
            return result
          },
          readText(id,block,offset){
            requireAccess()
            const {title,item,passage}=documents.readPassage(ws,id,block,offset)
            if(item)observe(id,item.id,item.text,offset,offset+passage.text.length)
            cite(id,title,item,block===null?'canvas':undefined)
            return passage
          },
          browse(project,offset){
            requireAccess()
            const result=browseProject(db,ws,project,offset)
            for(const entry of result.entries)if(entry.kind==='project')browsedProjects.set(entry.id,entry.name)
            return result
          },
          async search(query){
            requireAccess()
            const results=await searchWorkspace(db,documents.liveText,retriever,ws,query)
            requireAccess()
            for(const hit of results){
              if(!hit.block&&(hit.excerpt||!hit.attachment))sources.set(hit.id,{id:hit.id,title:hit.title,surface:hit.surface,excerpt:hit.excerpt})
              if(hit.attachment)attachmentSources.set(hit.attachment.id,{id:hit.id,title:hit.title,attachment:hit.attachment})
              if(hit.block&&!linkedSources.some(source=>source.id===hit.id&&source.block===hit.block)){
                linkedSources.push({id:hit.id,title:hit.title,block:hit.block,excerpt:hit.excerpt})
              }
            }
            if(results.length)saveSources()
            return results
          },
          readPluginDraft:actor.savePlugin?id=>{
            requireAccess()
            // A null ID selects the most recent prior draft even after its message leaves the model's history window.
            const row=db.prepare('SELECT pluginDraft FROM chat_messages WHERE chat=? AND id<? AND pluginDraft IS NOT NULL AND (? IS NULL OR id=?) ORDER BY id DESC LIMIT 1').get(chat,message,id,id)
            if(!row)reject(404,'Plugin draft unavailable in this conversation.')
            return valid(pluginDraft,JSON.parse(String(row.pluginDraft)))
          }:undefined,
          draftPlugin:allowEdits&&actor.savePlugin?draft=>{
            requireAccess()
            const source=valid(pluginDraft,draft)
            const saved=db.prepare('UPDATE chat_messages SET pluginDraft=? WHERE id=? AND pluginDraft IS NULL').run(JSON.stringify(source),message)
            if(!saved.changes)reject(409,'This response already contains a plugin draft.')
            return {drafted:true}
          }:undefined,
          proposeRename:allowEdits?(id,title)=>{
            requireAccess()
            const change=valid(pageRename,{id,title})
            const current=body(ws,id).title
            if(readTitles.get(id)!==current)reject(409,'Read the current page before proposing a rename')
            if(change.title===current)reject(400,'The title makes no change')
            const saved=db.prepare("INSERT INTO chat_edits(message,page,title,block,before,after,kind) VALUES(?,?,?,'',?,?,'rename')").run(message,id,current,current,change.title)
            const pending=Number(saved.lastInsertRowid)
            notify({proposal:pending});return {pending}
          }:undefined,
          proposePage:allowEdits?(title,project,markdown)=>{
            requireAccess()
            const request=reviewPageDraft(db,ws,{title,project,markdown})
            const saved=db.prepare('INSERT INTO chat_page_requests(message,title,markdown,parent,parentName) VALUES(?,?,?,?,?)').run(message,request.title,request.draft.markdown,request.draft.project,request.draft.projectName)
            const pending=Number(saved.lastInsertRowid)
            notify({proposal:pending});return {pending}
          }:undefined,
          proposeProjectRename:allowEdits?(id,name)=>{
            requireAccess()
            const before=browsedProjects.get(id),next=projectName(name)
            const target=db.prepare('SELECT name,parent FROM projects WHERE id=? AND workspace=? AND trashRoot IS NULL').get(id,ws)
            if(!before||before!==target?.name)reject(409,'Browse the current parent folder before proposing a project rename.')
            if(next===before)reject(400,'The project name makes no change.')
            const parent=target.parent===null?null:Number(target.parent)
            const saved=db.prepare('INSERT INTO chat_project_requests(message,name,beforeName,parent,parentName,project) VALUES(?,?,?,?,?,?)')
              .run(message,next,before,parent,reviewProjectPath(db,ws,parent),id)
            const pending=Number(saved.lastInsertRowid)
            notify({proposal:pending});return {pending}
          }:undefined,
          proposeProject:allowEdits?(name,parent)=>{
            requireAccess()
            const parentName=reviewProjectPath(db,ws,parent)
            const saved=db.prepare('INSERT INTO chat_project_requests(message,name,parent,parentName) VALUES(?,?,?,?)').run(message,name,parent,parentName)
            const pending=Number(saved.lastInsertRowid)
            notify({proposal:pending});return {pending}
          }:undefined,
          propose:allowEdits?(id,block,after)=>{
            requireAccess()
            const target=body(ws,id)
            const seen=observed.get(id)?.get(block)
            const before=block?(seen?.complete?seen.prefix:undefined):''
            if(before===undefined||(!block&&!readTitles.has(id)))reject(409,'Read the complete target block before proposing an edit')
            documents.checkProposalBlock(target,block,before)
            if(after===before)reject(400,'The edit makes no change')
            const result=db.prepare('INSERT INTO chat_edits(message,page,title,block,before,after) VALUES(?,?,?,?,?,?)').run(message,id,target.title,block,before,after)
            notify({proposal:Number(result.lastInsertRowid)})
            return {pending:Number(result.lastInsertRowid)}
          }:undefined,
        },publish(delta){
          requireAccess()
          db.prepare('UPDATE chat_messages SET text=text||? WHERE id=?').run(delta,message)
          notify({message,delta})
        }})
        requireAccess()
        db.prepare("UPDATE chat_messages SET status='complete' WHERE id=?").run(message)
      }catch{
        const status=signal.reason==='cancelled'?'cancelled':signal.aborted?'interrupted':'failed'
        db.prepare("UPDATE chat_messages SET status=? WHERE id=? AND status='running'").run(status,message)
        if(signal.reason!=='deleted')notify({error:status==='failed'?(config.agent?'Local '+config.agent+' request failed. Check the CLI version, login and connection.':'Provider request failed. Verify the host API key, model, network and quota.'):'Turn interrupted'})
      }finally{
        controller.abort();runs.delete(chat)
        res.off('close',close);if(!background&&!res.destroyed)res.end()
      }
    }
  }
  return {handle,runningIn(workspace:number){
    return [...runs.values()].some(run=>run.workspace===workspace)
  },recheckAccess(){
    // A provider can wait silently between tools. Interrupt as soon as its initiating session loses access.
    for(const {controller,canRun} of runs.values())if(!canRun())controller.abort()
  },async stop(){
    stopped=true
    for(const {controller} of runs.values())controller.abort()
    await Promise.all([...runs.values()].map(run=>run.finished))
  }}
}
