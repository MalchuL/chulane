/** Exercise workspace operations through the same HTTP and CLI boundaries used by the two hosts. */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {once} from 'node:events'
import {request as httpRequest} from 'node:http'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import test, {type TestContext} from 'node:test'
import {initialJournalState} from '../../src/shared/journal-state.ts'
import {agentDocument,initialEditorState} from '../../src/server/agent-document.ts'
import {serve} from '../../src/server/service.ts'
import type {AgentEnvironment} from '../../src/server/agent-environment.ts'
import type {Library} from '../../src/shared/library.ts'

/** Give each test its own SQLite database, ephemeral listener and authenticated editor. */
async function workspace(t:TestContext,desktop=false,file=':memory:',backgroundEnvironment?:AgentEnvironment) {
  const key='test-editor'
  const host=await serve({file,assets:'.',editorKey:key,desktop,backgroundEnvironment,provider:backgroundEnvironment?{get:()=>({model:'fixture',key:'fixture'})}:undefined})
  t.after(()=>host.close())
  const url=host.url+'/api/'
  const response=await fetch(url+'login',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})
  })
  assert.equal(response.status,200)
  const cookie=response.headers.get('set-cookie')?.split(';')[0] ?? ''
  assert.ok(cookie)
  function request(path:string,method='GET',data?:object) {
    return fetch(url+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)})
  }
  async function create(path:string,data:object):Promise<number> {
    const response=await request(path,'POST',data)
    assert.equal(response.status,200)
    const {id}=await response.json()
    assert.equal(typeof id,'number')
    return id
  }
  async function library(id=1):Promise<Library> {
    const response=await request('library?workspace='+id)
    assert.equal(response.status,200)
    return response.json()
  }
  await create('workspaces',{name:'Test workspace'})
  return {host,key,cookie,request,create,library}
}

test('retrying a confirmed creation returns its original ID across host restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-creation-'))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const file=join(dir,'workspace.sqlite')
  const previous=await workspace(t,false,file)
  await previous.host.close()
  const database=new DatabaseSync(file)
  try{database.exec('DROP TABLE creation_receipts; PRAGMA user_version=3')}finally{database.close()}
  const first=await workspace(t,false,file)
  const operations=[
    {path:'workspaces',data:{name:'Survey'},operationId:'1'.repeat(32)},
    {path:'projects',data:{name:'Survey'},operationId:'2'.repeat(32)},
    {path:'pages',data:{title:'Survey'},operationId:'3'.repeat(32)},
    {path:'pages/import-markdown',data:{title:'Field log',content:'# Survey'},operationId:'4'.repeat(32)}
  ]
  const ids:number[]=[]
  for(const {path,data,operationId} of operations){
    const copies=await Promise.all([first.create(path,{...data,operationId}),first.create(path,{...data,operationId})])
    assert.equal(copies[0],copies[1])
    ids.push(copies[0])
  }
  await first.host.close()
  const second=await workspace(t,false,file)
  for(const [index,{path,data,operationId}] of operations.entries()){
    assert.equal(await second.create(path,{...data,operationId}),ids[index])
    assert.equal((await second.request(path,'POST',{...data,name:'Different',title:'Different',operationId})).status,409)
    assert.notEqual(await second.create(path,data),ids[index])
    assert.equal((await second.request(path,'POST',{...data,operationId:'invalid'})).status,400)
  }
  const imported=operations[3]
  assert.equal((await second.request(imported.path,'POST',{...imported.data,content:'Updated',operationId:imported.operationId})).status,409)
  assert.notEqual(await second.create(imported.path,{...imported.data,operationId:'5'.repeat(32)}),ids[3])
  await second.request('pages/'+ids[3],'PATCH',{deleted:true})
  assert.equal((await second.request(imported.path,'POST',{...imported.data,operationId:imported.operationId})).status,404)
  await second.request('pages/'+ids[2],'PATCH',{deleted:true})
  assert.equal((await second.request('pages','POST',{title:'Survey',operationId:operations[2].operationId})).status,404)
  assert.equal((await second.library()).pages.filter(page=>page.title==='Survey').length,2)
})

test('moving a page retains its identity and contents and rejects a project from another workspace',async t=>{
  const {create,request,library,host,cookie}=await workspace(t)
  const other=await create('workspaces',{name:'Other'})
  const localProject=await create('projects',{name:'Notes'})
  const remoteProject=await create('projects?workspace='+other,{name:'Other notes'})
  const id=await create('pages',{title:'Draft',content:'Original text'})
  assert.equal((await request('pages/'+id,'PATCH',{project:localProject})).status,200)
  assert.equal((await request('pages/'+id,'PATCH',{project:remoteProject})).status,400)
  const [page]=(await library()).pages
  assert.equal(page.id,id)
  assert.equal(page.project,localProject)
  assert.equal(page.plain,'Original text')
  assert.deepEqual((await library(other)).pages,[])
  const accepted=once(host.server,'request')
  const move=httpRequest(host.url+'/api/pages/'+id,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'}})
  const completed=once(move,'response')
  move.write(' ')
  await accepted
  await request('pages/'+id,'PATCH',{deleted:true})
  move.end(JSON.stringify({project:null}))
  const [response]=await completed
  response.resume()
  assert.equal(response.statusCode,410)
  assert.equal((await request('pages/'+id,'PATCH',{project:null})).status,410)
  await request('pages/'+id,'PATCH',{deleted:false})
  assert.equal((await library()).pages[0].project,localProject)
  assert.equal((await request('pages/'+id,'PATCH',{project:null})).status,200)
  assert.equal((await library()).pages[0].project,null)
  const day=await create('pages',{title:'Journal',day:'2026-11-22'})
  assert.equal((await request('pages/'+day,'PATCH',{project:localProject})).status,400)
})

test('competing page moves retain distinct destinations including the workspace root',async t=>{
  const {create,request,library}=await workspace(t,true)
  const a=await create('projects',{name:'Research'}),b=await create('projects',{name:'Research'})
  const page=await create('pages',{title:'Survey',project:a,content:'Field notes'})
  const move=(project:number|null,baseProject:number|null,resolveMove?:number)=>request('pages/'+page,'PATCH',{project,baseProject,resolveMove})
  assert.equal((await move(b,a)).status,200)
  assert.equal((await move(null,a)).status,200)
  assert.equal((await move(null,a)).status,200)
  const live=await library()
  assert.equal(live.pages[0].project,b)
  assert.equal(live.moveConflicts?.length,1)
  const conflict=live.moveConflicts![0]
  assert.equal(conflict.project,null)
  assert.equal((await move(null,a,conflict.id)).status,409)
  assert.equal((await move(a,b,conflict.id)).status,400)
  assert.equal((await move(null,b,conflict.id)).status,200)
  const resolved=await library()
  assert.deepEqual(resolved.moveConflicts,[])
  assert.deepEqual([resolved.pages[0].id,resolved.pages[0].project,resolved.pages[0].plain],[page,null,'Field notes'])
  await move(a,null)
  await move(b,null)
  const alternative=(await library()).moveConflicts![0]
  assert.equal((await request('projects/'+b,'PATCH',{deleted:true})).status,200)
  assert.equal((await move(b,a,alternative.id)).status,400)
  assert.equal((await move(a,a,alternative.id)).status,200)
  assert.deepEqual((await library()).moveConflicts,[])
})

test('combined page metadata patches commit the title and location together on replay',async t=>{
  const {create,request,library}=await workspace(t)
  const a=await create('projects',{name:'Field'})
  const b=await create('projects',{name:'Archive'})
  const id=await create('pages',{title:'Notes'})
  const patch=(data:object)=>request('pages/'+id,'PATCH',data)
  const change={title:'Survey',baseTitle:'Notes',project:a,baseProject:null,operationId:'a'.repeat(32)}
  assert.equal((await patch({...change,project:999})).status,400)
  assert.equal((await library()).pages[0].title,'Notes')
  assert.equal((await patch(change)).status,200)
  assert.equal((await library()).pages[0].project,a)
  assert.equal((await patch({title:'Final',baseTitle:'Survey',project:b,baseProject:a})).status,200)
  assert.equal((await patch(change)).status,200)
  assert.equal((await patch({...change,project:b})).status,409)
  const view=await library()
  assert.deepEqual([view.pages[0].title,view.pages[0].project],['Final',b])
  assert.deepEqual([view.titleConflicts,view.moveConflicts],[[],[]])
  assert.equal((await patch({...change,title:'Camera notes',operationId:'b'.repeat(32)})).status,200)
  const contested=await library()
  assert.deepEqual(contested.titleConflicts?.map(c=>c.title),['Camera notes'])
  assert.deepEqual(contested.moveConflicts?.map(c=>c.project),[a])
  const decision={title:'Camera notes',baseTitle:'Final',resolveTitle:contested.titleConflicts![0].id,
    project:a,baseProject:b,resolveMove:contested.moveConflicts![0].id,operationId:'c'.repeat(32)}
  assert.equal((await patch({...decision,baseProject:null})).status,409)
  assert.deepEqual((await library()).titleConflicts,contested.titleConflicts)
  assert.equal((await patch(decision)).status,200)
  assert.equal((await patch(decision)).status,200)
  assert.equal((await patch({deleted:true,title:'Stray rename'})).status,400)
  const resolved=await library()
  assert.deepEqual([resolved.pages[0].title,resolved.pages[0].project,resolved.pages[0].deleted],['Camera notes',a,0])
  assert.deepEqual([resolved.titleConflicts,resolved.moveConflicts],[[],[]])
})

test('retrying a page move cannot reopen a dismissed location conflict',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-move-retry-')),file=join(dir,'workspace.sqlite')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const {create,request,library,host,key}=await workspace(t,true,file)
  const a=await create('projects',{name:'Team'}),b=await create('projects',{name:'Field'})
  const id=await create('pages',{title:'Survey'})
  const patch=(data:object)=>request('pages/'+id,'PATCH',data)
  await patch({project:a,baseProject:null})
  const move={project:b,baseProject:null,operationId:'a'.repeat(32)}
  assert.equal((await patch(move)).status,200)
  const conflict=(await library()).moveConflicts![0]
  const keep={project:a,baseProject:a,resolveMove:conflict.id,operationId:'b'.repeat(32)}
  assert.equal((await patch(keep)).status,200)
  assert.equal((await patch(move)).status,200)
  assert.deepEqual((await library()).moveConflicts,[])
  assert.equal((await patch(keep)).status,200)
  assert.equal((await patch({...move,baseProject:undefined})).status,409)
  assert.equal((await patch({...move,operationId:'invalid'})).status,400)
  assert.equal((await library()).pages[0].project,a)
  await host.close()
  const reopened=await serve({file,assets:'.',editorKey:key,desktop:true})
  try{
    const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'}
    const replay=await fetch(reopened.url+'/api/pages/'+id,{method:'PATCH',headers,body:JSON.stringify(move)})
    assert.equal(replay.status,200)
    const restored=await(await fetch(reopened.url+'/api/library',{headers})).json()
    assert.deepEqual(restored.moveConflicts,[])
    assert.equal(restored.pages[0].project,a)
  }finally{await reopened.close()}
})

test('concurrent requests for one journal day share a page within each workspace',async t=>{
  const {create,library}=await workspace(t)
  const day={title:'Journal',day:'2026-11-20'}
  const [first,second]=await Promise.all([create('pages',day),create('pages',day)])
  const other=await create('workspaces',{name:'Team'})
  assert.equal(first,second)
  assert.notEqual(await create('pages?workspace='+other,day),first)
  assert.equal((await library()).pages.length,1)
  assert.equal((await library(other)).pages.length,1)
})

test('dated page creation preserves supplied writing across retry and independent offline editing',async t=>{
  const {create,request,library}=await workspace(t)
  const day='2032-02-29',content='Morning observations',title='Field notebook'
  const draft={day,title,content,operationId:'c'.repeat(32)}
  const project=await create('projects',{name:'Survey'})
  assert.equal((await request('pages','POST',{...draft,project})).status,400)
  assert.equal((await library()).pages.length,0)
  const [id,retry]=await Promise.all([create('pages',draft),create('pages',draft)])
  assert.equal(retry,id)
  const stored=(await library()).pages
  assert.equal(stored.length,1)
  assert.equal(stored[0].plain,content)
  assert.equal((await request('pages','POST',{day,title,content:'Independent import'})).status,409)
  assert.equal(await create('pages',{day,title}),id)
  const page={id,title,plain:'',state:initialJournalState(day)}
  const [block]=agentDocument(page).blocks
  const local=agentDocument(page,{page:id,block:block.id,before:'',after:'Offline observations'}).state!
  const server=new Uint8Array(await (await request('pages/'+id+'/state')).arrayBuffer())
  assert.equal(agentDocument({...page,state:server}).blocks[0].text,content)
  const merged=agentDocument({...page,state:Y.mergeUpdates([local,server])}).blocks
  assert.equal(merged.length,1)
  assert.equal(merged[0].id,block.id)
  assert.ok(merged[0].text.includes(content)&&merged[0].text.includes('Offline observations'))
})

test('independently initialized journal edits merge with the server paragraph in either delivery order',async t=>{
  const {create,request,host,cookie,library}=await workspace(t)
  const day='2031-01-02'
  const id=await create('pages',{title:day,day})
  // Two app versions must agree on the original Yjs structs before either edits.
  assert.equal(createHash('sha256').update(initialJournalState(day)).digest('hex'),'0a5c4a246aeea44b594b05c67902b6f2b5ee12877081872c206dab696300d369')
  const server=new Uint8Array(await (await request('pages/'+id+'/state')).arrayBuffer())
  const page={id,title:day,plain:'',state:server}
  const [first]=agentDocument(page).blocks
  const changes=['Server note','East note','West note'].map((text,index)=>{
    const state=index===0?server:initialJournalState(day)
    assert.deepEqual(agentDocument({...page,state}).blocks,[first])
    return agentDocument({...page,state},{page:id,block:first.id,before:'',after:text}).state!
  })
  for(const states of [changes,[...changes].reverse()]){
    const merged=agentDocument({...page,state:Y.mergeUpdates([...states,states[0]!])})
    assert.equal(merged.blocks.length,1)
    for(const text of ['East note','West note','Server note'])assert.ok(merged.blocks[0]!.text.includes(text))
    assert.equal(merged.blocks[0]!.text.length,'East noteWest noteServer note'.length)
  }
  for(const state of changes){
    const resolved=await create('pages',{title:day,day})
    assert.equal(resolved,id)
    const path='pages/'+resolved+'/state'
    const latest=await request(path)
    const bytes=Y.mergeUpdates([new Uint8Array(await latest.arrayBuffer()),state])
    const text=Buffer.from(agentDocument({...page,state:bytes}).blocks[0].text)
    const response=await fetch(host.url+'/api/'+path,{method:'PUT',headers:{Cookie:cookie,'If-Match':latest.headers.get('x-revision')!,'X-Text-Bytes':String(text.length)},body:Buffer.concat([text,bytes])})
    assert.equal(response.status,200)
  }
  const pages=(await library()).pages
  assert.equal(pages.length,1)
  const expected=agentDocument({...page,state:Y.mergeUpdates(changes)}).blocks
  assert.equal(pages[0].plain,expected[0].text)
  const stored=new Uint8Array(await (await request('pages/'+id+'/state')).arrayBuffer())
  assert.deepEqual(agentDocument({...page,state:stored}).blocks,expected)
})


test('a trashed rename target cannot be approved and dismissing the request leaves its title intact',async t=>{
  const {create,request,library}=await workspace(t)
  const id=await create('pages',{title:'Draft'})
  const {pending}=await (await request('proposals','POST',{page:id,title:'Published'})).json()
  assert.equal((await request('pages/'+id,'PATCH',{deleted:true})).status,200)
  assert.equal((await request('proposals/'+pending+'/approve','POST')).status,410)
  assert.equal((await library()).proposals[0]?.id,pending)
  assert.equal((await request('proposals/'+pending+'/dismiss','POST')).status,200)
  assert.equal((await request('pages/'+id,'PATCH',{deleted:false})).status,200)
  assert.equal((await request('proposals/'+pending+'/approve','POST')).status,409)
  const restored=await library()
  assert.equal(restored.pages[0].title,'Draft')
  assert.deepEqual(restored.proposals,[])
})

test('CLI journal drafts retry once, require review and preserve an independently created day',async t=>{
  const {host,key,request,library,create}=await workspace(t)
  const entry=fileURLToPath(new URL('../../src/tools/cli.ts',import.meta.url))
  const env={...process.env,CHULANE_URL:host.url,CHULANE_ACCESS_KEY:key,CHULANE_WORKSPACE:'1'}
  const day='2032-02-29',title='Morning log',content='First observation.'
  const args=[entry,'propose_journal','--operation-id','b'.repeat(32),day,title,content]
  const submit=async()=>JSON.parse((await promisify(execFile)(process.execPath,args,{env})).stdout).pending
  const pending=await submit()
  assert.equal(await submit(),pending)
  assert.equal((await library()).pages.length,0)
  assert.deepEqual((await library()).proposals.map(p=>p.draft),[{day,content}])
  assert.equal((await request('proposals/'+pending+'/approve','POST',{reviewedPath:null})).status,409)
  assert.equal((await request('proposals/'+pending+'/approve','POST',{reviewedDay:day})).status,200)
  assert.equal(await submit(),pending)
  assert.deepEqual((await library()).pages.map(p=>[p.title,p.day,p.plain]),[[title,day,content]])
  const rival={day:'2032-03-01',title,content:''}
  const queued=await(await request('proposals','POST',rival)).json()
  await create('pages',{...rival,content:'Written independently'})
  assert.equal((await request('proposals/'+queued.pending+'/approve','POST',{reviewedDay:rival.day})).status,409)
  assert.equal((await library()).proposals.length,1)
  assert.equal((await request('proposals','POST',{...rival,day:'2032-02-31'})).status,400)
})

test('CLI search returns links only for active matching pages in its configured workspace',async t=>{
  const {create,request,host,key}=await workspace(t)
  const other=await create('workspaces',{name:'Research'})
  await create('pages',{title:'Observation elsewhere'})
  const path='pages?workspace='+other
  const id=await create(path,{title:'Visible',content:'An observation'})
  const imported=await create('pages/import-markdown?workspace='+other,{title:'Field diary',content:'First entry\n\nSecond observation'})
  const {blocks}=await(await request('source?workspace='+other+'&id='+imported+'&blocks=1')).json()
  const deleted=await create(path,{title:'Deleted observation'})
  assert.equal((await request('pages/'+deleted+'?workspace='+other,'PATCH',{deleted:true})).status,200)
  const entry=fileURLToPath(new URL('../../src/tools/cli.ts',import.meta.url))
  const {stdout}=await promisify(execFile)(process.execPath,[entry,'search','observation'],{
    env:{...process.env,CHULANE_URL:host.url,CHULANE_ACCESS_KEY:key,CHULANE_WORKSPACE:String(other)}
  })
  assert.deepEqual(JSON.parse(stdout),[
    {id,title:'Visible',excerpt:'An observation',url:host.url+'/?workspace='+other+'&page='+id},
    {id:imported,title:'Field diary',block:blocks[1].id,excerpt:'Second observation',url:host.url+'/?workspace='+other+'&page='+imported+'&block='+blocks[1].id}
  ])
})

