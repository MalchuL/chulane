/** Exercises real HTTP, role enforcement, revision conflicts, attachments and a cold backup restore. */
import test from 'node:test'
import {once} from 'node:events'
import {execFile,spawnSync} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {mkdtemp,copyFile,rm,mkdir,readdir,writeFile,readFile} from 'node:fs/promises'
import * as Y from 'yjs'
import type {TagTable} from '../../src/shared/tag-fields.ts'
import {serve} from '../../src/server/service.ts'
test('role boundary, journal uniqueness, binary document and attachment survive cold restore',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-test-'))
  let host:Awaited<ReturnType<typeof serve>>|null=null
  t.after(async()=>{if(host)await host.close();await rm(dir,{recursive:true,force:true})})
  const open=(file:string)=>serve({file:join(dir,file),assets:dir,editorKey:'test-edit',viewerKey:'test-read'})
  host=await open('first.sqlite')
  let cookie=''
  const call=(path:string,method='GET',body?:BodyInit,headers:Record<string,string>={})=>fetch(host!.url+'/api/'+path,{method,body,headers:{Cookie:cookie,...headers}})
  const post=(path:string,data:object)=>call(path,'POST',JSON.stringify(data),{'Content-Type':'application/json'})
  async function login(key:string){cookie=(await post('login',{key})).headers.get('set-cookie')!.split(';')[0]}
  assert.equal((await call('library')).status,401)
  await login('test-edit')
  await post('workspaces',{name:'Original workspace'})
  const create=()=>post('pages',{title:'Today',day:'2026-11-20'}).then(r=>r.json())
  const {id}=await create();assert.equal((await create()).id,id)
  const p='pages/'+id, d=new Y.Doc();d.getText('test').insert(0,'hello')
  const bytes=Buffer.concat([Buffer.from('hello'),Y.encodeStateAsUpdate(d)])
  const put=()=>call(p+'/state','PUT',bytes,{'If-Match':'0','X-Text-Bytes':'5'})
  assert.equal((await put()).status,200);assert.equal((await put()).status,409)
  const filename="  e\u0301 O'Brien (field)* "+'x'.repeat(225)+'.bin  '
  const upload=await call(p+'/files?name='+encodeURIComponent(filename),'POST',Buffer.from([0,255]))
  assert.equal(upload.status,200)
  const {id:fileId}=await upload.json()
  for(const invalid of ['','.', '..','nested/name','broken\0suffix','x'.repeat(256)]){
    assert.equal((await call(p+'/files?name='+encodeURIComponent(invalid),'POST',Buffer.from([1]))).status,400)
  }
  const oversized=await call(p+'/files?name=oversize.bin','PUT',Buffer.alloc(16*1024*1024+1),{'Idempotency-Key':'a'.repeat(32)})
  assert.equal(oversized.status,413)
  assert.match((await oversized.json()).error,/16 MiB/)
  const {id:target}=await(await post('pages',{title:'Source material'})).json()
  const renamePath='pages/'+target
  const draftTitle={baseTitle:'Source material',title:'Field analysis',operationId:'a'.repeat(32)}
  assert.equal((await call(renamePath,'PATCH',JSON.stringify({baseTitle:'Source material',title:'Survey data'}))).status,200)
  assert.equal((await call(renamePath,'PATCH',JSON.stringify(draftTitle))).status,200)
  const [titleConflict]=(await(await call('library')).json()).titleConflicts
  const keepTitle=JSON.stringify({baseTitle:'Survey data',resolveTitle:titleConflict.id,title:'Survey data'})
  const link=p+'/links/'+target
  const receipt={'Idempotency-Key':'c'.repeat(32)}
  assert.equal((await call(link,'PUT',undefined,receipt)).status,200)
  assert.equal((await call(link,'DELETE')).status,200)
  assert.equal((await call(link,'PUT',undefined,receipt)).status,200)
  assert.deepEqual((await(await call('library')).json()).links,[])
  assert.equal((await call(link,'DELETE',undefined,receipt)).status,409)
  assert.equal((await call(link,'PUT')).status,200)
  const {id:tag}=await(await post('tags',{name:'Reference'})).json()
  const assignment=JSON.stringify({tag,block:'',active:true})
  const taggedOnce=JSON.stringify({tag,block:'',active:true,operationId:'d'.repeat(32)})
  assert.equal((await call(p+'/tags','PUT',taggedOnce)).status,200)
  assert.equal((await call(p+'/tags','PUT',JSON.stringify({tag,block:'',active:false}))).status,200)
  assert.equal((await call(p+'/tags','PUT',taggedOnce)).status,200)
  assert.deepEqual((await(await call('library')).json()).applications,[])
  assert.equal((await call(p+'/tags','PUT',JSON.stringify({tag,block:'',active:false,operationId:'d'.repeat(32)}))).status,409)
  assert.equal((await call(p+'/tags','PUT',assignment)).status,200)
  const fieldPath='tags/'+tag+'/fields'
  const {id:field}=await(await post(fieldPath,{name:'Reviewed',kind:'checkbox'})).json()
  const cell=fieldPath+'/'+field+'/value',checked=JSON.stringify({page:id,block:'',value:false})
  assert.equal((await call(cell,'PUT',checked)).status,200)
  const exported=await(await call(p+'/markdown')).json()
  assert.ok(exported.omitted.includes('tag field values'))
  assert.match(exported.markdown,/## Attachments/)
  assert.ok(!exported.markdown.includes('/api/pages/'))
  const portable=await(await call(p+'/markdown?origin='+encodeURIComponent(host.url))).json()
  const fileUrl=host.url+'/api/'+p+'/files/'+fileId+'?workspace=1'
  assert.ok(portable.markdown.includes(fileUrl))
  assert.ok(portable.omitted.includes('attachments'))
  assert.equal((await fetch(fileUrl)).status,401)
  assert.deepEqual(Buffer.from(await(await fetch(fileUrl,{headers:{Cookie:cookie}})).arrayBuffer()),Buffer.from([0,255]))
  assert.ok(!(await(await call(renamePath+'/markdown')).json()).omitted.includes('tag field values'))
  const edit={block:'',before:'',after:'Append after restore'}
  const queued=await(await post('proposals',{page:target,edit})).json()
  const decision='proposals/'+queued.pending+'/approve'
  const pending=await (await post('proposals',{title:'After restart'})).json()
  await login('test-read');assert.equal((await put()).status,403);assert.equal((await create()).error,'Editor access required')
  await host.close();host=null;await copyFile(join(dir,'first.sqlite'),join(dir,'restored.sqlite'))
  host=await open('restored.sqlite');await login('test-read')
  assert.deepEqual((await(await call('library')).json()).titleConflicts,[])
  assert.equal((await call(renamePath,'PATCH',keepTitle)).status,403)
  assert.deepEqual((await(await call('library')).json()).links,[{source:id,target}])
  assert.deepEqual(await(await call('tags/'+tag+'/sources')).json(),[{id,title:'Today'}])
  assert.equal((await(await call('tags/'+tag+'/table')).json()).rows[0].values[field],false)
  assert.equal((await call(cell,'PUT',checked)).status,403)
  assert.equal((await call(fieldPath+'/'+field,'DELETE')).status,403)
  assert.equal((await post('tags',{name:'Viewer tag'})).status,403)
  assert.equal((await call(p+'/tags','PUT',assignment)).status,403)
  assert.equal((await call('tags/'+tag,'PATCH',JSON.stringify({deleted:true}))).status,403)
  assert.equal((await call(link,'DELETE')).status,403)
  assert.equal((await call(link,'PUT')).status,403)
  const restored=new Y.Doc();Y.applyUpdate(restored,new Uint8Array(await (await call(p+'/state')).arrayBuffer()))
  assert.equal(restored.getText('test').toString(),'hello')
  const [attachment]=await (await call(p+'/files')).json();assert.equal(attachment.name,filename)
  assert.equal(attachment.id,fileId)
  const download=await call(p+'/files/'+fileId)
  const disposition=download.headers.get('Content-Disposition')!
  assert.ok(disposition.includes('O%27Brien%20%28field%29%2A'))
  assert.equal(decodeURIComponent(disposition.slice("attachment; filename*=UTF-8''".length)),filename)
  assert.equal(download.headers.get('Cache-Control'),'no-store')
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),Buffer.from([0,255]))
  assert.equal((await(await call('library')).json()).pages[0].plain,'hello')
  assert.equal((await post('proposals/'+pending.pending+'/approve',{})).status,403)
  assert.equal((await post(decision,{})).status,403)
  assert.equal((await call('proposals/history')).status,403)
  await login('test-edit')
  assert.deepEqual((await(await call('library')).json()).titleConflicts,[titleConflict])
  assert.equal((await call(renamePath,'PATCH',keepTitle)).status,200)
  assert.equal((await call(renamePath,'PATCH',JSON.stringify(draftTitle))).status,200)
  assert.deepEqual((await(await call('library')).json()).titleConflicts,[])
  assert.equal((await(await call('source?id='+target)).json()).title,'Survey data')
  assert.equal((await(await call('source?id='+target)).json()).text,'')
  assert.deepEqual((await(await call('library')).json()).proposals.find(p=>p.id===queued.pending).edit,edit)
  assert.equal((await post(decision,{})).status,200)
  assert.equal((await post(decision,{})).status,409)
  assert.equal((await(await call('source?id='+target)).json()).text,'Append after restore')
  assert.equal((await post('proposals/'+pending.pending+'/approve',{})).status,200)
  assert.equal((await post('proposals/'+pending.pending+'/approve',{})).status,409)
  assert.equal((await(await call('library')).json()).pages.filter(p=>p.title==='After restart').length,1)
  const recorded=(await(await call('proposals/history')).json()).items
  assert.deepEqual(recorded.map(d=>d.kind),['create','append'])
  await host.close();host=await open('restored.sqlite');await login('test-edit')
  assert.deepEqual((await(await call('proposals/history')).json()).items,recorded)
})

