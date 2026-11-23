/** Single-workspace HTTP boundary shared by the web process and Electron. SQLite owns acknowledged writes. */
import {documentEvents} from './document-events.ts'
import {propertyQuery} from '../shared/tag-fields.ts'
import { createServer, type IncomingMessage } from 'node:http'
import type {SQLInputValue} from 'node:sqlite'
import {openWorkspaceDatabase,recordWorkspaceFormat} from './workspace-database.ts'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import * as Y from 'yjs'
import {openDocumentSnapshot} from './document-snapshot.ts'
import { installDocumentSearch, searchWorkspace, textRetriever, type PageRetriever } from './retrieval.ts'

import {serverProvider} from './server-provider.ts'
import type {AgentEnvironment} from './agent-environment.ts'
import {MAX_DOCUMENT_BYTES,applyLiveUpdate,documentVector,checkpointDrafts,checkpointWriting,liveRevisionAllocator,mergeTrashedDocument,openLiveDraftJournal} from './document-checkpoint.ts'
import {requireRequesterWrite,serverAccounts} from './accounts.ts'
import {z} from 'zod'
import {tagSearchHits,tagSearchName} from '../shared/tag-search.ts'
import {linkDirection} from '../shared/page-links.ts'
import {textRange} from '../shared/text-range.ts'
import {agentDocument,documentPreview,initialEditorState} from './agent-document.ts'
import {proposalHistory} from './proposal-history.ts'
import {reviewedDocuments} from './reviewed-documents.ts'
import {toolProfileName} from '../shared/tool-profile.ts'
import {exportPageMarkdown} from '../shared/markdown-export.ts'
import {markdownImportLimit} from '../shared/markdown-file.ts'
import {createMarkdownPage,importMarkdownPage,reviewPageDraft} from './markdown.ts'
import {attachmentSizeError,maxAttachmentBytes} from '../shared/attachment-upload.ts'
import {attachmentDisposition} from '../shared/attachment-filename.ts'
import {attachmentText} from '../shared/attachment-text.ts'
import {attachmentQuery} from '../shared/attachment-read.ts'
import {installAttachmentText,readAttachment} from './attachment-text.ts'
import {createOnce} from './creation-receipts.ts'
import {alreadyApplied} from './metadata-receipts.ts'
import {renamePage} from './page-titles.ts'
import {pageSource} from '../shared/agent.ts'
import {journalCreation} from '../shared/page-draft.ts'
import {initialJournalState} from '../shared/journal-state.ts'
import {workspaceDay,workspaceReplica} from '../shared/library.ts'
import {changeWorkspaceDeletion} from './workspace-deletion.ts'
import {installWritingReferences} from './writing-references.ts'
import {workspaceTags} from './tags.ts'
import {projectLookup} from '../shared/project-lookup.ts'
import {activeProject,activeProjects,findProjects,confirmProjectPath,browseProject,createProject,renameProject,movePage,installProjects,setProjectTrashed} from './projects.ts'
import {workspaceTagFields} from './tag-fields.ts'
import {workspaceInvitations} from './invitations.ts'
import { workspaceAgent,type SavePluginFolder } from './chat.ts'
import type { Context } from '../../../../vendor/cordis/src/index.ts'
import { apiConnection,type Provider } from './mastra.ts'