test('new pages and journal days give independent editors the same first paragraph',async t=>{
  const {create,request}=await workspace(t)
  const page=await create('pages',{title:'Blank page'})
  const day=await create('journal/today',{})
  for(const id of [page,day]){
    const read=async()=>new Uint8Array(await(await request('pages/'+id+'/state')).arrayBuffer())
    const [left,right]=await Promise.all([read(),read()])
    assert.ok(left.length>0,'both editors need an initialized document before typing')
    assert.deepEqual(left,right)
    const initial=agentDocument({id,title:'',plain:'',state:left}).blocks
    assert.equal(initial.length,1)
    assert.equal(initial[0].text,'')
    assert.equal((await request('pages/'+id+'/state?since=0')).status,204)
  }
})

test('invalid document bytes preserve the last acknowledged revision and search text',async t=>{
  const {create,request,library,host,cookie}=await workspace(t)
  const id=await create('pages',{title:'Draft'})
  const path='pages/'+id+'/state'
  const write=(state:Uint8Array,revision:number,text:string)=>fetch(host.url+'/api/'+path,{
    method:'PUT',
    headers:{Cookie:cookie,'If-Match':String(revision),'X-Text-Bytes':String(Buffer.byteLength(text))},
    body:Buffer.concat([Buffer.from(text),state])
  })
  const document=new Y.Doc()
  t.after(()=>document.destroy())
  document.getText('body').insert(0,'Saved text')
  const valid=Y.encodeStateAsUpdate(document)
  assert.equal((await write(valid,0,'Saved text')).status,200)
  assert.equal((await write(Uint8Array.of(255),1,'Invalid text')).status,400)
  const saved=await request(path)
  assert.equal(saved.headers.get('x-revision'),'1')
  assert.deepEqual(new Uint8Array(await saved.arrayBuffer()),valid)
  assert.equal((await library()).pages[0].plain,'Saved text')
})

test('a collaborator downloads only missing changes and deletions after opening the full document',async t=>{
  const {create,host,cookie}=await workspace(t)
  const page=await create('pages',{title:'Long shared page'}),path=host.url+'/api/pages/'+page+'/state'
  const writer=new Y.Doc(),reader=new Y.Doc()
  t.after(()=>{writer.destroy();reader.destroy()})
  const write=(rev:number)=>fetch(path+'?live',{method:'PUT',headers:{Cookie:cookie,'If-Match':String(rev),
    'Content-Type':'application/octet-stream'},body:Buffer.from(Y.encodeStateAsUpdate(writer))})
  const read=(since:number,vector:string)=>fetch(path+'?since='+since,{headers:{Cookie:cookie,'X-Yjs-State-Vector':vector}})
  writer.getText('writing').insert(0,'x'.repeat(256*1024))
  const first=await(await write(0)).json()
  const opened=await read(-1,'')
  Y.applyUpdate(reader,new Uint8Array(await opened.arrayBuffer()))
  const vector=opened.headers.get('X-Yjs-State-Vector')
  assert.ok(vector)
  writer.getText('writing').delete(0,3)
  writer.getText('writing').insert(0,'start')
  const second=await(await write(first.rev)).json()
  const changed=await read(first.rev,vector)
  assert.equal(changed.headers.get('X-Yjs-Delta-From'),String(first.rev))
  const delta=new Uint8Array(await changed.arrayBuffer())
  assert.ok(delta.length<256)
  Y.applyUpdate(reader,delta)
  assert.equal(reader.getText('writing').toString(),writer.getText('writing').toString())
  const nextVector=changed.headers.get('X-Yjs-State-Vector')!
  assert.equal((await read(second.rev,nextVector)).status,204)
  writer.getText('writing').delete(5,1)
  assert.equal((await write(second.rev)).status,200)
  const deletion=await read(second.rev,nextVector)
  assert.equal(deletion.headers.get('X-Yjs-State-Vector'),nextVector)
  assert.equal(deletion.headers.get('X-Yjs-Delta-From'),String(second.rev))
  Y.applyUpdate(reader,new Uint8Array(await deletion.arrayBuffer()))
  assert.equal(reader.getText('writing').toString(),writer.getText('writing').toString())
  const full=await fetch(path,{headers:{Cookie:cookie}})
  assert.equal(full.headers.get('X-Yjs-Delta-From'),null)
  assert.ok((await full.arrayBuffer()).byteLength>256*1024)
})

test('live patch uploads apply only to their acknowledged base and keep a standalone draft',async t=>{
  const {create,host,cookie}=await workspace(t)
  const page=await create('pages',{title:'Coauthoring',content:'z'.repeat(8192)})
  const url=host.url+'/api/pages/'+page+'/state'
  const read=()=>fetch(url,{headers:{Cookie:cookie,'X-Yjs-State-Vector':''}})
  const opened=await read()
  const base=Number(opened.headers.get('X-Revision'))
  const writer=new Y.Doc()
  t.after(()=>writer.destroy())
  Y.applyUpdate(writer,new Uint8Array(await opened.arrayBuffer()))
  writer.getText('notes').insert(0,'first')
  const patch=(rev:number,bytes:Uint8Array)=>fetch(url+'?live',{method:'PATCH',headers:{Cookie:cookie,
    'Content-Type':'application/octet-stream','If-Match':String(rev)},body:Buffer.from(bytes)})
  const delta=Y.encodeStateAsUpdate(writer,Buffer.from(opened.headers.get('X-Yjs-State-Vector')!,'base64'))
  assert.ok(delta.byteLength<128)
  const accepted=await patch(base,delta)
  assert.equal(accepted.status,200)
  assert.equal(opened.headers.get('Accept-Patch'),'application/octet-stream')
  const ack=await accepted.json()
  assert.equal((await patch(base,delta)).status,409)
  writer.getText('notes').delete(0,1)
  const deletion=Y.encodeStateAsUpdate(writer,Buffer.from(ack.vector,'base64'))
  assert.ok(deletion.length<64)
  const next=await patch(ack.rev,deletion)
  assert.equal(next.status,200)
  const {rev}=await next.json()
  assert.equal((await patch(rev,Uint8Array.of(255))).status,400)
  const incomplete=new Y.Doc()
  t.after(()=>incomplete.destroy())
  incomplete.getText('missing').insert(0,'base')
  const missing=Y.encodeStateVector(incomplete)
  incomplete.getText('missing').insert(4,'tail')
  const orphan=Y.encodeStateAsUpdate(incomplete,missing)
  assert.equal((await patch(rev,orphan)).status,409)
  for(const suffix of ['','?live']){
    for(const frame of [{'Content-Type':'application/octet-stream'},{'X-Text-Bytes':'0'}] as Record<string,string>[]){
      const invalid=await fetch(url+suffix,{method:'PUT',headers:{Cookie:cookie,'If-Match':String(rev),...frame},body:Buffer.from(orphan)})
      assert.equal(invalid.status,400)
    }
  }
  const head=await read()
  assert.equal(Number(head.headers.get('X-Revision')),rev)
  const bytes=new Uint8Array(await head.arrayBuffer()),reader=new Y.Doc()
  t.after(()=>reader.destroy())
  Y.applyUpdate(reader,bytes)
  assert.equal(reader.getText('notes').toString(),'irst')
  assert.equal(agentDocument({id:page,title:'',plain:'',state:bytes}).plain.length,8192)
})

test('a large live document checkpoints from the same binary state and rejects a stale revision',async t=>{
  const {create,host,cookie,library}=await workspace(t)
  const id=await create('pages',{title:'Shared writing'})
  const path=host.url+'/api/pages/'+id+'/state'
  const plain='x'.repeat(8*1024*1024+256)
  const state=Buffer.from(initialEditorState({id,plain}))
  assert.ok(state.length<16*1024*1024 && state.length+plain.length>16*1024*1024)
  const write=(rev:number,suffix='')=>fetch(path+suffix,{method:'PUT',headers:{
    Cookie:cookie,'If-Match':String(rev),'Content-Type':'application/octet-stream'},body:state})
  const live=await write(0,'?live')
  assert.equal(live.status,200)
  const {rev}=await live.json()
  assert.equal((await write(0)).status,409)
  assert.equal((await write(rev)).status,200)
  assert.equal((await library()).pages[0].plain.length,plain.length)
})

test('reviewed edits on a live page use the editor binary size limit and preserve rejected drafts',async t=>{
  const {create,request,host,cookie}=await workspace(t)
  const page=await create('pages',{title:'Shared draft'})
  const plain='x'.repeat(16*1024*1024-2048)
  const state=initialEditorState({id:page,plain})
  const path='pages/'+page+'/state'
  const live=await fetch(host.url+'/api/'+path+'?live',{method:'PUT',headers:{
    Cookie:cookie,'If-Match':'0','Content-Type':'application/octet-stream'},body:Buffer.from(state)})
  assert.equal(live.status,200)
  const {rev}=await live.json()
  const propose=async(after:string)=>(await(await request('proposals','POST',{page,edit:{block:'',before:'',after}})).json()).pending
  const writer=new Y.Doc()
  t.after(()=>writer.destroy())
  Y.applyUpdate(writer,state)
  const known=Y.encodeStateVector(writer)
  writer.getText('overflow').insert(0,'x'.repeat(4096))
  const overflow=await fetch(host.url+'/api/'+path+'?live',{method:'PATCH',headers:{Cookie:cookie,
    'Content-Type':'application/octet-stream','If-Match':String(rev)},body:Buffer.from(Y.encodeStateAsUpdate(writer,known))})
  assert.equal(overflow.status,413)
  const large=await propose('y'.repeat(4096))
  assert.equal((await request('proposals/'+large+'/approve','POST')).status,413)
  assert.equal((await(await request('proposals/'+large)).json()).status,'pending')
  assert.equal((await request(path+'?since='+rev)).status,204)
  const small=await propose('Reviewed addition')
  const approval=await request('proposals/'+small+'/approve','POST')
  assert.equal(approval.status,200)
  const {base,delta,block}=await approval.json()
  const merged=Y.mergeUpdates([Buffer.from(base,'base64'),Buffer.from(delta,'base64')])
  const persisted=new Uint8Array(await(await request(path)).arrayBuffer())
  for(const snapshot of [merged,persisted]){
    const document=agentDocument({id:page,title:'',plain:'',state:snapshot})
    assert.equal(document.blocks[0].text.length,plain.length)
    assert.deepEqual(document.blocks[1],{id:block,text:'Reviewed addition'})
  }
})

test('live revisions reach readers without committing the document or its search text',async t=>{
  const {create,request,library,host,cookie}=await workspace(t)
  const id=await create('pages',{title:'Draft'})
  const path='pages/'+id+'/state'
  const doc=new Y.Doc()
  t.after(()=>doc.destroy())
  doc.getText('body').insert(0,'live only')
  const state=Y.encodeStateAsUpdate(doc)
  const put=(suffix:string,rev:number)=>fetch(host.url+'/api/'+path+suffix,{
    method:'PUT',headers:{Cookie:cookie,'If-Match':String(rev),'X-Text-Bytes':'0'},body:Buffer.from(state)
  })
  const live=await put('?live',0)
  assert.equal(live.status,200)
  const {rev}=await live.json()
  assert.ok(rev<0)
  assert.deepEqual(new Uint8Array(await (await request(path)).arrayBuffer()),state)
  assert.equal((await library()).pages[0].plain,'')
  assert.equal((await put('',0)).status,409)
  assert.equal((await request(path+'?since='+rev)).status,204)
  const saved=await put('',rev)
  assert.equal(saved.status,200)
  assert.equal((await saved.json()).rev,1)
})

test('retrieval filters stale and foreign index hits and returns authorized source text', async t => {
  const host = await serve({
    file: ':memory:', assets: '.', editorKey: 'write', viewerKey: 'view',
    retriever: { async search(_workspace, _query, pages) {
      assert.deepEqual(pages.map(page => page.title), ['Visible'])
      return [2, 3, 1, 1, 999]
    } },
  })
  t.after(() => host.close())
  let cookie = ''
  const call = (path: string, data?: object) => fetch(host.url + '/api/' + path, {
    method: data ? 'POST' : 'GET', body: JSON.stringify(data),
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  })
  const login = async (key: string) => {
    cookie = (await call('login', { key })).headers.get('set-cookie')!.split(';')[0]
  }
  assert.equal((await call('search?q=test')).status, 401)
  await login('write')
  await call('workspaces',{name:'Primary'})
  await call('workspaces', { name: 'Another' })
  await call('pages', { title: 'Visible', content: 'Body' })
  await call('pages?workspace=2', { title: 'Foreign' })
  await call('pages', { title: 'Trashed' })
  await fetch(host.url + '/api/pages/3', { method: 'PATCH', headers: { Cookie: cookie }, body: '{"deleted":true}' })
  await login('view')
  assert.deepEqual(await (await call('search?q=test')).json(), [{ id: 1, title: 'Visible' }])
  assert.deepEqual(await (await call('source?id=1')).json(), { id: 1, title: 'Visible', text: 'Body' })
  for (const id of [2, 3]) assert.equal((await call('source?id=' + id)).status, 404)
})

test('library text search returns every matching attachment independently of agent retrieval',async t=>{
  const host=await serve({file:':memory:',assets:'.',editorKey:'write',retriever:{async search(){throw Error('Semantic index unavailable')}}})
  t.after(()=>host.close())
  const api=host.url+'/api/'
  const login=await fetch(api+'login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'write'})})
  const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]!}
  const post=(path:string,data:object)=>fetch(api+path,{headers:{...headers,'Content-Type':'application/json'},method:'POST',body:JSON.stringify(data)})
  await post('workspaces',{name:'Research'})
  const ids:number[]=[]
  for(let i=0;i<31;i++){
    const {id}=await(await post('pages',{title:'Note '+i})).json()
    ids.push(id)
    assert.equal((await fetch(api+'pages/'+id+'/files?name=log.txt',{headers,method:'POST',body:Buffer.from('North ridge survey')})).status,200)
  }
  await fetch(api+'pages/'+ids[0]+'/files?name=map.csv',{headers,method:'POST',body:'Site,North ridge'})
  const response=await fetch(api+'library/search?q=north%20ridge',{headers})
  assert.equal(response.status,200)
  const hits=await response.json()
  assert.deepEqual(hits.map(hit=>hit.id),ids)
  assert.equal(hits.at(-1).attachment.excerpt,'North ridge survey')
  assert.equal(hits[0].attachment.name,'log.txt')
  assert.deepEqual(hits[0].additionalAttachments?.map(file=>[file.name,file.excerpt]),[['map.csv','Site,North ridge']])
})

test('exact attachment filenames survive both agent search limits',async t=>{
  const {create,request,host,cookie}=await workspace(t)
  const name='RÉSUMÉ[1].txt'
  for(let i=0;i<30;i++)await create('pages',{title:'Mention '+i,content:name})
  const page=await create('pages',{title:'Original records'})
  const add=(name:string)=>fetch(host.url+'/api/pages/'+page+'/files?name='+encodeURIComponent(name),{
    method:'POST',headers:{Cookie:cookie},body:'See RÉSUMÉ[1].txt'
  })
  for(let i=0;i<30;i++)assert.equal((await add('reference-'+i+'.txt')).status,200)
  const exact=await (await add(name)).json()
  for(const path of ['search','library/search']){
    const hits=await (await request(path+'?q='+encodeURIComponent(name.toLowerCase()))).json()
    assert.equal(hits[0].id,page)
    assert.equal(hits[0].attachment.id,exact.id)
    assert.equal(hits.length,path==='search'?30:31)
  }
  const exactPage=await create('pages',{title:name})
  const hits=await (await request('search?q='+encodeURIComponent(name))).json()
  assert.deepEqual(hits.slice(0,2).map(hit=>hit.id),[exactPage,page])
})

for(const version of [1,2])test('format '+version+' attachment search upgrades preserve original downloads and passage offsets',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-tabular-')),file=join(dir,'library.sqlite')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const {host,create,key}=await workspace(t,false,file)
  const page=await create('pages',{title:'Sampling'})
  await host.close()
  const old=new DatabaseSync(file)
  const content='\ufeffstation,reading\r\n🧭,"Tidal inlet, 41"\r\n'
  const name=version===1?'Survey.CsV':'legacy.MD'
  const csv=version===1?Buffer.from(content):Buffer.from(content,'utf16le').swap16()
  const binary=Buffer.from([84,105,100,97,108,0,255])
  let csvId:number
  try{
    const add=old.prepare('INSERT INTO files(page,name,bytes) VALUES(?,?,?)')
    csvId=Number(add.run(page,name,csv).lastInsertRowid)
    add.run(page,'bad.tsv',binary)
    add.run(page,'truncated.md',Buffer.from([0xff,0xfe,0x41]))
    add.run(page,'controls.txt',Buffer.from('\ufeffprobe\0record','utf16le'))
    old.exec('PRAGMA user_version='+version)
  }finally{old.close()}
  const upgraded=await serve({file,assets:'.',editorKey:key})
  t.after(()=>upgraded.close())
  const login=await fetch(upgraded.url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})})
  const cookie=login.headers.get('set-cookie')!.split(';')[0]!
  const api=(path:string,body?:Uint8Array)=>fetch(upgraded.url+'/api/'+path,{method:body?'POST':'GET',headers:{Cookie:cookie},body:body as BodyInit|undefined})
  const tsv=Buffer.from('\ufeffstation\treading\nEast\tTidal channel','utf16le')
  const uploaded=await api('pages/'+page+'/files?name=Results.TSV',tsv)
  assert.equal(uploaded.status,200)
  const tsvId=(await uploaded.json()).id
  const hits=await(await api('search?q=Tidal')).json()
  assert.deepEqual(hits.map(hit=>hit.attachment.id),[csvId,tsvId])
  for(const [i,bytes] of [csv,tsv].entries()){
    const {id,matchOffset}=hits[i].attachment
    const passage=await(await api('attachment-text?id='+page+'&file='+id+'&offset='+matchOffset)).json()
    assert.equal(passage.text,i===0?'Tidal inlet, 41"\r\n':'Tidal channel')
    assert.deepEqual(Buffer.from(await(await api('pages/'+page+'/files/'+id)).arrayBuffer()),bytes)
  }
  const listed=await(await api('attachment-text?id='+page)).json()
  assert.deepEqual(listed.files.map(f=>f.name),[name,'Results.TSV'])
  const checked=new DatabaseSync(file,{readOnly:true})
  try{assert.equal(checked.prepare('PRAGMA user_version').get()!.user_version,7)}finally{checked.close()}
})

test('project trash restores the original subtree and preserves independent deletions',async t=>{
  const {create,request,library}=await workspace(t)
  const parent=await create('projects',{name:'Research'})
  const child=await create('projects',{name:'Fieldwork',parent})
  const nested=await create('projects',{name:'Marsh',parent:child})
  const page=await create('pages',{title:'Transect',content:'North bank',project:nested})
  const previous=await create('pages',{title:'Old note',project:child})
  await request('pages/'+previous,'PATCH',{deleted:true})
  const toggle=(id:number,deleted:boolean)=>request('projects/'+id,'PATCH',{deleted})
  const other=await create('workspaces',{name:'Other'})
  assert.equal((await request('projects?workspace='+other,'POST',{name:'Foreign parent',parent})).status,400)
  assert.equal((await toggle(parent,true)).status,200)
  const denied=await request('pages/'+page+'/files')
  assert.equal(denied.status,410)
  assert.equal(denied.headers.get('X-Chulane-Trash-Revision'),'1')
  assert.equal((await request('source?id='+page)).status,404)
  assert.equal((await request('pages/'+page,'PATCH',{deleted:false})).status,409)
  assert.equal((await request('pages/'+previous,'PATCH',{deleted:false})).status,409)
  assert.equal((await request('pages','POST',{project:nested,title:'New note'})).status,400)
  assert.equal((await toggle(child,false)).status,409)
  assert.equal((await toggle(parent,false)).status,200)
  const restored=(await library()).pages.find(item=>item.id===page)!
  assert.equal(restored.trashRevision,2)
  assert.equal(restored.deleted,0);assert.equal(restored.project,nested);assert.equal(restored.plain,'North bank')
  assert.equal((await library()).pages.find(item=>item.id===previous)?.deleted,1)
  await toggle(child,true);await toggle(parent,true);await toggle(parent,false)
  assert.equal((await request('source?id='+page)).status,404)
  assert.equal((await toggle(child,false)).status,200)
})

