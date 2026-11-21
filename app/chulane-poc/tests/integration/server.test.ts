/** Exercises real HTTP, role enforcement, revision conflicts, attachments and a cold backup restore. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {mkdtemp,copyFile,rm} from 'node:fs/promises'
import * as Y from 'yjs'
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
  const create=()=>post('pages',{title:'Today',day:'2026-11-20'}).then(r=>r.json())
  const {id}=await create();assert.equal((await create()).id,id)
  const p='pages/'+id, d=new Y.Doc();d.getText('test').insert(0,'hello')
  const bytes=Buffer.concat([Buffer.from('hello'),Y.encodeStateAsUpdate(d)])
  const put=()=>call(p+'/state','PUT',bytes,{'If-Match':'0','X-Text-Bytes':'5'})
  assert.equal((await put()).status,200);assert.equal((await put()).status,409)
  assert.equal((await call(p+'/files?name=blob.bin','POST',Buffer.from([0,255]))).status,200)
  const pending=await (await post('proposals',{title:'After restart'})).json()
  await login('test-read');assert.equal((await put()).status,403);assert.equal((await create()).error,'Editor access required')
  await host.close();host=null;await copyFile(join(dir,'first.sqlite'),join(dir,'restored.sqlite'))
  host=await open('restored.sqlite');await login('test-read')
  const restored=new Y.Doc();Y.applyUpdate(restored,new Uint8Array(await (await call(p+'/state')).arrayBuffer()))
  assert.equal(restored.getText('test').toString(),'hello')
  const [attachment]=await (await call(p+'/files')).json();assert.equal(attachment.name,'blob.bin')
  assert.deepEqual(Buffer.from(await(await call(p+'/files/'+attachment.id)).arrayBuffer()),Buffer.from([0,255]))
  assert.equal((await(await call('library')).json()).pages[0].plain,'hello')
  assert.equal((await post('proposals/'+pending.pending+'/approve',{})).status,403)
  await login('test-edit')
  assert.equal((await post('proposals/'+pending.pending+'/approve',{})).status,200)
  assert.equal((await post('proposals/'+pending.pending+'/approve',{})).status,409)
  assert.equal((await(await call('library')).json()).pages.filter(p=>p.title==='After restart').length,1)
})
