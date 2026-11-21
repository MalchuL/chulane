/** Exercise workspace operations through the same HTTP and CLI boundaries used by the two hosts. */
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import * as Y from 'yjs'
import test, {type TestContext} from 'node:test'
import {serve} from '../../src/server/service.ts'
import type {Library} from '../../src/shared/library.ts'

/** Give each test its own SQLite database, ephemeral listener and authenticated editor. */
async function workspace(t:TestContext) {
  const key='test-editor'
  const host=await serve({file:':memory:',assets:'.',editorKey:key})
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
  return {host,key,cookie,request,create,library}
}

test('moving a page retains its identity and contents and rejects a project from another workspace',async t=>{
  const {create,request,library}=await workspace(t)
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

test('CLI search returns links only for active matching pages in its configured workspace',async t=>{
  const {create,request,host,key}=await workspace(t)
  const other=await create('workspaces',{name:'Research'})
  await create('pages',{title:'Observation elsewhere'})
  const path='pages?workspace='+other
  const id=await create(path,{title:'Visible',content:'An observation'})
  const deleted=await create(path,{title:'Deleted observation'})
  await request('pages/'+deleted,'PATCH',{deleted:true})
  const entry=fileURLToPath(new URL('../../src/tools/cli.ts',import.meta.url))
  const {stdout}=await promisify(execFile)(process.execPath,[entry,'search','observation'],{
    env:{...process.env,CHULANE_URL:host.url,CHULANE_ACCESS_KEY:key,CHULANE_WORKSPACE:String(other)}
  })
  assert.deepEqual(JSON.parse(stdout),[{id,title:'Visible',url:host.url+'/?workspace='+other+'&page='+id}])
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