test('page state, metadata and files use the requested workspace',async t=>{
  const {create,request,library}=await workspace(t)
  const ws=await create('workspaces',{name:'Second library'})
  const id=await create('pages?workspace='+ws,{title:'Field note'})
  const path='pages/'+id
  for(const [suffix,method,data] of [['/state','GET'],['/files','GET'],['/files/1','GET'],['/state','PUT'],['/files?name=wrong.txt','POST'],['','PATCH',{deleted:true}]] as const){
    assert.equal((await request(path+suffix,method,data)).status,404)
  }
  assert.equal((await request(path+'/state?workspace='+ws)).status,200)
  assert.equal((await request(path+'/files?workspace='+ws)).status,200)
  assert.equal((await library(ws)).pages[0].deleted,0)
})

test('workspace journal follows its configured calendar across midnight and keeps earlier pages',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-03-08T04:59:59Z')})
  const {create,request,library,host,key}=await workspace(t,true)
  const id=await create('workspaces',{name:'Team',timeZone:'America/New_York'})
  const scope='?workspace='+id
  const today=()=>create('journal/today'+scope,{})
  assert.equal((await library(id)).today,'2026-03-07')
  const journal=async()=>await(await request('library'+scope+'&view=journal')).json()
  const march7=await journal()
  assert.equal(march7.pages.length,1)
  assert.equal(march7.pages[0].day,march7.today)
  const first=await today()
  assert.equal(first,march7.pages[0].id)
  t.mock.timers.tick(1000)
  assert.equal((await library(id)).today,'2026-03-08')
  const march8=await journal()
  assert.equal(march8.pages.length,2)
  assert.ok(march8.pages.some(page=>page.day===march8.today))
  const [a,b]=await Promise.all([today(),today()])
  assert.equal(a,b);assert.notEqual(a,first)
  assert.equal((await request('workspaces'+scope,'PATCH',{timeZone:'Moon/Base'})).status,400)
  assert.equal((await request('workspaces'+scope,'PATCH',{timeZone:'Pacific/Honolulu'})).status,200)
  assert.equal(await today(),first)
  assert.equal((await library(id)).pages.length,2)
  assert.equal((await request('pages/'+first+scope,'PATCH',{deleted:true})).status,200)
  assert.equal(await today(),first)
  assert.equal((await library(id)).pages.find(page=>page.id===first)?.deleted,1)
  assert.equal((await request('pages'+scope,'POST',{title:'Invalid',day:'2026-02-30'})).status,400)
  assert.equal((await journal()).pages.find(page=>page.id===first).deleted,1)
  const purge=await fetch(host.url+'/api/pages/'+first+scope,{method:'DELETE',headers:{Authorization:'Bearer '+key}})
  assert.equal(purge.status,200)
  const retired=await journal()
  assert.ok(retired.removedPages.some(page=>page.day===retired.today))
  assert.ok(!retired.pages.some(page=>page.day===retired.today))
})

test('a shared web editor can choose the calendar for a new workspace but cannot reconfigure it',async t=>{
  const {create,request,library}=await workspace(t)
  const id=await create('workspaces',{name:'Team',timeZone:'Europe/Paris'})
  assert.equal((await request('workspaces?workspace='+id,'PATCH',{timeZone:'Asia/Tokyo'})).status,403)
  assert.equal((await library(id)).workspaces.find(ws=>ws.id===id)?.timeZone,'Europe/Paris')
})

test('page references survive rename, move and trash and stay in their own workspace',async t=>{
  const {request,create,library}=await workspace(t)
  const source=await create('pages',{title:'Notes'})
  const target=await create('pages',{title:'Plan'})
  const other=await create('workspaces',{name:'Other'})
  const foreign=await create('pages?workspace='+other,{title:'Other plan'})
  const path='pages/'+source+'/links/'
  assert.equal((await request(path+foreign,'PUT')).status,404)
  assert.equal((await request(path+target+'?workspace='+other,'PUT')).status,404)
  assert.equal((await request(path+source,'PUT')).status,400)
  for(let i=0;i<2;i++)assert.equal((await request(path+target,'PUT')).status,200)
  const project=await create('projects',{name:'Archive'})
  await request('pages/'+target,'PATCH',{title:'Revised plan'})
  await request('pages/'+target,'PATCH',{project})
  await request('pages/'+target,'PATCH',{deleted:true})
  assert.equal((await request(path+target,'PUT')).status,410)
  await request('pages/'+target,'PATCH',{deleted:false})
  assert.deepEqual((await library()).links,[{source,target}])
  assert.deepEqual((await library(other)).links,[])
  const markdown='pages/'+source+'/markdown'
  const plain=await(await request(markdown)).json()
  assert.match(plain.markdown,/Revised plan/)
  assert.ok(plain.markdown.includes('workspace 1, page '+target))
  const origin='https://notes.example:9443'
  const linked=await(await request(markdown+'?'+new URLSearchParams({origin}))).json()
  const list=fromMarkdown(linked.markdown).children.at(-1)
  assert.ok(list?.type==='list')
  const line=list.children[0]?.children[0]
  assert.ok(line?.type==='paragraph')
  const link=line.children[0]
  assert.ok(link?.type==='link')
  assert.equal(link.url,origin+'/?workspace=1&page='+target)
  assert.equal(link.children[0].type==='text'&&link.children[0].value,'Revised plan')
  assert.ok(!linked.omitted.includes('editable workspace link relationships'))
  await request('pages/'+target,'PATCH',{deleted:true})
  const trashed=await(await request(markdown+'?'+new URLSearchParams({origin}))).json()
  assert.match(trashed.markdown,/Revised plan.*in Trash/)
  assert.ok(!trashed.markdown.includes(origin))
  assert.equal((await request(markdown+'?origin=javascript:example')).status,400)
  assert.equal((await request(path+target,'DELETE')).status,200)
  assert.deepEqual((await library()).links,[])
})