test('opening a text-only page preserves its pending paragraph review through restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-initial-block-')),file=join(dir,'library.sqlite')
  const open=()=>serve({file,assets:dir,editorKey:'editor',desktop:true})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer editor','Content-Type':'application/json'},body:JSON.stringify(data)})
  await call('workspaces',{name:'Research'})
  const {id}=await(await call('pages',{title:'Field notes',content:'First observation'})).json()
  const {pending}=await(await call('proposals',{page:id,edit:{block:'@import',before:'First observation',after:'Revised observation'}})).json()
  const read=()=>call('pages/'+id+'/state').then(response=>response.arrayBuffer()).then(bytes=>new Uint8Array(bytes))
  const [left,right]=await Promise.all([read(),read()])
  assert.ok(left.length>0,'the first two editors must receive a shared CRDT baseline')
  assert.deepEqual(left,right)
  await host.close();host=await open()
  assert.deepEqual(await read(),left)
  assert.equal((await call('proposals/'+pending+'/approve',{})).status,200)
  assert.equal((await(await call('source?id='+id)).json()).text,'Revised observation')
  assert.equal((await call('proposals/'+pending+'/approve',{})).status,409)
})

test('restore and administrator bootstrap leave incompatible database files untouched',async t=>{
  const {DatabaseSync}=await import('node:sqlite')
  const dir=await mkdtemp(join(tmpdir(),'chulane-format-')),file=join(dir,'workspace.sqlite')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const host=await serve({file,assets:dir,editorKey:'edit'})
  await host.close()
  const source=new DatabaseSync(file)
  source.exec('PRAGMA journal_mode=DELETE; PRAGMA user_version=12345')
  source.close()
  const bytes=await readFile(file)
  const expected=/format 12345.*newer/i
  await assert.rejects(async()=>{
    const unexpected=await serve({file,assets:dir,editorKey:'edit'})
    await unexpected.close()
  },expected)
  const cli=promisify(execFile)
  await assert.rejects(cli(process.execPath,['src/tools/backup.ts','--verify',file]),expected)
  const bootstrap=execFile(process.execPath,['--import','tsx','src/server/main.ts','create-admin','Operator'],{env:{...process.env,CHULANE_DATA:dir}})
  const stopped=once(bootstrap,'close')
  let message=''
  bootstrap.stderr!.on('data',chunk=>{message+=chunk})
  bootstrap.stdin!.end('a private fixture password')
  assert.notEqual((await stopped)[0],0)
  assert.match(message,expected)
  assert.deepEqual(await readFile(file),bytes)
  assert.deepEqual(await readdir(dir),['workspace.sqlite'])
})

test('an operator can provision an ordinary account while public registration stays closed',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-provision-'))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const password='a private test password'
  const provision=(command:string,name:string,input=password)=>spawnSync(process.execPath,['--import','tsx','src/server/main.ts',command,name],{
    input,encoding:'utf8',timeout:5000,env:{...process.env,CHULANE_DATA:dir,PORT:'0'}
  })
  const first=provision('create-user','Reader')
  assert.match(first.stderr,/Create a server administrator first/)
  assert.equal(first.status,1)
  assert.equal(provision('create-admin','Operator').status,0)
  const host=await serve({file:join(dir,'workspace.sqlite'),assets:dir})
  t.after(()=>host.close())
  const created=provision('create-user','Reader')
  assert.equal(created.status,0,created.stderr)
  assert.match(provision('create-user','READER','a different test password').stderr,/Username unavailable/)
  const post=(path:string,username:string)=>fetch(host.url+'/api/'+path,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})})
  assert.equal((await post('register','Stranger')).status,403)
  const login=await post('login','reader')
  assert.equal(login.status,200)
  const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]}
  const catalog=await(await fetch(host.url+'/api/workspaces',{headers})).json()
  assert.equal((await fetch(host.url+'/api/server/settings',{headers})).status,403)
  assert.deepEqual(catalog.workspaces,[])
})

test('terminal bootstrap retries a mismatch and never echoes the administrator password',{skip:process.platform!=='linux'},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-terminal-bootstrap-'))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const password='synthetic-terminal-password'
  // util-linux script provides a real TTY for the CLI's hidden input flow.
  const child=execFile('script',['-qefc','node --import tsx src/server/main.ts create-admin Operator','/dev/null'],
    {env:{...process.env,CHULANE_DATA:dir},timeout:15000})
  const closed=once(child,'close')
  const steps=[['Administrator password',password],['Confirm password','incorrect-confirmation'],
    ['Passwords differ',null],['Administrator password',password],['Confirm password',password]] as const
  let step=0,cursor=0,output=''
  child.stdout!.on('data',chunk=>{
    output+=chunk
    while(step<steps.length){
      const [prompt,reply]=steps[step]
      const index=output.indexOf(prompt,cursor)
      if(index<0)break
      cursor=index+prompt.length
      step++
      if(reply!==null)child.stdin!.write(reply+'\r')
    }
  })
  assert.equal((await closed)[0],0)
  assert.equal(step,steps.length)
  assert.match(output,/Server administrator created/)
  assert.ok(!output.includes(password)&&!output.includes('incorrect-confirmation'))
})

test('legacy flat projects remain navigable across migration, subtree trash and cold restart',async t=>{
  const {DatabaseSync}=await import('node:sqlite')
  const dir=await mkdtemp(join(tmpdir(),'chulane-project-upgrade-')),file=join(dir,'workspace.sqlite')
  const db=new DatabaseSync(file)
  db.exec(`CREATE TABLE workspaces(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
    INSERT INTO workspaces VALUES(1,'Legacy');
    CREATE TABLE projects(id INTEGER PRIMARY KEY,workspace INTEGER NOT NULL,name TEXT NOT NULL);
    INSERT INTO projects VALUES(7,1,'Survey');
    CREATE TABLE pages(id INTEGER PRIMARY KEY,workspace INTEGER NOT NULL,title TEXT NOT NULL,project INTEGER,day TEXT,deleted INTEGER DEFAULT 0,state BLOB,rev INTEGER DEFAULT 0,plain TEXT DEFAULT '',UNIQUE(workspace,day));
    INSERT INTO pages(id,workspace,title,project,plain) VALUES(20,1,'Old note',7,'Original content');
    CREATE TABLE proposals(id INTEGER PRIMARY KEY,workspace INTEGER,page INTEGER,title TEXT NOT NULL,status TEXT DEFAULT 'pending');
    INSERT INTO proposals VALUES(9,1,20,'Old note','approve');
    CREATE TABLE files(id INTEGER PRIMARY KEY,page INTEGER NOT NULL REFERENCES pages,name TEXT NOT NULL,bytes BLOB NOT NULL);
    INSERT INTO files VALUES(4,20,'field.txt',CAST('Legacy survey point' AS BLOB));
    CREATE TABLE chats(id INTEGER PRIMARY KEY,workspace INTEGER NOT NULL REFERENCES workspaces,title TEXT NOT NULL);
    INSERT INTO chats VALUES(5,1,'Old conversation');`)
  db.close()
  const open=()=>serve({file,assets:dir,editorKey:'edit'})
  let host=await open(),cookie=''
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(path:string,method='GET',data?:object)=>fetch(host.url+'/api/'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)})
  async function login(){cookie=(await call('login','POST',{key:'edit'})).headers.get('set-cookie')!.split(';')[0]}
  await login()
  const marked=new DatabaseSync(file,{readOnly:true})
  try{assert.equal(marked.prepare('PRAGMA user_version').get()!.user_version,6)}finally{marked.close()}
  const upgraded=await(await call('library')).json()
  assert.deepEqual((await(await call('agent')).json()).chats,[{id:5,title:'Old conversation',canDelete:true}])
  const [legacy]=(await(await call('proposals/history')).json()).items
  assert.equal(legacy.id,9);assert.equal(legacy.kind,'page');assert.equal(legacy.decidedAt,null)
  assert.equal(upgraded.projects[0].parent,null)
  assert.equal(upgraded.workspaces[0].timeZone,'UTC')
  assert.equal((await call('projects/7','PATCH',{deleted:true})).status,200)
  await host.close();host=await open();await login()
  assert.equal((await call('source?id=20')).status,404)
  assert.equal((await call('projects/7','PATCH',{deleted:false})).status,200)
  assert.equal((await(await call('source?id=20')).json()).text,'Original content')
  const [hit]=await(await call('search?q=survey%20point')).json()
  assert.deepEqual(hit.attachment,{id:4,name:'field.txt',excerpt:'Legacy survey point',matchOffset:7})
  assert.equal(await(await call('pages/20/files/4')).text(),'Legacy survey point')
})