type ServiceOptions = { savePlugin?:SavePluginFolder; rendererModules?:ReadonlyMap<string,string>; file:string; assets:string; host?:string; port?:number; editorKey?:string; viewerKey?:string; registration?:boolean; desktop?:boolean; retriever?:PageRetriever; provider?:Provider; backgroundEnvironment?:AgentEnvironment; context?:Context }
const mime: Record<string,string> = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.woff':'font/woff', '.woff2':'font/woff2', '.svg':'image/svg+xml' }
function fail(status:number,message:string):never { throw Object.assign(new Error(message),{status}) }
const name = (value:unknown) => typeof value === 'string' && value.trim() && value.length <= 250 ? value.trim() : fail(400,'Enter a name of 1–250 characters.')
const hostTimeZone=Intl.DateTimeFormat().resolvedOptions().timeZone
/** Validate the workspace's geographical time zone and normalize names accepted by ICU. */
function timeZone(value:unknown){
  if(typeof value!=='string'||!value||value.length>100||/^[+-]/.test(value))fail(400,'Choose a valid time zone')
  try{return new Intl.DateTimeFormat('en',{timeZone:value}).resolvedOptions().timeZone}
  catch{fail(400,'Choose a valid time zone')}
}
const same = (a:Buffer,b:Buffer) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b))
/** Read at most limit bytes before parsing input or storing an attachment. */
async function body(req:IncomingMessage, limit:number, sizeError='File or document too large.') {
  if(Number(req.headers['content-length'])>limit)fail(413,sizeError)
  const chunks:Buffer[] = []; let size = 0
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413,sizeError); chunks.push(chunk) }
  return Buffer.concat(chunks)
}
/** Open a durable workspace and return the listening server and its shutdown operation. */
export async function serve({savePlugin,rendererModules,file,assets,host='127.0.0.1',port=0,editorKey,viewerKey='',registration=false,desktop=false,retriever=textRetriever,provider,backgroundEnvironment,context}:ServiceOptions) {
  if ((desktop&&!editorKey) || (editorKey && editorKey===viewerKey)) throw new Error('Supply distinct editor and optional viewer keys.')
  const {db,version}=openWorkspaceDatabase(file)
  db.exec('PRAGMA secure_delete=ON')
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS workspaces(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS creation_receipts(actor INTEGER NOT NULL,operation TEXT NOT NULL,fingerprint TEXT NOT NULL,result INTEGER NOT NULL,PRIMARY KEY(actor,operation)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS retired_workspaces(id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY,workspace INTEGER NOT NULL REFERENCES workspaces, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pages(id INTEGER PRIMARY KEY,workspace INTEGER NOT NULL REFERENCES workspaces,title TEXT NOT NULL,project INTEGER REFERENCES projects,day TEXT,deleted INTEGER DEFAULT 0,state BLOB,rev INTEGER DEFAULT 0,plain TEXT DEFAULT '',UNIQUE(workspace,day));
    CREATE TABLE IF NOT EXISTS page_title_receipts(page INTEGER NOT NULL REFERENCES pages ON DELETE CASCADE,operation TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(page,operation)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS page_title_conflicts(id INTEGER PRIMARY KEY AUTOINCREMENT,page INTEGER NOT NULL REFERENCES pages ON DELETE CASCADE,title TEXT NOT NULL,UNIQUE(page,title));
    CREATE TABLE IF NOT EXISTS proposals(id INTEGER PRIMARY KEY,workspace INTEGER REFERENCES workspaces,page INTEGER REFERENCES pages,title TEXT NOT NULL,status TEXT DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS page_links(
      source INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      target INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      PRIMARY KEY(source,target), CHECK(source<>target));
    CREATE INDEX IF NOT EXISTS page_links_by_target ON page_links(target,source);
    CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY,page INTEGER NOT NULL REFERENCES pages,name TEXT NOT NULL,bytes BLOB NOT NULL);
    CREATE INDEX IF NOT EXISTS files_by_page ON files(page);`)
  installAttachmentText(db,version)
  installDocumentSearch(db)
  if(!db.prepare('PRAGMA table_info(pages)').all().some(column=>column.name==='trashRevision'))
    db.exec('ALTER TABLE pages ADD COLUMN trashRevision INTEGER NOT NULL DEFAULT 0')
  // Project cascades and direct page actions must use the same durable ordering.
  db.exec(`CREATE TRIGGER IF NOT EXISTS advance_page_trash_revision AFTER UPDATE OF deleted ON pages
    WHEN OLD.deleted<>NEW.deleted BEGIN UPDATE pages SET trashRevision=OLD.trashRevision+1 WHERE id=NEW.id; END`)
  if(!db.prepare('PRAGMA table_info(workspaces)').all().some(column=>column.name==='restoration'))
    db.exec('ALTER TABLE workspaces ADD COLUMN restoration INTEGER NOT NULL DEFAULT 0')
  if(!db.prepare('PRAGMA table_info(workspaces)').all().some(column=>column.name==='timeZone'))
    db.exec("ALTER TABLE workspaces ADD COLUMN timeZone TEXT NOT NULL DEFAULT 'UTC'")
  if(!db.prepare('PRAGMA table_info(workspaces)').all().some(column=>column.name==='archived'))
    db.exec('ALTER TABLE workspaces ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
  if(!db.prepare('PRAGMA table_info(proposals)').all().some(column=>column.name==='profile'))
    db.exec('ALTER TABLE proposals ADD COLUMN profile TEXT')
  if(!db.prepare('PRAGMA table_info(proposals)').all().some(column=>column.name==='edit'))
    db.exec('ALTER TABLE proposals ADD COLUMN edit TEXT')
  if(!db.prepare('PRAGMA table_info(proposals)').all().some(column=>column.name==='baseTitle'))
    db.exec('ALTER TABLE proposals ADD COLUMN baseTitle TEXT')
  // The installation ID survives backup restore and distinguishes databases served at the same origin.
  db.exec("CREATE TABLE IF NOT EXISTS installation(id INTEGER PRIMARY KEY CHECK(id=1),identity TEXT NOT NULL); INSERT OR IGNORE INTO installation(id,identity) VALUES(1,lower(hex(randomblob(16))))")
  const identity=db.prepare('SELECT identity FROM installation WHERE id=1').get()!.identity
  // Existing key-backed libraries retain their access mode even as new accounts register.
  if(!db.prepare('PRAGMA table_info(workspaces)').all().some(column=>column.name==='accessMode'))
    db.exec("ALTER TABLE workspaces ADD COLUMN accessMode TEXT NOT NULL DEFAULT 'key' CHECK(accessMode IN ('key','account'))")
  const accounts=serverAccounts(db,registration)
  if(!editorKey&&!viewerKey&&!registration&&!db.prepare('SELECT id FROM accounts LIMIT 1').get()){
    db.close()
    throw Error('Create the first administrator with create-admin, enable CHULANE_ALLOW_REGISTRATION=1, or configure a shared access key.')
  }
  if(!db.prepare('PRAGMA table_info(proposals)').all().some(column=>column.name==='requester'))
    db.exec('ALTER TABLE proposals ADD COLUMN requester INTEGER REFERENCES accounts(id)')
  if(!db.prepare('PRAGMA table_info(proposals)').all().some(column=>column.name==='draft'))
    db.exec('ALTER TABLE proposals ADD COLUMN draft TEXT')
  const history=proposalHistory(db)
  installProjects(db)
  // Recover durable live snapshots before the first client reads a page.
  const drafts=new Map<number,{rev:number;state:Buffer}>()
  const tags=workspaceTags(db,drafts)
  const syncWriting=installWritingReferences(db)
  const journalLiveDraft=openLiveDraftJournal(db)
  const presencePage=db.prepare('SELECT 1 FROM pages WHERE workspace=? AND id=? AND deleted=0')
  const events=documentEvents(accounts.presenceEnabled,(workspace,page)=>!!presencePage.get(workspace,page))
  const documents=reviewedDocuments(db,drafts,events.changed)
  const managedProvider=!desktop&&!provider&&file!==':memory:'?serverProvider(db,file):undefined
  const installationProvider=managedProvider??provider
  const invitations=workspaceInvitations(db)
  /** Search by tag assignment or by ranked text within the already authorized workspace. */
  async function search(ws:number,query:string,scope:'sources'|'pages'='sources'){
    const tag=tagSearchName(query)
    if(tag)return tagSearchHits(tags.namedSources(ws,tag),scope)
    return searchWorkspace(db,documents.liveText,scope==='pages'?textRetriever:retriever,ws,query,scope)
  }
  const agent=workspaceAgent(db,documents,search,tags.readProperties,!desktop&&installationProvider?{get:()=>installationProvider.get()}:provider,backgroundEnvironment)
  recordWorkspaceFormat(db,version)
  const agentPlugin=context?.plugin(function chatService(scope){
    scope.provide('workspaceAgent',agent)
    scope.effect(()=>agent.stop)
  })
  await agentPlugin?.await()
  const nextLiveRevision=liveRevisionAllocator(db)
  const sessions = new Map<string,{role:'editor'|'viewer';profile:string|null;account?:number}>()
  let closing=false
  const server = createServer(async (req,res) => {
    // Electron can keep polling an existing socket after the listening port has closed.
    if(closing){res.writeHead(503,{Connection:'close'});res.end();return}
    const json = (value:unknown,status=200) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(value))}
    try {
      const url = new URL(req.url||'/','http://localhost'), path=url.pathname, method=req.method
      res.setHeader('X-Content-Type-Options','nosniff')
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'")
      if (!path.startsWith('/api/')) {
        if (method !== 'GET') fail(405,'Method unavailable')
        const target=resolve(assets,'.'+(path==='/'?'/index.html':decodeURIComponent(path)))
        if (!target.startsWith(resolve(assets)+sep)) fail(404,'Missing asset')
        const bytes=await readFile(target).catch(()=>fail(404,'Missing asset'))
        res.writeHead(200,{'Content-Type':mime[extname(target)] || 'application/octet-stream'});return res.end(bytes)
      }
      if (method!=='GET' && req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) fail(403,'Cross-origin write')
      /** The browser or tool profile knows the public scheme when TLS terminates at a reverse proxy. */
      function documentOrigin(){
        const host=req.headers.host??'localhost'
        const hint=req.headers.origin??url.searchParams.get('origin')??req.headers.referer
        const publicUrl=hint?URL.parse(hint):null
        if(publicUrl&&['http:','https:'].includes(publicUrl.protocol)&&URL.parse(publicUrl.protocol+'//'+host)?.origin===publicUrl.origin)return publicUrl.origin
        return new URL('http://'+host).origin
      }
      let checkWorkspace=()=>{}
      const readBody=async(limit:number,sizeError?:string)=>{const bytes=await body(req,limit,sizeError);checkWorkspace();return bytes}
      /** Decode JSON strictly so invalid bytes cannot become replacement characters in persisted content. */
      const input=async(limit=65536,allowEmpty=false)=>{
        const bytes=await readBody(limit)
        if(allowEmpty&&!bytes.length)return {}
        try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
        catch{fail(400,'Expected valid UTF-8 JSON')}
      }
      if(path==='/api/auth'&&method==='GET')return json({accounts:!desktop,registration:!desktop&&accounts.registrationOpen(),keys:!!(editorKey||viewerKey)})
      if ((path==='/api/login'||path==='/api/register') && method==='POST') {
        if(req.headers['content-type']!=='application/json') fail(415,'JSON required')
        const data=await input(),register=path==='/api/register'
        if(register&&(desktop||!accounts.registrationOpen()))fail(403,'Registration is closed')
        if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Expected credentials')
        const {key,profile}=data
        if(profile!==undefined&&(typeof profile!=='string'||!toolProfileName.test(profile)))fail(400,'Invalid tool profile name')
        let account:number|undefined,role:'editor'|'viewer'
        if(register||data.username!==undefined){
          if(desktop)fail(403,'Server accounts are available on web')
          account=await accounts.authenticate(data.username,data.password,register?'register':'login')
          role='editor'
        }else if(typeof key==='string'&&editorKey&&same(Buffer.from(key),Buffer.from(editorKey)))role='editor'
        else if(typeof key==='string'&&viewerKey&&same(Buffer.from(key),Buffer.from(viewerKey)))role='viewer'
        else fail(403,'Invalid access key')
        const token=randomBytes(32).toString('hex'); sessions.set(token,{role,account,profile:profile??null})
        res.setHeader('Set-Cookie',`chulane=${token}; HttpOnly; SameSite=Strict; Path=/`)
        if(account!==undefined)res.setHeader('X-Chulane-Profile',identity+'/'+account)
        return json({role})
      }
      const localOwner=desktop && req.headers.authorization==='Bearer '+editorKey
      if(path==='/api/desktop/renderers'||path.startsWith('/api/desktop/renderers/')){
        if(!localOwner||method!=='GET'||!rendererModules)fail(404,'Plugin module unavailable')
        if(path==='/api/desktop/renderers')return json([...rendererModules.keys()])
        const key=/^\/api\/desktop\/renderers\/([a-f0-9]{64})\.mjs$/.exec(path)?.[1]
        const source=key&&rendererModules.get(key)
        if(source===undefined)fail(404,'Plugin module unavailable')
        res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(source)
      }
      const session=/(?:^|; )chulane=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1]||''
      const principal=sessions.get(session)
      if(!localOwner&&!principal)fail(401,'Sign in to the workspace')
      // Account-wide writes can receive their request body after the initiating session signs out.
      checkWorkspace=()=>{if(!localOwner&&!sessions.has(session))fail(401,'Sign in to the server')}
      if(path==='/api/logout'&&method==='POST'){
        sessions.delete(session);agent.recheckAccess();events.recheckAccess();res.setHeader('Set-Cookie','chulane=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/');return json({})
      }
      const rows=(sql:string,...args:SQLInputValue[])=>db.prepare(sql).all(...args)
      const run=(sql:string,...args:SQLInputValue[])=>db.prepare(sql).run(...args)
      const ws=Number(url.searchParams.get('workspace')||1)
      const account=principal?.account??null
      if(account!==null)res.setHeader('X-Chulane-Profile',identity+'/'+account)
      const serverAdmin=()=>!desktop&&accounts.isAdmin(account)
      if(path==='/api/server/provider'){
        if(!serverAdmin())fail(403,'Server administrator access required.')
        if(!managedProvider)fail(409,'This host manages its provider externally.')
        if(method==='PUT'){
          const data=apiConnection.safeParse(await input())
          if(!data.success)fail(400,'Enter a valid model and API key.')
          managedProvider.save(data.data.key,data.data.model)
        }else if(method==='DELETE')managedProvider.reset()
        else if(method!=='GET')fail(405,'Provider operation unavailable')
        return json(managedProvider.status())
      }
      if(path==='/api/server/settings'){
        if(!serverAdmin())fail(403,'Server administrator access required.')
        if(method==='PATCH'){
          const data=await input()
          if(typeof data?.presence==='boolean'&&data.registration===undefined){
            accounts.setPresence(account,data.presence)
            events.refreshPresence()
          }else if(typeof data?.registration==='boolean'&&data.presence===undefined)accounts.setRegistration(account,data.registration)
          else fail(400,'Choose one server policy to update.')
        }else if(method!=='GET')fail(405,'Settings operation unavailable')
        return json({registration:accounts.registrationOpen(),presence:accounts.presenceEnabled()})
      }
      const replicaNow=()=>account===null?undefined:workspaceReplica(identity+'/'+account,ws,Number(db.prepare('SELECT restoration FROM workspaces WHERE id=?').get(ws)?.restoration??0))
      const replica=replicaNow()
      if(req.headers['x-chulane-replica']!==undefined&&req.headers['x-chulane-replica']!==replica)
        fail(403,'Sign in to the original workspace account to sync these changes')
      const membership=()=>db.prepare('SELECT role FROM memberships WHERE workspace=? AND account=?').get(ws,account)?.role
      const currentRole=()=>localOwner?'editor':!sessions.has(session)?undefined:account===null?principal?.role:membership()
      function listWorkspaces(archived=0){
        if(account===null)return rows("SELECT id,name,timeZone FROM workspaces WHERE accessMode='key' AND archived=? ORDER BY id",archived)
        return rows(`SELECT w.id,w.name,w.timeZone,w.restoration,m.role FROM workspaces w JOIN memberships m ON m.workspace=w.id
          WHERE w.accessMode='account' AND m.account=? AND w.archived=? AND (w.archived=0 OR m.role='owner') ORDER BY w.id`,account,archived)
      }
      const sessionRole=localOwner?'editor':principal!.role
      const catalog=()=>({role:sessionRole,desktop,...(localOwner?{deletedWorkspaces:listWorkspaces(2)}:serverAdmin()?{deletedWorkspaces:rows("SELECT id,name FROM workspaces WHERE archived=2 AND accessMode='account' ORDER BY id")}:{}),...(serverAdmin()?{serverAdmin:true}:{}),...(account!==null?{profile:identity+'/'+account,invitations:invitations.incoming(account)}:{}),workspaces:listWorkspaces(),...(localOwner||account!==null?{archivedWorkspaces:listWorkspaces(1)}:{})})
      const invitation=/^\/api\/invitations\/(\d+)\/(accept|decline)$/.exec(path)
      if(invitation&&method==='POST'){
        if(account===null)fail(403,'Sign in with a server account.')
        invitations.respond(account,Number(invitation[1]),invitation[2]==='accept')
        return json(catalog())
      }
      if(path==='/api/workspaces' && method==='GET')return json(catalog())
      if(path==='/api/workspaces' && method==='POST'){
        if(sessionRole!=='editor')fail(403,'Editor access required')
        const data=await input()
        const title=name(data.name),zone=timeZone(data.timeZone??hostTimeZone)
        const id=createOnce(db,account,data.operationId,['workspace',title,data.timeZone==null?null:zone],()=>{
          const id=Number(run('INSERT INTO workspaces(id,name,timeZone,accessMode) VALUES((SELECT max(id)+1 FROM (SELECT max(id) AS id FROM workspaces UNION ALL SELECT max(id) FROM retired_workspaces)),?,?,?)',title,zone,account===null?'key':'account').lastInsertRowid)
          if(account!==null)run("INSERT INTO memberships(workspace,account,role) VALUES(?,?,'owner')",id,account)
          return id
        },id=>listWorkspaces().some(item=>item.id===id))
        return json({id})
      }
      if(path==='/api/workspaces/deletion'&&method==='PUT'){
        const action=(await input())?.action
        if(action!=='mark'&&action!=='restore'&&action!=='purge')fail(400,'Choose a workspace deletion action')
        if(!localOwner&&(account===null||!sessions.has(session)||(action==='mark'?currentRole()!=='owner':!serverAdmin())))
          fail(403,action==='mark'?'Workspace owner access required':'Administrator access required')
        if(!rows('SELECT 1 FROM workspaces WHERE id=? AND accessMode=?',ws,localOwner?'key':'account').length)fail(404,'Unknown workspace')
        if(action==='purge'&&agent.runningIn(ws))fail(409,'Wait for the interrupted agent to finish stopping.')
        changeWorkspaceDeletion(db,ws,action)
        return json(catalog())
      }
      const access=currentRole()
      if(!access)fail(404,'Unknown workspace')
      const owner=localOwner||access==='owner'
      const role=access==='owner'?'editor':access
      if(method!=='GET'&&role!=='editor')fail(403,'Editor access required')
      checkWorkspace=()=>{
        if(req.headers['x-chulane-replica']!==undefined&&replicaNow()!==replica)fail(403,'The restored workspace requires a new sync decision.')
        const permission=currentRole()
        if(!permission)fail(403,'Workspace access expired')
        if(method!=='GET'&&permission==='viewer')fail(403,'Editor access required')
      }
      const checkPermission=checkWorkspace
      const workspace=rows('SELECT timeZone FROM workspaces WHERE id=? AND accessMode=?',ws,account===null?'key':'account')[0]
      if(!workspace)fail(404,'Unknown workspace')
      if(path==='/api/workspaces/archive' && method==='PUT'){
        const archived=(await input())?.archived
        if(!localOwner&&currentRole()!=='owner')fail(403,'Workspace owner access required')
        if(typeof archived!=='boolean')fail(400,'Choose archive or restore')
        checkpointDrafts(db,drafts,{workspace:ws,include:archived?()=>true:undefined,change(){
          if(!db.prepare('SELECT 1 FROM workspaces WHERE id=? AND archived IN (0,1)').get(ws))fail(409,'Workspace is no longer in the archive.')
          run('UPDATE workspaces SET archived=? WHERE id=?',Number(archived),ws)
        }})
        if(archived){agent.recheckAccess();events.recheckAccess(ws)}
        return json(catalog())
      }
      const active=()=>!!db.prepare('SELECT id FROM workspaces WHERE id=? AND archived=0').get(ws)
      checkWorkspace=()=>{checkPermission();if(!active())fail(410,'Workspace archived')}
      checkWorkspace()
      if(path==='/api/document-events'&&method==='GET')return json(events.issue(ws,checkWorkspace,account===null?undefined:String(db.prepare('SELECT name FROM accounts WHERE id=?').get(account)!.name)))
      const offers=/^\/api\/workspaces\/invitations(?:\/(\d+))?$/.exec(path)
      if(offers){
        const data=method==='POST'||method==='PATCH'?await input():undefined
        if(account===null||currentRole()!=='owner')fail(403,'Workspace owner access required')
        if(!offers[1]&&method==='GET')return json(invitations.pending(ws))
        if(!offers[1]&&method==='POST')return json(invitations.invite(ws,data?.username,data?.role))
        if(offers[1]&&method==='PATCH')return json(invitations.revise(ws,Number(offers[1]),data?.role))
        if(offers[1]&&method==='DELETE'){invitations.revoke(ws,Number(offers[1]));return json({})}
        fail(405,'Method unavailable')
      }
      const memberRoute=/^\/api\/workspaces\/members(?:\/(\d+))?$/.exec(path)
      if(memberRoute){
        if(account===null||currentRole()!=='owner')fail(403,'Workspace owner access required')
        if(!memberRoute[1]&&method==='GET')return json(accounts.members(ws))
        if(memberRoute[1]&&(method==='DELETE'||method==='PATCH')){
          const role=method==='PATCH'?(await input())?.role:null
          if(method==='PATCH'&&typeof role!=='string')fail(400,'Choose an existing workspace role.')
          accounts.changeMember(ws,account,Number(memberRoute[1]),role)
          agent.recheckAccess();events.recheckAccess(ws)
          return json({})
        }
        fail(405,'Method unavailable')
      }
      if(/^\/api\/(?:tags(?:\/|$)|pages\/\d+\/tags(?:\/|$))/.test(path)){
        const data=method==='GET'||method==='DELETE'?{}:await input()
        if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Expected tag data')
        return json(tags.handle(path,method||'GET',ws,data,!!replica&&req.headers['x-chulane-replica']===replica))
      }
      if(path==='/api/workspaces' && method==='PATCH'){
        const zone=timeZone((await input()).timeZone)
        if(!desktop&&currentRole()!=='owner')fail(403,'Changing workspace settings requires owner access')
        run('UPDATE workspaces SET timeZone=? WHERE id=?',zone,ws)
        return json({})
      }
      /** Both explicit dates and the workspace clock resolve the same durable page, including entries in trash. */
      function journalEntry(day:string,title:string,{includeRetired=false,content='',requireNew=false}:{includeRetired?:boolean;content?:string;requireNew?:boolean}={}){
        const existing=rows('SELECT id,deleted FROM pages WHERE workspace=? AND day=?',ws,day)[0]
        if(existing?.deleted===2&&!includeRetired)fail(410,'This journal day was permanently deleted.')
        if(existing&&(content||requireNew))fail(409,'This journal day already exists. Open its page to edit the writing.')
        if(existing)return existing
        run('INSERT INTO pages(workspace,title,day,state,plain) VALUES(?,?,?,?,?) ON CONFLICT(workspace,day) DO NOTHING',ws,title,day,initialJournalState(day,content),content)
        return rows('SELECT id,deleted FROM pages WHERE workspace=? AND day=?',ws,day)[0]
      }
      if(path==='/api/journal/today' && method==='POST'){
        const day=workspaceDay(String(workspace.timeZone))
        return json(journalEntry(day,day))
      }
      if(path==='/api/agent' || path.startsWith('/api/agent/')){
        const canRun=()=>!closing&&['owner','editor'].includes(String(currentRole()))&&active()
        const result=await agent.handle(path,method||'GET',ws,input,res,canRun,{
          origin:documentOrigin(),canRead:()=>!closing&&!!currentRole()&&active(),account,owner,write:role==='editor',savePlugin:localOwner?savePlugin:undefined,
        })
        if(!res.headersSent)return json(result)
        return
      }
      const requestStatus=/^\/api\/proposals\/(\d+)$/.exec(path)
      if((path==='/api/proposals/history'||requestStatus)&&method==='GET'){
        if(role!=='editor')fail(403,'Editor access required')
        return json(requestStatus?history.status(ws,Number(requestStatus[1])):history.list(ws,url.searchParams.get('before')))
      }
      if(path==='/api/proposals' && method==='POST'){
        const inputData=await input(512*1024),page=inputData?.page??null
        const profile=localOwner?null:sessions.get(session)?.profile??null
        if(inputData?.day!==undefined){
          const parsed=journalCreation.safeParse(inputData)
          if(!parsed.success)fail(400,'Supply a valid calendar day, title, and plain text for the journal draft.')
          const {day,title,content,operationId}=parsed.data
          const pending=createOnce(db,account,operationId,['journal-proposal',ws,profile,day,title,content],()=>{
            if(rows('SELECT 1 FROM pages WHERE workspace=? AND day=?',ws,day).length)
              fail(409,'This journal day already exists. Review its page before proposing an edit.')
            return Number(run('INSERT INTO proposals(workspace,title,profile,requester,draft) VALUES(?,?,?,?,?)',
              ws,title,profile,account,JSON.stringify({day,content})).lastInsertRowid)
          },id=>!!db.prepare('SELECT 1 FROM proposals WHERE workspace=? AND id=?').get(ws,id))
          return json({pending})
        }
        const baseTitle=inputData?.baseTitle
        if(baseTitle!==undefined&&(page===null||inputData.edit!==undefined||typeof baseTitle!=='string'||!baseTitle.trim()||baseTitle.length>250))
          fail(400,'Supply the observed title of the page being renamed.')
        if(inputData?.markdown!==undefined||inputData?.project!==undefined){
          if(page!==null||inputData.edit!==undefined)fail(400,'A new page draft cannot edit an existing page.')
          const {title,draft}=reviewPageDraft(db,ws,{title:inputData.title,project:inputData.project??null,markdown:inputData.markdown===undefined?'':inputData.markdown})
          return json({pending:Number(run('INSERT INTO proposals(workspace,title,profile,requester,draft) VALUES(?,?,?,?,?)',ws,title,profile,account,JSON.stringify(draft)).lastInsertRowid)})
        }
        if(inputData?.edit!==undefined){
          const parsed=z.object({page:z.number().int().positive(),edit:z.object({block:z.string().max(1024),before:z.string().max(12000),after:z.string().max(32000)})}).safeParse(inputData)
          if(!parsed.success)fail(400,'Invalid paragraph edit')
          const {edit}=parsed.data,target=documents.read(ws,page)
          if(edit.before===edit.after||(!edit.block&&edit.before))fail(400,'Supply a changed paragraph or an append with empty before text')
          documents.checkProposalBlock(target,edit.block,edit.before)
          return json({pending:Number(run('INSERT INTO proposals(workspace,page,title,profile,requester,edit) VALUES(?,?,?,?,?,?)',ws,page,target.title,profile,account,JSON.stringify(edit)).lastInsertRowid)})
        }
        if(page!==null&&(!Number.isSafeInteger(page)||page<=0))fail(400,'Supply a positive page ID')
        const title=name(inputData?.title)
        if(page===null)return json({pending:Number(run('INSERT INTO proposals(workspace,title,profile,requester) VALUES(?,?,?,?)',ws,title,profile,account).lastInsertRowid)})
        // Capture the reviewed base in the same statement that checks the caller's observed title.
        const queued=db.prepare(`INSERT INTO proposals(workspace,page,title,profile,requester,baseTitle)
          SELECT workspace,id,?,?,?,title FROM pages WHERE id=? AND workspace=? AND deleted=0 AND (? IS NULL OR title=?)
          RETURNING id`).get(title,profile,account,page,ws,baseTitle??null,baseTitle??null)
        if(queued)return json({pending:Number(queued.id)})
        if(!rows('SELECT 1 FROM pages WHERE id=? AND workspace=? AND deleted=0',page,ws).length)fail(404,'Page unavailable')
        fail(409,'Read the current title before proposing a rename.')
      }
      const decision=/^\/api\/proposals\/(\d+)\/(approve|dismiss)$/.exec(path)
      if(decision && method==='POST'){
        const review=decision[2]==='approve'?await input(undefined,true):{}
        const pending=rows("SELECT * FROM proposals WHERE id=? AND workspace=? AND status='pending'",Number(decision[1]),ws)[0]
        if(!pending)fail(409,'Request already resolved or unavailable')
        const edit=pending.edit?JSON.parse(String(pending.edit)):null
        const kind=edit?(edit.block?'replace':'append'):pending.page===null?'create':'rename'
        const status=decision[2]==='approve'?'approve':'dismiss'
        /** Both mutation paths call this before committing, so losing write access rolls the decision and change back together. */
        function recordDecision(block:string|null){
          if(status==='approve')requireRequesterWrite(db,ws,pending.requester===null?null:Number(pending.requester))
          history.resolve(Number(pending.id),pending.page===null?null:Number(pending.page),status,kind,block,account)
        }
        if(edit&&status==='approve')return json(documents.apply(ws,{...edit,page:Number(pending.page)},review?.reviewedTitle??pending.title,recordDecision))
        db.exec('BEGIN IMMEDIATE')
        try{
          if(decision[2]==='approve'){
            if(pending.draft){
              const draft=JSON.parse(String(pending.draft))
              if(draft.day){
                // Older review clients only know how to present project destinations.
                if(review?.reviewedDay!==draft.day)fail(409,'Review the journal date before approving this entry.')
                pending.page=journalEntry(draft.day,String(pending.title),{content:draft.content,requireNew:true}).id
              }else{
                const path=confirmProjectPath(db,ws,draft.project,draft.projectName,review)
                if(path!==draft.projectName)run('UPDATE proposals SET draft=? WHERE id=?',JSON.stringify({...draft,reviewedPath:path}),pending.id)
                pending.page=createMarkdownPage(db,ws,String(pending.title),draft.project,draft.markdown)
              }
            }else if(pending.page===null)pending.page=Number(run('INSERT INTO pages(workspace,title) VALUES(?,?)',ws,pending.title).lastInsertRowid)
            else renamePage(db,ws,Number(pending.page),{title:String(pending.title),base:pending.baseTitle===null?undefined:String(pending.baseTitle),reviewedTitle:review?.reviewedTitle})
          }
          recordDecision(edit?.block||null)
          db.exec('COMMIT')
        }catch(e){db.exec('ROLLBACK');throw e}
        return json({page:pending.page})
      }
      if((path==='/api/search'||path==='/api/library/search') && method==='GET'){
        const query=url.searchParams.get('q') ?? ''
        if(query.length>4096)fail(400,'Search query exceeds 4096 characters')
        const results=await search(ws,query,path==='/api/library/search'?'pages':'sources')
        checkWorkspace();return json(results)
      }
      if(path==='/api/attachment-text'&&method==='GET'){
        const file=url.searchParams.get('file'),position=url.searchParams.get('offset')??'0'
        const query=attachmentQuery.safeParse({id:Number(url.searchParams.get('id')),file:file===null||file==='all'?file:Number(file),offset:Number(position)})
        if(!query.success||!/^\d+$/.test(position))fail(400,'Invalid attachment request')
        const {id,file:fileId,offset}=query.data
        return json(readAttachment(db,ws,id,fileId,offset))
      }
      if(path==='/api/properties'&&method==='GET'){
        const position=url.searchParams.get('offset')??'0'
        const query=propertyQuery.safeParse({id:Number(url.searchParams.get('id')),block:url.searchParams.get('block'),offset:Number(position)})
        if(!query.success||!/^\d+$/.test(position))fail(400,'Invalid property request')
        return json(tags.readProperties(ws,query.data))
      }
      if(path==='/api/document-text'&&method==='GET'){
        const position=url.searchParams.get('offset')??'0'
        const query=textRange.safeParse({id:Number(url.searchParams.get('id')),block:url.searchParams.get('block'),offset:Number(position),field:url.searchParams.get('field')})
        if(!query.success||!/^\d+$/.test(position))fail(400,'Invalid document passage request')
        const {id,block,offset}=query.data
        const {title,passage}=documents.readPassage(ws,id,block,offset,undefined,query.data.field)
        return json({id,title,...passage})
      }
      if(path==='/api/journal/entries'&&method==='GET')return json(documents.listJournal(ws,url.searchParams.get('before')))
      if(path==='/api/source' && method==='GET'){
        const day=url.searchParams.get('day')
        if(day!==null&&url.searchParams.has('id'))fail(400,'Supply either a page ID or a journal date.')
        const id=day===null?Number(url.searchParams.get('id')):documents.journalPageId(ws,day==='today'?workspaceDay(String(workspace.timeZone)):day)
        if(id===null)return json(null)
        if(url.searchParams.get('blocks')==='1'){
          const target=documents.read(ws,id)
          const position=url.searchParams.get('offset')
          const offset=Number(position)
          if(position!==null&&(!/^\d+$/.test(position)||!Number.isSafeInteger(offset)))fail(400,'Invalid block offset')
          const document=documents.liveText(target.id)??agentDocument(target)
          if(position!==null){
            const preview=documentPreview(document,offset)
            return json({...pageSource(target),...preview})
          }
          const {blocks,plain,canvasText}=document
          return json({...pageSource(target),text:plain,blocks,...(canvasText&&{canvasText})})
        }
        const page=db.prepare('SELECT id,title,day,plain AS text FROM pages WHERE id=? AND workspace=? AND deleted=0').get(id,ws) as {id:number;title:string;day:string|null;text:string}|undefined
        if(!page)fail(404,'Page unavailable')
        return json({...pageSource(page),text:documents.liveText(page.id)?.plain??page.text})
      }
      if(path==='/api/library' && method==='GET'){
        const today=workspaceDay(String(workspace.timeZone))
        // The workspace clock owns today's entry even when the first person to open the journal is a viewer.
        if(url.searchParams.get('view')==='journal')journalEntry(today,today,{includeRetired:true})
        return json({...catalog(),role,owner,replica,installation:identity,...(account!==null&&{offlinePageLinks:true,offlinePageTags:true}),...(account!==null&&accounts.presenceEnabled()&&{presence:true}),
        ...(url.searchParams.get('includeTagFields')==='1'?{tagFields:workspaceTagFields(db,ws,account!==null&&role==='editor')}:{}),
        removedPages:rows('SELECT id,day FROM pages WHERE workspace=? AND deleted=2',ws),
        namedReferences:rows('SELECT r.* FROM named_page_references r JOIN pages p ON p.id=r.source WHERE p.workspace=? AND p.deleted=0',ws),
        tags:rows('SELECT id,name,deleted FROM tags WHERE workspace=? ORDER BY name',ws),
        moveConflicts:role==='editor'?rows('SELECT c.id,c.page,c.project FROM page_move_conflicts c JOIN pages p ON p.id=c.page WHERE p.workspace=? AND p.deleted=0 ORDER BY c.id',ws):[],
        projectNameConflicts:role==='editor'?rows('SELECT c.id,c.project,c.name FROM project_name_conflicts c JOIN projects p ON p.id=c.project WHERE p.workspace=? AND p.trashRoot IS NULL ORDER BY c.id',ws):[],
        titleConflicts:role==='editor'?rows('SELECT c.id,c.page,c.title FROM page_title_conflicts c JOIN pages p ON p.id=c.page WHERE p.workspace=? AND p.deleted=0 ORDER BY c.id',ws):[],
        applications:rows('SELECT a.tag,a.page,a.block FROM tag_applications a JOIN tags t ON a.tag=t.id JOIN pages p ON p.id=a.page WHERE a.active=1 AND t.deleted=0 AND t.workspace=? AND p.workspace=? AND p.deleted=0',ws,ws),today,links:rows('SELECT source,target FROM page_links JOIN pages ON pages.id=source WHERE workspace=? ORDER BY source,target',ws),proposals:role==='editor'?rows("SELECT id,page,title,baseTitle,profile,edit,draft,(SELECT name FROM accounts WHERE id=proposals.requester) AS requestedBy FROM proposals WHERE workspace=? AND status='pending'",ws).map(p=>({...p,draft:p.draft?JSON.parse(String(p.draft)):null,edit:p.edit?JSON.parse(String(p.edit)):null})):[],projects:rows('SELECT * FROM projects WHERE workspace=? ORDER BY id',ws),pages:rows(`WITH visible AS (SELECT id,title,project,day,deleted,trashRevision,plain FROM pages WHERE workspace=? AND deleted<>2)
          SELECT visible.*, (SELECT max(f.id) FROM files f WHERE f.page=visible.id) AS lastAttachmentId ${url.searchParams.get('includeExportMetadata')==='1'?`,
            id IN (SELECT f.page FROM files f JOIN visible ON visible.id=f.page) AS hasFiles,
            id IN (SELECT v.page FROM tag_values v JOIN visible ON visible.id=v.page) AS hasFieldValues`:''}
          FROM visible ORDER BY id`,ws).map(page=>{
            const referenceBlockLengths=documents.referenceBlockLengths(Number(page.id),String(page.plain))
            return referenceBlockLengths?{...page,referenceBlockLengths}:page
          })})
      }
      if(path==='/api/projects'&&method==='GET')return json(activeProjects(db,ws))
      if(path==='/api/projects/find'&&method==='GET'){
        const position=url.searchParams.get('offset')??'0'
        const query=projectLookup.safeParse({name:url.searchParams.get('name'),match:url.searchParams.get('match')??undefined,offset:Number(position)})
        if(!query.success||!/^\d+$/.test(position))fail(400,'Supply a project name or path, a valid match mode and a nonnegative offset.')
        return json(findProjects(db,ws,query.data.name,query.data.offset,query.data.match))
      }
      if(path==='/api/projects/browse'&&method==='GET'){
        const folder=url.searchParams.get('project'),position=url.searchParams.get('offset')??'0'
        if((folder!==null&&!/^[1-9]\d*$/.test(folder))||!/^\d+$/.test(position)||!Number.isSafeInteger(Number(position)))fail(400,'Invalid folder or offset')
        return json(browseProject(db,ws,folder===null?null:Number(folder),Number(position),url.searchParams.get('name')))
      }
      if(path==='/api/projects' && method==='POST'){
        const data=await input()
        return json({id:createOnce(db,account,data.operationId,['project',ws,data.name,data.parent??null],
          ()=>createProject(db,ws,data.name,data.parent),id=>!!db.prepare('SELECT 1 FROM projects WHERE id=? AND workspace=? AND trashRoot IS NULL').get(id,ws))})
      }
      const projectRoute=/^\/api\/projects\/(\d+)$/.exec(path)
      if(projectRoute && method==='PATCH'){
        const data=await input(),id=Number(projectRoute[1])
        if(typeof data?.deleted==='boolean'&&data.name===undefined&&data.resolveName===undefined)setProjectTrashed(db,ws,id,data.deleted,drafts)
        else if(data?.deleted===undefined&&data?.name!==undefined){
          const includeTrashed=!!replica&&req.headers['x-chulane-replica']===replica&&typeof data.operationId==='string'&&data.resolveName===undefined
          renameProject(db,ws,id,data.baseName,data.name,{resolve:data.resolveName,operationId:data.operationId,includeTrashed})
        }
        else fail(400,'Invalid project change')
        return json({})
      }
      if(path==='/api/pages/import-markdown' && method==='POST'){
        const data=await input(7*1024*1024)
        if(typeof data.content!=='string')fail(400,'Expected Markdown text')
        const title=name(data.title)
        return json({id:createOnce(db,account,data.operationId,['markdown',ws,title,data.project??null,data.content],
          ()=>importMarkdownPage(db,ws,title,data.project,data.content),
          id=>!!db.prepare('SELECT 1 FROM pages WHERE id=? AND workspace=? AND deleted=0').get(id,ws))})
      }
      if(path==='/api/pages' && method==='POST') {
        const p=await input(2*1024*1024)
        if(p.content!=null && (typeof p.content!=='string'||Buffer.byteLength(p.content)>markdownImportLimit))fail(413,'Markdown import limit is 1 MiB')
        const title=name(p.title)
        if(p.day!=null){
          if(typeof p.day!=='string'||!/^\d{4}-\d\d-\d\d$/.test(p.day))fail(400,'Invalid day')
          const date=new Date(p.day+'T00:00:00Z')
          if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==p.day)fail(400,'Invalid day')
          if(p.project!=null)fail(400,'Journal pages cannot belong to a project.')
          const content=p.content??''
          return json({id:createOnce(db,account,p.operationId,['journal',ws,p.day,title,content],
            ()=>Number(journalEntry(p.day,title,{content}).id),
            id=>!!db.prepare('SELECT 1 FROM pages WHERE id=? AND workspace=? AND deleted<>2').get(id,ws))})
        }
        const id=createOnce(db,account,p.operationId,['page',ws,title,p.project??null,p.content??''],
          ()=>Number(run('INSERT INTO pages(workspace,title,project,plain) VALUES(?,?,?,?)',ws,title,activeProject(db,ws,p.project),p.content||'').lastInsertRowid),
          id=>!!db.prepare('SELECT 1 FROM pages WHERE id=? AND workspace=? AND deleted=0').get(id,ws))
        return json({id})
      }
      const match=/^\/api\/pages\/(\d+)(?:\/(state|markdown|files|links|references)(?:\/(\d+))?)?$/.exec(path)
      if(!match) fail(404,'Unknown operation')
      const id=Number(match[1]), op=match[2], p=db.prepare('SELECT id,day,deleted,trashRevision,rev FROM pages WHERE id=? AND workspace=?').get(id,ws)
      if(!p) fail(404,'Page missing')
      if(p.deleted===2){
        res.setHeader('X-Chulane-Permanently-Deleted','1')
        fail(410,'Page permanently deleted.')
      }
      if(!op&&method==='DELETE'){
        if(!owner)fail(403,'Only the workspace owner can permanently delete pages.')
        const reviewed=req.headers['x-chulane-trash-revision']
        if(reviewed!==undefined&&(typeof reviewed!=='string'||!/^\d+$/.test(reviewed)))fail(400,'Invalid Trash revision.')
        db.exec('BEGIN IMMEDIATE')
        try{
          const target=db.prepare('SELECT p.trashRevision,pr.trashRoot FROM pages p LEFT JOIN projects pr ON pr.id=p.project WHERE p.id=? AND p.workspace=?').get(id,ws)
          if(target?.trashRoot!=null)fail(409,'Restore the project first.')
          if(reviewed!==undefined&&reviewed!==String(target?.trashRevision))fail(409,'This page changed in Trash. Review it again before deleting.')
          // Retain the ID and calendar date so a delayed writer or stale link cannot target a replacement.
          const changed=run("UPDATE pages SET deleted=2,state=NULL,plain='',title='',project=NULL,projectTrash=NULL,rev=rev+1 WHERE id=? AND workspace=? AND deleted=1",id,ws)
          if(!changed.changes)fail(409,'Move this page to Trash first.')
          for(const table of ['files','tag_applications','page_title_conflicts','page_title_receipts','page_move_conflicts'])
            run('DELETE FROM '+table+' WHERE page=?',id)
          run('DELETE FROM page_links WHERE source=? OR target=?',id,id)
          run("UPDATE chat_edits SET status='dismissed' WHERE page=? AND status='pending'",id)
          for(const item of rows("SELECT id,edit FROM proposals WHERE page=? AND status='pending'",id)){
            const edit=item.edit?JSON.parse(String(item.edit)):null
            history.resolve(Number(item.id),id,'dismiss',edit?(edit.block?'replace':'append'):'rename',edit?.block||null)
          }
          db.exec('COMMIT')
        }catch(error){db.exec('ROLLBACK');throw error}
        drafts.delete(id)
        return json({})
      }
      if(!op && method==='PATCH') {
        const data=await input()
        if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Invalid page change.')
        // A collaborator can trash the page or its parent while the request body is arriving.
        const current=db.prepare('SELECT p.deleted,pr.trashRoot FROM pages p LEFT JOIN projects pr ON pr.id=p.project WHERE p.id=? AND p.workspace=?').get(id,ws)
        if(!current||current.deleted===2)fail(410,'Page permanently deleted.')
        // Only durable metadata from the authorized replica can follow a page into Trash.
        const fromReplica=!!replica&&req.headers['x-chulane-replica']===replica&&typeof data.operationId==='string'&&data.deleted===undefined
        const hasTitle=data.title!==undefined,hasMove=data.project!==undefined
        if((!hasTitle&&(data.baseTitle!==undefined||data.resolveTitle!==undefined))||
           (!hasMove&&(data.baseProject!==undefined||data.resolveMove!==undefined)))fail(400,'Missing metadata change.')
        const replay=fromReplica&&(!hasTitle||(typeof data.baseTitle==='string'&&data.resolveTitle===undefined))&&
          (!hasMove||(data.baseProject!==undefined&&data.resolveMove===undefined))
        if(!replay&&current.trashRoot!==null)fail(409,'Restore the project first')
        if(data.deleted!==undefined){
          if(typeof data.deleted!=='boolean'||hasTitle||hasMove)fail(400,'Send trash or restore separately from other page changes.')
          checkpointDrafts(db,drafts,{workspace:ws,include:data.deleted?page=>page.id===id:undefined,change(){
            if(!run('UPDATE pages SET deleted=? WHERE id=? AND deleted<>2',Number(data.deleted),id).changes)fail(410,'Page permanently deleted.')
          }})
        }
        else{
          if(!hasTitle&&!hasMove)fail(400,'Invalid change')
          if(current.deleted&&!replay)fail(410,'Restore the page before editing its metadata.')
          const base=data.baseTitle===undefined?undefined:name(data.baseTitle)
          if(data.resolveTitle!==undefined&&(!Number.isSafeInteger(data.resolveTitle)||data.resolveTitle<=0||base===undefined))fail(400,'Invalid title resolution')
          const title=hasTitle?name(data.title):undefined
          // Single-field deliveries retain fingerprints created by earlier desktop releases.
          const rename=[title,base,data.resolveTitle]
          const move={project:data.project,baseProject:data.baseProject,resolveMove:data.resolveMove}
          const payload=hasTitle&&hasMove?{rename,move}:hasTitle?rename:move
          db.exec('BEGIN IMMEDIATE')
          try{
            if(!alreadyApplied(db,'page',id,data.operationId,payload)){
              if(title!==undefined)renamePage(db,ws,id,{title,base,resolve:data.resolveTitle},replay)
              if(hasMove)movePage(db,ws,id,data.project,data.baseProject,data.resolveMove,replay)
            }
            db.exec('COMMIT')
          }catch(error){db.exec('ROLLBACK');throw error}
        }
        return json({})
      }
      if(op==='state'&&!match[3]&&method==='POST'&&url.searchParams.get('merge')==='1'){
        if(!replica||req.headers['x-chulane-replica']!==replica)fail(403,'The original workspace replica is required.')
        const incoming=await readBody(MAX_DOCUMENT_BYTES)
        mergeTrashedDocument(db,drafts,ws,id,incoming)
        res.writeHead(204);return res.end()
      }
      const linkWrite=op==='links'&&!!match[3]&&(method==='PUT'||method==='DELETE')
      const linkOperation=req.headers['idempotency-key']
      const linkReplay=linkWrite&&!!replica&&req.headers['x-chulane-replica']===replica&&typeof linkOperation==='string'
      if(p.deleted&&!linkReplay){
        res.setHeader('X-Chulane-Page-Trashed','1')
        res.setHeader('X-Chulane-Trash-Revision',String(p.trashRevision))
        fail(410,'Page is in the trash')
      }
      if(op==='links'&&!match[3]&&method==='GET'){
        const cursor=url.searchParams.get('after')??'0',after=Number(cursor)
        if(!/^\d+$/.test(cursor)||!Number.isSafeInteger(after))fail(400,'Invalid linked page cursor')
        const direction=linkDirection.safeParse(url.searchParams.get('direction')??'outgoing')
        if(!direction.success)fail(400,'Expected incoming or outgoing links')
        return json(documents.listPageLinks(ws,id,after,documentOrigin(),direction.data))
      }
      if(op==='references'&&!match[3]&&method==='POST'){
        db.exec('BEGIN IMMEDIATE')
        try{syncWriting(id);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
        return json({})
      }
      if(linkWrite){
        const target=Number(match[3])
        if(target===id)fail(400,'Choose another page')
        const destination=db.prepare('SELECT deleted FROM pages WHERE workspace=? AND id=?').get(ws,target)
        if(!destination)fail(404,'Page unavailable')
        db.exec('BEGIN IMMEDIATE')
        try{
          if(!alreadyApplied(db,'page',id,linkOperation,{link:target,method})){
            if(method==='PUT'){
              if(destination.deleted&&!linkReplay)fail(410,'Linked page is in the trash')
              // A retired target has a permanent tombstone. Late deliveries cannot recreate an incoming link.
              if(destination.deleted!==2)run('INSERT INTO page_links(source,target) VALUES(?,?) ON CONFLICT DO NOTHING',id,target)
            }else run('DELETE FROM page_links WHERE source=? AND target=?',id,target)
          }
          db.exec('COMMIT')
        }catch(error){db.exec('ROLLBACK');throw error}
        return json({})
      }
      if(op==='markdown' && !match[3] && method==='GET'){
        const page=db.prepare('SELECT state,plain FROM pages WHERE id=?').get(id)!
        const files=db.prepare('SELECT id,name FROM files WHERE page=? ORDER BY id').all(id)
        const origin=desktop?null:url.searchParams.get('origin')
        if(origin!==null){
          const base=URL.parse(origin)
          if(!base||!['http:','https:'].includes(base.protocol)||base.origin!==origin)fail(400,'Expected an HTTP or HTTPS server origin.')
        }
        const targets=db.prepare('SELECT p.id,p.title,p.deleted FROM page_links l JOIN pages p ON p.id=l.target WHERE l.source=? AND p.workspace=? AND p.deleted<>2 ORDER BY p.id').all(id,ws)
        const references=targets.map(p=>({id:Number(p.id),title:String(p.title),deleted:Number(p.deleted)}))
        return json(await exportPageMarkdown(drafts.get(id)?.state??page.state as Uint8Array|null,String(page.plain),ws,origin,references,{
          installation:String(identity),page:id,files:files.map(f=>({id:Number(f.id),name:String(f.name)})),hasFiles:files.length>0,
          tagged:!!db.prepare('SELECT 1 FROM tag_applications a JOIN tags t ON t.id=a.tag WHERE a.page=? AND a.active=1 AND t.deleted=0 LIMIT 1').get(id),
          fields:!!db.prepare('SELECT 1 FROM tag_values WHERE page=? LIMIT 1').get(id),
        }))
      }
      if(op==='state' && method==='GET'){
        res.setHeader('Accept-Patch','application/octet-stream')
        const draft=drafts.get(id), revision=draft?.rev ?? Number(p.rev)
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Revision',revision)
        if(url.searchParams.get('since')===String(revision)){res.writeHead(204);return res.end()}
        /** Readers echo the vector of their last server snapshot. Legacy and initial opens receive complete bytes. */
        function sendState(state:Uint8Array){
          const known=req.headers['x-yjs-state-vector'],since=url.searchParams.get('since')
          res.setHeader('Content-Type','application/octet-stream')
          if(typeof known==='string'){
            // Bound the next request header even for documents that accumulated many distinct Yjs writers.
            const vector=documentVector(state)
            if(vector)res.setHeader('X-Yjs-State-Vector',vector)
            if(known && known.length<=4096 && since!==null && /^-?\d+$/.test(since)){
              let delta:Uint8Array
              try{delta=Y.diffUpdate(state,Buffer.from(known,'base64'))}
              catch{return res.end(state)}
              if(delta.byteLength<state.byteLength){
                res.setHeader('X-Yjs-Delta-From',since)
                return res.end(delta)
              }
            }
          }
          return res.end(state)
        }
        if(draft)return sendState(draft.state)
        const page=documents.read(ws,id)
        if(page.state)return sendState(page.state)
        // Concurrent first opens must share the same Yjs structs as well as the original paragraph ID.
        const initial=typeof p.day==='string'&&!page.plain?initialJournalState(p.day):initialEditorState(page)
        run('UPDATE pages SET state=? WHERE id=? AND state IS NULL AND plain=?',initial,id,page.plain)
        const saved=db.prepare('SELECT rev,state FROM pages WHERE id=? AND workspace=? AND deleted=0').get(id,ws)
        if(!saved)fail(410,'Page unavailable')
        res.setHeader('X-Revision',Number(saved.rev))
        return sendState(saved.state as Uint8Array)
      }
      const livePatch=op==='state'&&!match[3]&&url.searchParams.has('live')&&method==='PATCH'
      if(op==='state' && (method==='PUT'||livePatch)){
        const bytes=await readBody(MAX_DOCUMENT_BYTES)
        // Older renderers prefix the state with their own UTF-8 writing projection.
        const prefix=req.headers['x-text-bytes']
        const binary=prefix===undefined && req.headers['content-type']==='application/octet-stream'
        if(livePatch&&!binary)fail(415,'Expected a binary Yjs update')
        const textLength=binary?0:Number(prefix)
        if(!Number.isSafeInteger(textLength)||textLength<0||textLength>=bytes.length) fail(400,'Invalid document frame')
        const state=bytes.subarray(textLength)
        // Recheck after reading the async body so competing writers cannot overwrite a newer draft.
        const current=db.prepare('SELECT rev FROM pages WHERE id=? AND deleted=0').get(id)
        if(!current)fail(410,'Page unavailable')
        if(Number(req.headers['if-match'])!==(drafts.get(id)?.rev ?? current.rev))fail(409,'Document changed; merge and retry')
        if(url.searchParams.has('live')){
          const snapshot=livePatch?applyLiveUpdate(drafts.get(id)?.state??documents.read(ws,id).state,state):state
          const rev=nextLiveRevision()
          journalLiveDraft(id,snapshot)
          drafts.set(id,{rev,state:snapshot})
          events.changed(ws,id)
          return json(livePatch?{rev,vector:documentVector(snapshot)}:{rev})
        }
        let plain:string
        if(binary)plain=checkpointWriting(id,state)
        else{
          try{openDocumentSnapshot(state).destroy()}catch{fail(400,'Invalid document state')}
          plain=bytes.subarray(0,textLength).toString()
        }
        const result=run('UPDATE pages SET state=?,plain=?,rev=rev+1 WHERE id=? AND rev=? AND deleted=0',state,plain,id,current.rev)
        if(!result.changes) fail(409,'Document changed; merge and retry')
        drafts.delete(id)
        events.changed(ws,id)
        return json({rev:Number(current.rev)+1,referenceBlockLengths:documents.referenceBlockLengths(id,plain)})
      }
      if(op==='files'){
        if(method==='POST'||(method==='PUT'&&!match[3])){
          const operation=req.headers['idempotency-key']
          if(method==='PUT'&&operation===undefined)fail(400,'Supply an Idempotency-Key for this upload.')
          const filename=url.searchParams.get('name')
          if(!filename||filename==='.'||filename==='..'||/[\/\0]/.test(filename)||Array.from(filename).length>255)
            fail(400,'Supply a filename of up to 255 characters.')
          const bytes=await readBody(maxAttachmentBytes,attachmentSizeError)
          if(!rows('SELECT id FROM pages WHERE id=? AND deleted=0',id).length)fail(410,'Page is in the trash')
          const store=()=>Number(run('INSERT INTO files(page,name,bytes,extractedText) VALUES(?,?,?,?)',id,filename,bytes,attachmentText(filename,bytes)).lastInsertRowid)
          if(operation===undefined)return json({id:store()})
          const digest=createHash('sha256').update(bytes).digest('hex')
          return json({id:createOnce(db,account,operation,['file',ws,id,filename,digest],store,
            file=>!!db.prepare('SELECT 1 FROM files WHERE id=? AND page=?').get(file,id))})
        }
        if(method==='GET' && !match[3])return json(rows('SELECT id,name,length(bytes) AS size FROM files WHERE page=?',id))
        if(method==='GET'){
          const f=db.prepare('SELECT name,bytes FROM files WHERE id=? AND page=?').get(Number(match[3]),id)
          if(!f)fail(404,'File missing')
          res.setHeader('Cache-Control','no-store');res.setHeader('Content-Disposition',attachmentDisposition(String(f.name)));res.setHeader('Content-Type','application/octet-stream');return res.end(f.bytes)
        }
      }
      fail(405,'Method unavailable')
    } catch(error){if(!error.status) console.error(error);json({error:error.status?error.message:'Workspace operation failed'},error.status||500)}
  })
  events.attach(server)
  await new Promise<void>((ok,no)=>server.once('error',no).listen(port,host,ok))
  let shutdown:Promise<void>|undefined
  /** Drain accepted requests before promoting the final live revisions and closing their database. */
  async function drain(){
    closing=true
    events.close()
    const stopped=new Promise<void>(ok=>server.close(()=>ok()))
    if(agentPlugin)await agentPlugin.dispose();else await agent.stop()
    await stopped
    checkpointDrafts(db,drafts)
    db.close()
  }
  return {server,url:`http://${host}:${(server.address() as import('node:net').AddressInfo).port}`,close:()=>shutdown??=drain().catch(error=>{shutdown=undefined;throw error})}
}