test('Markdown reimport restores same-workspace page relationships and keeps foreign or edited references readable',async t=>{
  const {request,create,library}=await workspace(t)
  const source=await create('pages',{title:'Index',content:'See the map.'})
  const target=await create('pages',{title:'Original map'})
  assert.equal((await request('pages/'+source+'/links/'+target,'PUT')).status,200)
  const exported=await(await request('pages/'+source+'/markdown')).json()
  await request('pages/'+target,'PATCH',{title:'Renamed map'})
  const copy=await create('pages/import-markdown',{title:'Copy',content:exported.markdown})
  assert.ok((await library()).links.some(link=>link.source===copy&&link.target===target))
  const again=await(await request('pages/'+copy+'/markdown')).json()
  assert.equal(again.markdown.match(/## Linked pages/g)?.length,1)
  assert.match(again.markdown,/Renamed map/)
  assert.doesNotMatch(again.markdown,/Original map/)
  const other=await create('workspaces',{name:'Second library'})
  const foreign=await create('pages/import-markdown?workspace='+other,{title:'Foreign copy',content:exported.markdown})
  const foreignLibrary=await library(other)
  assert.deepEqual(foreignLibrary.links,[])
  assert.match(foreignLibrary.pages.find(p=>p.id===foreign)!.plain,/Original map/)
  const independent=await workspace(t)
  await independent.create('pages',{title:'Unrelated index'})
  assert.equal(await independent.create('pages',{title:'Unrelated map'}),target)
  const separate=await independent.create('pages/import-markdown',{title:'Imported elsewhere',content:exported.markdown})
  const separateLibrary=await independent.library()
  assert.deepEqual(separateLibrary.links,[])
  assert.match(separateLibrary.pages.find(p=>p.id===separate)!.plain,/Original map/)
  const edited=await create('pages/import-markdown',{title:'Edited copy',content:exported.markdown.replace('Original map','My annotation')})
  assert.ok(!(await library()).links.some(link=>link.source===edited))
  assert.match((await library()).pages.find(p=>p.id===edited)!.plain,/My annotation/)
  const retired=await create('pages',{title:'Retired plan'})
  await request('pages/'+source+'/links/'+retired,'PUT')
  const mixed=await(await request('pages/'+source+'/markdown')).json()
  await request('pages/'+retired,'PATCH',{deleted:true})
  const partial=await create('pages/import-markdown',{title:'Partial copy',content:mixed.markdown.replaceAll('\n','\r\n')})
  const after=await library()
  assert.deepEqual(after.links.filter(link=>link.source===partial),[{source:partial,target}])
  assert.match(after.pages.find(p=>p.id===partial)!.plain,/Retired plan/)
  assert.doesNotMatch(after.pages.find(p=>p.id===partial)!.plain,/Renamed map|chulane-page-links/)
})

test('Markdown imports reconnect intact link sections between paragraphs only in their owning workspace',async t=>{
  const {request,create,library}=await workspace(t)
  const source=await create('pages',{title:'Route',content:'Original writing'})
  const target=await create('pages',{title:'Map'})
  await request('pages/'+source+'/links/'+target,'PUT')
  const {markdown}=await(await request('pages/'+source+'/markdown')).json()
  const notes='## Notes added after export\n\nKeep the second paragraph.'
  const content=markdown+'\n\n'+notes
  const copy=await create('pages/import-markdown',{title:'Revised route',content})
  const catalog=await library()
  assert.deepEqual(catalog.links.filter(link=>link.source===copy),[{source:copy,target}])
  assert.equal(catalog.pages.find(page=>page.id===copy)?.plain,'Original writing\n\n'+notes)
  // Combining exports retains both bodies and the literal example but creates each relationship once.
  const example='~~~markdown\n'+markdown+'\n~~~'
  const combined=await create('pages/import-markdown',{title:'Collected notes',content:[markdown,example,markdown,'## Measurements','    indented code'].join('\n\n')})
  const collected=await library()
  assert.deepEqual(collected.links.filter(link=>link.source===combined),[{source:combined,target}])
  assert.equal(collected.pages.find(page=>page.id===combined)?.plain,['Original writing',example,'Original writing','## Measurements','    indented code'].join('\n\n'))
  const other=await create('workspaces',{name:'Another library'})
  const foreign=await create('pages/import-markdown?workspace='+other,{title:'Revised route',content})
  const foreignLibrary=await library(other)
  assert.deepEqual(foreignLibrary.links,[])
  const plain=foreignLibrary.pages.find(page=>page.id===foreign)!.plain
  assert.ok(plain.includes('Map')&&plain.endsWith(notes))
  assert.doesNotMatch(plain,/chulane-page-links-v1/)
})

test('Markdown file imports reject binary content and unpaired surrogates before creating a page',async t=>{
  const {request,library,host,cookie}=await workspace(t)
  const before=(await library()).pages.length
  for(const content of ['Field\0notes','Field\ud800notes','Field\udc00']){
    const response=await request('pages/import-markdown','POST',{title:'Damaged',content})
    assert.equal(response.status,400)
  }
  const damaged=Buffer.concat([Buffer.from('{"title":"Damaged","content":"'),Buffer.from([0xc3]),Buffer.from('"}')])
  const response=await fetch(host.url+'/api/pages/import-markdown',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:damaged})
  assert.equal(response.status,400)
  assert.equal((await library()).pages.length,before)
})

test('Markdown import applies the same 1 MiB text budget across file encodings and the API',async t=>{
  const {readMarkdownFile,markdownImportLimit}=await import('../../src/shared/markdown-file.ts')
  const {create,request,library}=await workspace(t)
  const content='x'.repeat(markdownImportLimit)
  for(const bytes of [Buffer.from('\uFEFF'+content),Buffer.from('\uFEFF'+content,'utf16le'),Buffer.from('\uFEFF'+content,'utf16le').swap16()]){
    assert.equal((await readMarkdownFile(new Blob([bytes]))).replace(/^\uFEFF/,''),content)
  }
  const id=await create('pages/import-markdown',{title:'At the limit',content:'\uFEFF'+content})
  assert.equal((await library()).pages.find(page=>page.id===id)?.plain,content)
  // This UTF-16 file fits in 1 MiB on disk but its decoded text exceeds the UTF-8 budget.
  const large='界'.repeat(Math.ceil(markdownImportLimit/3))
  await assert.rejects(readMarkdownFile(new Blob([Buffer.from('\uFEFF'+large,'utf16le')])),/1 MiB/)
  assert.equal((await request('pages/import-markdown','POST',{title:'Too large',content:large})).status,413)
  assert.equal((await library()).pages.length,1)
})

test('Markdown import accepts a UTF-8 signature without shifting list text or same-title page references',async t=>{
  const {create,request,library}=await workspace(t)
  await create('pages',{title:'Field map'})
  const target=await create('pages',{title:'Field map'})
  const source=await create('pages/import-markdown',{title:'Index',content:'- Original observation'})
  await request('pages/'+source+'/links/'+target,'PUT')
  const exported=await(await request('pages/'+source+'/markdown')).json()
  const writing='- Updated observation with an interior \uFEFF mark'
  const content='\uFEFF'+exported.markdown.replace('- Original observation',writing).replaceAll('\n','\r\n')
  const copy=await create('pages/import-markdown',{title:'Returned index',content})
  const catalog=await library()
  assert.deepEqual(catalog.links.filter(link=>link.source===copy),[{source:copy,target}])
  assert.equal(catalog.pages.find(page=>page.id===copy)?.plain,writing)
  const again=await(await request('pages/'+copy+'/markdown')).json()
  assert.ok(again.markdown.startsWith(writing+'\n\n'))
})

test('agents follow saved page links by ID across renames, trash and paginated reads',async t=>{
  const {request,create,host,key,cookie}=await workspace(t,false,':memory:',{async run(turn){
    const links=turn.tools.listPageLinks(turn.current!.id,0)
    const target=links.entries[0]
    turn.publish(turn.tools.read(target.id,0).blocks[0].text)
  }})
  const targets:number[]=[]
  for(let i=0;i<42;i++){
    const id=await create('pages',{title:'Station',content:'Field note '+i})
    targets.push(id)
  }
  const unrelated=await create('pages',{title:'Unlinked'})
  const content=[
    '[Copied block][station]',
    '[Also explicitly linked](?workspace=1&page='+targets[3]+')',
    '[Inline canvas](?view=canvas&page='+targets[41]+'&workspace=1)',
    '[Duplicate workspace](?workspace=2&workspace=1&page='+unrelated+')',
    '[External canvas](https://external.example/?workspace=1&page='+unrelated+'&view=canvas)',
    '`[Code example](?workspace=1&page='+unrelated+')`',
    '[Other workspace](?workspace=2&page='+unrelated+')',
    '\n\n[station]: '+host.url+'/?workspace=1&page='+targets[2]+'&block=station'
  ].join(' ')
  const source=await create('pages',{title:'Index',content})
  for(const target of targets.filter(id=>id!==targets[2]&&id!==targets[41]))await request('pages/'+source+'/links/'+target,'PUT')
  const project=await create('projects',{name:'Archive of observations'})
  assert.equal((await request('pages/'+targets[0],'PATCH',{title:'Moved station',baseTitle:'Station',project,baseProject:null})).status,200)
  await request('pages/'+targets[1],'PATCH',{deleted:true})
  const incoming=(id:number)=>'pages/'+id+'/links?direction=incoming'
  const index={id:source,title:'Index'}
  for(const destination of [targets[0],targets[2],targets[3],targets[41]]){
    assert.deepEqual(await(await request(incoming(destination))).json(),{entries:[index],nextAfter:null})
  }
  assert.deepEqual(await(await request(incoming(unrelated))).json(),{entries:[],nextAfter:null})
  const path='pages/'+source+'/links'
  const first=await request(path)
  assert.equal(first.status,200)
  const batch=await first.json()
  assert.deepEqual(batch.entries.map(entry=>entry.id),[targets[0],...targets.slice(2,41)])
  assert.equal(batch.entries[0].title,'Moved station')
  assert.equal(batch.nextAfter,targets[40])
  await request(path+'/'+targets[0],'DELETE')
  const cli=fileURLToPath(new URL('../../src/tools/cli.ts',import.meta.url))
  const result=await promisify(execFile)(process.execPath,[cli,'list_page_links',String(source),String(batch.nextAfter)],{env:{...process.env,CHULANE_URL:host.url,CHULANE_ACCESS_KEY:key,CHULANE_WORKSPACE:'1'}})
  assert.deepEqual(JSON.parse(result.stdout),{entries:[{id:targets[41],title:'Station',url:host.url+'/?workspace=1&page='+targets[41]}],nextAfter:null})
  const chat=await create('agent/chats',{})
  await request('agent/chats/'+chat+'/turn','POST',{text:'Read the first linked page',page:source,allowEdits:false,background:true})
  assert.equal((await(await request('agent/chats/'+chat)).json()).messages.at(-1).text,'Field note 2')
  const httpsOrigin=host.url.replace('http:','https:')
  const replacement='[New destination]('+httpsOrigin+'/?workspace=1&page='+unrelated+'&view=canvas)'
  const live=await fetch(host.url+'/api/pages/'+source+'/state?live',{method:'PUT',headers:{
    Cookie:cookie,'If-Match':'0','Content-Type':'application/octet-stream'
  },body:Buffer.from(initialEditorState({id:source,plain:replacement}))})
  assert.equal(live.status,200)
  assert.deepEqual(await(await request(incoming(targets[2]))).json(),{entries:[],nextAfter:null})
  assert.deepEqual(await(await request(incoming(unrelated)+'&origin='+encodeURIComponent(httpsOrigin))).json(),{entries:[index],nextAfter:null})
  assert.equal((await request(path+'?direction=invalid')).status,400)
  const tail=await(await request(path+'?after='+targets[40]+'&origin='+encodeURIComponent(httpsOrigin))).json()
  const otherOrigin=await(await request(path+'?after='+targets[40]+'&origin=https://external.example')).json()
  assert.deepEqual(otherOrigin,{entries:[],nextAfter:null})
  assert.deepEqual(tail,{entries:[{id:unrelated,title:'Unlinked'}],nextAfter:null})
  assert.equal((await request(path+'?after=-1')).status,400)
  const named=await create('pages/import-markdown',{title:'Site register',content:'[Unlinked]'})
  await request('pages/'+named+'/references','POST')
  const cliIncoming=await promisify(execFile)(process.execPath,[cli,'list_page_links',String(unrelated),'incoming'],{env:{...process.env,CHULANE_URL:host.url,CHULANE_ACCESS_KEY:key,CHULANE_WORKSPACE:'1'}})
  assert.deepEqual(JSON.parse(cliIncoming.stdout).entries,[{id:named,title:'Site register',url:host.url+'/?workspace=1&page='+named}])
  for(const id of targets.filter(id=>id!==targets[1]))await request('pages/'+id+'/links/'+unrelated,'PUT')
  const firstSources=await(await request(incoming(unrelated))).json()
  assert.deepEqual(firstSources.entries.map(entry=>entry.id),[targets[0],...targets.slice(2,41)])
  await request('pages/'+targets[0]+'/links/'+unrelated,'DELETE')
  assert.deepEqual(await(await request(incoming(unrelated)+'&after='+firstSources.nextAfter)).json(),{entries:[
    {id:targets[41],title:'Station'},{id:named,title:'Site register'}],nextAfter:null})
  const other=await create('workspaces',{name:'Elsewhere'})
  assert.equal((await request(path+'?workspace='+other)).status,404)
  await request('pages/'+source,'PATCH',{deleted:true})
  assert.deepEqual(await(await request(incoming(targets[3]))).json(),{entries:[],nextAfter:null})
  assert.equal((await request(path)).status,410)
})

test('server Markdown distinguishes same-title destinations in visible link text and restores both identities',async t=>{
  const {create,request,library}=await workspace(t)
  const source=await create('pages',{title:'Index'})
  const titles=['Map','Map','Legend']
  const targets:number[]=[]
  for(const title of titles){
    const target=await create('pages',{title})
    targets.push(target)
    await request('pages/'+source+'/links/'+target,'PUT')
  }
  const origin='https://notes.example'
  const exported=await(await request('pages/'+source+'/markdown?'+new URLSearchParams({origin}))).json()
  const list=fromMarkdown(exported.markdown).children.at(-1)
  assert.ok(list?.type==='list')
  const labels=list.children.map(item=>{
    const line=item.children[0]
    assert.ok(line?.type==='paragraph'&&line.children[0]?.type==='link')
    return line.children[0].children[0]
  })
  assert.deepEqual(labels.map(label=>label?.type==='text'&&label.value),['Map · #'+targets[0],'Map · #'+targets[1],'Legend'])
  const copy=await create('pages/import-markdown',{title:'Returned index',content:exported.markdown})
  assert.deepEqual((await library()).links.filter(link=>link.source===copy).map(link=>link.target),targets)
})

test('read tag properties through a page, a specific block and the workspace agent',async t=>{
  let page:number,block:string
  const {create,request,host,key}=await workspace(t,false,':memory:',{async run(turn){
    const result=turn.tools.readProperties({id:page,block,offset:0})
    turn.publish(JSON.stringify(result.entries))
  }})
  const imported=await create('pages',{title:'Unopened notebook',content:'Inspect the site #Camp'})
  const preview=await request('properties?id='+imported+'&block=%40import')
  assert.equal(preview.status,200)
  assert.equal((await preview.json()).entries[0].tag.name,'Camp')
  const match=await(await request('search?q=%23Camp')).json()
  assert.equal(match[0].block,'@import')
  page=await create('pages/import-markdown',{title:'Field notes',content:'Inspect the site'})
  const path='pages/'+page+'/tags'
  block=(await(await request(path+'/blocks')).json())[0].id
  const survey=await create('tags',{name:'Survey'}),priority=await create('tags',{name:'Priority'})
  const surveyFields='tags/'+survey+'/fields',priorityFields='tags/'+priority+'/fields'
  const checked=await create(surveyFields,{name:'Checked',kind:'checkbox'})
  const weight=await create(surveyFields,{name:'Weight',kind:'number'})
  await create(priorityFields,{field:weight})
  for(const [tag,target] of [[survey,''],[survey,block],[priority,block]] as const)
    assert.equal((await request(path,'PUT',{tag,block:target,active:true})).status,200)
  for(const [fields,field,target,value] of [[surveyFields,checked,'',false],[surveyFields,weight,block,0],[priorityFields,weight,block,4]] as const)
    assert.equal((await request(fields+'/'+field+'/value','PUT',{page,block:target,value})).status,200)
  const url='properties?id='+page
  const response=await request(url)
  assert.equal(response.status,200)
  const base={tag:{id:survey,name:'Survey'}}
  const first=await response.json()
  assert.deepEqual(first.entries,[
    {...base,field:{id:checked,name:'Checked',kind:'checkbox',value:false}},
    {...base,field:{id:weight,name:'Weight',kind:'number',value:null}},
  ])
  const source=url+'&block='+encodeURIComponent(block)
  const forBlock=await(await request(source)).json()
  assert.deepEqual(forBlock.entries.map(row=>row.field.value),[null,0,4])
  const chat=await create('agent/chats',{})
  await request('agent/chats/'+chat+'/turn','POST',{text:'Read the block properties',page:null,allowEdits:false,background:true})
  const answer=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.deepEqual(JSON.parse(answer.text),forBlock.entries)
  assert.ok(answer.sources.some(s=>s.id===page&&s.block===block))
  const cli=fileURLToPath(new URL('../../src/tools/cli.ts',import.meta.url))
  const external=await promisify(execFile)(process.execPath,[cli,'read_properties',String(page),'0',block],{env:{...process.env,CHULANE_URL:host.url,CHULANE_ACCESS_KEY:key}})
  assert.deepEqual(JSON.parse(external.stdout),{...forBlock,url:host.url+'/?workspace=1&page='+page+'&block='+encodeURIComponent(block)})
  assert.equal((await request(url+'&block=absent')).status,404)
  assert.equal((await request(url+'&offset=-1')).status,400)
  const separate=await create('workspaces',{name:'Elsewhere'})
  assert.equal((await request(url+'&workspace='+separate)).status,404)
  await request(priorityFields+'/'+weight,'DELETE')
  const bare={tag:{id:priority,name:'Priority'},field:null}
  assert.deepEqual((await(await request(source+'&offset=2')).json()).entries,[bare])
  const memo=await create(surveyFields,{name:'Memo',kind:'text'})
  const text='🧭'.repeat(9000)
  assert.equal((await request(surveyFields+'/'+memo+'/value','PUT',{page,block,value:text})).status,200)
  const beforeMemo=await(await request(source)).json()
  assert.equal(beforeMemo.nextOffset,2)
  const memoBatch=await(await request(source+'&offset='+beforeMemo.nextOffset)).json()
  assert.deepEqual(memoBatch.entries.map(row=>row.field.value),[text])
  assert.deepEqual((await(await request(source+'&offset='+memoBatch.nextOffset)).json()).entries,[bare])
  await request('tags/'+survey,'PATCH',{deleted:true})
  assert.deepEqual((await(await request(source)).json()).entries,[bare])
  await request(path,'PUT',{tag:priority,block,active:false})
  assert.deepEqual((await(await request(source)).json()).entries,[])
  await request('pages/'+page,'PATCH',{deleted:true})
  assert.equal((await request(url)).status,404)
})

test('tag definitions and applications retain identity across removal, trash and same-name restoration',async t=>{
  const {request,create,library}=await workspace(t)
  const page=await create('pages/import-markdown',{title:'Survey',content:'# Field\n\nCheck the map'})
  const path='pages/'+page+'/tags'
  const blocks=await(await request(path+'/blocks')).json()
  assert.equal(blocks[1].text,'Check the map')
  const block=blocks[1].id
  const tag=await create('tags',{name:'#Survey'})
  const apply=(block:string,active=true)=>request(path,'PUT',{tag,block,active})
  assert.equal((await apply('')).status,200)
  assert.equal((await apply(block)).status,200)
  const tagSearch=(query:string,route='search')=>request(route+'?q='+encodeURIComponent(query)).then(r=>r.json())
  await create('pages/import-markdown',{title:'Code examples',content:'`#Survey` and #Surveying'})
  assert.deepEqual(await tagSearch('#Survey'),[{id:page,title:'Survey'},{id:page,title:'Survey',block,excerpt:'Check the map'}])
  assert.deepEqual(await tagSearch('#Survey','library/search'),[{id:page,title:'Survey'}])
  await request(path,'PUT',{name:String(page),block,active:true})
  assert.equal((await tagSearch('#'+page))[0].id,page)
  assert.deepEqual(await tagSearch('tag:#'+page),[{id:page,title:'Survey',block,excerpt:'Check the map'}])
  assert.equal((await apply('absent')).status,404)
  const other=await create('workspaces',{name:'Other'})
  const foreign=await create('pages?workspace='+other,{title:'Foreign'})
  assert.equal((await request('pages/'+foreign+'/tags?workspace='+other,'PUT',{tag,block:'',active:true})).status,404)
  const sources=async()=>(await(await request('tags/'+tag+'/sources')).json())
  assert.equal((await sources()).length,2)
  assert.equal((await apply(block,false)).status,200)
  assert.equal((await sources()).length,1)
  await apply(block)
  await request('tags/'+tag,'PATCH',{deleted:true})
  assert.equal((await apply('')).status,410)
  assert.equal((await request('tags/'+tag+'/sources')).status,410)
  assert.deepEqual(await tagSearch('#Survey'),[])
  assert.equal(await create('tags',{name:'Survey'}),tag)
  assert.equal((await sources()).length,2)
  assert.equal((await library()).tags.filter(item=>item.name==='Survey').length,1)
  await request('pages/'+page,'PATCH',{deleted:true})
  assert.deepEqual(await sources(),[])
})

test('reviewed external drafts keep their destination and create the Markdown page exactly once',async t=>{
  const {create,request}=await workspace(t)
  const project=await create('projects',{name:'Survey'})
  const other=await create('workspaces',{name:'Separate'})
  const foreign=await create('projects?workspace='+other,{name:'Other folder'})
  const input={title:'Brief',markdown:'First paragraph.\n\nSecond paragraph.',project}
  const propose=(data:object)=>request('proposals','POST',data)
  assert.equal((await propose({...input,project:foreign})).status,400)
  assert.equal((await propose({...input,page:1})).status,400)
  assert.equal((await propose({...input,markdown:42})).status,400)
  const {pending}=await(await propose(input)).json()
  const decide=()=>request('proposals/'+pending+'/approve','POST',{})
  await request('projects/'+project,'PATCH',{deleted:true})
  assert.equal((await decide()).status,400)
  assert.equal((await(await request('proposals/'+pending)).json()).status,'pending')
  await request('projects/'+project,'PATCH',{deleted:false})
  const outcomes=await Promise.all([decide(),decide()])
  assert.deepEqual(outcomes.map(item=>item.status).sort(),[200,409])
  const {page}=await outcomes.find(item=>item.ok)!.json()
  const catalog=await(await request('library')).json()
  assert.deepEqual(catalog.pages.filter(p=>p.title===input.title).map(p=>[p.id,p.project]),[[page,project]])
  const source=await(await request('source?blocks=1&id='+page)).json()
  assert.deepEqual(source.blocks.map(block=>block.text),['First paragraph.','Second paragraph.'])
})

test('shared tag fields retain independent typed values across detachment and trash',async t=>{
  const {create,request}=await workspace(t)
  const page=await create('pages/import-markdown',{title:'Notes',content:'A block'})
  const block=(await(await request('pages/'+page+'/tags/blocks')).json())[0].id
  const a=await create('tags',{name:'A'}),b=await create('tags',{name:'B'})
  const fields=(tag:number)=>'tags/'+tag+'/fields'
  const field=await create(fields(a),{name:'Count',kind:'number'})
  assert.equal(await create(fields(b),{field}),field)
  const apply=(tag:number,block:string,active:boolean)=>request('pages/'+page+'/tags','PUT',{tag,block,active})
  const write=(tag:number,block:string,value:unknown)=>request(fields(tag)+'/'+field+'/value','PUT',{page,block,value})
  const values=async(tag:number)=>(await(await request('tags/'+tag+'/table')).json()).rows.map((row:{values:Record<string,unknown>})=>row.values[field])
  const snapshot=async(workspace=1)=>(await(await request('library?includeTagFields=1&workspace='+workspace)).json()).tagFields
  assert.equal((await(await request('library')).json()).tagFields,undefined)
  await apply(a,'',true);await apply(a,block,true);await apply(b,'',true)
  assert.equal((await write(a,'',0)).status,200)
  assert.equal((await request(fields(a)+'/'+field+'/value','PUT',{page,block:'',value:0,previous:null})).status,200)
  assert.equal((await request(fields(a)+'/'+field+'/value','PUT',{page,block:'',value:0,previous:{}})).status,400)
  assert.equal((await write(a,block,8)).status,200)
  assert.equal((await write(b,'',12)).status,200)
  assert.equal((await write(a,'','8')).status,400)
  assert.equal((await request(fields(a)+'/'+field+'/value','PUT',{page,block:'',value:55,previous:null})).status,409)
  assert.deepEqual(await values(a),[0,8]);assert.deepEqual(await values(b),[12])
  assert.equal((await request(fields(a)+'/'+field,'DELETE')).status,200)
  assert.deepEqual((await snapshot()).cells,[{tag:b,page,block:'',field,value:12}])
  assert.equal((await write(a,'',4)).status,404)
  assert.equal(await create(fields(a),{field}),field)
  await apply(a,block,false);assert.deepEqual(await values(a),[0])
  assert.deepEqual((await snapshot()).cells.find((cell:{tag:number;block:string})=>cell.tag===a&&cell.block===block),undefined)
  assert.equal((await write(a,block,5)).status,404)
  await apply(a,block,true)
  await request('tags/'+a,'PATCH',{deleted:true});await create('tags',{name:'A'})
  assert.deepEqual(await values(a),[0,8])
  assert.equal((await request(fields(b)+'/'+field,'PATCH',{name:'Count',kind:'text'})).status,409)
  const ws=await create('workspaces',{name:'Separate'})
  assert.deepEqual(await snapshot(ws),{columns:[],cells:[]})
  const foreign=await create('tags?workspace='+ws,{name:'Other'})
  assert.equal((await request(fields(foreign)+'?workspace='+ws,'POST',{field})).status,404)
  for(const [kind,good,bad] of [['date','2024-02-29','2023-02-29'],['choice','Red','Blue'],['checkbox',false,0],['text','hello',true]] as const){
    const id=await create(fields(a),{name:kind,kind,options:kind==='choice'?['Red']:[]})
    const path=fields(a)+'/'+id+'/value'
    assert.equal((await request(path,'PUT',{page,block:'',value:good})).status,200)
    if(kind==='choice'){
      assert.equal((await request(fields(a)+'/'+id,'PATCH',{name:'Palette',kind,options:['Blue']})).status,409)
      assert.equal((await request(fields(a)+'/'+id,'PATCH',{name:'Palette',kind,options:['Red','Green']})).status,200)
    }
    assert.equal((await request(path,'PUT',{page,block:'',value:bad})).status,400)
    assert.equal((await request(path,'PUT',{page,block:'',value:good,previous:null})).status,200)
    for(let attempt=0;attempt<2;attempt++)assert.equal((await request(path,'PUT',{page,block:'',value:null,previous:good})).status,200)
  }
  await request('pages/'+page,'PATCH',{deleted:true})
  assert.deepEqual((await snapshot()).cells,[])
  assert.deepEqual(await values(a),[]);assert.equal((await write(a,'',4)).status,404)
  await request('pages/'+page,'PATCH',{deleted:false})
  assert.deepEqual(await values(a),[0,8])
})

test('editing a shared field through a restored tag preserves a concurrent definition change',async t=>{
  const {create,request}=await workspace(t)
  const a=await create('tags',{name:'Survey'}),b=await create('tags',{name:'Archive'})
  const original={name:'Status',kind:'choice',options:['Open','Closed']}
  const id=await create('tags/'+a+'/fields',original)
  await create('tags/'+b+'/fields',{field:id})
  await request('tags/'+a,'PATCH',{deleted:true})
  assert.equal(await create('tags',{name:'Survey'}),a)
  const path=(tag:number)=>'tags/'+tag+'/fields/'+id
  const updated={...original,options:['Open','Closed','Deferred']}
  assert.equal((await request(path(b),'PATCH',{...updated,previous:original})).status,200)
  assert.equal((await request(path(a),'PATCH',{...updated,previous:original})).status,200)
  const stale={...original,name:'Progress',previous:original}
  assert.equal((await request(path(a),'PATCH',stale)).status,409)
  assert.equal((await request(path(a),'PATCH',{...updated,name:'Progress',previous:updated})).status,200)
  assert.equal((await request(path(b),'PATCH',{...updated,previous:original})).status,409)
  const {fields}=await(await request('tags/'+b+'/table')).json()
  assert.deepEqual(fields,[{...updated,id,name:'Progress',attached:true}])
})

test('typing a tag can define and apply it to a block in one operation',async t=>{
  const {create,request,library}=await workspace(t)
  const page=await create('pages/import-markdown',{title:'Survey',content:'Original observation\n\nLater observation'})
  const path='pages/'+page+'/tags',blocks=await(await request(path+'/blocks')).json()
  const block=blocks[0].id,another=blocks[1].id
  const assign=(block:string,name:string)=>request(path,'PUT',{block,name,active:true})
  assert.equal((await assign('missing','Unused')).status,404)
  assert.deepEqual((await library()).tags,[])
  assert.equal((await assign(block,'Café')).status,200)
  const [tag]=(await library()).tags
  const field=await create('tags/'+tag.id+'/fields',{name:'Count',kind:'number'})
  assert.equal((await request('tags/'+tag.id+'/fields/'+field+'/value','PUT',{page,block,value:7})).status,200)
  await request('tags/'+tag.id,'PATCH',{deleted:true})
  assert.equal((await assign(another,'Cafe\u0301')).status,200)
  assert.deepEqual((await library()).tags,[{id:tag.id,name:'Café',deleted:0}])
  const table=await(await request('tags/'+tag.id+'/table')).json()
  assert.equal(table.rows.find(row=>row.block===block).values[field],7)
  assert.deepEqual(table.rows.find(row=>row.block===another).values,{})
  assert.deepEqual(new Set((await library()).applications.map(item=>item.block)),new Set([block,another]))
})

test('named tool profiles bind server, workspace and credential without falling back to the ambient editor',async t=>{
  const {host,key,cookie,create,library}=await workspace(t)
  const second=await create('workspaces',{name:'Second'})
  const other=await serve({file:':memory:',assets:'.',editorKey:'another-editor',viewerKey:'reader'})
  t.after(()=>other.close())
  const entry=fileURLToPath(new URL('../../src/tools/cli.ts',import.meta.url))
  const env={...process.env,CHULANE_URL:host.url,CHULANE_ACCESS_KEY:key,CHULANE_PROFILE:'reader',
    CHULANE_PROFILE_READER_URL:other.url,CHULANE_PROFILE_READER_ACCESS_KEY:'reader',
    CHULANE_PROFILE_DESK_URL:host.url,CHULANE_PROFILE_DESK_ACCESS_KEY:key,CHULANE_PROFILE_DESK_WORKSPACE:String(second)}
  const cli=(...args:string[])=>promisify(execFile)(process.execPath,[entry,...args],{env})
  assert.deepEqual(JSON.parse((await cli('workspaces')).stdout),[])
  const login=await fetch(other.url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'another-editor'})})
  const created=await fetch(other.url+'/api/workspaces',{method:'POST',headers:{Cookie:login.headers.get('set-cookie')!.split(';')[0],'Content-Type':'application/json'},body:JSON.stringify({name:'Reader library'})})
  assert.equal(created.status,200)
  assert.deepEqual(JSON.parse((await cli('workspaces')).stdout).map(w=>w.name),['Reader library'])
  await assert.rejects(cli('propose_create','Forbidden'),/Editor access required/)
  await assert.rejects(cli('--profile','missing','workspaces'),/profile.*missing/i)
  const result=JSON.parse((await cli('--profile','desk','propose_create','Review this')).stdout)
  const [proposal]=(await library(second)).proposals
  assert.equal(proposal.id,result.pending)
  assert.equal(proposal.profile,'desk')
  assert.equal(JSON.parse((await cli('--profile','desk','proposal_status',String(result.pending))).stdout).status,'pending')
  await assert.rejects(cli('proposal_status',String(result.pending)),/Editor access required/)
  assert.deepEqual((await library()).proposals,[])
  const target=await create('pages?workspace='+second,{title:'Journal',content:'Original'})
  const rename=(id:string)=>cli('--profile','desk','propose_rename',id,'Updated','journal')
  const pendingBefore=(await library(second)).proposals
  for(const invalid of ['Journal','1e500','1e0','1.5','0','9007199254740993']){
    await assert.rejects(rename(invalid),/positive page ID/)
  }
  await assert.rejects(cli('--profile','desk','propose_edit',target+'e0','','','New paragraph'),/positive page ID/)
  for(const page of [String(target),1.5,{},0]){
    const response=await fetch(host.url+'/api/proposals?workspace='+second,{method:'POST',
      headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({page,title:'Updated journal'})})
    assert.equal(response.status,400)
  }
  assert.deepEqual((await library(second)).proposals,pendingBefore)
  const checkedRename=(base:string)=>cli('--profile','desk','propose_rename','--from',base,String(target),'Updated','journal')
  await assert.rejects(checkedRename('Former journal'),/Read the current title/)
  const renamed=JSON.parse((await checkedRename('Journal')).stdout)
  const queued=(await library(second)).proposals.find(item=>item.id===renamed.pending)
  assert.equal(queued?.page,target)
  assert.equal(queued?.title,'Updated journal')
  assert.equal((await library(second)).pages.find(item=>item.id===target)?.title,'Journal')
  const read=JSON.parse((await cli('--profile','desk','read',String(target))).stdout)
  const long=await create('pages?workspace='+second,{title:'Inventory',content:'🧭'.repeat(8000)+'Supply depot: bring water.'})
  // Full reads remain available; agents can also walk long pages with a bounded response.
  const log=await create('pages/import-markdown?workspace='+second,{title:'Station log',content:Array.from({length:43},(_,i)=>'Station '+i).join('\n\n')})
  const blockBatch=(id:number,offset:string)=>cli('--profile','desk','read',String(id),offset)
  const first=JSON.parse((await blockBatch(log,'0')).stdout)
  assert.equal(first.blocks.length,40)
  assert.equal(first.nextBlockOffset,40)
  assert.equal(first.text,undefined)
  const last=JSON.parse((await blockBatch(log,String(first.nextBlockOffset))).stdout)
  assert.deepEqual(last.blocks.map(item=>item.text),['Station 40','Station 41','Station 42'])
  assert.equal(last.nextBlockOffset,null)
  const preview=JSON.parse((await blockBatch(long,'0')).stdout)
  assert.equal(preview.blocks[0].nextOffset,12000)
  assert.equal(preview.blocks[0].text,'🧭'.repeat(6000))
  const thick=await create('pages/import-markdown?workspace='+second,{title:'Long sections',content:
    ['a'.repeat(10000),'b'.repeat(10000),'c'.repeat(5000)].join('\n\n')})
  const limited=JSON.parse((await blockBatch(thick,'0')).stdout)
  assert.equal(limited.nextBlockOffset,2)
  assert.equal(limited.blocks.length,2)
  const continued=JSON.parse((await blockBatch(thick,'2')).stdout)
  assert.equal(continued.blocks[0].text,'c'.repeat(5000))
  assert.equal(continued.nextBlockOffset,null)
  await assert.rejects(blockBatch(log,'-1'),/Use read ID/)
  await assert.rejects(blockBatch(log,'44'),/past the current end/)
  const batchUrl=host.url+'/api/source?blocks=1&id='+log+'&offset='
  assert.equal((await fetch(batchUrl+'0&workspace='+second)).status,401)
  assert.equal((await fetch(batchUrl+'0&workspace=1',{headers:{Cookie:cookie}})).status,404)
  assert.equal((await fetch(batchUrl+'1.5&workspace='+second,{headers:{Cookie:cookie}})).status,400)
  const [located]=JSON.parse((await cli('--profile','desk','search','Supply depot')).stdout)
  const passage=(...args:string[])=>cli('--profile','desk','read_text',String(long),...args)
  const atMatch=JSON.parse((await passage(String(located.readFrom.offset),located.readFrom.block)).stdout)
  assert.equal(atMatch.text,'Supply depot: bring water.')
  assert.equal(atMatch.nextOffset,null)
  assert.equal(atMatch.url,host.url+'/?workspace='+second+'&page='+long+'&block=%40import')
  assert.equal(JSON.parse((await passage('0',located.readFrom.block)).stdout).nextOffset,12000)
  await assert.rejects(passage('16050',located.readFrom.block),/past the current end/)
  await assert.rejects(passage('0','absent'),/Block unavailable/)
  await assert.rejects(passage('0',located.readFrom.block,'description'),/Task description unavailable/)
  await assert.rejects(passage('1',located.readFrom.block),/splits a Unicode character/)
  await assert.rejects(passage('-1'),/Use read_text/)
  const canvas=JSON.parse((await passage('0')).stdout)
  assert.equal(canvas.text,'')
  assert.equal(canvas.url,host.url+'/?workspace='+second+'&page='+long+'&view=canvas')
  assert.equal((await fetch(host.url+'/api/document-text?id='+long+'&offset=0&workspace='+second)).status,401)
  assert.equal((await fetch(host.url+'/api/document-text?id='+long+'&offset=0&workspace=1',{headers:{Cookie:cookie}})).status,404)
  const evidence='Counted three sandpipers'
  const uploaded=await fetch(host.url+'/api/pages/'+target+'/files?workspace='+second+'&name=survey.md',{method:'POST',headers:{Cookie:cookie},body:evidence})
  assert.equal(uploaded.status,200)
  const {id:file}=await uploaded.json()
  const [hit]=JSON.parse((await cli('--profile','desk','search','sandpipers')).stdout)
  assert.equal(hit.attachment.url,host.url+'/api/pages/'+target+'/files/'+file+'?workspace='+second)
  assert.equal(hit.url,host.url+'/?workspace='+second+'&page='+target)
  assert.equal((await fetch(hit.attachment.url)).status,401)
  assert.equal(await(await fetch(hit.attachment.url,{headers:{Cookie:cookie}})).text(),evidence)
  const rangeUrl=host.url+'/api/attachment-text?id='+target+'&file='+file
  assert.equal((await fetch(rangeUrl+'&workspace='+second)).status,401)
  assert.equal((await fetch(rangeUrl+'&workspace=1',{headers:{Cookie:cookie}})).status,404)
  assert.equal((await fetch(rangeUrl+'&workspace='+second+'&offset=-1',{headers:{Cookie:cookie}})).status,400)
  const readFile=(...args:string[])=>cli('--profile','desk','read_attachment',String(target),...args)
  assert.deepEqual(JSON.parse((await readFile()).stdout),{files:[{id:file,name:'survey.md'}],nextOffset:null})
  const inventory=JSON.parse((await readFile('all')).stdout)
  assert.deepEqual(inventory.files,[{id:file,name:'survey.md',readable:true,url:hit.attachment.url}])
  assert.deepEqual(JSON.parse((await readFile(String(file),String(hit.attachment.matchOffset))).stdout),{
    title:'Journal',name:'survey.md',text:'sandpipers',nextOffset:null,url:hit.attachment.url})
  await assert.rejects(cli('read_attachment',String(target),String(file)),/unavailable/i)
  const editorCookie=login.headers.get('set-cookie')!.split(';')[0]
  const readerPage=await(await fetch(other.url+'/api/pages',{method:'POST',headers:{Cookie:editorCookie,'Content-Type':'application/json'},body:JSON.stringify({title:'Public to members',content:'Member notes'})})).json()
  assert.equal(JSON.parse((await cli('read_text',String(readerPage.id),'7','@import')).stdout).text,'notes')
  const readerFile=await(await fetch(other.url+'/api/pages/'+readerPage.id+'/files?name=notes.txt',{method:'POST',headers:{Cookie:editorCookie},body:'Visible to readers'})).json()
  assert.equal(JSON.parse((await cli('read_attachment',String(readerPage.id),String(readerFile.id))).stdout).text,'Visible to readers')
  const paragraph=JSON.parse((await cli('--profile','desk','propose_edit',String(target),read.blocks[0].id,'Original','Revised')).stdout)
  assert.equal((await library(second)).proposals.find(p=>p.id===paragraph.pending)?.edit?.after,'Revised')
  assert.equal((await library(second)).pages.find(p=>p.id===target)?.plain,'Original')
})