test('shutdown drains accepted writes and stops serving new requests on their keep-alive socket',async t=>{
  const {connect}=await import('node:net')
  const dir=await mkdtemp(join(tmpdir(),'chulane-drain-'))
  const file=join(dir,'workspace.sqlite')
  const host=await serve({file,assets:dir,editorKey:'edit',desktop:true})
  await fetch(host.url+'/api/workspaces',{method:'POST',headers:{Authorization:'Bearer edit','Content-Type':'application/json'},body:JSON.stringify({name:'Drain test'})})
  const socket=connect(Number(new URL(host.url).port),'127.0.0.1')
  let stop:Promise<void>|undefined,received=''
  t.after(async()=>{socket.destroy();await (stop??host.close());await rm(dir,{recursive:true,force:true})})
  socket.setEncoding('utf8')
  socket.on('data',chunk=>{received+=chunk})
  const closed=once(socket,'close')
  await once(socket,'connect')
  const accepted=once(host.server,'request')
  const data=JSON.stringify({title:'Accepted before shutdown'})
  socket.write('POST /api/pages HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer edit\r\nContent-Type: application/json\r\nContent-Length: '+data.length+'\r\n\r\n')
  await accepted
  stop=host.close()
  socket.write(data+'GET /api/library HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer edit\r\nConnection: close\r\n\r\n')
  await closed;await stop
  assert.match(received,/HTTP\/1.1 200 OK/)
  assert.equal(received.match(/HTTP\/1.1 200 OK/g)?.length,1)
  const {DatabaseSync}=await import('node:sqlite')
  const db=new DatabaseSync(file)
  try{assert.equal(db.prepare('SELECT title FROM pages').get()?.title,'Accepted before shutdown')}finally{db.close()}
})

test('opening a fresh local profile leaves workspace creation to its owner across restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-first-run-'))
  const open=()=>serve({file:join(dir,'local.sqlite'),assets:dir,editorKey:'local',desktop:true})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',
    headers:{Authorization:'Bearer local','Content-Type':'application/json'},body:JSON.stringify(data)})
  assert.deepEqual((await(await call('workspaces')).json()).workspaces,[])
  assert.equal((await call('library')).status,404)
  await host.close();host=await open()
  assert.deepEqual((await(await call('workspaces')).json()).workspaces,[])
  const {id}=await(await call('workspaces',{name:'My research',timeZone:'Europe/London'})).json()
  await host.close();host=await open()
  assert.deepEqual((await(await call('workspaces')).json()).workspaces,[{id,name:'My research',timeZone:'Europe/London'}])
})

test('portable snapshots reject unreadable page states and live drafts that need a missing base',async t=>{
  const {DatabaseSync}=await import('node:sqlite')
  const dir=await mkdtemp(join(tmpdir(),'chulane-snapshot-state-')),source=join(dir,'workspace.sqlite')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const host=await serve({file:source,assets:dir,editorKey:'edit'})
  await host.close()
  const db=new DatabaseSync(source)
  t.after(()=>db.close())
  db.exec("INSERT INTO workspaces(id,name) VALUES(1,'Library'); INSERT INTO pages(id,workspace,title) VALUES(2,1,'Notes')")
  const cli=(...args:string[])=>promisify(execFile)(process.execPath,['src/tools/backup.ts',...args])
  db.prepare('UPDATE pages SET state=? WHERE id=2').run(Uint8Array.of(255))
  await assert.rejects(cli('--verify',source),/Invalid document state in pages for page 2/)
  await assert.rejects(cli(source,join(dir,'bad.sqlite')),/Invalid document state in pages for page 2/)
  const doc=new Y.Doc()
  const text=doc.getText('observations')
  text.insert(0,'Survey')
  const base=Y.encodeStateVector(doc)
  db.prepare('UPDATE pages SET state=? WHERE id=2').run(Y.encodeStateAsUpdate(doc))
  text.delete(0,1)
  db.prepare("INSERT INTO live_document_drafts(page,state,plain) VALUES(2,?,'urvey')").run(Y.encodeStateAsUpdate(doc,base))
  doc.destroy()
  await assert.rejects(cli('--restore',source,join(dir,'restored')),/Invalid document state in live_document_drafts for page 2/)
  assert.ok(!(await readdir(dir)).some(name=>name==='restored'||name==='bad.sqlite'))
})

test('incomplete stamped databases fail verification, restore and startup before missing data can be recreated',async t=>{
  const {DatabaseSync}=await import('node:sqlite')
  const dir=await mkdtemp(join(tmpdir(),'chulane-incomplete-')),source=join(dir,'workspace.sqlite')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const host=await serve({file:source,assets:dir,editorKey:'edit'})
  await host.close()
  const backup=(...args:string[])=>promisify(execFile)(process.execPath,['src/tools/backup.ts',...args])
  const file=join(dir,'candidate.sqlite')
  for(const [sql,reason] of [
    ['PRAGMA user_version=0',/Unrecognized workspace database format/],
    ['DROP TABLE files',/Missing workspace table: files/],
    ['DROP TABLE creation_receipts',/Missing workspace table: creation_receipts/],
    ['DROP TABLE tag_values',/Missing workspace table: tag_values/],
    ['DROP TABLE chat_edits',/Missing workspace table: chat_edits/],
    ['ALTER TABLE chat_messages RENAME COLUMN sources TO old_sources',/Missing workspace column: chat_messages.sources/],
    ['DROP TABLE workspace_invitations',/Missing workspace table: workspace_invitations/],
    ['ALTER TABLE memberships RENAME COLUMN role TO old_role',/Missing workspace column: memberships.role/],
    ['DELETE FROM installation',/Missing Chulane installation identity/],
    ["UPDATE installation SET identity='invalid'",/Invalid Chulane installation identity/],
  ] as const){
    await copyFile(source,file)
    const db=new DatabaseSync(file)
    try{db.exec('PRAGMA journal_mode=DELETE');db.exec(sql)}finally{db.close()}
    const before=await readFile(file)
    await assert.rejects(backup('--verify',file),reason)
    await assert.rejects(backup(file,join(dir,'snapshot')),reason)
    await assert.rejects(backup('--restore',file,join(dir,'restored')),reason)
    await assert.rejects(async()=>{
      const unexpected=await serve({file,assets:dir,editorKey:'edit'})
      await unexpected.close()
    },reason)
    assert.deepEqual(await readFile(file),before)
    assert.deepEqual((await readdir(dir)).sort(),['candidate.sqlite','workspace.sqlite'])
  }
})

