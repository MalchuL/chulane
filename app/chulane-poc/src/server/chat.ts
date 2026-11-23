/** SQLite owns conversations, partial responses and review decisions. Every request supplies its authenticated workspace. */
import {propertyQuery,type PropertyBatch,type PropertyQuery} from '../shared/tag-fields.ts'
import type { DatabaseSync } from 'node:sqlite'
import type {CanvasElementPreview} from './agent-canvas.ts'
import {chatActivity} from './chat-activity.ts'
import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import type {reviewedDocuments} from './reviewed-documents.ts'
import {textPrefix,type DocumentTextBlock} from '../shared/document-text.ts'
import {readAttachment} from './attachment-text.ts'
import { agentCanvas,agentDocument,blockPreview,documentPreview } from './agent-document.ts'
import { apiConnection, pageRename, pluginDraft, environmentProvider, runAgent, type Provider, type ProviderSettings } from './mastra.ts'
import {createMarkdownPage,reviewPageDraft} from './markdown.ts'
import {renamePage} from './page-titles.ts'
import {HermesSetupError} from './local-agent.ts'
import {createOnce,hasCreationReceipt} from './creation-receipts.ts'
import {requireRequesterWrite} from './accounts.ts'
import type {LiveSteer,AgentEnvironment,AgentTurn,CitedAttachment,DocumentContext,LinkedMessage,MessageReviews} from './agent-environment.ts'
import {findProjects,browseProject,confirmProjectPath,createProject,projectName,renameProject,reviewProjectPath} from './projects.ts'
import {workspaceDay} from '../shared/library.ts'
import {canvasRead,canvasEdit,canvasValue} from '../shared/agent-canvas.ts'
import {agentModes,pageSource,LOCAL_AGENTS,MAX_BLOCK_LINKS,MAX_PAGE_REFERENCES,type AppliedEdit,type LibrarySearchHit,type PluginDraft,type Source} from '../shared/agent.ts'

const turnInput=z.object({
  background:z.boolean().default(false),allowEdits:z.boolean().default(true),
  mode:z.enum(agentModes).optional(),surface:z.enum(['canvas','page']).optional(),
  text:z.string().trim().min(1).max(12000),page:z.number().int().positive().nullable(),
  references:z.array(z.number().int().positive()).max(MAX_PAGE_REFERENCES).default([]),
  blockLinks:z.array(z.object({
    id:z.number().int().positive(),block:z.string().min(1).max(1024),excerpt:z.string().max(256).optional()
  })).max(MAX_BLOCK_LINKS).default([])
})
const submission=turnInput.extend({operationId:z.string().optional(),managed:z.boolean().optional()})
const foregroundEnvironment:AgentEnvironment={run:runAgent}

/** Keep historical file references small. Reading a cited passage checks current workspace access. */
function citedAttachments(sources:Source[]):CitedAttachment[]{
  return sources.flatMap(({id,attachment})=>attachment
    ?[{id,file:attachment.id,name:attachment.name,matchOffset:attachment.matchOffset,readOffset:attachment.readOffset}]:[])
}

export type SavePluginFolder=(draft:PluginDraft,authorize:()=>void)=>Promise<string|null>
const streamHeaders={'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'}
type ChatActor={origin:string;canRead:()=>boolean;savePlugin?:SavePluginFolder;account:number|null;owner:boolean;write:boolean}

function reject(status:number, message:string):never { throw Object.assign(new Error(message),{status}) }
function valid<T>(schema:z.ZodType<T>, data:unknown):T {
  const parsed=schema.safeParse(data)
  return parsed.success ? parsed.data : reject(400,'Invalid agent request')
}
// Older applied edits retained only the resulting block. Keep their destination usable without guessing the request.
const editBlockColumns=`e.block,CASE WHEN e.kind='text' AND e.status<>'applied' THEN e.block ELSE e.requestedBlock END AS requestedBlock`