test('external paragraph reviews preserve independent edits and reject stale or repeated approvals',async t=>{
  const {create,request,library}=await workspace(t)
  const page=await create('pages/import-markdown',{title:'Log',content:'First\n\nSecond'})
  const read=async()=>await(await request('source?id='+page+'&blocks=1')).json()
  const original=await read()
  assert.deepEqual(original.blocks?.map((b:{text:string})=>b.text),['First','Second'])
  const proposal=async(index:number,after:string)=>{
    const block=original.blocks[index]
    const response=await request('proposals','POST',{page,edit:{block:block.id,before:block.text,after}})
    assert.equal(response.status,200)
    return (await response.json()).pending
  }
  const approve=(id:number,reviewedTitle?:string)=>request('proposals/'+id+'/approve','POST',reviewedTitle?{reviewedTitle}:undefined)
  const a=await proposal(0,'Changed first'),b=await proposal(1,'Changed second'),stale=await proposal(0,'Old request')
  assert.equal((await read()).text,original.text)
  assert.equal((await approve(b)).status,200)
  await request('pages/'+page,'PATCH',{title:'Survey log'})
  assert.equal((await approve(a,'Log')).status,409)
  assert.equal((await read()).text,'First\nChanged second')
  assert.equal((await approve(a,'Survey log')).status,200)
  assert.equal((await(await request('proposals/'+a)).json()).titleAtApproval,'Survey log')
  assert.equal((await approve(a)).status,409);assert.equal((await approve(stale,'Survey log')).status,409)
  assert.equal((await read()).text,'Changed first\nChanged second')
  assert.equal((await library()).proposals[0].id,stale)
  assert.equal((await(await request('proposals/'+stale)).json()).status,'pending')
  assert.deepEqual((await(await request('proposals/history')).json()).items.map(d=>d.id),[a,b])
})

test('proposal history records only resolved decisions in decision order and stays within its workspace',async t=>{
  const {request,create}=await workspace(t)
  const page=await create('pages',{title:'Original'})
  const other=await create('workspaces',{name:'Other'})
  const propose=async(data:object)=>(await(await request('proposals','POST',data)).json()).pending
  const edit=await propose({page,edit:{block:'',before:'',after:'New paragraph'}})
  const rename=await propose({page,title:'Revised'})
  await propose({title:'Still pending'})
  await request('proposals/'+rename+'/dismiss','POST')
  const approval=await(await request('proposals/'+edit+'/approve','POST')).json()
  const response=await request('proposals/history')
  assert.equal(response.status,200)
  const history=await response.json()
  assert.deepEqual(history.items.map(row=>[row.id,row.kind,row.status]),[[edit,'append','approve'],[rename,'rename','dismiss']])
  assert.equal(history.items[0].block,approval.block)
  assert.equal(history.items[0].page,page)
  assert.ok(Date.parse(history.items[0].decidedAt)>0)
  assert.deepEqual((await(await request('proposals/history?before='+history.items[0].sequence)).json()).items.map(row=>row.id),[rename])
  assert.deepEqual((await(await request('proposals/history?workspace='+other)).json()).items,[])
  assert.equal((await request('proposals/'+edit+'?workspace='+other)).status,404)
  for(let i=0;i<20;i++){
    const id=await propose({title:'Extra '+i})
    await request('proposals/'+id+'/dismiss','POST')
  }
  const recent=await(await request('proposals/history')).json()
  assert.equal(recent.items.length,20)
  assert.deepEqual((await(await request('proposals/history?before='+recent.next)).json()).items,history.items)
  assert.equal((await request('proposals/history?before=invalid')).status,400)
  await request('pages/'+page,'PATCH',{deleted:true})
  const archived=await(await request('proposals/'+edit)).json()
  assert.equal(archived.status,'approved')
  assert.equal(archived.block,approval.block)
  assert.equal((await request('source?id='+page)).status,404)
})

test('trashing a page or project checkpoints its accepted live edits without committing other documents',async t=>{
  const {host,cookie,request,create,library}=await workspace(t)
  const project=await create('projects',{name:'Research'})
  const direct=await create('pages',{title:'Direct'}),nested=await create('pages',{title:'Nested',project})
  const untouched=await create('pages',{title:'Unrelated'})
  for(const id of [direct,nested,untouched]){
    const state=agentDocument({id,title:'Draft',plain:'',state:null},{page:id,block:'',before:'',after:'Draft '+id}).state!
    const response=await fetch(host.url+'/api/pages/'+id+'/state?live',{method:'PUT',headers:{Cookie:cookie,'If-Match':'0','X-Text-Bytes':'0'},body:Buffer.from(state)})
    assert.equal(response.status,200)
  }
  await request('pages/'+direct,'PATCH',{deleted:true})
  await request('projects/'+project,'PATCH',{deleted:true})
  const pages=(await library()).pages
  for(const id of [direct,nested])assert.equal(pages.find(page=>page.id===id)?.plain,'Draft '+id)
  assert.equal(pages.find(page=>page.id===untouched)?.plain,'')
})

test('only the local owner can archive, discover and restore a workspace with its accepted draft',async t=>{
  const {host,key,request,create,library}=await workspace(t,true)
  const page=await create('pages',{title:'Draft',content:'Initial'})
  const other=await create('workspaces',{name:'Other'})
  const archive=(archived:boolean)=>fetch(host.url+'/api/workspaces/archive?workspace=1',{method:'PUT',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({archived})})
  const snapshot=agentDocument({id:page,title:'Draft',plain:'Initial',state:null},{page,block:'',before:'',after:'Accepted draft'}).state!
  assert.equal((await fetch(host.url+'/api/pages/'+page+'/state?live',{method:'PUT',headers:{
    Authorization:'Bearer '+key,'If-Match':'0','X-Text-Bytes':'0'},body:Buffer.from(snapshot)})).status,200)
  assert.equal((await request('workspaces/archive','PUT',{archived:true})).status,403)
  const result=await archive(true)
  assert.equal(result.status,200)
  const catalog=await result.json()
  assert.deepEqual(catalog.workspaces.map((w:{id:number})=>w.id),[other])
  assert.deepEqual(catalog.archivedWorkspaces.map((w:{id:number})=>w.id),[1])
  assert.equal((await(await request('workspaces')).json()).archivedWorkspaces,undefined)
  for(const path of ['library','source?id='+page,'pages/'+page+'/state','agent','search?q=draft'])
    assert.equal((await request(path)).status,410)
  assert.equal((await request('pages','POST',{title:'Late edit'})).status,410)
  assert.equal((await library(other)).pages.length,0)
  assert.equal((await archive(false)).status,200)
  assert.equal((await library()).pages[0].plain,'Initial\nAccepted draft')
  const state=await request('pages/'+page+'/state')
  assert.equal(state.headers.get('X-Revision'),'1')
  assert.deepEqual(Buffer.from(await state.arrayBuffer()),Buffer.from(snapshot))
})

test('divergent page renames retain both alternatives and resolve against the reviewed title',async t=>{
  const {create,request,library}=await workspace(t)
  const id=await create('pages',{title:'Field notes'})
  const rename=(title:string,baseTitle:string)=>request('pages/'+id,'PATCH',{title,baseTitle})
  await rename('Station log','Field notes')
  await rename('Expedition log','Field notes')
  await rename('Expedition log','Field notes')
  const view=await library()
  assert.equal(view.pages[0].title,'Station log')
  assert.equal(view.titleConflicts?.length,1)
  const conflict=view.titleConflicts![0]
  assert.equal(conflict.title,'Expedition log')
  const resolve=(baseTitle:string)=>request('pages/'+id,'PATCH',{resolveTitle:conflict.id,baseTitle,title:conflict.title})
  assert.equal((await request('proposals','POST',{baseTitle:'Field notes',title:'Research notes'})).status,400)
  assert.equal((await request('proposals','POST',{page:id,baseTitle:null,title:'Research notes'})).status,400)
  assert.equal((await request('proposals','POST',{page:id+1,baseTitle:'Field notes',title:'Research notes'})).status,404)
  const stale=await request('proposals','POST',{page:id,baseTitle:'Field notes',title:'Research notes'})
  assert.equal(stale.status,409)
  assert.deepEqual((await library()).proposals,[])
  const {pending}=await(await request('proposals','POST',{page:id,baseTitle:'Station log',title:'Research notes'})).json()
  await rename('Station archive','Station log')
  assert.equal((await resolve('Station log')).status,409)
  assert.equal((await library()).titleConflicts?.length,1)
  assert.equal((await resolve('Station archive')).status,200)
  const resolved=await library()
  assert.equal(resolved.pages[0].title,'Expedition log')
  assert.deepEqual(resolved.titleConflicts,[])
  const approve='proposals/'+pending+'/approve'
  assert.equal((await request(approve,'POST',{reviewedTitle:'Station log'})).status,409)
  assert.deepEqual((await library()).titleConflicts,[])
  assert.equal((await(await request('proposals/'+pending)).json()).status,'pending')
  assert.equal((await request(approve,'POST',{reviewedTitle:'Expedition log'})).status,200)
  const approved=await library()
  assert.equal(approved.pages[0].title,'Expedition log')
  assert.deepEqual(approved.titleConflicts?.map(row=>row.title),['Research notes'])
  await rename('Later title','Expedition log')
  const status=await(await request('proposals/'+pending)).json()
  const history=await(await request('proposals/history')).json()
  for(const decision of [status,history.items.find(item=>item.id===pending)]){
    assert.equal(decision.title,'Research notes')
    assert.equal(decision.titleAtApproval,'Expedition log')
  }
})

test('retrying an acknowledged rename never reopens a resolved conflict',async t=>{
  const {create,request,library}=await workspace(t)
  const page=await create('pages',{title:'Original'})
  const patch=(data:object)=>request('pages/'+page,'PATCH',data)
  await patch({title:'Server',baseTitle:'Original'})
  const draft={operationId:'a'.repeat(32),title:'Client',baseTitle:'Original'}
  assert.equal((await patch(draft)).status,200)
  const [candidate]=(await library()).titleConflicts!
  const decision={operationId:'b'.repeat(32),title:'Server',baseTitle:'Server',resolveTitle:candidate.id}
  assert.equal((await patch(decision)).status,200)
  assert.equal((await patch(draft)).status,200)
  assert.deepEqual((await library()).titleConflicts,[])
  assert.equal((await patch(decision)).status,200)
  assert.equal((await patch({...draft,title:'Different operation'})).status,409)
  assert.equal((await patch({...draft,operationId:'invalid'})).status,400)
  assert.equal((await library()).pages[0].title,'Server')
})

test('writing search cites the stable matching block and keeps legacy text page-addressable',async t=>{
  const {create,request}=await workspace(t)
  const page=await create('pages/import-markdown',{title:'Field notes',content:'First observation\n\n'+ 'İ'.repeat(600)+' NORTH RIDGE station.'})
  const {blocks}=await(await request('source?id='+page+'&blocks=1')).json()
  const legacy=await create('pages',{title:'Older entry',content:'North ridge at ΟΣ'})
  const hits=await(await request('search?q=north%20ridge')).json()
  assert.equal(hits[0].block,blocks[1].id)
  assert.deepEqual(hits[0].readFrom,{block:blocks[1].id,offset:601})
  assert.match(hits[0].excerpt,/NORTH RIDGE station/)
  assert.ok(hits[0].excerpt.length<=320)
  assert.deepEqual(hits[1],{id:legacy,title:'Older entry',excerpt:'North ridge at ΟΣ'})
  for(const endpoint of ['search','library/search']){
    const greek=await(await request(endpoint+'?q='+encodeURIComponent('οσ'))).json()
    assert.deepEqual(greek,[hits[1]])
  }
})