test('workspace backup restores credentials, settings and membership without device credentials',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-accounts-'))
  const open=(file:string,registration:boolean)=>serve({file:join(dir,file),assets:dir,registration,editorKey:'shared'})
  let host=await open('library.db',true)
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(cookie:string,path:string,data?:object,method=data?'POST':'GET')=>fetch(host.url+'/api/'+path,{
    method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)})
  async function session(path:string,data:object){
    const response=await call('',path,data)
    assert.equal(response.status,200)
    return response.headers.get('set-cookie')!.split(';')[0]
  }
  const credentials={username:'Writer',password:'a long test password'}
  const writer=await session('register',credentials), other=await session('register',{...credentials,username:'Other'})
  const shared=await session('login',{key:'shared'})
  assert.equal((await call('','register',{...credentials,username:'writer'})).status,409)
  const {id}=await(await call(writer,'workspaces',{name:'Private'})).json()
  const {id:legacy}=await(await call(shared,'workspaces',{name:'Shared'})).json()
  const invite=await call(writer,'workspaces/invitations?workspace='+id,{username:'Other',role:'viewer'})
  assert.equal(invite.status,200)
  const invitation=(await invite.json()).id
  const original=(await(await call(writer,'library?workspace='+id)).json()).replica
  assert.equal(typeof original,'string')
  assert.equal((await(await call(shared,'library?workspace='+legacy)).json()).replica,undefined)
  const mismatched=await fetch(host.url+'/api/pages/1/state?workspace='+id,{method:'PUT',headers:{Cookie:writer,'X-Chulane-Replica':original+'-different'},body:'stale replica'})
  assert.equal(mismatched.status,403)
  const scope='?workspace='+id
  const page=(await(await call(writer,'pages'+scope,{title:'Private draft'})).json()).id
  const tag=(await(await call(writer,'tags'+scope,{name:'Survey'})).json()).id
  const field=(await(await call(writer,'tags/'+tag+'/fields'+scope,{name:'Count',kind:'number'})).json()).id
  assert.equal((await call(writer,'pages/'+page+'/tags'+scope,{tag,block:'',active:true},'PUT')).status,200)
  assert.equal((await call(writer,'tags/'+tag+'/fields/'+field+'/value'+scope,{page,block:'',value:7},'PUT')).status,200)
  assert.equal((await call(writer,'workspaces?workspace='+id,{timeZone:'Europe/London'},'PATCH')).status,200)
  for(const cookie of [other,shared]){
    for(const path of ['library','agent','pages/1/state','source?id=1','search?q=Private']){
      assert.equal((await call(cookie,path+(path.includes('?')?'&':'?')+'workspace='+id)).status,404)
    }
    assert.equal((await call(cookie,'pages?workspace='+id,{title:'Unauthorized'})).status,404)
  }
  assert.equal((await call(writer,'library?workspace='+legacy)).status,404)
  assert.deepEqual((await(await call(other,'workspaces')).json()).workspaces,[])
  assert.equal((await call(writer,'workspaces/archive?workspace='+id,{archived:true},'PUT')).status,200)
  assert.deepEqual((await(await call(other,'workspaces')).json()).archivedWorkspaces,[])
  const backupDir=join(dir,'restore')
  await mkdir(backupDir)
  await writeFile(join(dir,'ai-provider.json'),'device configuration')
  const destination=join(backupDir,'workspace.sqlite')
  const command=[join(process.cwd(),'src/tools/backup.ts'),join(dir,'library.db'),destination]
  await promisify(execFile)(process.execPath,command)
  await assert.rejects(promisify(execFile)(process.execPath,command),/EEXIST/)
  assert.deepEqual(await readdir(backupDir),['workspace.sqlite'])
  const verify=(file:string)=>promisify(execFile)(process.execPath,[command[0]!, '--verify',file])
  const bytes=await readFile(destination)
  assert.match((await verify(destination)).stdout,/Verified Chulane workspace format 6/)
  assert.deepEqual(await readFile(destination),bytes)
  const damaged=join(dir,'damaged.sqlite')
  await copyFile(destination,damaged)
  const {DatabaseSync}=await import('node:sqlite')
  const oldSnapshot=new DatabaseSync(damaged)
  try{oldSnapshot.exec('PRAGMA application_id=0; PRAGMA user_version=0')}finally{oldSnapshot.close()}
  const unversioned=await readFile(damaged)
  assert.match((await verify(damaged)).stdout,/workspace format 0/)
  assert.deepEqual(await readFile(damaged),unversioned)
  const db=new DatabaseSync(damaged)
  try{db.exec('PRAGMA foreign_keys=OFF; UPDATE workspace_invitations SET account=-1')}finally{db.close()}
  await assert.rejects(verify(damaged),/foreign key.*workspace_invitations/i)
  const partial=join(dir,'partial.sqlite')
  const incomplete=new DatabaseSync(partial)
  try{incomplete.exec("PRAGMA application_id=0x43484c4e; PRAGMA user_version=2; CREATE TABLE installation(id INTEGER PRIMARY KEY,identity TEXT); INSERT INTO installation VALUES(1,'test')")}finally{incomplete.close()}
  await assert.rejects(verify(partial),/Missing workspace table: workspaces/)

  const copy=(...args:string[])=>promisify(execFile)(process.execPath,[command[0]!,...args])
  const rejected=join(dir,'invalid-backup.sqlite'),restoredDir=join(dir,'restored-deployment')
  await assert.rejects(copy(damaged,rejected),/foreign key.*workspace_invitations/i)
  await assert.rejects(copy('--restore',damaged,restoredDir),/foreign key.*workspace_invitations/i)
  assert.ok(!(await readdir(dir)).includes('invalid-backup.sqlite'))
  assert.ok(!(await readdir(dir)).includes('restored-deployment'))
  await copy('--restore',destination,restoredDir)
  assert.deepEqual(await readdir(restoredDir),['workspace.sqlite'])
  const restoredBytes=await readFile(join(restoredDir,'workspace.sqlite'))
  await assert.rejects(copy('--restore',destination,restoredDir),/exist/i)
  assert.deepEqual(await readFile(join(restoredDir,'workspace.sqlite')),restoredBytes)

  await writeFile(damaged,bytes.subarray(0,100))
  await assert.rejects(verify(damaged))
  // A later write to the original installation cannot change the published snapshot.
  await call(writer,'workspaces/archive?workspace='+id,{archived:false},'PUT')
  await host.close();host=await open('restored-deployment/workspace.sqlite',false)
  assert.equal((await call(writer,'workspaces')).status,401)
  assert.equal((await call('','register',{...credentials,username:'Closed'})).status,403)
  assert.equal((await call('','login',{...credentials,password:'wrong'})).status,403)
  const restored=await session('login',{...credentials,username:'writer'})
  assert.equal((await(await call(restored,'workspaces')).json()).archivedWorkspaces[0].id,id)
  await call(restored,'workspaces/archive?workspace='+id,{archived:false},'PUT')
  const lib=await(await call(restored,'library?workspace='+id)).json()
  const table:TagTable=await(await call(restored,'tags/'+tag+'/table'+scope)).json()
  assert.equal(table.fields.find(item=>item.id===field)?.name,'Count')
  assert.equal(table.rows.find(item=>item.id===page&&!item.block)?.values[field],7)
  assert.equal(lib.replica,original)
  assert.equal(lib.owner,true);assert.equal(lib.pages[0].title,'Private draft')
  assert.equal(lib.workspaces[0].timeZone,'Europe/London')
  const invitee=await session('login',{...credentials,username:'Other'})
  assert.equal((await call(invitee,'library?workspace='+id)).status,404)
  assert.equal((await call(invitee,'invitations/'+invitation+'/accept',{})).status,200)
  assert.equal((await(await call(invitee,'library?workspace='+id)).json()).role,'viewer')
  await call(restored,'logout',{})
  assert.equal((await call(restored,'library?workspace='+id)).status,401)
})