/** Install the agent storage and return request and shutdown operations owned by this service. */
export function workspaceAgent(db:DatabaseSync,documents:ReturnType<typeof reviewedDocuments>,search:(workspace:number,query:string)=>Promise<LibrarySearchHit[]>,readProperties:(workspace:number,query:PropertyQuery)=>PropertyBatch,provider:Provider={get:environmentProvider},backgroundEnvironment:AgentEnvironment=foregroundEnvironment,restorePlugin?:SavePluginFolder){
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
  if(!db.prepare('PRAGMA table_info(chat_edits)').all().some(column=>column.name==='requestedBlock'))
    db.exec('ALTER TABLE chat_edits ADD COLUMN requestedBlock TEXT')
  if(!db.prepare('PRAGMA table_info(chat_edits)').all().some(column=>column.name==='reviewedTitle'))
    db.exec('ALTER TABLE chat_edits ADD COLUMN reviewedTitle TEXT')
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
  if(!db.prepare('PRAGMA table_info(chat_messages)').all().some(column=>column.name==='activity'))
    db.exec("ALTER TABLE chat_messages ADD COLUMN activity TEXT NOT NULL DEFAULT '[]'")
  if(!db.prepare('PRAGMA table_info(chat_messages)').all().some(column=>column.name==='mode'))
    db.exec('ALTER TABLE chat_messages ADD COLUMN mode TEXT')
  if(!db.prepare('PRAGMA table_info(chat_edits)').all().some(column=>column.name==='canvas'))
    db.exec('ALTER TABLE chat_edits ADD COLUMN canvas INTEGER NOT NULL DEFAULT 0')
  const runs=new Map<number,{workspace:number;message:number;mode:string;agent?:string;steer?:LiveSteer;observers:Map<ServerResponse,()=>boolean>;controller:AbortController;canRun:()=>boolean;finished:Promise<void>}>()
  db.exec(`CREATE TABLE IF NOT EXISTS chat_queue(id INTEGER PRIMARY KEY AUTOINCREMENT,chat INTEGER NOT NULL REFERENCES chats ON DELETE CASCADE,
    author TEXT NOT NULL,payload TEXT NOT NULL,origin TEXT NOT NULL,plugin INTEGER NOT NULL,agent TEXT,revision INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,error TEXT);
    CREATE INDEX IF NOT EXISTS chat_queue_order ON chat_queue(chat,priority DESC,id)`)
  const pendingSteers=new Set<number>()
  const draining=new Set<number>()
  /** Start the oldest eligible entry after the preceding provider has released its run. */
  async function drain(chat:number){
    if(stopped||runs.has(chat)||draining.has(chat))return
    const entry=db.prepare(`SELECT q.*,c.workspace FROM chat_queue q JOIN chats c ON c.id=q.chat
      WHERE q.chat=? AND c.deleted=0 AND q.error IS NULL ORDER BY priority DESC,q.id LIMIT 1`).get(chat)
    if(!entry)return
    draining.add(chat)
    const ws=Number(entry.workspace),account=entry.author==='shared-key'?null:Number(entry.author)
    const allowed=()=>!!db.prepare(`SELECT 1 FROM workspaces w WHERE w.id=? AND archived=0 AND
      ((accessMode='key' AND ? IS NULL) OR (accessMode='account' AND EXISTS(SELECT 1 FROM memberships WHERE workspace=w.id AND account=? AND role IN ('owner','editor'))))`).get(ws,account,account)
    try{
      await handle('/api/agent/chats/'+chat+'/turn','POST',ws,async()=>JSON.parse(String(entry.payload)),undefined,allowed,
        {account,origin:String(entry.origin),owner:false,write:true,canRead:allowed,savePlugin:entry.plugin?restorePlugin:undefined},entry)
    }catch(error){
      if((error as {status?:number}).status!==503&&!runs.has(chat))
        db.prepare('UPDATE chat_queue SET error=?,revision=revision+1 WHERE id=? AND revision=?').run((error as Error).message,entry.id,entry.revision)
    }finally{draining.delete(chat)}
  }
  const timer=setInterval(()=>{
    for(const row of db.prepare('SELECT DISTINCT chat FROM chat_queue WHERE error IS NULL').all())void drain(Number(row.chat))
  },500)
  timer.unref()
  let stopped=false
  const body=documents.read
  async function handle(path:string,method:string,ws:number,input:(limit?:number,allowEmpty?:boolean)=>Promise<unknown>,res:ServerResponse|undefined,canRun:()=>boolean,actor:ChatActor,entry?:Record<string,import('node:sqlite').SQLOutputValue>){
    const author=actor.account===null?'shared-key':String(actor.account)
    if(path==='/api/agent' && method==='GET'){
      const settings=provider.get()
      return {canSavePlugin:!!actor.savePlugin,configured:!!(settings.agent||settings.key),agent:settings.agent,hasApiKey:!!settings.key,localAgents:provider.selectAgent?LOCAL_AGENTS:[],model:settings.model,configurable:!!provider.save,chats:db.prepare(`SELECT id,title,author,localAgent,(SELECT id*2+(status<>'running') FROM chat_messages m WHERE m.chat=chats.id ORDER BY id DESC LIMIT 1) AS latest,(SELECT count(*) FROM chat_queue q WHERE q.chat=chats.id) AS queued FROM chats WHERE workspace=? AND deleted=0 ORDER BY id DESC`).all(ws).map(row=>({id:row.id,title:row.title,...(row.latest&&{latest:row.latest}),...(row.queued&&{queued:row.queued}),...(runs.has(Number(row.id))&&{running:true}),agent:provider.checkAgent?LOCAL_AGENTS.find(agent=>agent===row.localAgent):undefined,canDelete:actor.write&&(actor.owner||author===row.author)}))}
    }
    if(path==='/api/agent/tasks'&&method==='GET')return db.prepare(`SELECT m.id,m.chat,m.status,
      COALESCE((SELECT substr(u.text,1,100) FROM chat_messages u WHERE u.chat=m.chat AND u.id<m.id AND u.role='user' ORDER BY u.id DESC LIMIT 1),c.title) AS title,
      (EXISTS(SELECT 1 FROM chat_edits e WHERE e.message=m.id AND e.status='pending') OR EXISTS(SELECT 1 FROM chat_project_requests r WHERE r.message=m.id AND r.status='pending') OR EXISTS(SELECT 1 FROM chat_page_requests p WHERE p.message=m.id AND p.status='pending')) AS pending
      FROM chat_messages m JOIN chats c ON c.id=m.chat WHERE c.workspace=? AND c.deleted=0 AND m.background=1 ORDER BY m.id DESC`).all(ws)
    const cancel=/^\/api\/agent\/tasks\/(\d+)\/cancel$/.exec(path)
    if(cancel&&method==='POST'){
      const task=db.prepare('SELECT m.chat,m.status FROM chat_messages m JOIN chats c ON c.id=m.chat WHERE c.workspace=? AND c.deleted=0 AND m.id=? AND m.background=1').get(ws,Number(cancel[1]))
      if(!task)reject(404,'Task unavailable')
      if(task.status==='running'&&!db.prepare('SELECT 1 FROM chat_messages WHERE id=? AND requester IS ?').get(Number(cancel[1]),actor.account))reject(403,'Only the author can stop this task.')
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
    if(path==='/api/agent/chats' && method==='POST'){
      const {operationId,agent}=valid(z.object({operationId:z.string().optional(),agent:z.enum(LOCAL_AGENTS).optional()}),await input(undefined,true))
      if(agent){
        if(!provider.checkAgent)reject(403,'The server operator configures the provider')
        if(!operationId||!hasCreationReceipt(db,actor.account,operationId))await provider.checkAgent(agent)
      }
      if(!canRun())reject(403,'Editor access required')
      // Preserve existing receipts for conversations created with the device default.
      return {id:createOnce(db,actor.account,operationId,agent?['chat',ws,agent]:['chat',ws],
        ()=>Number(db.prepare("INSERT INTO chats(workspace,title,author,localAgent) VALUES(?,'New chat',?,?)").run(ws,author,agent??null).lastInsertRowid),
        id=>!!db.prepare('SELECT 1 FROM chats WHERE workspace=? AND id=? AND deleted=0').get(ws,id))}
    }
    const route=/^\/api\/agent\/chats\/(\d+)(?:\/(turn|edits|pages|projects|provider|plugins|queue|stop)(?:\/(\d+)\/(apply|dismiss|save|edit|delete|steer))?)?$/.exec(path)
    if(!route)reject(404,'Unknown chat operation')
    const chat=Number(route[1])
    const getChat=db.prepare('SELECT author,localAgent FROM chats WHERE id=? AND workspace=? AND deleted=0')
    const conversation=getChat.get(chat,ws)
    if(!conversation)reject(404,'Chat unavailable')
    const run=runs.get(chat)
    const ownsRun=!!run&&!!db.prepare('SELECT 1 FROM chat_messages WHERE id=? AND requester IS ?').get(run.message,actor.account)
    if(route[2]==='stop'&&method==='POST'){
      const {message}=valid(z.object({message:z.number().int()}),await input())
      if(!canRun()||!ownsRun||runs.get(chat)!==run||run?.message!==message)reject(409,'This response is no longer yours to stop.')
      run.controller.abort();return {}
    }
    if(route[2]==='queue'&&method==='POST'){
      const data=await input()
      if(!canRun()||!getChat.get(chat,ws))reject(403,'Editor access required')
      if(!route[3]){
        const {operationId,...payload}=valid(turnInput.extend({operationId:z.string()}),data)
        const pinned=provider.checkAgent&&LOCAL_AGENTS.find(name=>name===conversation.localAgent)
        const agent=pinned??provider.get().agent??null
        const id=createOnce(db,actor.account,operationId,['queue',ws,chat,payload],()=>Number(db.prepare(
          'INSERT INTO chat_queue(chat,author,payload,origin,plugin,agent) VALUES(?,?,?,?,?,?)'
        ).run(chat,author,JSON.stringify(payload),actor.origin,Number(!!actor.savePlugin),agent).lastInsertRowid),()=>true)
        return {queued:id}
      }
      const {revision}=valid(z.object({revision:z.number().int()}),data)
      const id=Number(route[3]),row=db.prepare('SELECT * FROM chat_queue WHERE chat=? AND id=? AND revision=?').get(chat,id,revision)
      if(!row)reject(409,'This queued message has changed or started.')
      if(pendingSteers.has(id))reject(409,'Waiting for the provider to acknowledge steering.')
      if(row.author!==author)reject(403,'Only the author can change a queued message.')
      if(route[4]==='edit'){
        const payload=valid(turnInput,data)
        db.prepare('UPDATE chat_queue SET payload=?,revision=revision+1,error=NULL WHERE id=?').run(JSON.stringify(payload),id)
      }else if(route[4]==='delete')db.prepare('DELETE FROM chat_queue WHERE id=?').run(id)
      else if(route[4]==='steer'){
        const {message}=valid(z.object({message:z.number().int()}),data)
        if(!ownsRun||runs.get(chat)!==run||run?.message!==message||run.controller.signal.aborted)reject(409,'The running response changed.')
        const queued=turnInput.parse(JSON.parse(String(row.payload)))
        const queuedMode=queued.allowEdits?(queued.mode??'suggest'):'ask'
        if(run.steer&&run.mode===queuedMode&&run.agent===row.agent){
          const ids=[...new Set([queued.page,...queued.references,...queued.blockLinks.map(link=>link.id)].filter((id):id is number=>id!==null))]
          const context=ids.map(id=>{
            const source=body(ws,id),doc=documents.liveText(id)??agentDocument(source)
            const blocks=queued.blockLinks.filter(link=>link.id===id).map(link=>{
              const block=doc.blocks.find(item=>item.id===link.block)
              if(!block)reject(409,'A linked block is unavailable.')
              return {id:block.id,...blockPreview(block,2400)}
            })
            return {id,title:source.title,blocks,...((queued.page===id||queued.references.includes(id))&&{preview:documentPreview(doc,0)}),
              ...(queued.page===id&&queued.surface==='canvas'&&{canvas:agentCanvas(source,0)})}
          })
          // A host crash between the write and acknowledgement must never replay this instruction.
          db.prepare("UPDATE chat_queue SET error='Steering delivery unconfirmed. Review before retrying.',revision=revision+1 WHERE id=?").run(id)
          pendingSteers.add(id)
          try{
            if(await run.steer(JSON.stringify({instruction:queued.text,context,surface:queued.surface}))){
              db.exec('BEGIN IMMEDIATE')
              try{
                if(getChat.get(chat,ws))db.prepare("INSERT INTO chat_messages(chat,role,text,status,sources,requester) VALUES(?,'user',?,'sent',?,?)").run(chat,queued.text,JSON.stringify(context.flatMap(doc=>[{id:doc.id,title:doc.title},...doc.blocks.map(block=>({id:doc.id,title:doc.title,block:block.id}))])),actor.account)
                db.prepare('DELETE FROM chat_queue WHERE id=?').run(id);db.exec('COMMIT')
              }catch(error){db.exec('ROLLBACK');throw error}
              return {}
            }
          }finally{pendingSteers.delete(id)}
        }
        db.prepare('UPDATE chat_queue SET priority=1,error=NULL,revision=revision+1 WHERE id=?').run(id)
        if(runs.get(chat)===run)run.controller.abort('steered')
      }else reject(405,'Unknown queue action')
      return {}
    }
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
        db.prepare('DELETE FROM chat_queue WHERE chat=?').run(chat)
        db.prepare('DELETE FROM chat_page_requests WHERE message IN (SELECT id FROM chat_messages WHERE chat=?)').run(chat)
        db.prepare('DELETE FROM chat_project_requests WHERE message IN (SELECT id FROM chat_messages WHERE chat=?)').run(chat)
        db.prepare('DELETE FROM chat_edits WHERE message IN (SELECT id FROM chat_messages WHERE chat=?)').run(chat)
        // Keep allocated chat and task IDs so stale URLs or cancellation requests cannot target a new conversation.
        db.prepare("UPDATE chat_messages SET text='',sources='[]',activity='[]',pluginDraft=NULL,requester=NULL,background=0,status='deleted' WHERE chat=?").run(chat)
        db.prepare("UPDATE chats SET deleted=1,title='',author=NULL WHERE id=?").run(chat)
        db.exec('COMMIT')
      }catch(error){db.exec('ROLLBACK');throw error}
      runs.get(chat)?.controller.abort('deleted')
      return {}
    }
    if(!route[2] && method==='GET')return {
      canStop:ownsRun,
      queue:db.prepare('SELECT id,payload,revision,error,author FROM chat_queue WHERE chat=? ORDER BY priority DESC,id').all(chat).map(q=>({id:q.id,turn:JSON.parse(String(q.payload)),revision:q.revision,error:q.error,mine:q.author===author})),
      messages:db.prepare('SELECT id,role,text,status,sources,mode,activity,pluginDraft,(SELECT name FROM accounts WHERE id=requester) AS requestedBy FROM chat_messages WHERE chat=? ORDER BY id').all(chat).map(({pluginDraft,activity,...m})=>({...m,...(activity!=='[]'&&{activity:JSON.parse(String(activity))}),sources:JSON.parse(String(m.sources)),...(pluginDraft?{pluginDraft:JSON.parse(String(pluginDraft))}:{})})),
      pages:db.prepare('SELECT r.id,r.message,r.title,r.markdown,r.parent,r.parentName,r.reviewedPath,r.page,r.status,(SELECT name FROM accounts WHERE id=r.reviewer) AS reviewedBy FROM chat_page_requests r JOIN chat_messages m ON m.id=r.message WHERE m.chat=? ORDER BY r.id').all(chat),
      projects:db.prepare('SELECT r.id,r.message,r.name,r.beforeName,r.parent,r.parentName,r.reviewedPath,r.project,r.status,(SELECT name FROM accounts WHERE id=r.reviewer) AS reviewedBy FROM chat_project_requests r JOIN chat_messages m ON m.id=r.message WHERE m.chat=? ORDER BY r.id').all(chat),
      edits:db.prepare(`SELECT e.id,e.message,e.page,e.title,e.reviewedTitle,${editBlockColumns},e.before,e.after,e.status,CASE WHEN e.canvas THEN 'canvas' ELSE e.kind END AS kind,(SELECT name FROM accounts WHERE id=e.reviewer) AS reviewedBy FROM chat_edits e JOIN chat_messages m ON m.id=e.message WHERE m.chat=? ORDER BY e.id`).all(chat),
    }
    /** Manual approval and preauthorized agent actions use identical transactions and access checks. */
    function decideCreation(kind:'pages'|'projects',id:number,apply:boolean,review:unknown){
      const page=kind==='pages',table=page?'chat_page_requests':'chat_project_requests',resultKey=page?'page':'project'
      db.exec('BEGIN IMMEDIATE')
      try{
        const item=db.prepare(`SELECT r.*,m.requester FROM ${table} r JOIN chat_messages m ON m.id=r.message WHERE m.chat=? AND r.id=? AND r.status='pending'`).get(chat,id)
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
    /** Recheck a pending edit against live content and record its result in the same transaction. */
    function decideEdit(id:number,apply:boolean,shownTitle?:string):AppliedEdit|null{
      const edit=db.prepare('SELECT e.*,m.requester FROM chat_edits e JOIN chat_messages m ON m.id=e.message WHERE m.chat=? AND e.id=?').get(chat,id)
      if(!edit || edit.status!=='pending')reject(409,'This proposal is no longer pending')
      if(!apply){
        const saved=db.prepare("UPDATE chat_edits SET status='dismissed',reviewer=? WHERE id=? AND status='pending'").run(actor.account,edit.id)
        if(!saved.changes)reject(409,'This proposal is no longer pending')
        return null
      }
      // Commit the decision with its mutation so a concurrent dismissal or access change rolls both back.
      const reviewedTitle=edit.kind==='rename'?edit.before:shownTitle??edit.title
      const markApplied=(block:string)=>{
        requireRequesterWrite(db,ws,edit.requester===null?null:Number(edit.requester))
        const saved=db.prepare("UPDATE chat_edits SET status='applied',requestedBlock=CASE WHEN kind='text' THEN block END,block=?,reviewer=?,reviewedTitle=? WHERE id=? AND status='pending'").run(block,actor.account,reviewedTitle,edit.id)
        if(!saved.changes)reject(409,'This proposal is no longer pending')
      }
      if(edit.kind==='rename'){
        db.exec('BEGIN IMMEDIATE')
        try{
          markApplied('')
          if(body(ws,Number(edit.page)).title!==edit.before)reject(409,'The page title changed. Ask for a fresh rename.')
          renamePage(db,ws,Number(edit.page),{title:String(edit.after),base:String(edit.before)})
          db.exec('COMMIT');return null
        }catch(error){db.exec('ROLLBACK');throw error}
      }
      return documents.apply(ws,{page:Number(edit.page),block:String(edit.block),before:String(edit.before),after:String(edit.after),canvas:!!edit.canvas},reviewedTitle,markApplied)
    }
    if(route[3]&&method==='POST'&&(route[4]==='apply'||route[4]==='dismiss')){
      const apply=route[4]==='apply',id=Number(route[3])
      if(route[2]==='pages'||route[2]==='projects')return decideCreation(route[2],id,apply,apply?await input(undefined,true):{})
      if(route[2]==='edits')return decideEdit(id,apply,apply?valid(z.object({reviewedTitle:z.string().optional()}),await input(undefined,true)).reviewedTitle:undefined)??{}
    }
    if(route[2]==='turn'&&!route[3]&&method==='GET'){
      if(!res)throw Error('Missing stream reader')
      const run=runs.get(chat)
      if(!run||run.controller.signal.aborted){res.writeHead(204,{'Cache-Control':'no-store'});res.end();return}
      run.observers.set(res,actor.canRead)
      res.once('close',()=>run.observers.delete(res))
      res.writeHead(200,streamHeaders)
      // Subscribe before the reader fetches history so every later delta is buffered on this connection.
      res.write(JSON.stringify({message:run.message})+'\n')
      return
    }
    if(route[2]!=='turn' || route[3] || method!=='POST')reject(405,'Chat operation unavailable')
    const {operationId,managed,...turn}=valid(submission,await input())
    if(stopped)reject(503,'Agent service stopped')
    if(!canRun())reject(403,'Editor access required')
    const currentChat=getChat.get(chat,ws)??reject(404,'Chat unavailable')
    const {text,page,references,blockLinks,background}=turn
    const mode=turn.allowEdits?(turn.mode??'suggest'):'ask',allowEdits=mode!=='ask'
    let config:ProviderSettings
    let attached:Source[]
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
    let userMessage=0
    const missingContext=Object.assign(Error('Linked context is unavailable. Restore or remove the affected blocks.'),{blocks:[] as typeof blockLinks})
    /** Resolve current context only for a new turn. Accepted retries use the saved message. */
    function acceptTurn(){
      const defaults=provider.get()
      // A restored desktop database never enables local executables on a hosted server.
      const pinned=provider.checkAgent&&LOCAL_AGENTS.find(agent=>agent===currentChat.localAgent)
      config=entry?{...defaults,agent:LOCAL_AGENTS.find(name=>name===entry.agent&&(provider.checkAgent||defaults.agent===name))}:pinned?{...defaults,agent:pinned}:defaults
      if(entry?.agent&&!config.agent)reject(503,'Queued provider unavailable')
      if(!config.agent&&!config.key)reject(503,'Configure the OpenAI provider to start a turn')
      if(runs.has(chat)||(!entry&&managed&&db.prepare('SELECT 1 FROM chat_queue WHERE chat=? AND error IS NULL').get(chat)))reject(409,'A turn is already running in this chat')
      if(page!==null)body(ws,page)
      attached=[...new Set(references)].filter(id=>id!==page).map(id=>pageSource(body(ws,id)))
      const linkedPages=new Map<number,{title:string;day?:string;blocks:Map<string,DocumentTextBlock>}>()
      const uniqueLinks=new Map(blockLinks.map(link=>[link.id+'/'+link.block,link]))
      for(const {id,block} of uniqueLinks.values()){
        let target=linkedPages.get(id)
        if(!target){
          const pageBody=body(ws,id)
          target={...pageSource(pageBody),blocks:new Map((documents.liveText(id)??agentDocument(pageBody)).blocks.map(b=>[b.id,b]))}
          linkedPages.set(id,target)
        }
        const item=target.blocks.get(block)
        if(!item){
          missingContext.blocks.push({id,block})
          continue
        }
        const preview=blockPreview(item,2400)
        referencedBlocks.push({page:id,...(target.day&&{day:target.day}),block,truncated:false,...preview})
        observe(id,block,item.text,0,preview.text.length)
        linkedSources.push({id,title:target.title,block,excerpt:textPrefix(item.text,60)||'Empty block'})
      }
      if(missingContext.blocks.length)throw missingContext
      if(entry&&!db.prepare('DELETE FROM chat_queue WHERE id=? AND revision=?').run(entry.id,entry.revision).changes)reject(409,'Queue entry changed')
      const add=db.prepare('INSERT INTO chat_messages(chat,role,text,status,sources,requester) VALUES(?,?,?,?,?,?)')
      db.prepare("UPDATE chats SET title=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM chat_messages WHERE chat=?)").run(textPrefix(text,64),chat,chat)
      userMessage=Number(add.run(chat,'user',text,'sent',JSON.stringify([...attached,...linkedSources]),actor.account).lastInsertRowid)
      const id=Number(add.run(chat,'assistant','','running',JSON.stringify(linkedSources),actor.account).lastInsertRowid)
      db.prepare('UPDATE chat_messages SET background=?,mode=? WHERE id=?').run(Number(background),mode,id)
      return id
    }
    let message:number
    try{
      message=createOnce(db,actor.account,operationId,['turn',ws,chat,turn],acceptTurn,
        id=>!!db.prepare("SELECT 1 FROM chat_messages WHERE chat=? AND id=? AND role='assistant'").get(chat,id))
    }catch(error){
      if(error!==missingContext||!res)throw error
      res.writeHead(409,{'Content-Type':'application/json','Cache-Control':'no-store'})
      res.end(JSON.stringify({error:missingContext.message,unavailableBlock:missingContext.blocks[0],unavailableBlocks:missingContext.blocks}))
      return
    }
    if(!userMessage){
      // The stream belongs to the original request. This client can load the recorded response by ID.
      if(!res)return
      res.writeHead(background?202:200,{'Content-Type':background?'application/json':'application/x-ndjson','Cache-Control':'no-store'})
      res.end(JSON.stringify(background?{task:message,chat,replayed:true}:{message,replayed:true})+'\n')
      return
    }
    const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])
    const close=()=>controller.abort()
    // A search citation can describe a page that the agent has never opened.
    const browsedProjects=new Map<number,string>()
    const readTitles=new Map<number,string>()
    const sources=new Map<number,Source>()
    const attachmentSources=new Map<number,Source>()
    const saveSources=()=>db.prepare('UPDATE chat_messages SET sources=? WHERE id=?').run(JSON.stringify([...sources.values(),...linkedSources,...attachmentSources.values()]),message)
    const observers=new Map<ServerResponse,()=>boolean>()
    const notifySender=(event:object)=>{if(res&&!background&&!res.destroyed)res.write(JSON.stringify(event)+'\n')}
    /** A slow reader catches up from durable history independently of the provider and other readers. */
    function notify(event:object){
      const line=JSON.stringify(event)+'\n'
      if(res&&!background&&!res.destroyed)res.write(line)
      for(const [reader,canRead] of observers){
        if(canRead()&&reader.write(line))continue
        observers.delete(reader);reader.end()
      }
    }
    let answerLength=0
    const recordActivity=chatActivity(db,message,(part,detailOffset)=>notify({message,part,detailOffset}))
    /** Bind each tool and each published result to the initiating session throughout the run. */
    function requireAccess(){
      if(!signal.aborted&&!canRun())controller.abort()
      signal.throwIfAborted()
    }
    // Reserve the chat before the environment starts, including environments that finish synchronously.
    const finished=Promise.resolve().then(executeTurn)
    runs.set(chat,{workspace:ws,message,mode,agent:config!.agent,observers,controller,canRun,finished})
    return finished

    async function executeTurn(){
      try{
        if(res&&background){
          res.writeHead(202,{'Content-Type':'application/json','Cache-Control':'no-store'})
          res.end(JSON.stringify({task:message,chat}))
        }else if(res){
          if(!managed)res.once('close',close)
          res.writeHead(200,streamHeaders)
        }
        if(!managed&&!background&&res?.destroyed)controller.abort()
        requireAccess()
        /** Keep one citation per block. A range read or search can identify a more specific passage. */
        function citeBlock(source:Source){
          const index=linkedSources.findIndex(saved=>saved.id===source.id&&saved.block===source.block)
          if(index<0)linkedSources.push(source)
          else if(source.readFrom)linkedSources[index]=source
        }
        /** Persist the source when either a document preview or a text range is read. */
        function cite(id:number,title:string,block?:{id:string;text:string},surface?:Source['surface'],range?:Pick<Source,'readFrom'|'excerpt'|'excerptOffset'>){
          readTitles.set(id,title)
          sources.set(id,{...sources.get(id),id,title,...(surface&&{surface,...range})})
          if(block)citeBlock({id,title,block:block.id,excerpt:textPrefix(block.text,60)||'Empty block',...range})
          saveSources()
        }
        const read=(id:number,offsetOrBlock:number|string,surface?:Source['surface']):DocumentContext=>{
          requireAccess()
          const target=body(ws,id), document=documents.liveText(id)??agentDocument(target)
          const all=document.blocks
          const linked=typeof offsetOrBlock==='string'
          const offset=linked?all.findIndex(block=>block.id===offsetOrBlock):offsetOrBlock
          if(linked&&offset<0)reject(404,'Block unavailable')
          const preview=documentPreview(document,offset,linked)
          preview.blocks.forEach((b,i)=>observe(id,b.id,all[offset+i].text,0,b.text.length))
          cite(id,target.title,linked?all[offset]:undefined,surface)
          return {...pageSource(target),...(surface&&{surface}),...preview}
        }
        notify({message})
        const current=page===null?null:read(page,0,turn.surface==='canvas'?'canvas':undefined)
        const referencedDocuments=attached.map(source=>read(source.id,0))
        /** Include stable target and request IDs. The current turn must still read the document before editing. */
        function reviews(message:number):MessageReviews{
          const edits=db.prepare(`SELECT e.id,e.page,COALESCE(e.reviewedTitle,e.title) AS title,${editBlockColumns},CASE WHEN e.canvas THEN 'canvas' ELSE e.kind END AS kind,
            CASE WHEN e.kind='rename' THEN e.after END AS proposedTitle,e.status FROM chat_edits e WHERE e.message=? ORDER BY e.id`).all(message) as MessageReviews['edits']
          const pages=db.prepare('SELECT id,title,parent,parentName,reviewedPath,page,status FROM chat_page_requests WHERE message=? ORDER BY id').all(message) as MessageReviews['pages']
          const projects=db.prepare('SELECT id,name,beforeName,parent,parentName,reviewedPath,project,status FROM chat_project_requests WHERE message=? ORDER BY id').all(message) as MessageReviews['projects']
          return {message,edits,pages,projects}
        }
        const rows=db.prepare("SELECT id,role,status,text AS content,sources,json_extract(pluginDraft,'$.name') AS draftName FROM chat_messages WHERE chat=? AND id<? AND (text<>'' OR status IN ('unknown','interrupted','cancelled') OR pluginDraft IS NOT NULL) ORDER BY id DESC LIMIT 24").all(chat,message).reverse() as {id:number;role:'assistant'|'user';status:string;content:string;sources:string;draftName:string|null}[]
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
            if(status==='interrupted'||status==='cancelled')content+='\nThis response was interrupted. Consult its recorded decisions before continuing.'
            if(draftName&&actor.savePlugin)content+='\nSaved plugin draft: '+JSON.stringify({message:id,name:draftName})
            const {edits:decisions,pages,projects}=reviews(id)
            if(pages.length)content+='\nRecorded page creation decisions: '+JSON.stringify(pages)
            if(projects.length)content+='\nRecorded project decisions: '+JSON.stringify(projects)
            if(decisions.length)content+='\nRecorded edit decisions: '+JSON.stringify(decisions)
          }
          return {role,content}
        })
        const environment=background?backgroundEnvironment:foregroundEnvironment
        const timeZone=String(db.prepare('SELECT timeZone FROM workspaces WHERE id=?').get(ws)!.timeZone)
        const workspaceCalendar={timeZone,today:workspaceDay(timeZone)}
        const seenElements=new Map<number,Map<string,CanvasElementPreview>>()
        function readCanvas(id:number,offset:number){
          requireAccess()
          valid(canvasRead,{id,offset})
          const target=body(ws,id),batch=agentCanvas(target,offset)
          const seen=seenElements.get(id)??new Map<string,CanvasElementPreview>()
          for(const element of batch.elements)seen.set(element.id,element)
          seenElements.set(id,seen)
          cite(id,target.title,undefined,'canvas')
          return batch
        }
        if(current&&turn.surface==='canvas'){
          current.canvas=readCanvas(current.id,0)
        }
        /** The host classifies the actual mutation. Neither the model nor the caller can mark a replacement as an append. */
        function submitted(kind:'edits'|'pages'|'projects',pending:number,append=false,path?:string|null){
          if(mode!=='full'&&!(mode==='append'&&append)){notify({proposal:pending});return {pending}}
          requireAccess()
          if(kind!=='edits'){
            const result=decideCreation(kind,pending,true,{reviewedPath:path??null})
            notify({proposal:pending})
            return {applied:pending,...result}
          }
          const result=decideEdit(pending,true)
          if(result)notifySender({appliedEdit:result})
          notify({proposal:pending})
          return {applied:pending,...(result&&{page:result.page,block:result.block})}
        }
        await environment.run({registerSteer(handler){const run=runs.get(chat);if(run?.message===message)run.steer=handler},mode,settings:config,history,workspaceCalendar,current,referencedDocuments,referencedBlocks,signal,tools:{
          read,readCanvas,
          editCanvas:allowEdits?input=>{
            requireAccess()
            const {id,element,value}=valid(canvasEdit,input)
            const target=body(ws,id)
            if(!readTitles.has(id))reject(409,'Read the canvas before editing it.')
            const seen=element?seenElements.get(id)?.get(element):undefined
            if(element&&(!seen||seen.truncated||!canvasValue.shape.type.safeParse(seen.type).success))reject(409,'Read an editable canvas element before changing it.')
            if(!element&&!value)reject(400,'Choose an element to remove.')
            if(seen&&value&&value.type!==seen.type)reject(400,'Keep the original element type.')
            const saved=db.prepare('INSERT INTO chat_edits(message,page,title,block,before,after,canvas) VALUES(?,?,?,?,?,?,1)')
              .run(message,id,target.title,element??'',seen?JSON.stringify(seen):'',value?JSON.stringify(value):'')
            const result=submitted('edits',Number(saved.lastInsertRowid),!element)
            if('applied' in result&&'block' in result)return {applied:result.applied,page:id,element:result.block}
            return result
          }:undefined,
          readProperties(input){
            requireAccess()
            const batch=readProperties(ws,valid(propertyQuery,input))
            const source={...pageSource(batch),...(batch.block&&{block:batch.block})}
            if(batch.block)citeBlock(source)
            else if(!sources.has(batch.id))sources.set(batch.id,source)
            saveSources()
            return batch
          },
          listPageLinks(id,after,direction){
            requireAccess()
            const batch=documents.listPageLinks(ws,id,after,actor.origin,direction)
            if(direction==='incoming'&&batch.entries.length){
              // A backlink can cite a source without counting its unread content as reviewed for editing.
              for(const entry of batch.entries)if(!sources.has(entry.id))sources.set(entry.id,entry)
              saveSources()
            }
            return batch
          },
          listJournal(before){
            requireAccess()
            return documents.listJournal(ws,before)
          },
          readJournalDay(day){
            requireAccess()
            const id=documents.journalPageId(ws,day==='today'?workspaceCalendar.today:day)
            return id===null?null:read(id,0)
          },
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
              const links=sources.filter(source=>!source.attachment).map(({id,title,block,surface,readFrom})=>({id,title,block,surface,...(readFrom&&{readFrom})}))
              return {message:Number(row.id),role:row.role==='user'?'user':'assistant',prompt:String(row.prompt),links,
                ...(row.role==='assistant'&&{attachments:citedAttachments(sources)})}
            })
            return {messages,nextBefore:rows.length>4?messages[3].message:null}
          },
          openPage:background||!res?undefined:(id,block,surface)=>{
            if(block&&surface)reject(400,'Choose a writing block or Canvas view.')
            const document=read(id,block??0,surface??undefined)
            // Navigation is delivered once to the initiating window. Reopening shared history only shows the citation.
            notifySender({openPage:{id,title:document.title,...(block&&{block}),...(surface&&{surface})}})
            return document
          },
          readAttachment(id,file,offset){
            requireAccess()
            const result=readAttachment(db,ws,id,file,offset)
            if(typeof file==='number'&&'text' in result){
              const previous=attachmentSources.get(file)?.attachment
              attachmentSources.set(file,{id,title:result.title,attachment:{...previous,id:file,name:result.name,excerpt:previous?.excerpt??'',...(result.text&&{excerpt:textPrefix(result.text,320),readOffset:offset})}})
              saveSources()
            }
            return result
          },
          readText(id,block,offset,citationMessage,field){
            requireAccess()
            let anchor:{excerpt:string;inside:number}|undefined
            if(citationMessage!=null){
              const row=db.prepare("SELECT sources FROM chat_messages WHERE chat=? AND id=? AND id<? AND role='assistant'").get(chat,citationMessage,userMessage)
              const source=row&&(JSON.parse(String(row.sources)) as Source[]).find(s=>s.id===id&&s.readFrom?.block===block&&s.readFrom.offset===offset&&s.readFrom.field===(field??undefined))
              if(!source)reject(404,'Passage citation unavailable in this conversation.')
              // Earlier saved citations carry only an offset. New citations also locate it inside the saved excerpt.
              if(source.excerpt&&source.excerptOffset!==undefined)anchor={excerpt:source.excerpt,inside:source.excerptOffset}
            }
            const {title,item,offset:start,passage}=documents.readPassage(ws,id,block,offset,anchor,field)
            if(item&&!field)observe(id,item.id,item.text,start,start+passage.text.length)
            const range=passage.text?{readFrom:{block,offset:start,...(field&&{field})},excerpt:textPrefix(passage.text,60),excerptOffset:0}:undefined
            cite(id,title,item,block===null?'canvas':undefined,range)
            return passage
          },
          findProjects(name,offset,match){
            requireAccess()
            const result=findProjects(db,ws,name,offset,match)
            for(const entry of result.entries)browsedProjects.set(entry.id,entry.name)
            return result
          },
          browse(project,offset,name){
            requireAccess()
            const result=browseProject(db,ws,project,offset,name)
            for(const entry of result.entries)if(entry.kind==='project')browsedProjects.set(entry.id,entry.name)
            return result
          },
          async search(query){
            requireAccess()
            const results=await search(ws,query)
            requireAccess()
            for(const hit of results){
              if(!hit.block&&(hit.excerpt||!hit.attachment))sources.set(hit.id,{id:hit.id,title:hit.title,surface:hit.surface,excerpt:hit.excerpt,readFrom:hit.readFrom,excerptOffset:hit.excerptOffset})
              if(hit.attachment){
                // Keep the last passage read even if a later search finds a different location in this file.
                const read=attachmentSources.get(hit.attachment.id)?.attachment
                attachmentSources.set(hit.attachment.id,{id:hit.id,title:hit.title,attachment:{...hit.attachment,
                  ...(read?.readOffset!==undefined&&{readOffset:read.readOffset,excerpt:read.excerpt})}})
              }
              if(hit.block)citeBlock({id:hit.id,title:hit.title,block:hit.block,excerpt:hit.excerpt,readFrom:hit.readFrom,excerptOffset:hit.excerptOffset})
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
            return submitted('edits',pending)
          }:undefined,
          proposePage:allowEdits?(title,project,markdown)=>{
            requireAccess()
            const request=reviewPageDraft(db,ws,{title,project,markdown})
            const saved=db.prepare('INSERT INTO chat_page_requests(message,title,markdown,parent,parentName) VALUES(?,?,?,?,?)').run(message,request.title,request.draft.markdown,request.draft.project,request.draft.projectName)
            const pending=Number(saved.lastInsertRowid)
            return submitted('pages',pending,false,request.draft.projectName)
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
            return submitted('projects',pending,false,reviewProjectPath(db,ws,parent))
          }:undefined,
          proposeProject:allowEdits?(name,parent)=>{
            requireAccess()
            const parentName=reviewProjectPath(db,ws,parent)
            const saved=db.prepare('INSERT INTO chat_project_requests(message,name,parent,parentName) VALUES(?,?,?,?)').run(message,name,parent,parentName)
            const pending=Number(saved.lastInsertRowid)
            return submitted('projects',pending,false,parentName)
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
            return submitted('edits',Number(result.lastInsertRowid),!block)
          }:undefined,
        },activity(event){requireAccess();recordActivity(event,answerLength)},publish(delta){
          requireAccess()
          db.prepare('UPDATE chat_messages SET text=text||? WHERE id=?').run(delta,message)
          notify({message,delta,offset:answerLength})
          answerLength+=delta.length
        }})
        requireAccess()
        db.prepare("UPDATE chat_messages SET status='complete' WHERE id=?").run(message)
      }catch(error){
        const status=signal.reason==='cancelled'?'cancelled':signal.aborted?'interrupted':'failed'
        db.prepare("UPDATE chat_messages SET status=? WHERE id=? AND status='running'").run(status,message)
        const failure=error instanceof HermesSetupError?error.message:config.agent
          ?'Local '+config.agent+' request failed. Check the CLI version, login and connection.'
          :'Provider request failed. Verify the host API key, model, network and quota.'
        if(status==='failed'){
          if(entry&&getChat.get(chat,ws))db.prepare(`INSERT INTO chat_queue(id,chat,author,payload,origin,plugin,agent,revision,error)
            VALUES(?,?,?,?,?,?,?,?,?)`).run(entry.id,chat,entry.author,entry.payload,entry.origin,entry.plugin,entry.agent,Number(entry.revision)+1,failure+' Review the response before retrying.')
          notifySender({error:failure})
        }
      }finally{
        controller.abort();runs.delete(chat)
        for(const reader of observers.keys())reader.end()
        observers.clear()
        res?.off('close',close);if(res&&!background&&!res.destroyed)res.end()
      }
    }
  }
  return {handle,runningIn(workspace:number){
    return [...runs.values()].some(run=>run.workspace===workspace)
  },recheckAccess(){
    // A provider can wait silently between tools. Interrupt as soon as its initiating session loses access.
    for(const {controller,canRun,observers} of runs.values()){
      if(!canRun())controller.abort()
      for(const [reader,canRead] of observers)if(!canRead()){observers.delete(reader);reader.end()}
    }
  },async stop(){
    clearInterval(timer);stopped=true
    for(const {controller} of runs.values())controller.abort()
    await Promise.all([...runs.values()].map(run=>run.finished))
  }}
}