test('agent search keeps ranked pages visible and cites multiple matching blocks on one page',async t=>{
  const {create,request}=await workspace(t,false,':memory:',{async run(turn){
    if(turn.history.at(-1)?.content==='Revisit your second cited block'){
      const {messages}=turn.tools.listLinkedMessages(null)
      assert.equal(messages.length,1)
      const [previous]=messages
      assert.equal(previous.role,'assistant')
      const [,second]=previous.links.filter(link=>link.block)
      assert.equal('excerpt' in second,false)
      assert.throws(()=>turn.tools.propose!(second.id,second.block!,'Unseen change'),/Read the complete target/)
      turn.publish(turn.tools.readText(second.id,second.block!,401).text)
      return
    }
    const hits=await turn.tools.search('meter')
    turn.publish('Found '+hits.length+' sources')
  }})
  const paragraphs=Array.from({length:35},(_,n)=>'Reading '+n+' from the meter')
  paragraphs[1]='🧭'.repeat(200)+' meter two'
  const page=await create('pages/import-markdown',{title:'Readings',content:paragraphs.join('\n\n')})
  const other=await create('pages',{title:'Meter map'})
  const {blocks}=await(await request('source?id='+page+'&blocks=1')).json()
  const hits=await(await request('search?q=meter')).json()
  assert.equal(hits.length,30)
  assert.deepEqual(hits.slice(0,2).map(hit=>hit.id),[page,other])
  assert.deepEqual(hits.filter(hit=>hit.id===page).map(hit=>hit.block),blocks.slice(0,29).map(block=>block.id))
  assert.deepEqual(hits[2].readFrom,{block:blocks[1].id,offset:401})
  assert.deepEqual((await(await request('library/search?q=meter')).json()).map(hit=>hit.id),[page,other])
  const chat=await create('agent/chats',{})
  await request('agent/chats/'+chat+'/turn','POST',{text:'Find meter readings',page:null,background:true})
  const answer=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(answer.text,'Found 30 sources')
  assert.deepEqual(answer.sources.filter(hit=>hit.id===page).map(hit=>hit.block),blocks.slice(0,29).map(block=>block.id))
  await request('agent/chats/'+chat+'/turn','POST',{text:'Revisit your second cited block',page:null,background:true,allowEdits:true})
  const followup=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(followup.text,'meter two')
})

test('agent search cites title and text hits without granting edit tools a page read',async t=>{
  const {create,request}=await workspace(t,false,':memory:',{async run(turn){
    const hits=await turn.tools.search('station')
    for(const hit of hits){
      assert.throws(()=>turn.tools.propose!(hit.id,'','New paragraph'),/Read the complete target/)
      assert.throws(()=>turn.tools.proposeRename!(hit.id,'New title'),/Read the current page/)
    }
    turn.publish('Found '+hits.length+' pages')
  }})
  const title=await create('pages',{title:'Station map'})
  const body=await create('pages',{title:'Notebook',content:'Weather station'})
  const chat=await create('agent/chats',{})
  await request('agent/chats/'+chat+'/turn','POST',{text:'Find station pages',page:null,background:true,allowEdits:true})
  const answer=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(answer.text,'Found 2 pages')
  assert.deepEqual(answer.sources,[{id:title,title:'Station map'},{id:body,title:'Notebook',excerpt:'Weather station'}])
})

test('task descriptions cite their block in live and checkpointed search without changing its editable text',async t=>{
  const {create,request,host,cookie}=await workspace(t,false,':memory:',{async run(turn){
    const [source]=await turn.tools.search('North shore')
    turn.publish(source.excerpt!)
  }})
  const id=await create('pages',{title:'Field log'})
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('tasks',doc))
  t.after(()=>model.destroy())
  const block=model.blocks.insertBlock({type:'todo-item',content:'Check gauge',props:{description:'Meet at North shore'}})
  let revision=0
  async function save(query:string){
    const response=await fetch(host.url+'/api/pages/'+id+'/state'+query,{method:'PUT',headers:{Cookie:cookie,'If-Match':String(revision),'Content-Type':'application/octet-stream'},body:Buffer.from(Y.encodeStateAsUpdate(doc))})
    assert.equal(response.status,200)
    revision=(await response.json()).rev
  }
  for(const query of ['?live','']){
    await save(query)
    for(const route of ['search','library/search']){
      const result=await(await request(route+'?q=north')).json()
      assert.deepEqual(result,[{id,title:'Field log',block:block.id,excerpt:'Meet at North shore'}])
    }
  }
  assert.equal((await(await request('document-text?id='+id+'&block='+block.id+'&offset=0')).json()).text,'Check gauge')
  const chat=await create('agent/chats',{})
  await request('agent/chats/'+chat+'/turn','POST',{text:'Find the meeting point',page:null,background:true})
  const answer=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(answer.text,'Meet at North shore')
  assert.deepEqual(answer.sources,[{id,title:'Field log',block:block.id,excerpt:'Meet at North shore'}])
  model.blocks.updateBlock(block.id,{props:{description:'South entrance'}})
  await save('')
  assert.deepEqual(await(await request('search?q=north')).json(),[])
  assert.equal((await(await request('search?q=south')).json())[0]?.block,block.id)
})

test('attached tasks and document previews can continue long descriptions independently of writing',async t=>{
  const description='x'.repeat(2394)+'🧭'+'y'.repeat(10000)+'final meeting point'
  const {create,request,host,cookie}=await workspace(t,false,':memory:',{async run(turn){
    if(!turn.referencedBlocks.length){
      const message=turn.tools.listLinkedMessages(null).messages.find(item=>item.role==='assistant')!
      const citation=message.links.find(link=>link.readFrom?.field==='description')!
      const range=citation.readFrom!
      assert.throws(()=>turn.tools.readText(citation.id,range.block,range.offset,message.message),/citation unavailable/)
      const passage=turn.tools.readText(citation.id,range.block,range.offset,message.message,range.field)
      assert.throws(()=>turn.tools.propose!(citation.id,citation.block!,'Changed'),/Read the complete/)
      turn.publish(passage.text)
      return
    }
    const [attached]=turn.referencedBlocks
    const page=turn.current!.blocks[0]
    for(const preview of [attached,page]){
      assert.equal(preview.text,'Gauge')
      assert.ok(preview.description)
      assert.equal(preview.descriptionNextOffset,preview.description.length)
      assert.equal(preview.description,description.slice(0,preview.descriptionNextOffset))
      assert.doesNotMatch(preview.description,/[\uD800-\uDBFF]$/)
      const rest=turn.tools.readText(attached.page,attached.block,preview.descriptionNextOffset,null,'description')
      assert.equal(preview.description+rest.text,description)
    }
    const [source]=await turn.tools.search('meeting point')
    assert.equal(source.readFrom?.field,'description')
    turn.publish(turn.tools.readText(source.id,source.block!,source.readFrom!.offset,null,'description').text)
  }})
  const id=await create('pages',{title:'Measurements'})
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('measurements',doc))
  t.after(()=>model.destroy())
  const block=model.blocks.insertBlock({type:'todo-item',content:'Gauge',props:{description}})
  const saved=await fetch(host.url+'/api/pages/'+id+'/state',{method:'PUT',headers:{Cookie:cookie,'If-Match':'0','Content-Type':'application/octet-stream'},body:Buffer.from(Y.encodeStateAsUpdate(doc))})
  assert.equal(saved.status,200)
  const passage='document-text?id='+id+'&block='+block.id+'&offset=0'
  assert.equal((await(await request(passage+'&field=description')).json()).text,description.slice(0,12000))
  assert.equal((await(await request(passage)).json()).text,'Gauge')
  const chat=await create('agent/chats',{})
  await request('agent/chats/'+chat+'/turn','POST',{text:'Where do we meet?',page:id,blockLinks:[{id,block:block.id}],background:true})
  const answer=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(answer.text,'meeting point')
  model.blocks.updateBlock(block.id,{props:{description:'Revised '+description}})
  const updated=await fetch(host.url+'/api/pages/'+id+'/state',{method:'PUT',headers:{Cookie:cookie,'If-Match':'1','Content-Type':'application/octet-stream'},body:Buffer.from(Y.encodeStateAsUpdate(doc))})
  assert.equal(updated.status,200)
  await request('agent/chats/'+chat+'/turn','POST',{text:'Revisit that passage',page:null,background:true,allowEdits:true})
  assert.equal((await(await request('agent/chats/'+chat)).json()).messages.at(-1).text,'meeting point')
})

test('an upgraded library rediscovers canvas titles and task descriptions in previously indexed pages',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-canvas-index-')),file=join(dir,'library.sqlite')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const {create,host,key}=await workspace(t,false,file)
  const id=await create('pages',{title:'Map'})
  await host.close()
  const old=new DatabaseSync(file),doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('map',doc))
  try{
    model.elements.insertElement({type:'group',frame:{x:0,y:0,width:100,height:80},zIndex:1,props:{title:'Tidal basin'}})
    model.blocks.insertBlock({id:'task',type:'todo-item',content:'Inspect gate',props:{description:'Check the sluice'}})
    old.exec(`DROP TRIGGER invalidate_canvas_labels;
      ALTER TABLE pages DROP COLUMN taskDescriptions;
      CREATE TRIGGER invalidate_canvas_text AFTER UPDATE OF state ON pages
      WHEN OLD.canvasText IS NOT NULL BEGIN UPDATE pages SET canvasText=NULL WHERE id=NEW.id; END`)
    old.prepare('UPDATE pages SET state=? WHERE id=?').run(Y.encodeStateAsUpdate(doc),id)
    old.prepare('UPDATE pages SET canvasText=? WHERE id=?').run('',id)
  }finally{old.close();await model.destroy()}
  const reopened=await serve({file,assets:'.',editorKey:key})
  try{
    const login=await fetch(reopened.url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})})
    const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]!}
    const results=await(await fetch(reopened.url+'/api/search?q=tidal',{headers})).json()
    assert.deepEqual(results,[{id,title:'Map',surface:'canvas',excerpt:'Tidal basin'}])
    const tasks=await(await fetch(reopened.url+'/api/search?q=sluice',{headers})).json()
    assert.deepEqual(tasks,[{id,title:'Map',block:'task',excerpt:'Check the sluice'}])
  }finally{await reopened.close()}
})

test('canvas labels are discoverable by page and a changed label replaces the old search result',async t=>{
  const {create,request,host,cookie}=await workspace(t,false,':memory:',{async run(turn){
    if(!turn.current){
      const [hit]=await turn.tools.search('inlet')
      turn.publish(hit.excerpt!)
      return
    }
    const page=turn.current
    if(page.canvasTextTruncated){
      assert.equal(page.canvasText,'A'.repeat(3999))
      assert.equal(page.canvasNextOffset,3999)
      assert.ok(turn.tools.readText(page.id,null,page.canvasNextOffset!).text.startsWith('🌊'))
      const [hit]=await turn.tools.search('Eastern inlet')
      assert.deepEqual(hit?.readFrom,{block:null,offset:12002})
      const match=turn.tools.readText(page.id,hit!.readFrom!.block,hit!.readFrom!.offset)
      assert.equal(match.text,'Eastern inlet')
      const first=turn.tools.readText(page.id,null,0)
      assert.equal(first.nextOffset,11999)
      const last=turn.tools.readText(page.id,null,first.nextOffset!)
      assert.equal(last.nextOffset,null)
      turn.publish(last.text)
      return
    }
    const read=turn.tools.read(page.id,0)
    turn.publish([page.canvasText,read.canvasText].join(' / '))
  }})
  const page=await create('pages',{title:'Survey map'})
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('map',doc))
  t.after(()=>model.destroy())
  const label=model.elements.insertElement({type:'text',frame:{x:0,y:0,width:100,height:40},zIndex:1,props:{text:'Northern inlet'}})
  let rev=0
  async function checkpoint(){
    const response=await fetch(host.url+'/api/pages/'+page+'/state',{method:'PUT',headers:{Cookie:cookie,'If-Match':String(rev),'X-Text-Bytes':'0'},body:Buffer.from(Y.encodeStateAsUpdate(doc))})
    assert.equal(response.status,200)
    rev=(await response.json()).rev
  }
  await checkpoint()
  const hits=async(q:string)=>await(await request('search?q='+q)).json()
  assert.deepEqual(await hits('inlet'),[{id:page,title:'Survey map',surface:'canvas',excerpt:'Northern inlet'}])
  const source=await(await request('source?id='+page+'&blocks=1')).json()
  assert.equal(source.canvasText,'Northern inlet')
  assert.deepEqual(source.blocks,[])
  const chat=await create('agent/chats',{})
  assert.equal((await request('agent/chats/'+chat+'/turn','POST',{text:'Read the map',page,background:true,allowEdits:false})).status,202)
  const transcript=await(await request('agent/chats/'+chat)).json()
  assert.equal(transcript.messages.at(-1).text,'Northern inlet / Northern inlet')
  const searchTurn=await request('agent/chats/'+chat+'/turn','POST',{text:'Find the inlet',page:null,background:true,allowEdits:false})
  assert.equal(searchTurn.status,202)
  const answer=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(answer.text,'Northern inlet')
  assert.ok(answer.sources.some(source=>source.id===page&&source.excerpt==='Northern inlet'))
  model.elements.updateElement(label.id,{props:{text:'A'.repeat(3999)+'🌊'+'A'.repeat(7998)+'🧭 Eastern inlet'}})
  await checkpoint()
  await request('agent/chats/'+chat+'/turn','POST',{text:'Read the end of the canvas',page,background:true,allowEdits:false})
  const tail=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(tail.text,'🧭 Eastern inlet')
  assert.ok(tail.sources.some(source=>source.id===page&&source.excerpt?.includes('Eastern inlet')))
  model.elements.updateElement(label.id,{props:{text:'Southern bay'}})
  await checkpoint()
  assert.deepEqual(await hits('inlet'),[])
  assert.deepEqual(await hits('bay'),[{id:page,title:'Survey map',surface:'canvas',excerpt:'Southern bay'}])
  const foreign=await create('workspaces',{name:'Another team'})
  assert.deepEqual(await(await request('search?q=bay&workspace='+foreign)).json(),[])
  await request('pages/'+page,'PATCH',{deleted:true})
  assert.deepEqual(await hits('bay'),[])
})

test('attachment search returns a cited excerpt only from readable text in the active workspace',async t=>{
  const {host,cookie,create,request}=await workspace(t)
  const page=await create('pages',{title:'Station notebook'})
  const foreign=await create('workspaces',{name:'Other team'})
  const hidden=await create('pages?workspace='+foreign,{title:'Private notes'})
  const upload=async(scope:number,id:number,name:string,bytes:Buffer)=>{
    const response=await fetch(host.url+'/api/pages/'+id+'/files?workspace='+scope+'&name='+name,{method:'POST',headers:{Cookie:cookie},body:bytes})
    assert.equal(response.status,200)
    return (await response.json()).id
  }
  const file=await upload(1,page,'Observations.MD',Buffer.from('x'.repeat(900)+'\nАРКТИКА: north ridge.'))
  const packet=await upload(1,page,'packet.bin',Buffer.from('binary secret'))
  await upload(1,page,'corrupt.txt',Buffer.from([255,...Buffer.from('binary secret')]))
  await upload(1,page,'controls.txt',Buffer.from('binary secret\0'))
  await upload(foreign,hidden,'private.txt',Buffer.from('foreign secret'))
  const search=async(query:string)=>await(await request('search?q='+encodeURIComponent(query))).json()
  const [hit]=await search('арктика')
  assert.equal(hit.id,page);assert.equal(hit.attachment.id,file)
  assert.equal(hit.attachment.name,'Observations.MD')
  assert.match(hit.attachment.excerpt,/АРКТИКА: north ridge/)
  assert.ok(hit.attachment.excerpt.length<=320)
  assert.deepEqual(await search('binary secret'),[])
  assert.deepEqual(await search('foreign secret'),[])
  for(const endpoint of ['search','library/search']){
    const [byName]=await(await request(endpoint+'?q=PACKET.BIN')).json()
    assert.deepEqual(byName?.attachment,{id:packet,name:'packet.bin',matchedFilename:true,excerpt:''})
    assert.deepEqual(await(await request(endpoint+'?q=private.txt')).json(),[])
  }
  assert.equal((await request('attachment-text?id='+page+'&file='+packet)).status,404)
  await request('pages/'+page,'PATCH',{deleted:true})
  assert.deepEqual(await search('арктика'),[])
  assert.deepEqual(await search('packet.bin'),[])
})

test('the agent can browse and read text attachments in chunks with workspace-scoped file citations',async t=>{
  const {create,host,cookie,request}=await workspace(t,false,':memory:',{async run(turn){
    const read=turn.tools.readAttachment
    if(turn.history.at(-1)?.content==='Reopen the last cited route'){
      const previous=turn.history.at(-2)!.content
      const citations=JSON.parse(previous.split('Cited attachments: ')[1]!)
      const route=citations.find((source:{name:string})=>source.name==='route.md')
      const result=read(route.id,route.file,route.matchOffset)
      assert.ok('text' in result)
      turn.publish(result.text)
      return
    }
    if(!turn.current){
      assert.throws(()=>read(page,'all',0),/unavailable/i)
      assert.throws(()=>read(page,null,0),/unavailable/i)
      assert.throws(()=>read(page,file,0),/unavailable/i)
      turn.publish('Unavailable')
      return
    }
    assert.throws(()=>read(hidden,secret,0),/unavailable/i)
    assert.throws(()=>read(page,secret,0),/unavailable/i)
    assert.throws(()=>read(page,binary,0),/unavailable/i)
    const inventory=read(page,'all',0)
    assert.ok('files' in inventory)
    assert.equal(inventory.files.length,40)
    assert.deepEqual(inventory.files.slice(0,2),[
      {id:file,name:'route.md',readable:true},{id:binary,name:'map.bin',readable:false}
    ])
    assert.equal(inventory.nextOffset,40)
    const remainder=read(page,'all',inventory.nextOffset!)
    assert.ok('files' in remainder)
    assert.deepEqual(remainder.files.map(item=>item.name),['log-38.txt','log-39.txt'])
    assert.equal(remainder.nextOffset,null)
    assert.throws(()=>read(hidden,'all',0),/unavailable/i)
    const listing=read(page,null,0)
    assert.ok('files' in listing)
    assert.equal(listing.files.length,40)
    assert.deepEqual(listing.files[0],{id:file,name:'route.md'})
    assert.equal(listing.nextOffset,40)
    assert.deepEqual(read(page,null,listing.nextOffset!),{files:[{id:lastFile,name:'log-39.txt'}],nextOffset:null})
    const first=read(page,file,0)
    assert.ok('text' in first)
    assert.equal(first.text,'🧭'.repeat(12000))
    assert.equal(first.nextOffset,12000)
    const [match,second]=await turn.tools.search('north ridge')
    assert.equal(second?.id,page)
    assert.equal(second?.attachment?.id,lastFile)
    assert.equal(second?.attachment?.matchOffset,2)
    assert.equal(match.attachment?.matchOffset,12000+'Return via the '.length)
    const located=read(match.id,match.attachment!.id,match.attachment!.matchOffset!)
    assert.ok('text' in located)
    assert.equal(located.text,'north ridge.')
    const tail=read(page,file,first.nextOffset!)
    assert.ok('text' in tail)
    assert.equal(tail.nextOffset,null)
    turn.publish(tail.text)
  }})
  const page=await create('pages',{title:'Survey'})
  const foreign=await create('workspaces',{name:'Private'})
  const hidden=await create('pages?workspace='+foreign,{title:'Other survey'})
  async function upload(ws:number,id:number,name:string,text:string){
    const response=await fetch(host.url+'/api/pages/'+id+'/files?workspace='+ws+'&name='+name,{method:'POST',headers:{Cookie:cookie},body:text})
    assert.equal(response.status,200)
    return (await response.json()).id
  }
  const file=await upload(1,page,'route.md','🧭'.repeat(12000)+'Return via the north ridge.')
  const binary=await upload(1,page,'map.bin','opaque')
  const secret=await upload(foreign,hidden,'private.txt','Another team')
  let lastFile=0
  for(let n=0;n<40;n++)lastFile=await upload(1,page,'log-'+n+'.txt',n===39?'🧭 North ridge marker':'Field observation')
  const otherPage=await create('pages',{title:'Field observation register'})
  const query='?q=Field%20observation'
  const sources=await(await request('search'+query)).json()
  assert.equal(sources.length,30)
  assert.deepEqual(sources.slice(0,2).map(source=>source.id),[page,otherPage])
  assert.equal(new Set(sources.filter(source=>source.attachment).map(source=>source.attachment.id)).size,29)
  const pages=await(await request('library/search'+query)).json()
  assert.deepEqual(pages.map(source=>source.id),[page,otherPage])
  const chat=await create('agent/chats',{})
  await request('agent/chats/'+chat+'/turn','POST',{text:'Read the attached route',page,background:true,allowEdits:false})
  const answer=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(answer.status,'complete')
  assert.equal(answer.text,'Return via the north ridge.')
  assert.deepEqual(answer.sources.filter(source=>source.attachment),[{id:page,title:'Survey',attachment:{id:file,name:'route.md',excerpt:answer.text,readOffset:12000,matchOffset:12000+'Return via the '.length}},
    {id:page,title:'Survey',attachment:{id:lastFile,name:'log-39.txt',excerpt:'🧭 North ridge marker',matchOffset:2}}])
  await request('agent/chats/'+chat+'/turn','POST',{text:'Reopen the last cited route',page:null,background:true,allowEdits:false})
  const followup=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(followup.text,'north ridge.')
  await request('pages/'+page,'PATCH',{deleted:true})
  await request('agent/chats/'+chat+'/turn','POST',{text:'Recheck the file',page:null,background:true,allowEdits:false})
  const revoked=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(revoked.text,'Unavailable')
  assert.deepEqual(revoked.sources,[])
})