test('trashed document replay is bound to the editing replica and survives a host restart',async t=>{
  const {importMarkdown}=await import('../../src/server/markdown.ts')
  const dir=await mkdtemp(join(tmpdir(),'chulane-trashed-replay-')),file=join(dir,'shared.sqlite')
  const open=()=>serve({file,assets:dir,registration:true})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(path:string,cookie:string,method='GET',data?:object)=>fetch(host.url+'/api/'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)})
  const password='field station password'
  async function signIn(username:string,path:string){
    const result=await call(path,'','POST',{username,password})
    return result.headers.get('set-cookie')!.split(';')[0]
  }
  let owner=await signIn('Owner','register')
  const viewer=await signIn('Reader','register')
  await call('workspaces',owner,'POST',{name:'Station'})
  const {DatabaseSync}=await import('node:sqlite')
  const db=new DatabaseSync(file)
  db.exec("INSERT INTO memberships SELECT 1,id,'viewer' FROM accounts WHERE name='Reader'");db.close()
  const {id}=await(await call('pages/import-markdown',owner,'POST',{title:'Log',content:'Server entry'})).json()
  const replica=(await(await call('library',owner)).json()).replica
  const readerReplica=(await(await call('library',viewer)).json()).replica
  const {id:destination}=await(await call('pages',owner,'POST',{title:'Destination'})).json()
  const {id:tag}=await(await call('tags',owner,'POST',{name:'Surveyed'})).json()
  const assignment='pages/'+id+'/tags',fields='tags/'+tag+'/fields'
  const assigned={tag,block:'',active:true}
  const receipt='a'.repeat(32)
  const replayTag=(cookie:string,replica:string,data={...assigned,operationId:receipt})=>fetch(host.url+'/api/'+assignment,{method:'PUT',
    headers:{Cookie:cookie,'Content-Type':'application/json','X-Chulane-Replica':replica},body:JSON.stringify(data)})
  assert.equal((await call(assignment,owner,'PUT',assigned)).status,200)
  const {id:field}=await(await call(fields,owner,'POST',{name:'Verified',kind:'checkbox'})).json()
  assert.equal((await call(fields+'/'+field+'/value',owner,'PUT',{page:id,block:'',value:false})).status,200)
  assert.equal((await call(assignment,owner,'PUT',{...assigned,active:false})).status,200)
  const snapshot=async(cookie:string)=>(await(await call('library?includeTagFields=1',cookie)).json()).tagFields.cells
  assert.deepEqual(await snapshot(owner),[{tag,page:id,block:'',field,value:false}])
  assert.deepEqual(await snapshot(viewer),[])
  const linkPath='pages/'+id+'/links/'+destination
  const replayLink=(cookie:string,source:string,operationId:string)=>fetch(host.url+'/api/'+linkPath,{method:'PUT',
    headers:{Cookie:cookie,'X-Chulane-Replica':source,'Idempotency-Key':operationId}})
  const update=Buffer.from(importMarkdown('Device entry'))
  const replay=(cookie:string,source:string,body=update)=>fetch(host.url+'/api/pages/'+id+'/state?workspace=1&merge=1',{method:'POST',headers:{Cookie:cookie,'X-Chulane-Replica':source},body})
  assert.equal((await replay(owner,replica)).status,409)
  await call('pages/'+id,owner,'PATCH',{deleted:true})
  const titleReplay=(cookie:string,source:string,title:string,operationId:string)=>fetch(host.url+'/api/pages/'+id+'?workspace=1',{method:'PATCH',
    headers:{Cookie:cookie,'Content-Type':'application/json','X-Chulane-Replica':source},body:JSON.stringify({title,baseTitle:'Log',operationId})})
  assert.equal((await call('pages/'+id,owner,'PATCH',{title:'Direct rename'})).status,410)
  assert.equal((await call(linkPath,owner,'PUT')).status,410)
  assert.equal((await call(assignment,owner,'PUT',assigned)).status,404)
  assert.equal((await replayTag(viewer,readerReplica)).status,403)
  assert.equal((await replayTag(owner,readerReplica)).status,403)
  assert.equal((await call('tags/'+tag,owner,'PATCH',{deleted:true})).status,200)
  assert.equal((await replayTag(owner,replica)).status,200)
  assert.equal((await call('tags/'+tag+'/table',owner)).status,410)
  assert.equal((await replayLink(viewer,readerReplica,'8'.repeat(32))).status,403)
  assert.equal((await replayLink(owner,readerReplica,'8'.repeat(32))).status,403)
  assert.equal((await replayLink(owner,replica,'8'.repeat(32))).status,200)
  assert.equal((await titleReplay(viewer,readerReplica,'Device title','1'.repeat(32))).status,403)
  assert.equal((await titleReplay(owner,readerReplica,'Device title','1'.repeat(32))).status,403)
  assert.equal((await titleReplay(owner,replica,'Device title','1'.repeat(32))).status,200)
  assert.equal((await titleReplay(owner,replica,'Concurrent title','2'.repeat(32))).status,200)
  assert.equal((await replay(viewer,readerReplica)).status,403)
  assert.equal((await replay(owner,readerReplica)).status,403)
  assert.equal((await replay(owner,replica,Buffer.from([255]))).status,400)
  assert.equal((await replay(owner,replica)).status,204)
  assert.equal((await replay(owner,replica)).status,204)
  await host.close();host=await open();owner=await signIn('Owner','login')
  assert.equal((await call('pages/'+id+'/state',owner)).status,410)
  await call('pages/'+id,owner,'PATCH',{deleted:false})
  const restored=await(await call('source?id='+id,owner)).json()
  assert.equal(restored.title,'Device title')
  const library=await(await call('library',owner)).json()
  assert.deepEqual(library.titleConflicts.map(item=>item.title),['Concurrent title'])
  assert.deepEqual(library.links,[{source:id,target:destination}])
  assert.deepEqual(library.applications,[])
  await call('tags/'+tag,owner,'PATCH',{deleted:false})
  const table=async()=>(await(await call('tags/'+tag+'/table',owner)).json()).rows
  assert.equal((await table())[0].values[field],false)
  await call(assignment,owner,'PUT',{...assigned,active:false})
  assert.equal((await replayTag(owner,replica)).status,200)
  assert.deepEqual(await table(),[])
  await call('pages/'+destination,owner,'PATCH',{deleted:true})
  await call('pages/'+destination,owner,'DELETE')
  assert.equal((await replayLink(owner,replica,'9'.repeat(32))).status,200)
  assert.deepEqual((await(await call('library',owner)).json()).links,[])
  assert.equal((await titleReplay(owner,replica,'Device title','1'.repeat(32))).status,200)
  assert.deepEqual(restored.text.split('\n').sort(),['Device entry','Server entry'])
  const {id:project}=await(await call('projects',owner,'POST',{name:'Research'})).json()
  assert.equal((await call('pages/'+id,owner,'PATCH',{project})).status,200)
  assert.equal((await call('projects/'+project,owner,'PATCH',{deleted:true})).status,200)
  assert.equal((await call('pages/'+id,owner,'PATCH',{deleted:false})).status,409)
  const queuedMove=(page:number,base:number|null,destination:number|null,operationId:string,source=replica)=>fetch(host.url+'/api/pages/'+page,{method:'PATCH',
    headers:{Cookie:owner,'X-Chulane-Replica':source,'Content-Type':'application/json'},body:JSON.stringify({project:destination,baseProject:base,operationId})})
  assert.equal((await queuedMove(id,project,null,'6'.repeat(32),readerReplica)).status,403)
  assert.equal((await queuedMove(id,project,null,'6'.repeat(32))).status,200)
  const {id:activePage}=await(await call('pages',owner,'POST',{title:'Active log'})).json()
  assert.equal((await queuedMove(activePage,null,project,'7'.repeat(32))).status,200)
  const afterMove=await(await call('library',owner)).json()
  assert.equal(afterMove.pages.find(page=>page.id===activePage).project,null)
  assert.deepEqual(afterMove.moveConflicts.filter(choice=>choice.page===activePage).map(choice=>choice.project),[project])
  const projectPath='projects/'+project
  const pendingName={baseName:'Research',name:'Camp research',operationId:'4'.repeat(32)}
  assert.equal((await call(projectPath,owner,'PATCH',pendingName)).status,409)
  const projectReplay=(source:string)=>fetch(host.url+'/api/'+projectPath,{method:'PATCH',headers:{Cookie:owner,'X-Chulane-Replica':source,'Content-Type':'application/json'},body:JSON.stringify(pendingName)})
  assert.equal((await projectReplay(readerReplica)).status,403)
  assert.equal((await projectReplay(replica)).status,200)
  assert.deepEqual(await(await call('projects',owner)).json(),[])
  assert.equal((await titleReplay(owner,replica,'Project trash alternative','3'.repeat(32))).status,200)
  assert.equal((await call('source?id='+id,owner)).status,404)
  assert.equal((await call('projects/'+project,owner,'PATCH',{deleted:false})).status,200)
  const activeProjects=await(await call('projects',owner)).json()
  assert.equal(activeProjects.find(item=>item.id===project).name,'Camp research')
  const libraryAfterRestore=await(await call('library',owner)).json()
  assert.equal(libraryAfterRestore.pages.find(page=>page.id===id).project,project)
  assert.deepEqual(libraryAfterRestore.moveConflicts.filter(choice=>choice.page===id).map(choice=>choice.project),[null])
  const alternatives=libraryAfterRestore.titleConflicts.map(item=>item.title)
  assert.deepEqual(alternatives,['Concurrent title','Project trash alternative'])
  await call('pages/'+id,owner,'PATCH',{deleted:true})
  assert.equal((await call('pages/'+id,owner,'DELETE')).status,200)
  assert.equal((await titleReplay(owner,replica,'Device title','1'.repeat(32))).status,410)
  assert.equal((await replayTag(owner,replica)).status,410)
})

