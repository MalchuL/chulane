/** Single-workspace HTTP boundary shared by the web process and Electron. SQLite owns acknowledged writes. */
import { createServer, type IncomingMessage } from 'node:http'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import * as Y from 'yjs'
import { textRetriever, type PageRetriever, type SearchablePage } from './retrieval.ts'

import { workspaceAgent } from './chat.ts'
import type { Context } from '../../../../vendor/cordis/src/index.ts'
import type { Provider } from './mastra.ts'

type ServiceOptions = { file:string; assets:string; host?:string; port?:number; editorKey?:string; viewerKey?:string; desktop?:boolean; retriever?:PageRetriever; provider?:Provider; context?:Context }
const mime: Record<string,string> = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.woff':'font/woff', '.woff2':'font/woff2', '.svg':'image/svg+xml' }
function fail(status:number,message:string):never { throw Object.assign(new Error(message),{status}) }
const name = (value:unknown) => typeof value === 'string' && value.trim() && value.length <= 250 ? value.trim() : fail(400,'Enter a name of 1–250 characters.')
const same = (a:Buffer,b:Buffer) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b))
/** Read at most limit bytes before parsing input or storing an attachment. */
async function body(req:IncomingMessage, limit:number) {
  const chunks:Buffer[] = []; let size = 0
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413,'File or document too large.'); chunks.push(chunk) }
  return Buffer.concat(chunks)
}
/** Open a durable workspace and return the listening server and its shutdown operation. */
export async function serve({file,assets,host='127.0.0.1',port=0,editorKey,viewerKey='',desktop=false,retriever=textRetriever,provider,context}:ServiceOptions) {
  if (!editorKey || editorKey === viewerKey) throw new Error('Supply distinct editor and optional viewer keys.')
  const db = new DatabaseSync(file)
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS workspaces(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
    INSERT OR IGNORE INTO workspaces VALUES(1,'Personal library');
    CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY,workspace INTEGER NOT NULL REFERENCES workspaces, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pages(id INTEGER PRIMARY KEY,workspace INTEGER NOT NULL REFERENCES workspaces,title TEXT NOT NULL,project INTEGER REFERENCES projects,day TEXT,deleted INTEGER DEFAULT 0,state BLOB,rev INTEGER DEFAULT 0,plain TEXT DEFAULT '',UNIQUE(workspace,day));
    CREATE TABLE IF NOT EXISTS proposals(id INTEGER PRIMARY KEY,workspace INTEGER REFERENCES workspaces,page INTEGER REFERENCES pages,title TEXT NOT NULL,status TEXT DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY,page INTEGER NOT NULL REFERENCES pages,name TEXT NOT NULL,bytes BLOB NOT NULL);`)
  // Negative revisions identify volatile snapshots; SQLite revisions start at zero.
  const drafts=new Map<number,{rev:number;state:Buffer}>()
  const agent=workspaceAgent(db,drafts,retriever,provider)
  const stopAgent=async()=>{agent.stop();await agent.settle()}
  const agentPlugin=context?.plugin(function chatService(scope){
    scope.provide('workspaceAgent',agent)
    scope.effect(()=>stopAgent)
  })
  await agentPlugin?.await()
  let draftRev=-1
  const sessions = new Map<string,'editor'|'viewer'>()
  const server = createServer(async (req,res) => {
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
      const input=async(limit=65536)=>{try{return JSON.parse((await body(req,limit)).toString())}catch(e){fail(e.status||400,'Invalid request')}}
      if (path==='/api/login' && method==='POST') {
        if(req.headers['content-type']!=='application/json') fail(415,'JSON required')
        const {key}=await input()
        const role=typeof key==='string' && (same(Buffer.from(key),Buffer.from(editorKey))?'editor':viewerKey && same(Buffer.from(key),Buffer.from(viewerKey))?'viewer':null)
        if(!role) fail(403,'Invalid access key')
        const token=randomBytes(32).toString('hex'); sessions.set(token,role)
        res.setHeader('Set-Cookie',`chulane=${token}; HttpOnly; SameSite=Strict; Path=/`)
        return json({role})
      }
      const role=desktop && req.headers.authorization==='Bearer '+editorKey?'editor':sessions.get(/(?:^|; )chulane=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1]||'')
      if(!role) fail(401,'Sign in to the workspace')
      if(method!=='GET' && role!=='editor') fail(403,'Editor access required')
      const rows=(sql:string,...args:SQLInputValue[])=>db.prepare(sql).all(...args)
      const run=(sql:string,...args:SQLInputValue[])=>db.prepare(sql).run(...args)
      const ws=Number(url.searchParams.get('workspace')||1)
      if(path==='/api/workspaces' && method==='POST')return json({id:Number(run('INSERT INTO workspaces(name) VALUES(?)',name((await input()).name)).lastInsertRowid)})
      if(!rows('SELECT id FROM workspaces WHERE id=?',ws).length)fail(404,'Unknown workspace')
      if(path==='/api/agent' || path.startsWith('/api/agent/')){
        const result=await agent.handle(path,method||'GET',ws,input,res)
        if(!res.headersSent)return json(result)
        return
      }
      if(path==='/api/proposals' && method==='POST'){
        const inputData=await input(),page=inputData.page??null,title=name(inputData.title)
        if(page!==null && !rows('SELECT id FROM pages WHERE id=? AND workspace=? AND deleted=0',page,ws).length)fail(404,'Page unavailable')
        return json({pending:Number(run('INSERT INTO proposals(workspace,page,title) VALUES(?,?,?)',ws,page,title).lastInsertRowid)})
      }
      const decision=/^\/api\/proposals\/(\d+)\/(approve|dismiss)$/.exec(path)
      if(decision && method==='POST'){
        const pending=rows("SELECT * FROM proposals WHERE id=? AND workspace=? AND status='pending'",Number(decision[1]),ws)[0]
        if(!pending)fail(409,'Request already resolved or unavailable')
        db.exec('BEGIN IMMEDIATE')
        try{
          if(decision[2]==='approve'){
            if(pending.page===null)pending.page=Number(run('INSERT INTO pages(workspace,title) VALUES(?,?)',ws,pending.title).lastInsertRowid)
            else if(!run('UPDATE pages SET title=? WHERE id=? AND workspace=? AND deleted=0',pending.title,pending.page,ws).changes)fail(410,'Page unavailable')
          }
          run('UPDATE proposals SET page=?,status=? WHERE id=?',pending.page,decision[2],pending.id);db.exec('COMMIT')
        }catch(e){db.exec('ROLLBACK');throw e}
        return json({page:pending.page})
      }
      if(path==='/api/search' && method==='GET'){
        const query=url.searchParams.get('q') ?? ''
        if(query.length>4096)fail(400,'Search query exceeds 4096 characters')
        const pages=rows('SELECT id,title,plain FROM pages WHERE workspace=? AND deleted=0 ORDER BY id',ws) as SearchablePage[]
        const matches=await retriever.search(ws,query,pages)
        // Recheck after the asynchronous lookup. An index can return a stale or foreign source ID.
        const eligible=new Set(pages.map(page=>page.id))
        const results: Pick<SearchablePage, 'id' | 'title'>[]=[]
        for(const id of new Set(matches)){
          if(!eligible.has(id))continue
          const page=db.prepare('SELECT id,title FROM pages WHERE id=? AND workspace=? AND deleted=0').get(id,ws)
          if(page)results.push({id:Number(page.id),title:String(page.title)})
          if(results.length===30)break
        }
        return json(results)
      }
      if(path==='/api/source' && method==='GET'){
        const page=db.prepare('SELECT id,title,plain AS text FROM pages WHERE id=? AND workspace=? AND deleted=0').get(Number(url.searchParams.get('id')),ws)
        if(!page)fail(404,'Page unavailable')
        return json(page)
      }
      if(path==='/api/library' && method==='GET') return json({role,desktop,proposals:role==='editor'?rows("SELECT id,page,title FROM proposals WHERE workspace=? AND status='pending'",ws):[],workspaces:rows('SELECT * FROM workspaces'),projects:rows('SELECT * FROM projects WHERE workspace=? ORDER BY id',ws),pages:rows('SELECT id,title,project,day,deleted,plain FROM pages WHERE workspace=? ORDER BY id',ws)})
      if(path==='/api/projects' && method==='POST') return json({id:Number(run('INSERT INTO projects(workspace,name) VALUES(?,?)',ws,name((await input()).name)).lastInsertRowid)})
      const project=(id:number|null|undefined)=>id==null?null:rows('SELECT id FROM projects WHERE id=? AND workspace=?',id,ws)[0]?.id ?? fail(400,'Unknown project')
      if(path==='/api/pages' && method==='POST') {
        const p=await input(2*1024*1024)
        if(p.content!=null && (typeof p.content!=='string'||Buffer.byteLength(p.content)>1024*1024))fail(413,'Markdown import limit is 1 MiB')
        if(p.day && !/^\d{4}-\d\d-\d\d$/.test(p.day)) fail(400,'Invalid day')
        const title=name(p.title)
        if(p.day) run('INSERT INTO pages(workspace,title,day) VALUES(?,?,?) ON CONFLICT(workspace,day) DO NOTHING',ws,title,p.day)
        const id=p.day?rows('SELECT id FROM pages WHERE workspace=? AND day=?',ws,p.day)[0].id:Number(run('INSERT INTO pages(workspace,title,project,plain) VALUES(?,?,?,?)',ws,title,project(p.project),p.content||'').lastInsertRowid)
        return json({id})
      }
      const match=/^\/api\/pages\/(\d+)(?:\/(state|files)(?:\/(\d+))?)?$/.exec(path)
      if(!match) fail(404,'Unknown operation')
      const id=Number(match[1]), op=match[2], p=db.prepare('SELECT id,deleted,rev FROM pages WHERE id=?').get(id)
      if(!p) fail(404,'Page missing')
      if(!op && method==='PATCH') {
        const data=await input()
        if(typeof data.deleted==='boolean') run('UPDATE pages SET deleted=? WHERE id=?',Number(data.deleted),id)
        else if(!p.deleted && data.title!==undefined) run('UPDATE pages SET title=? WHERE id=?',name(data.title),id)
        else if(!p.deleted && 'project' in data && rows('SELECT id FROM pages WHERE id=? AND workspace=? AND day IS NULL',id,ws).length) run('UPDATE pages SET project=? WHERE id=?',project(data.project),id)
        else fail(400,'Invalid change')
        return json({})
      }
      if(p.deleted) fail(410,'Page is in the trash')
      if(op==='state' && method==='GET'){
        const draft=drafts.get(id), revision=draft?.rev ?? Number(p.rev)
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Revision',revision)
        if(url.searchParams.get('since')===String(revision)){res.writeHead(204);return res.end()}
        return res.end(draft?.state ?? db.prepare('SELECT state FROM pages WHERE id=?').get(id)?.state)
      }
      if(op==='state' && method==='PUT'){
        const bytes=await body(req,16*1024*1024)
        // Rivto sends the complete binary state and its search projection in one versioned write.
        const textLength=Number(req.headers['x-text-bytes'])
        if(!Number.isSafeInteger(textLength)||textLength<0||textLength>=bytes.length) fail(400,'Invalid document frame')
        const state=bytes.subarray(textLength)
        const probe=new Y.Doc()
        try {Y.applyUpdate(probe,state)} catch {fail(400,'Invalid document state')} finally {probe.destroy()}
        // Recheck after reading the async body so competing writers cannot overwrite a newer draft.
        const current=db.prepare('SELECT rev FROM pages WHERE id=? AND deleted=0').get(id)
        if(!current)fail(410,'Page unavailable')
        if(Number(req.headers['if-match'])!==(drafts.get(id)?.rev ?? current.rev))fail(409,'Document changed; merge and retry')
        if(url.searchParams.has('live')){
          drafts.set(id,{rev:--draftRev,state})
          return json({rev:draftRev})
        }
        const result=run('UPDATE pages SET state=?,plain=?,rev=rev+1 WHERE id=? AND rev=? AND deleted=0',state,bytes.subarray(0,textLength).toString(),id,current.rev)
        if(!result.changes) fail(409,'Document changed; merge and retry')
        drafts.delete(id)
        return json({rev:Number(current.rev)+1})
      }
      if(op==='files'){
        if(method==='POST'){
          const filename=name(url.searchParams.get('name')),bytes=await body(req,16*1024*1024)
          if(!rows('SELECT id FROM pages WHERE id=? AND deleted=0',id).length)fail(410,'Page is in the trash')
          run('INSERT INTO files(page,name,bytes) VALUES(?,?,?)',id,filename,bytes);return json({})
        }
        if(method==='GET' && !match[3])return json(rows('SELECT id,name,length(bytes) AS size FROM files WHERE page=?',id))
        if(method==='GET'){
          const f=db.prepare('SELECT name,bytes FROM files WHERE id=? AND page=?').get(Number(match[3]),id)
          if(!f)fail(404,'File missing')
          res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(String(f.name)));res.setHeader('Content-Type','application/octet-stream');return res.end(f.bytes)
        }
      }
      fail(405,'Method unavailable')
    } catch(error){if(!error.status) console.error(error);json({error:error.status?error.message:'Workspace operation failed'},error.status||500)}
  })
  await new Promise<void>((ok,no)=>server.once('error',no).listen(port,host,ok))
  return {server,url:`http://${host}:${(server.address() as import('node:net').AddressInfo).port}`,close:async()=>{const stopped=new Promise<void>(ok=>server.close(()=>ok()));if(agentPlugin)await agentPlugin.dispose();else await stopAgent();await stopped;db.close()}}
}