test('local workspace deletion requires archive and a tombstone, preserves neighbors and retires the ID',async t=>{
  const {host,key,request,create,library}=await workspace(t,true)
  const page=await create('pages',{title:'Survives restoration'})
  const other=await create('workspaces',{name:'Kept workspace'})
  await create('pages?workspace='+other,{title:'Neighbor'})
  const project=await create('projects',{name:'Folder'})
  await create('projects',{name:'Nested',parent:project})
  await request('pages/'+page,'PATCH',{project})
  await create('agent/chats',{})
  const tag=await create('tags',{name:'Review'})
  const field=await create('tags/'+tag+'/fields',{name:'Count',kind:'number'})
  assert.equal((await request('pages/'+page+'/tags','PUT',{tag,block:'',active:true})).status,200)
  assert.equal((await request('tags/'+tag+'/fields/'+field+'/value','PUT',{page,block:'',value:7})).status,200)
  assert.equal((await request('pages/'+page+'/files?name=notes.bin','POST',{bytes:'fixture'})).status,200)
  const {pending}=await(await request('proposals','POST',{title:'Suggested'})).json()
  assert.equal((await request('proposals/'+pending+'/dismiss','POST')).status,200)
  const owner=(action:string,data:object,ws=1)=>fetch(host.url+'/api/workspaces/'+action+'?workspace='+ws,{
    method:'PUT',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(data)})
  const transition=(action:string)=>owner('deletion',{action})
  assert.equal((await transition('mark')).status,409)
  assert.equal((await owner('archive',{archived:true})).status,200)
  assert.equal((await transition('purge')).status,409)
  assert.equal((await request('workspaces/deletion','PUT',{action:'mark'})).status,403)
  const marked=await(await transition('mark')).json()
  assert.deepEqual(marked.deletedWorkspaces.map(item=>item.id),[1])
  assert.deepEqual(marked.archivedWorkspaces,[])
  assert.equal((await owner('archive',{archived:false})).status,409)
  assert.equal((await request('pages/'+page+'/state')).status,410)
  assert.equal((await transition('restore')).status,200)
  assert.equal((await library()).pages[0].id,page)
  await owner('archive',{archived:true});await transition('mark')
  assert.equal((await transition('purge')).status,200)
  assert.equal((await transition('restore')).status,404)
  assert.equal((await library(other)).pages[0].title,'Neighbor')
  // Delete the highest allocated ID too. An old workspace URL must never resolve to new content.
  await owner('archive',{archived:true},other)
  await owner('deletion',{action:'mark'},other)
  assert.equal((await owner('deletion',{action:'purge'},other)).status,200)
  assert.ok(await create('workspaces',{name:'New library'})>other)
})

test('an attachment upload retries by operation while separate uploads keep their own files',async t=>{
  const {host,cookie,create}=await workspace(t)
  const page=await create('pages',{title:'Survey'})
  const other=await create('pages',{title:'Other'})
  const operation='ab'.repeat(16),auth={Cookie:cookie}
  const path=(id:number)=>host.url+'/api/pages/'+id+'/files'
  const upload=(id:number,name:string,body:string,op=operation)=>fetch(path(id)+'?name='+name,{
    method:'PUT',headers:{...auth,'Idempotency-Key':op},body})
  const first=await upload(page,'notes.bin','contents')
  assert.equal(first.status,200)
  const file=await first.json()
  assert.deepEqual(await (await upload(page,'notes.bin','contents')).json(),file)
  assert.equal((await upload(page,'notes.bin','different')).status,409)
  assert.equal((await upload(page,'other.bin','contents')).status,409)
  assert.equal((await upload(other,'notes.bin','contents')).status,409)
  assert.equal((await upload(page,'notes.bin','contents','')).status,400)
  assert.notEqual((await (await upload(page,'notes.bin','contents','cd'.repeat(16))).json()).id,file.id)
  assert.equal((await (await fetch(path(page),{headers:auth})).json()).length,2)
})

test('permanent deletion preserves pages inside a trashed project until its restoration',async t=>{
  const {create,request,library,host,key}=await workspace(t,true)
  const project=await create('projects',{name:'Fieldwork'})
  const page=await create('pages',{title:'Notes',project})
  assert.equal((await request('projects/'+project,'PATCH',{deleted:true})).status,200)
  const response=await fetch(host.url+'/api/pages/'+page,{method:'DELETE',headers:{Authorization:'Bearer '+key}})
  assert.equal(response.status,409)
  assert.equal((await request('projects/'+project,'PATCH',{deleted:false})).status,200)
  assert.equal((await library()).pages.find(item=>item.id===page)?.deleted,0)
})

test('permanent page deletion requires ownership and Trash, and retires the journal date and page ID',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-retired-page-')),file=join(dir,'workspace.sqlite')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const {create,request,library,host,key}=await workspace(t,true,file)
  const day='2031-01-05',id=await create('pages',{title:day,day}),path='pages/'+id
  const upload=await fetch(host.url+'/api/'+path+'/files?name=field.txt',{method:'POST',headers:{Authorization:'Bearer '+key},body:'Sample data'})
  assert.equal(upload.status,200)
  const remove=(revision?:number)=>fetch(host.url+'/api/'+path,{method:'DELETE',headers:{Authorization:'Bearer '+key,
    ...(revision===undefined?{}:{'X-Chulane-Trash-Revision':String(revision)})}})
  assert.equal((await remove()).status,409)
  const proposal=await(await request('proposals','POST',{page:id,title:'Revised title'})).json()
  assert.equal((await request(path,'PATCH',{deleted:true})).status,200)
  assert.equal((await request(path,'DELETE')).status,403)
  const reviewed=(await library()).pages[0].trashRevision
  assert.equal((await request(path,'PATCH',{deleted:false})).status,200)
  assert.equal((await request(path,'PATCH',{deleted:true})).status,200)
  assert.equal((await remove(reviewed)).status,409)
  assert.equal((await library()).pages[0].deleted,1)
  assert.equal((await remove((await library()).pages[0].trashRevision)).status,200)
  assert.equal((await request(path,'PATCH',{deleted:false})).status,410)
  assert.equal((await request(path+'/state')).status,410)
  assert.equal((await request('pages','POST',{title:day,day})).status,410)
  assert.equal((await request('proposals/'+proposal.pending+'/approve','POST',{})).status,409)
  const state=await library()
  assert.deepEqual(state.pages,[])
  assert.deepEqual(state.removedPages,[{id,day}])
  const audit=new DatabaseSync(file,{readOnly:true})
  try{
    assert.equal(audit.prepare('SELECT count(*) AS count FROM files WHERE page=?').get(id)?.count,0)
    assert.deepEqual({...audit.prepare('SELECT title,plain,state FROM pages WHERE id=?').get(id)},{title:'',plain:'',state:null})
  }finally{audit.close()}
  assert.notEqual(await create('pages',{title:'New page'}),id)
})

test('page ID search ranks the original ahead of Markdown mentions and numeric prefixes',async t=>{
  const {request,create}=await workspace(t)
  const original=await create('pages',{title:'Source notes'})
  const label='#'+original
  assert.equal((await request('pages/'+original+'/files?name=survey.txt','POST')).status,200)
  const exported=await(await request('pages/'+original+'/markdown')).json()
  assert.ok(exported.markdown.includes('`'+label+'`'))
  const mention=await create('pages/import-markdown',{title:label,content:exported.markdown})
  assert.equal((await request('pages/'+original,'PATCH',{baseTitle:'Source notes',title:'Renamed survey'})).status,200)
  for(let i=0;i<10;i++)await create('pages',{title:'Other notes'})
  for(const endpoint of ['search','library/search']){
    const hits=await(await request(endpoint+'?q='+encodeURIComponent(label))).json()
    assert.deepEqual(hits.map(page=>page.id),[original,mention])
  }
})

test('an exact page title precedes incidental matches before the source limit',async t=>{
  const {create,request}=await workspace(t)
  const mentions:number[]=[]
  for(let n=0;n<31;n++)mentions.push(await create('pages',{title:'Reading '+n,content:'See Δ [2] for details.'}))
  const exact=await create('pages',{title:'δ [2]'})
  for(const endpoint of ['search','library/search']){
    const response=await request(endpoint+'?q='+encodeURIComponent('  Δ [2]\t'))
    const ids=(await response.json()).map(hit=>hit.id)
    assert.deepEqual(ids,[exact,...mentions].slice(0,endpoint==='search'?30:undefined))
    const distinct=await request(endpoint+'?q='+encodeURIComponent('Δ  [2]'))
    assert.deepEqual(await distinct.json(),[])
  }
})

test('journal search retains the workspace calendar date after a title change',async t=>{
  const {create,request}=await workspace(t)
  const day='2029-03-18'
  const mention=await create('pages',{title:'Schedule',content:'Visit on '+day})
  const id=await create('pages',{title:day,day})
  assert.equal((await request('pages/'+id,'PATCH',{title:'Field visit',baseTitle:day})).status,200)
  for(const endpoint of ['search','library/search']){
    const hits=await(await request(endpoint+'?q='+day)).json()
    assert.deepEqual(hits.map(hit=>hit.id),[id,mention])
    assert.equal(hits[0].day,day)
    assert.equal(hits[0].title,'Field visit')
    const month=await(await request(endpoint+'?q=2029-03')).json()
    assert.ok(month.some(hit=>hit.id===id&&hit.day===day))
  }
  await request('pages/'+id,'PATCH',{deleted:true})
  assert.deepEqual((await(await request('search?q='+day)).json()).map(hit=>hit.id),[mention])
})

test('journal listing follows existing calendar days across gaps and concurrent inserts',async t=>{
  const {create,request,host,key}=await workspace(t)
  const other=await create('workspaces',{name:'Another station'})
  await create('pages?workspace='+other,{day:'2044-12-12',title:'Foreign day'})
  await create('pages',{title:'2044-12-12'})
  const ids:number[]=[]
  for(let i=0;i<41;i++){
    const day=new Date(Date.UTC(2030,0,1+i*2)).toISOString().slice(0,10)
    ids.unshift(await create('pages',{day,title:'Watch '+i}))
  }
  const gone=await create('pages',{day:'2040-12-25',title:'Cancelled watch'})
  await request('pages/'+gone,'PATCH',{deleted:true})
  const batch=await request('journal/entries?workspace=1')
  assert.equal(batch.status,200)
  const {entries,nextBefore}=await batch.json()
  assert.deepEqual(entries.map(row=>row.id),ids.slice(0,40))
  assert.equal(entries[0].title,'Watch 40')
  assert.equal(nextBefore,entries.at(-1).day)
  await create('pages',{day:'2044-12-15',title:'New watch'})
  const cli=fileURLToPath(new URL('../../src/tools/cli.ts',import.meta.url))
  const result=await promisify(execFile)(process.execPath,[cli,'list_journal',nextBefore],{env:{...process.env,CHULANE_URL:host.url,CHULANE_ACCESS_KEY:key,CHULANE_WORKSPACE:'1'}})
  assert.deepEqual(JSON.parse(result.stdout),{entries:[{id:ids[40],day:'2030-01-01',title:'Watch 0',url:host.url+'/?workspace=1&page='+ids[40]}],nextBefore:null})
  assert.equal((await request('journal/entries?before=2030-02-30')).status,400)
})

test('calendar reads find only the active journal entry, without creating missing days',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2032-02-28T12:30:00Z')})
  const day='2032-02-29'
  const {create,request,library,host,key}=await workspace(t,false,':memory:',{async run(turn){
    const entry=turn.tools.readJournalDay('today')
    assert.throws(()=>turn.tools.read(entry!.id,99),/past the current end/)
    turn.publish(JSON.stringify({id:entry?.id,writing:entry?.blocks[0].text,missing:turn.tools.readJournalDay('2032-03-01')}))
  }})
  const ws=await create('workspaces',{name:'Station',timeZone:'Pacific/Kiritimati'}),scope='?workspace='+ws
  await create('pages',{title:'Other workspace',day})
  await create('pages'+scope,{title:day,content:'Schedule'})
  const id=await create('pages'+scope,{title:'Night watch',day,content:'Ice on the lake'})
  const chat=await create('agent/chats'+scope,{})
  await request('agent/chats/'+chat+'/turn'+scope,'POST',{text:'Read the leap day entry',page:null,allowEdits:false,background:true})
  const answer=(await(await request('agent/chats/'+chat+scope)).json()).messages.at(-1)
  assert.deepEqual(JSON.parse(answer.text),{id,writing:'Ice on the lake',missing:null})
  assert.ok(answer.sources.some(source=>source.id===id))
  const cli=fileURLToPath(new URL('../../src/tools/cli.ts',import.meta.url))
  const readDay=async(date=day)=>JSON.parse((await promisify(execFile)(process.execPath,[cli,'read_journal',date],{
    env:{...process.env,CHULANE_URL:host.url,CHULANE_ACCESS_KEY:key,CHULANE_WORKSPACE:String(ws)}
  })).stdout)
  assert.equal((await readDay()).url,host.url+'/'+scope+'&page='+id)
  assert.equal((await readDay('today')).id,id)
  for(const invalid of ['day=2032-02-31','day='+day+'&id='+id])
    assert.equal((await request('source'+scope+'&'+invalid)).status,400)
  await request('pages/'+id+scope,'PATCH',{deleted:true})
  assert.equal(await readDay(),null)
  assert.equal(await readDay('today'),null)
  assert.equal((await library(ws)).pages.length,2)
})

test('agent turns resolve the workspace calendar and keep journal dates on renamed and linked sources',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2032-02-29T12:30:00Z')})
  const {create,request}=await workspace(t,false,':memory:',{async run(turn){
    turn.publish(JSON.stringify({calendar:turn.workspaceCalendar,current:turn.current?.day,
      attached:turn.referencedDocuments[0]?.day,linked:turn.referencedBlocks[0]?.day,
      read:turn.tools.read(turn.referencedDocuments[0].id,0).day}))
  }})
  const ws=await create('workspaces',{name:'Pacific log',timeZone:'Pacific/Kiritimati'})
  const scope='?workspace='+ws
  const page=await create('pages'+scope,{title:'Station notes',day:'2032-02-28'})
  const earlier=await create('pages'+scope,{title:'Fieldwork',day:'2032-02-27',content:'First measurement'})
  const {blocks}=await(await request('source'+scope+'&id='+earlier+'&blocks=1')).json()
  const chat=await create('agent/chats'+scope,{})
  await request('agent/chats/'+chat+'/turn'+scope,'POST',{text:'Which dates are these?',page,references:[earlier],
    blockLinks:[{id:earlier,block:blocks[0].id}],allowEdits:false,background:true})
  const answer=(await(await request('agent/chats/'+chat+scope)).json()).messages.at(-1)
  assert.deepEqual(JSON.parse(answer.text),{calendar:{timeZone:'Pacific/Kiritimati',today:'2032-03-01'},
    current:'2032-02-28',attached:'2032-02-27',linked:'2032-02-27',read:'2032-02-27'})
  for(const query of ['', '&blocks=1','&blocks=1&offset=0'])
    assert.equal((await(await request('source'+scope+'&id='+earlier+query)).json()).day,'2032-02-27')
})

test('search and source reads follow published writing and canvas edits before a checkpoint',async t=>{
  const {host,cookie,create,request,library}=await workspace(t,false,':memory:',{async run(turn){
    const [hit]=await turn.tools.search('  station\n')
    turn.publish(turn.tools.read(hit!.id,hit!.block!).blocks[0]!.text)
  }})
  const page=await create('pages',{title:'Log',content:'Previous measurement'})
  const foreign=await create('workspaces',{name:'Other'})
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('field',doc))
  t.after(()=>model.destroy())
  const block=model.blocks.insertBlock({type:'paragraph',content:'Unpublished station reading'})
  model.elements.insertElement({type:'text',frame:{x:0,y:0,width:150,height:80},zIndex:0,props:{text:'Southern campsite station'}})
  const live=await fetch(host.url+'/api/pages/'+page+'/state?live',{method:'PUT',headers:{Cookie:cookie,'If-Match':'0','X-Text-Bytes':'0'},body:Buffer.from(Y.encodeStateAsUpdate(doc))})
  assert.equal(live.status,200)
  for(const path of ['search','library/search']){
    const search=async(q:string,ws=1)=>await(await request(path+'?workspace='+ws+'&q='+encodeURIComponent(q))).json()
    assert.deepEqual(await search('previous measurement'),[])
    assert.deepEqual(await search('unpublished station'),[{id:page,title:'Log',block:block.id,excerpt:'Unpublished station reading'}])
    assert.deepEqual(await search('campsite'),[{id:page,title:'Log',surface:'canvas',excerpt:'Southern campsite station'}])
    const mixed=await search('station')
    assert.deepEqual(mixed.map(hit=>hit.excerpt),path==='search'?['Unpublished station reading','Southern campsite station']:['Unpublished station reading'])
    assert.deepEqual(await search('station',foreign),[])
  }
  const passage='document-text?id='+page+'&offset=12&block='+encodeURIComponent(block.id)
  assert.equal((await(await request(passage)).json()).text,'station reading')
  assert.equal((await(await request('document-text?id='+page+'&offset=9')).json()).text,'campsite station')
  assert.equal((await(await request('source?id='+page)).json()).text,'Unpublished station reading')
  assert.equal((await library()).pages[0]?.plain,'Previous measurement')
  const chat=await create('agent/chats',{})
  await request('agent/chats/'+chat+'/turn','POST',{text:'Find the station reading',page:null,background:true,allowEdits:false})
  const answer=(await(await request('agent/chats/'+chat)).json()).messages.at(-1)
  assert.equal(answer.text,'Unpublished station reading')
  assert.ok(answer.sources.some(source=>source.id===page&&!source.block&&source.excerpt==='Southern campsite station'))
})