test('workspace owners manage current members and concurrent removals preserve an owner',async t=>{
  const {DatabaseSync}=await import('node:sqlite')
  const dir=await mkdtemp(join(tmpdir(),'chulane-members-')),file=join(dir,'members.sqlite')
  const host=await serve({file,assets:dir,registration:true})
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(cookie:string,path:string,method='GET',body?:object)=>fetch(host.url+'/api/'+path,{
    method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)})
  async function register(username:string){
    const response=await call('','register','POST',{username,password:'membership fixture password'})
    return response.headers.get('set-cookie')!.split(';')[0]
  }
  const owner=await register('Owner'),guest=await register('Guest'),outsider=await register('Outsider')
  const operationId='a'.repeat(32)
  await call(owner,'workspaces','POST',{name:'Field station',operationId})
  // Invitation acceptance is independent of maintaining an established membership.
  const db=new DatabaseSync(file)
  db.exec("INSERT INTO memberships SELECT 1,id,'viewer' FROM accounts WHERE name='Guest'")
  const legacy=db.prepare("INSERT INTO proposals(workspace,title) VALUES(1,'Unattributed legacy request')").run().lastInsertRowid
  db.close()
  assert.equal((await call(owner,'proposals/'+legacy+'/approve','POST',{})).status,403)
  assert.equal((await call(owner,'proposals/'+legacy+'/dismiss','POST',{})).status,200)
  const path='workspaces/members'
  assert.equal((await call(outsider,path)).status,404)
  const response=await call(owner,path)
  assert.equal(response.status,200)
  const members=await response.json(),guestId=members.find(member=>member.name==='Guest').id,ownerId=members.find(member=>member.name==='Owner').id
  const change=(cookie:string,id:number,role:string)=>call(cookie,path+'/'+id,'PATCH',{role})
  assert.equal((await change(guest,guestId,'owner')).status,403)
  assert.equal((await change(owner,ownerId,'editor')).status,409)
  assert.equal((await call(owner,path+'/'+ownerId,'DELETE')).status,409)
  assert.equal((await change(owner,guestId,'editor')).status,200)
  const draft={title:'Field notes',operationId}
  assert.equal((await call(guest,'pages','POST',draft)).status,200)
  const env={...process.env,CHULANE_PROFILE_STATION_URL:host.url,CHULANE_PROFILE_STATION_USERNAME:'Guest',CHULANE_PROFILE_STATION_PASSWORD:'membership fixture password'}
  const cli=(...args:string[])=>promisify(execFile)(process.execPath,['src/tools/cli.ts','--profile','station',...args],{env})
  const invalidProfile=(overrides:NodeJS.ProcessEnv)=>promisify(execFile)(process.execPath,['src/tools/cli.ts','--profile','station','workspaces'],{env:{...env,...overrides}})
  await assert.rejects(invalidProfile({CHULANE_PROFILE_STATION_ACCESS_KEY:'other-identity'}),/either account credentials or an access key/)
  await assert.rejects(invalidProfile({CHULANE_PROFILE_STATION_URL:'http://example.invalid'}),/HTTPS or a loopback server/)
  await assert.rejects(invalidProfile({CHULANE_PROFILE_STATION_PASSWORD:''}),/both .*USERNAME and .*PASSWORD/)
  assert.deepEqual(JSON.parse((await cli('workspaces')).stdout).map(w=>w.name),['Field station'])
  const {id:folder}=await(await call(owner,'projects','POST',{name:'Station'})).json()
  const {id:nested}=await(await call(owner,'projects','POST',{name:'Notes',parent:folder})).json()
  await call(owner,'projects','POST',{name:'Notes'})
  const listing=JSON.parse((await cli('browse',String(folder))).stdout)
  assert.deepEqual(listing,{entries:[{kind:'project',id:nested,name:'Notes'}],nextOffset:null})
  assert.deepEqual(JSON.parse((await cli('browse',String(folder),'0','Notes')).stdout),listing)
  assert.deepEqual(JSON.parse((await cli('browse',String(folder),'0','notes')).stdout),{entries:[],nextOffset:null})
  const found=JSON.parse((await cli('find_projects','Notes')).stdout)
  assert.deepEqual(found.entries.map(entry=>entry.path),['Station / Notes','Notes'])
  assert.equal(found.entries[0].id,nested)
  assert.equal(found.entries[0].url,host.url+'/?workspace=1&project='+nested)
  assert.deepEqual(JSON.parse((await cli('find_projects','TION / no','0','path')).stdout).entries,[found.entries[0]])
  await assert.rejects(cli('find_projects','Notes','bad'),/Use find_projects/)
  const markdown='Readings\n\nWind from the east.'
  const {pending}=JSON.parse((await cli('propose_draft',String(listing.entries[0].id),'New field notebook',markdown)).stdout)
  const [proposal]=(await(await call(owner,'library')).json()).proposals
  assert.deepEqual(proposal.draft,{markdown,project:nested,projectName:'Station / Notes'})
  assert.equal(proposal.requestedBy,'Guest')
  assert.equal(proposal.profile,'station')
  assert.equal((await change(guest,ownerId,'viewer')).status,403)
  assert.equal((await change(owner,guestId,'viewer')).status,200)
  assert.equal((await call(guest,'pages','POST',draft)).status,403)
  assert.equal((await call(guest,'projects/'+folder,'PATCH',{name:'Blocked',baseName:'Station'})).status,403)
  assert.equal((await call(outsider,'projects/browse')).status,404)
  assert.deepEqual(JSON.parse((await cli('browse')).stdout).entries.map(item=>item.name),['Notes','Station','Field notes'])
  await assert.rejects(cli('propose_create','Forbidden'),/Editor access required/)
  assert.equal((await call(owner,'proposals/'+pending+'/approve','POST',{})).status,403)
  assert.equal((await(await call(owner,'library')).json()).pages.some(page=>page.title==='New field notebook'),false)
  assert.equal((await call(owner,'proposals/'+pending+'/dismiss','POST',{})).status,200)
  const history=await(await call(owner,'proposals/history')).json()
  assert.equal(history.items[0].requestedBy,'Guest')
  assert.equal(history.items[0].reviewedBy,'Owner')
  assert.equal((await change(owner,guestId,'owner')).status,200)
  assert.equal(JSON.parse((await cli('proposal_status',String(pending))).stdout).reviewedBy,'Owner')
  // An owner can be demoted while a slow settings request is still sending its body.
  const {request}=await import('node:http')
  for(const [endpoint,method,body] of [
    ['workspaces/archive','PUT',{archived:true}],
    ['workspaces','PATCH',{timeZone:'Europe/London'}],
    [path+'/'+guestId,'PATCH',{role:'viewer'}],
  ] as const){
    const accepted=once(host.server,'request')
    const slow=request(host.url+'/api/'+endpoint,{method,headers:{Cookie:owner,'Content-Type':'application/json'}})
    const completed=once(slow,'response')
    slow.write(' ');await accepted
    assert.equal((await change(guest,ownerId,'editor')).status,200)
    slow.end(JSON.stringify(body))
    const [response]=await completed
    assert.equal(response.statusCode,403);response.resume()
    assert.equal((await change(guest,ownerId,'owner')).status,200)
  }
  const removals=await Promise.all([call(owner,path+'/'+ownerId,'DELETE'),call(guest,path+'/'+guestId,'DELETE')])
  assert.deepEqual(removals.map(result=>result.status).sort(),[200,409])
  const removed=removals[0].ok?owner:guest
  assert.equal((await call(removed,'library')).status,404)
  assert.deepEqual((await(await call(removed,'workspaces')).json()).workspaces,[])
})