test('retrying a project rename after resolution preserves the reviewed choice',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-project-retry-')),file=join(dir,'workspace.sqlite')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const {create,request,library,host,key}=await workspace(t,false,file)
  const id=await create('projects',{name:'Original'})
  const patch=(data:object)=>request('projects/'+id,'PATCH',data)
  await patch({name:'Upstream',baseName:'Original'})
  const draft={name:'Downstream',baseName:'Original',operationId:'c'.repeat(32)}
  assert.equal((await patch(draft)).status,200)
  const [conflict]=(await library()).projectNameConflicts!
  const decision={name:'Upstream',baseName:'Upstream',resolveName:conflict.id,operationId:'d'.repeat(32)}
  assert.equal((await patch(decision)).status,200)
  assert.equal((await patch(draft)).status,200)
  assert.deepEqual((await library()).projectNameConflicts,[])
  assert.equal((await patch(decision)).status,200)
  assert.equal((await patch({...draft,name:'Changed'})).status,409)
  assert.equal((await patch({...draft,operationId:'bad'})).status,400)
  assert.equal((await library()).projects[0].name,'Upstream')
  await host.close()
  const reopened=await serve({file,assets:'.',editorKey:key})
  try{
    const login=await fetch(reopened.url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})})
    assert.equal(login.status,200)
    const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]!,'Content-Type':'application/json'}
    const replay=await fetch(reopened.url+'/api/projects/'+id,{method:'PATCH',headers,body:JSON.stringify(draft)})
    assert.equal(replay.status,200)
    const restored=await(await fetch(reopened.url+'/api/library',{headers})).json()
    assert.deepEqual(restored.projectNameConflicts,[])
    assert.equal(restored.projects[0].name,'Upstream')
  }finally{await reopened.close()}
})

test('project renames preserve the subtree and agent reviews reject concurrent renames',async t=>{
  let project:number
  const {create,request,library}=await workspace(t,false,':memory:',{async run(turn){
    assert.throws(()=>turn.tools.proposeProjectRename!(project,'Reviewed name'),/Browse/)
    turn.tools.browse(null,0)
    turn.tools.proposeProjectRename!(project,'Reviewed name')
    turn.publish('Review the project name')
  }})
  project=await create('projects',{name:'Field notes'})
  const child=await create('projects',{parent:project,name:'Samples'})
  const page=await create('pages',{project:child,title:'Notebook'})
  const chat=await create('agent/chats',{}),path='agent/chats/'+chat
  const rename=(name:string,baseName:string)=>request('projects/'+project,'PATCH',{name,baseName})
  async function suggest(){
    await request(path+'/turn','POST',{text:'Rename the field notes project',page:null,background:true})
    const view=await(await request(path)).json()
    assert.equal(view.messages.at(-1).status,'complete')
    return view.projects.at(-1)
  }
  const first=await suggest()
  assert.equal(first.beforeName,'Field notes')
  assert.equal((await rename('  ','Field notes')).status,400)
  assert.equal((await request('projects/'+project,'PATCH',{deleted:true,name:'Ambiguous',baseName:'Field notes'})).status,400)
  assert.equal((await rename('Expedition','Field notes')).status,200)
  assert.equal((await rename('Late change','Field notes')).status,200)
  assert.equal((await rename('Late change','Field notes')).status,200)
  const conflicts=(await library()).projectNameConflicts!
  assert.equal(conflicts.length,1)
  assert.equal(conflicts[0]!.name,'Late change')
  const resolve=(name:string,baseName:string)=>request('projects/'+project,'PATCH',{name,baseName,resolveName:conflicts[0]!.id})
  assert.equal((await resolve('Late change','Field notes')).status,409)
  assert.equal((await resolve('Unreviewed','Expedition')).status,400)
  assert.equal((await request(path+'/projects/'+first.id+'/apply','POST',{})).status,409)
  await request(path+'/projects/'+first.id+'/dismiss','POST',{})
  const fresh=await suggest()
  assert.equal(fresh.beforeName,'Expedition')
  assert.equal((await request(path+'/projects/'+fresh.id+'/apply','POST',{})).status,200)
  assert.equal((await request(path+'/projects/'+fresh.id+'/apply','POST',{})).status,409)
  const lib=await library()
  assert.equal(lib.projects.find(p=>p.id===project)?.name,'Reviewed name')
  assert.equal((await resolve('Late change','Expedition')).status,409)
  assert.equal((await resolve('Late change','Reviewed name')).status,200)
  assert.deepEqual((await library()).projectNameConflicts,[])
  assert.equal((await library()).projects.find(p=>p.id===project)?.name,'Late change')
  assert.equal(lib.projects.find(p=>p.id===child)?.parent,project)
  assert.equal(lib.pages.find(p=>p.id===page)?.project,child)
  const other=await create('workspaces',{name:'Other'})
  assert.ok(!(await request('projects/'+project+'?workspace='+other,'PATCH',{name:'Hidden',baseName:'Reviewed name'})).ok)
  await request('projects/'+project,'PATCH',{deleted:true})
  assert.ok(!(await rename('Trashed','Reviewed name')).ok)
})

test('page and project approvals use the destination path seen by the reviewer',async t=>{
  let folder:number
  const {create,request,library}=await workspace(t,false,':memory:',{async run(turn){
    turn.tools.proposePage!('Internal brief',folder,'Internal text')
    turn.tools.proposeProject!('Observations',folder)
  }})
  const parent=await create('projects',{name:'Research'})
  folder=await create('projects',{name:'Samples',parent})
  const chat=await create('agent/chats',{}),path='agent/chats/'+chat
  await request(path+'/turn','POST',{text:'Prepare a folder and a brief',page:null,background:true})
  const {pages,projects}=await(await request(path)).json()
  const {pending}=await(await request('proposals','POST',{title:'External brief',project:folder,markdown:'External text'})).json()
  const external='proposals/'+pending+'/approve'
  const approve=[external,path+'/pages/'+pages[0].id+'/apply',path+'/projects/'+projects[0].id+'/apply']
  await request('projects/'+parent,'PATCH',{name:'Fieldwork',baseName:'Research'})
  for(const endpoint of approve){
    assert.equal((await request(endpoint,'POST')).status,409)
    assert.equal((await request(endpoint,'POST',{reviewedPath:'Research / Samples'})).status,409)
  }
  assert.equal((await library()).pages.length,0)
  const shown='Fieldwork / Samples'
  for(const endpoint of approve)assert.equal((await request(endpoint,'POST',{reviewedPath:shown})).status,200)
  assert.deepEqual((await library()).pages.map(page=>page.project),[folder,folder])
  const completed=await(await request(path)).json()
  assert.equal(completed.pages[0].parentName,'Research / Samples')
  assert.equal(completed.pages[0].reviewedPath,shown)
  assert.equal(completed.projects[0].reviewedPath,shown)
  assert.equal((await(await request('proposals/history')).json()).items[0].draft.reviewedPath,shown)
})

test('Markdown reference labels are local to a Rivto block in live drafts, checkpoints and restored catalogs',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-reference-blocks-')),file=join(dir,'workspace.sqlite')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const {create,request,library,host,cookie}=await workspace(t,false,file)
  const notes=await create('pages',{title:'Guide'}),east=await create('pages',{title:'East'}),west=await create('pages',{title:'West'})
  const path='pages/'+notes+'/state',doc=new Y.Doc()
  Y.applyUpdate(doc,new Uint8Array(await(await request(path)).arrayBuffer()))
  const model=new DocumentModelImpl(new YjsDoc(String(notes),doc))
  t.after(()=>model.destroy())
  const blockText=(id:number)=>'🧭 [map]\n\n[map]: ?workspace=1&page='+id
  model.blocks.setBlockText(model.blocks.getBlocks()[0]!.id,blockText(east))
  const last=model.blocks.insertBlock({type:'paragraph',content:blockText(west)})
  const save=async(rev:number,live=false)=>{
    const result=await fetch(host.url+'/api/'+path+(live?'?live':''),{method:'PUT',headers:{
      Cookie:cookie,'Content-Type':'application/octet-stream','If-Match':String(rev)
    },body:Buffer.from(Y.encodeStateAsUpdate(doc))})
    assert.equal(result.status,200)
    return result.json()
  }
  const outgoing='pages/'+notes+'/links?direction=outgoing'
  const destinations=async(response:Response)=>(await response.json()).entries.map((entry:{id:number})=>entry.id)
  const draft=await save(0,true)
  assert.deepEqual(await destinations(await request(outgoing)),[east,west])
  const saved=await save(draft.rev)
  assert.deepEqual(saved.referenceBlockLengths,[blockText(east).length])
  assert.deepEqual((await library()).pages.find(p=>p.id===notes)?.referenceBlockLengths,saved.referenceBlockLengths)
  assert.deepEqual(await destinations(await request(outgoing)),[east,west])
  model.blocks.setBlockText(last.id,'[map]: ?workspace=1&page='+west)
  await save(saved.rev)
  assert.deepEqual(await destinations(await request(outgoing)),[east])
  assert.deepEqual(await destinations(await request('pages/'+west+'/links?direction=incoming')),[])
  await host.close()
  const restored=await workspace(t,false,file)
  assert.deepEqual(await destinations(await restored.request(outgoing)),[east])
  assert.deepEqual((await restored.library()).pages.find(p=>p.id===notes)?.referenceBlockLengths,saved.referenceBlockLengths)
})

test('a checkpoint binds named pages and block tags while Markdown links, images, escapes and code remain literal',async t=>{
  const {create,request,library,host,cookie}=await workspace(t)
  const id=await create('pages',{title:'Notebook'})
  const path='pages/'+id+'/state'
  const initial=new Uint8Array(await(await request(path)).arrayBuffer())
  const doc=new Y.Doc()
  Y.applyUpdate(doc,initial)
  const model=new DocumentModelImpl(new YjsDoc(String(id),doc))
  t.after(()=>model.destroy())
  const block=model.blocks.getBlocks()[0]!.id
  const text=['[Missing] and [[Missing]] #field #field','[External #label](https://example.org/a_(b)#part)',
    '![Image #alt](image.png) []() [Empty destination]()',String.raw`\[escaped] \#escaped`,'&#91;entity] &#35;entity',
    '`[Code] #code`','[Defined][ref]','','[ref]: /target','','~~~js','[Fence] #fence','~~~'].join('\n')
  model.blocks.setBlockText(block,text)
  const save=(rev:number,live=false)=>fetch(host.url+'/api/'+path+(live?'?live':''),{method:'PUT',
    headers:{Cookie:cookie,'Content-Type':'application/octet-stream','If-Match':String(rev)},body:Buffer.from(Y.encodeStateAsUpdate(doc))})
  const live=await save(0,true)
  assert.equal(live.status,200)
  assert.deepEqual((await library()).pages.map(p=>p.title),['Notebook'])
  const {rev}=await live.json()
  assert.equal((await save(rev)).status,200)
  let saved=await library()
  assert.deepEqual(saved.pages.map(p=>p.title),['Notebook','Missing'])
  assert.deepEqual(saved.tags.map(tag=>tag.name),['field'])
  assert.deepEqual(saved.applications,[{tag:saved.tags[0]!.id,page:id,block}])
  const target=saved.pages[1]!.id
  assert.deepEqual(saved.namedReferences,[{name:'Missing',source:id,target}])
  assert.equal((await request('pages/'+target,'PATCH',{title:'Renamed'})).status,200)
  assert.equal((await save(1)).status,200)
  assert.deepEqual((await library()).namedReferences,saved.namedReferences)
  assert.equal((await request('pages/'+id+'/tags','PUT',{block:'',name:'manual',active:true})).status,200)
  model.blocks.setBlockText(block,'[Missing](https://example.org) `#field`')
  assert.equal((await save(2)).status,200)
  saved=await library()
  assert.deepEqual(saved.namedReferences,[])
  assert.deepEqual(saved.applications,[{tag:saved.tags.find(tag=>tag.name==='manual')!.id,page:id,block:''}])
  assert.deepEqual(saved.pages.map(p=>p.title),['Notebook','Renamed'])
})

test('canvas turns enforce ask, review, append-only and full access on the host',async t=>{
  const observed:string[]=[]
  const {request,create}=await workspace(t,false,':memory:',{async run(turn){
    const id=turn.current!.id
    assert.equal(turn.current!.surface,'canvas')
    const canvas=turn.tools.readCanvas!(id,0)
    if(!turn.tools.editCanvas){observed.push('ask');return}
    const existing=canvas.elements.find(item=>item.type==='sticker')
    const value={type:'sticker' as const,x:40,y:80,width:180,height:120,text:existing?'Revised':'First'}
    const result=turn.tools.editCanvas({id,element:existing?.id??null,value})
    observed.push('pending' in result?'pending':'applied')
    const original=turn.current!.blocks.find(block=>block.id==='@import')
    if(original){
      const decision=turn.tools.propose!(id,original.id,'Rewritten paragraph')
      assert.equal('applied' in decision,turn.mode==='full')
    }
    turn.tools.propose!(id,'','New paragraph')
    turn.tools.proposeRename!(id,'Turn '+turn.history.at(-1)!.content)
  }})
  const id=await create('pages',{title:'Board',content:'Original paragraph'}),chat=await create('agent/chats',{}),path='agent/chats/'+chat
  async function send(mode:string){
    assert.equal((await request(path+'/turn','POST',{text:mode,page:id,surface:'canvas',mode,background:true})).status,202)
    const history=await(await request(path)).json()
    assert.equal(history.messages.at(-1).status,'complete')
    assert.equal(history.messages.at(-1).mode,mode)
    return history
  }
  await send('ask')
  const reviewed=await send('suggest')
  assert.equal(reviewed.edits.find(e=>e.kind==='canvas').status,'pending')
  const added=await send('append')
  assert.equal(added.edits.at(-2).status,'applied')
  assert.equal(added.edits.at(-1).status,'pending')
  const changed=await send('append')
  const proposal=changed.edits.filter(e=>e.kind==='canvas').at(-1)
  assert.equal(proposal.status,'pending')
  await send('full')
  assert.deepEqual(observed,['ask','pending','applied','pending','applied'])
  const history=await(await request(path)).json()
  assert.ok(history.edits.slice(-3).every(e=>e.status==='applied'))
  assert.equal((await request(path+'/edits/'+proposal.id+'/apply','POST',{reviewedTitle:'Turn full'})).status,409)
  const bytes=new Uint8Array(await(await request('pages/'+id+'/state')).arrayBuffer()),doc=new Y.Doc()
  Y.applyUpdate(doc,bytes)
  const model=new DocumentModelImpl(new YjsDoc(String(id),doc))
  try{
    assert.equal(model.blocks.getBlockNode('@import')?.content,'Rewritten paragraph')
    assert.deepEqual(model.elements.getElementNodes().map(item=>item.props.text),['Revised'])
    assert.equal(model.blocks.getBlocks().filter(b=>b.content==='New paragraph').length,3)
  }finally{model.destroy()}
})

test('append creates an editable canvas card, and full access moves or removes its frame without losing writing',async t=>{
  let card='',writing='',project=0
  const {request,create,library}=await workspace(t,false,':memory:',{async run(turn){
    const id=turn.current!.id,step=turn.history.at(-1)!.content
    const value={type:'block' as const,x:0,y:0,width:160,height:80,text:'Card paragraph'}
    if(step==='add'){
      const result=turn.tools.editCanvas!({id,element:null,value})
      assert.ok('applied' in result);card=result.element!
      assert.ok('pending' in turn.tools.proposeProject!('Reviewed folder',null))
    }else{
      const current=turn.current!.canvas!.elements.find(item=>item.id===card)!
      writing=String(current.startBlockId)
      assert.equal(current.endBlockId,writing)
      if(step==='move'){
        assert.ok('applied' in turn.tools.editCanvas!({id,element:card,value:{...value,text:'',x:400}}))
        const folder=turn.tools.proposeProject!('Immediate folder',null)
        assert.ok('applied' in folder);project=folder.project!
        assert.ok('applied' in turn.tools.proposePage!('Notes',project,'New draft'))
        turn.tools.browse(null,0)
        assert.ok('applied' in turn.tools.proposeProjectRename!(project,'Fieldwork'))
      }else{
        assert.equal(current.x,400)
        assert.ok('applied' in turn.tools.editCanvas!({id,element:card,value:null}))
      }
    }
  }})
  const id=await create('pages',{title:'Board'}),chat=await create('agent/chats',{}),path='agent/chats/'+chat
  for(const [text,mode] of [['add','append'],['move','full'],['remove','full']]){
    assert.equal((await request(path+'/turn','POST',{text,mode,surface:'canvas',page:id,background:true})).status,202)
    assert.equal((await(await request(path)).json()).messages.at(-1).status,'complete')
  }
  const state=(await request('pages/'+id+'/state')),doc=new Y.Doc()
  Y.applyUpdate(doc,new Uint8Array(await state.arrayBuffer()))
  const model=new DocumentModelImpl(new YjsDoc(String(id),doc))
  try{
    assert.equal(model.elements.getElementNode(card),undefined)
    assert.equal(model.blocks.getBlockNode(writing)?.content,'Card paragraph')
    const catalog=await library()
    assert.deepEqual(catalog.projects.map(p=>p.name),['Fieldwork'])
    assert.equal(catalog.pages.find(p=>p.title==='Notes')?.project,project)
  }finally{model.destroy()}
})

for(const format of ['wrapped checklist','table cell'] as const){
  test('Markdown '+format+' keeps page references and literal hashtags after export and reimport',async t=>{
    const {create,request,library}=await workspace(t)
    const prose=String.raw`[Survey map] and [[Tide book]] #field \#scratch &#35;private [Web #label](https://example.org)`+' `#sample`'
    const content=format==='table cell'?'| Observation |\n| --- |\n| '+prose+' |':'- [ ] Survey\r\n  '+prose+'\r\n  - Next visit'
    const original=await create('pages/import-markdown',{title:'Observations',content})
    const check=async(page:number)=>{
      const catalog=await library()
      assert.deepEqual(catalog.namedReferences?.filter(ref=>ref.source===page).map(ref=>ref.name).sort(),['Survey map','Tide book'])
      assert.deepEqual(catalog.tags.map(tag=>tag.name),['field'])
      const assignments=catalog.applications.filter(item=>item.page===page)
      assert.equal(assignments.length,1)
      assert.ok(assignments[0]!.block)
    }
    await check(original)
    const exported=await(await request('pages/'+original+'/markdown')).json()
    const copy=await create('pages/import-markdown',{title:'Restored observations',content:exported.markdown})
    await check(copy)
    assert.equal((await(await request('pages/'+copy+'/markdown')).json()).markdown,exported.markdown)
  })
}