test('the bootstrapped server administrator controls registration independently of workspace ownership',async t=>{
  const {DatabaseSync}=await import('node:sqlite')
  const {serverAccounts}=await import('../../src/server/accounts.ts')
  const dir=await mkdtemp(join(tmpdir(),'chulane-bootstrap-')),file=join(dir,'workspace.sqlite')
  const db=new DatabaseSync(file)
  const accounts=serverAccounts(db),password='a long test password'
  try{
    await accounts.authenticate('Root',password,'bootstrap')
    await assert.rejects(accounts.authenticate('Another',password,'bootstrap'),/already exists/)
    assert.equal(db.prepare('SELECT id FROM accounts WHERE name=?').get('Another'),undefined)
  }finally{db.close()}
  let host=await serve({file,assets:dir,registration:true,editorKey:'shared'})
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(path:string,cookie='',data?:object,method=data?'POST':'GET')=>fetch(host.url+'/api/'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)})
  const login=async(username:string)=>(await call('login','',{username,password})).headers.get('set-cookie')!.split(';')[0]
  const admin=await login('Root')
  assert.equal((await(await call('auth')).json()).registration,false)
  assert.equal((await call('server/settings',admin,{registration:true},'PATCH')).status,200)
  const enrolled=await call('register','',{username:'Member',password})
  const member=enrolled.headers.get('set-cookie')!.split(';')[0]
  const {id}=await(await call('workspaces',member,{name:'Private'})).json()
  assert.equal((await call('library?workspace='+id,admin)).status,404)
  assert.equal((await call('server/settings',member,{registration:false},'PATCH')).status,403)
  assert.equal((await call('server/settings',admin,{registration:false},'PATCH')).status,200)
  assert.equal((await call('register','',{username:'Late',password})).status,403)
  await call('server/settings',admin,{registration:true},'PATCH')
  assert.equal((await(await call('library?workspace='+id,member)).json()).presence,true)
  assert.equal((await call('server/settings',member,{presence:false},'PATCH')).status,403)
  assert.equal((await call('server/settings',admin,{presence:'no'},'PATCH')).status,400)
  assert.equal((await(await call('server/settings',admin,{presence:false},'PATCH')).json()).presence,false)
  assert.equal((await(await call('library?workspace='+id,member)).json()).presence,undefined)
  const providerPath='server/provider',secret='unpublished-fixture-key'
  const {createServer}=await import('node:http')
  let authorization='',usedModel=''
  const upstream=createServer(async(req,res)=>{
    let body=''
    for await(const chunk of req)body+=chunk
    authorization=req.headers.authorization??'';usedModel=JSON.parse(body).model
    res.writeHead(200,{'Content-Type':'text/event-stream'})
    const chunk={id:'test',object:'chat.completion.chunk',created:1,model:usedModel,choices:[{index:0,delta:{role:'assistant',content:'Shared provider answered'},finish_reason:'stop'}]}
    res.end('data: '+JSON.stringify(chunk)+'\n\ndata: [DONE]\n\n')
  })
  await new Promise<void>(ready=>upstream.listen(0,'127.0.0.1',ready))
  const baseUrl=process.env.CHULANE_OPENAI_BASE_URL
  process.env.CHULANE_OPENAI_BASE_URL='http://127.0.0.1:'+(upstream.address() as {port:number}).port+'/v1'
  t.after(()=>{
    upstream.closeAllConnections();upstream.close()
    if(baseUrl===undefined)delete process.env.CHULANE_OPENAI_BASE_URL
    else process.env.CHULANE_OPENAI_BASE_URL=baseUrl
  })
  const config={key:secret,model:'fixture-model'}
  assert.equal((await call(providerPath,member,config,'PUT')).status,403)
  assert.equal((await call(providerPath,admin,config,'PUT')).status,200)
  const info=await(await call(providerPath,admin)).json()
  assert.equal(info.model,config.model);assert.equal(info.hasApiKey,true)
  assert.ok(!JSON.stringify(info).includes(secret))
  const status=await(await call('agent?workspace='+id,member)).json()
  assert.equal(status.configurable,false);assert.equal(status.model,config.model)
  assert.equal((await call('agent/provider?workspace='+id,member,config)).status,403)
  const {id:chat}=await(await call('agent/chats?workspace='+id,member,{})).json()
  const conversation='agent/chats/'+chat
  const response=await call(conversation+'/turn?workspace='+id,member,{page:null,text:'Hello',allowEdits:false})
  assert.equal(response.status,200);await response.text()
  assert.equal(authorization,'Bearer '+secret);assert.equal(usedModel,config.model)
  assert.equal((await(await call(conversation+'?workspace='+id,member)).json()).messages.at(-1).text,'Shared provider answered')
  await host.close();host=await serve({file,assets:dir})
  assert.equal((await(await call(providerPath,await login('Root'))).json()).hasApiKey,true)
  const restored=join(dir,'restored.sqlite')
  await promisify(execFile)(process.execPath,[join(process.cwd(),'src/tools/backup.ts'),file,restored])
  await host.close();host=await serve({file:restored,assets:dir})
  assert.equal((await(await call('auth')).json()).registration,true)
  assert.equal((await(await call('server/settings',await login('Root'))).json()).presence,false)
  assert.equal((await call('server/settings',await login('Member'))).status,403)
  assert.ok(!(await readFile(restored)).includes(Buffer.from(secret)))
  const clean=await(await call(providerPath,await login('Root'))).json()
  assert.equal(clean.model,config.model);assert.equal(clean.hasApiKey,false)
  const restoredAdmin=await login('Root')
  assert.equal((await call(providerPath,restoredAdmin,{key:'',model:config.model},'PUT')).status,400)
  const reconnected=await call(providerPath,restoredAdmin,{key:'replacement-key',model:config.model},'PUT')
  assert.equal((await reconnected.json()).hasApiKey,true)
  assert.equal((await(await call(providerPath,restoredAdmin,undefined,'DELETE')).json()).custom,false)
  const owner=await login('Member'),scope='?workspace='+id
  const deletion=(action:string,cookie:string)=>call('workspaces/deletion'+scope,cookie,{action},'PUT')
  const replica=(await(await call('library'+scope,owner)).json()).replica
  assert.equal((await call('workspaces/archive'+scope,owner,{archived:true},'PUT')).status,200)
  assert.equal((await deletion('mark',owner)).status,200)
  assert.equal((await deletion('restore',owner)).status,403)
  assert.equal((await deletion('purge',owner)).status,403)
  assert.deepEqual((await(await call('workspaces',restoredAdmin)).json()).deletedWorkspaces.map(item=>item.id),[id])
  assert.equal((await deletion('restore',restoredAdmin)).status,200)
  assert.equal((await call('library'+scope,restoredAdmin)).status,404)
  const restoredLib=await(await call('library'+scope,owner)).json()
  assert.notEqual(restoredLib.replica,replica)
  assert.equal((await fetch(host.url+'/api/library'+scope,{headers:{Cookie:owner,'X-Chulane-Replica':replica}})).status,403)
  await call('workspaces/archive'+scope,owner,{archived:true},'PUT')
  await deletion('mark',owner)
  assert.equal((await deletion('purge',restoredAdmin)).status,200)
  assert.equal((await call('library'+scope,owner)).status,404)

})

test('a new workspace snapshot omits the purged attachment bytes',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-purge-')),file=join(dir,'workspace.sqlite')
  const host=await serve({file,assets:dir,desktop:true,editorKey:'owner'})
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(path:string,method:string,data:object|string)=>fetch(host.url+'/api/'+path,{method,
    headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:typeof data==='string'?data:JSON.stringify(data)})
  await call('workspaces','POST',{name:'Deleted library'})
  const {id}=await(await call('pages','POST',{title:'File'})).json()
  const marker='attachment-data-only-in-the-purged-workspace'
  await call('pages/'+id+'/files?name=data.bin','POST',marker.repeat(4000))
  async function contains(name:string){
    const snapshot=join(dir,name)
    await promisify(execFile)(process.execPath,[join(process.cwd(),'src/tools/backup.ts'),file,snapshot])
    return (await readFile(snapshot)).includes(Buffer.from(marker))
  }
  assert.equal(await contains('before.sqlite'),true)
  await call('workspaces/archive','PUT',{archived:true})
  await call('workspaces/deletion','PUT',{action:'mark'})
  assert.equal((await call('workspaces/deletion','PUT',{action:'purge'})).status,200)
  assert.equal(await contains('after.sqlite'),false)
})

test('username invitations survive restart and grant the offered role only on acceptance',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-invites-'))
  const open=()=>serve({file:join(dir,'server.sqlite'),assets:dir,registration:true})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{force:true,recursive:true})})
  const api=(path:string,cookie:string,method='GET',data?:object)=>fetch(host.url+'/api/'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)})
  const sign=async(username:string,action:string)=>{
    const r=await api(action,'','POST',{username,password:'a long test password'})
    assert.equal(r.status,200)
    return r.headers.get('set-cookie')!.split(';')[0]!
  }
  let owner=await sign('Owner','register'),guest=await sign('Guest','register')
  const stranger=await sign('Neighbor','register')
  const ws=(await(await api('workspaces',owner,'POST',{name:'Research'})).json()).id
  const invites='workspaces/invitations?workspace='+ws
  const invite=()=>api(invites,owner,'POST',{username:'gUeSt',role:'viewer'})
  const original=await(await invite()).json()
  assert.equal((await api('invitations/'+original.id+'/decline',guest,'POST')).status,200)
  const withdrawn=await(await invite()).json()
  assert.equal((await api('workspaces/invitations/'+withdrawn.id+'?workspace='+ws,owner,'DELETE')).status,200)
  assert.equal((await api('invitations/'+withdrawn.id+'/accept',guest,'POST')).status,404)
  const sent=await invite()
  assert.equal(sent.status,200)
  const {id:initialId}=await sent.json()
  const revise=(id:number,role:string,cookie=owner)=>api('workspaces/invitations/'+id+'?workspace='+ws,cookie,'PATCH',{role})
  assert.equal((await revise(initialId,'invalid')).status,400)
  assert.equal((await revise(initialId,'editor',stranger)).status,404)
  const promoted=await revise(initialId,'editor')
  assert.equal(promoted.status,200)
  const promotedId=(await promoted.json()).id
  assert.notEqual(promotedId,initialId)
  assert.equal((await api('invitations/'+initialId+'/accept',guest,'POST')).status,404)
  assert.equal((await revise(initialId,'owner')).status,404)
  const revised=await revise(promotedId,'viewer')
  const {id}=await revised.json()
  assert.equal((await api('invitations/'+promotedId+'/accept',guest,'POST')).status,404)
  assert.equal((await(await revise(id,'viewer')).json()).id,id)
  assert.equal((await invite()).status,409)
  assert.equal((await api('library?workspace='+ws,guest)).status,404)
  const unrelated=(await(await api('workspaces',stranger,'POST',{name:'Other workspace'})).json()).id
  assert.equal((await api('workspaces/invitations/'+id+'?workspace='+unrelated,stranger,'DELETE')).status,404)
  assert.deepEqual(await(await api('workspaces/invitations?workspace='+unrelated,stranger)).json(),[])
  assert.equal((await api('invitations/'+id+'/accept','','POST')).status,401)
  assert.equal((await api('invitations/'+id+'/accept',stranger,'POST')).status,404)
  await host.close();host=await open()
  guest=await sign('Guest','login');owner=await sign('Owner','login')
  const catalog=await(await api('workspaces',guest)).json()
  assert.deepEqual(catalog.workspaces,[])
  assert.deepEqual(catalog.invitations,[{id,workspace:ws,name:'Research',role:'viewer'}])
  await api('workspaces/archive?workspace='+ws,owner,'PUT',{archived:true})
  assert.equal((await api('invitations/'+id+'/accept',guest,'POST')).status,404)
  await api('workspaces/archive?workspace='+ws,owner,'PUT',{archived:false})
  assert.equal((await api('invitations/'+id+'/accept',guest,'POST')).status,200)
  assert.equal((await revise(id,'owner')).status,404)
  assert.equal((await(await api('library?workspace='+ws,guest)).json()).role,'viewer')
  assert.equal((await api('pages?workspace='+ws,guest,'POST',{title:'Forbidden'})).status,403)
  const journal=await(await api('library?view=journal&workspace='+ws,guest)).json()
  const today=journal.pages.find(page=>page.day===journal.today)
  assert.ok(today)
  assert.equal((await api('pages/'+today.id+'?workspace='+ws,guest,'PATCH',{title:'Forbidden'})).status,403)
  assert.equal((await api('library?view=journal&workspace='+ws,await sign('Neighbor','login'))).status,404)
  assert.equal((await api(invites,guest,'POST',{username:'Neighbor',role:'owner'})).status,403)
  assert.equal((await api(invites,owner,'POST',{username:'Missing account',role:'viewer'})).status,404)
  assert.equal((await api('invitations/'+id+'/accept',guest,'POST')).status,404)
  assert.equal((await invite()).status,409)
})

test('a graceful restart preserves live edits and their searchable text across workspaces',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-live-restart-'))
  const open=()=>serve({file:join(dir,'workspace.sqlite'),assets:dir,editorKey:'edit',desktop:true})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const headers={Authorization:'Bearer edit','Content-Type':'application/json'}
  const post=async(path:string,data:object)=>{
    const response=await fetch(host.url+'/api/'+path,{method:'POST',headers,body:JSON.stringify(data)})
    assert.equal(response.status,200)
    return (await response.json()).id as number
  }
  const {importMarkdown}=await import('../../src/server/markdown.ts')
  const drafts:{workspace:number;page:number;path:string;text:string;state:Uint8Array;revision:number}[]=[]
  for(const name of ['Survey','Archive']){
    const workspace=await post('workspaces',{name})
    const page=await post('pages?workspace='+workspace,{title:'Notes'})
    const text=name+' field observation',state=importMarkdown(text)
    const path='/api/pages/'+page+'/state?workspace='+workspace
    const ack=await fetch(host.url+path+'&live',{method:'PUT',headers:{...headers,'If-Match':'0','X-Text-Bytes':'0'},body:Buffer.from(state)})
    assert.equal(ack.status,200)
    const revision=(await ack.json()).rev
    assert.ok(revision<0)
    drafts.push({workspace,page,path,text,state,revision})
  }
  const {DatabaseSync}=await import('node:sqlite')
  const database=new DatabaseSync(join(dir,'workspace.sqlite'))
  try{
    database.exec("CREATE TRIGGER fail_checkpoint BEFORE UPDATE OF state ON pages WHEN NEW.workspace=2 BEGIN SELECT RAISE(ABORT,'disk failure fixture'); END")
    await assert.rejects(host.close(),/disk failure fixture/)
    assert.deepEqual(database.prepare('SELECT rev FROM pages').all().map(row=>row.rev),[0,0])
  }finally{database.exec('DROP TRIGGER IF EXISTS fail_checkpoint');database.close()}
  await Promise.all([host.close(),host.close()])
  host=await open()
  for(const {workspace,page,path,text,state,revision} of drafts){
    const saved=await fetch(host.url+path,{headers})
    assert.equal(saved.headers.get('X-Revision'),'1')
    assert.deepEqual(new Uint8Array(await saved.arrayBuffer()),state)
    const catalog=await(await fetch(host.url+'/api/library?workspace='+workspace,{headers})).json()
    assert.deepEqual(catalog.pages.map((p:{id:number;plain:string})=>[p.id,p.plain]),[[page,text]])
    const put=(rev:number,bytes:Uint8Array)=>fetch(host.url+path+'&live',{method:'PUT',headers:{...headers,'If-Match':String(rev),'X-Text-Bytes':'0'},body:Buffer.from(bytes)})
    const updated=importMarkdown(text+' after restart')
    assert.equal((await put(1,updated)).status,200)
    assert.equal((await put(revision,state)).status,409)
    const fresh=await fetch(host.url+path+'&since='+revision,{headers})
    assert.equal(fresh.status,200)
    assert.deepEqual(new Uint8Array(await fresh.arrayBuffer()),updated)
  }
})

test('a killed host and its online backup recover the last acknowledged live revision',async t=>{
  const {spawn}=await import('node:child_process')
  const {createInterface}=await import('node:readline')
  const {importMarkdown}=await import('../../src/server/markdown.ts')
  const dir=await mkdtemp(join(tmpdir(),'chulane-crash-')),file=join(dir,'workspace.sqlite'),snapshot=join(dir,'backup.sqlite')
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',
    "import {serve} from './src/server/service.ts'; const host=await serve({file:process.argv[1],assets:'.',editorKey:'edit'});console.log(host.url)",file],
    {stdio:['ignore','pipe','inherit']})
  const output=createInterface({input:child.stdout})
  const exited=once(child,'exit')
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;output.close();await rm(dir,{recursive:true,force:true})})
  const [origin]=await Promise.race([once(output,'line'),exited.then(()=>{throw Error('Test host exited before listening')})])
  const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'edit'})})
  assert.equal(login.status,200)
  const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'Content-Type':'application/json'}
  async function create(path:string,data:object){
    const response=await fetch(origin+'/api/'+path,{method:'POST',headers,body:JSON.stringify(data)})
    assert.equal(response.status,200)
    return (await response.json()).id
  }
  await create('workspaces',{name:'Research'})
  const page=await create('pages',{title:'Observation'}),path='/api/pages/'+page+'/state'
  const text='Final live observation',state=importMarkdown(text)
  let revision=0
  for(const bytes of [importMarkdown('Superseded revision'),state]){
    const response=await fetch(origin+path+'?live',{method:'PUT',headers:{...headers,'If-Match':String(revision),'X-Text-Bytes':'0'},body:Buffer.from(bytes)})
    assert.equal(response.status,200)
    revision=(await response.json()).rev
  }
  const {DatabaseSync}=await import('node:sqlite')
  const db=new DatabaseSync(file)
  try{
    db.exec("CREATE TRIGGER fail_live BEFORE UPDATE ON live_document_drafts BEGIN SELECT RAISE(ABORT,'disk failure fixture'); END")
    const failed=await fetch(origin+path+'?live',{method:'PUT',headers:{...headers,'If-Match':String(revision),'X-Text-Bytes':'0'},body:Buffer.from(importMarkdown('Unacknowledged change'))})
    assert.equal(failed.status,500)
    const current=await fetch(origin+path,{headers})
    assert.equal(current.headers.get('X-Revision'),String(revision))
    assert.deepEqual(new Uint8Array(await current.arrayBuffer()),state)
  }finally{db.exec('DROP TRIGGER IF EXISTS fail_live');db.close()}
  await promisify(execFile)(process.execPath,['src/tools/backup.ts',file,snapshot])
  child.kill('SIGKILL');await exited
  for(const database of [file,snapshot]){
    const host=await serve({file:database,assets:dir,editorKey:'edit',desktop:true})
    try{
      const headers={Authorization:'Bearer edit'}
      const saved=await fetch(host.url+path,{headers})
      assert.equal(saved.headers.get('X-Revision'),'1')
      assert.deepEqual(new Uint8Array(await saved.arrayBuffer()),state)
      const library=await(await fetch(host.url+'/api/library',{headers})).json()
      assert.equal(library.pages[0].plain,text)
      const stale=await fetch(host.url+path+'?live',{method:'PUT',headers:{...headers,'If-Match':String(revision),'X-Text-Bytes':'0'},body:Buffer.from(state)})
      assert.equal(stale.status,409)
    }finally{await host.close()}
  }
})
