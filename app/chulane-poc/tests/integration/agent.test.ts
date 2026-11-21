/** Check restart recovery and Rivto fidelity independently of a provider or renderer. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DatabaseSync} from 'node:sqlite'
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import {agentDocument} from '../../src/server/agent-document.ts'
import {serve} from '../../src/server/service.ts'

test('a block edit preserves nested siblings, plugin data and canvas placement',()=>{
  const doc=new Y.Doc(), model=new DocumentModelImpl(new YjsDoc('test',doc))
  model.blocks.insertBlock({id:'root',type:'paragraph',content:'Another edit',children:[{id:'child',type:'paragraph',content:'Before',pluginData:{note:{flag:true}}}]})
  model.elements.insertElement({id:'card',type:'block',frame:{x:1,y:2,width:100,height:80},zIndex:2,props:{startBlockId:'root',endBlockId:'root'}})
  const original=model.getSnapshot()
  const page={id:1,title:'A page',plain:'',state:Y.encodeStateAsUpdate(doc)}
  const edit={page:1,block:'child',before:'Before',after:'After'}
  const result=agentDocument(page,edit)
  Y.applyUpdate(doc,result.state!)
  const updated=model.getSnapshot()
  assert.deepEqual(updated.elements,original.elements)
  assert.equal(updated.blocks[0].content,'Another edit')
  assert.deepEqual(updated.blocks[0].children[0],{...original.blocks[0].children[0],content:'After'})
  assert.throws(()=>agentDocument({...page,state:result.state!},edit),/target block changed/)
  model.destroy()
})

test('cold restart keeps shared chat, interrupts an unfinished turn and enforces approval once',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-chat-restart-')),file=join(dir,'workspace.sqlite')
  const open=()=>serve({file,assets:dir,editorKey:'editor',viewerKey:'viewer',provider:{get:()=>({key:'',model:'test'})}})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  let cookie=''
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:data&&JSON.stringify(data)})
  async function login(key:string){cookie=(await call('login',{key})).headers.get('set-cookie')!.split(';')[0]}
  await login('editor')
  const {id:chat}=await(await call('agent/chats',{})).json()
  const {id:page}=await(await call('pages',{title:'Notebook',content:'Draft'})).json()
  const {id:other}=await(await call('workspaces',{name:'Other'})).json()
  assert.equal((await call('agent/chats/'+chat+'/turn',{page,text:'Hello'})).status,503)
  await host.close()
  // Fixture captures the database immediately before an unclean shutdown.
  const db=new DatabaseSync(file)
  const m=db.prepare("INSERT INTO chat_messages(chat,role,text,status) VALUES(?,'assistant','Partial answer','running')").run(chat)
  const e=db.prepare("INSERT INTO chat_edits(message,page,title,block,before,after) VALUES(?,?,'Notebook','@import','Draft','Edited')").run(m.lastInsertRowid,page)
  db.close();host=await open();await login('viewer')
  const path='agent/chats/'+chat
  const review=path+'/edits/'+e.lastInsertRowid+'/apply'
  const saved=await(await call(path)).json()
  assert.equal(saved.messages[0].status,'interrupted');assert.equal(saved.edits[0].status,'pending')
  assert.equal((await call(path+'?workspace='+other)).status,404)
  assert.equal((await call(review,{})).status,403)
  await login('editor')
  assert.equal((await call(review+'?workspace='+other,{})).status,404)
  assert.equal((await call(review,{})).status,200)
  assert.equal((await call(review,{})).status,409)
  assert.equal((await(await call('source?id='+page)).json()).text,'Edited')
})

test('a Codex API model uses the Responses endpoint with the workspace tools',async t=>{
  const {createServer}=await import('node:http')
  const {runAgent}=await import('../../src/server/mastra.ts')
  let requestPath='',requestBody:any
  const provider=createServer(async(req,res)=>{
    requestPath=req.url||''
    let body=''
    for await(const part of req)body+=part
    requestBody=JSON.parse(body)
    res.writeHead(200,{'Content-Type':'text/event-stream'})
    const response={id:'resp_test',object:'response',model:'test-codex',created_at:1,status:'completed',output:[],usage:{input_tokens:10,output_tokens:2,total_tokens:12}}
    const item={id:'msg_test',type:'message',role:'assistant',content:[]}
    for(const event of [
      {type:'response.created',response:{...response,status:'in_progress'}},
      {type:'response.output_item.added',output_index:0,item},
      {type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:'Hello',logprobs:[]},
      {type:'response.output_item.done',output_index:0,item:{...item,content:[{type:'output_text',text:'Hello',annotations:[]}]}},
      {type:'response.completed',response},
    ])res.write('data: '+JSON.stringify(event)+'\n\n')
    res.end()
  })
  await new Promise<void>(done=>provider.listen(0,'127.0.0.1',done))
  t.after(()=>new Promise<void>(done=>provider.close(()=>done())))
  let text=''
  const unused=()=>{throw Error('Unexpected tool call')}
  await runAgent({key:'local-fixture',model:'test-codex',url:'http://127.0.0.1:'+(provider.address() as {port:number}).port+'/v1'},[{role:'user',content:'hello'}],null,
    {search:unused,read:unused,propose:unused},AbortSignal.timeout(10000),delta=>{text+=delta})
  assert.equal(requestPath,'/v1/responses');assert.equal(requestBody.model,'test-codex')
  assert.ok(requestBody.tools.some(tool=>tool.name==='proposeEdit'));assert.equal(text,'Hello')
})

test('block links reject missing blocks and foreign pages before a turn is stored',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-block-links-'))
  const host=await serve({file:join(dir,'workspace.sqlite'),assets:dir,editorKey:'editor',viewerKey:'viewer',provider:{get:()=>({key:'fixture',model:'fixture'})}})
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  let cookie=''
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:data&&JSON.stringify(data)})
  cookie=(await call('login',{key:'editor'})).headers.get('set-cookie')!.split(';')[0]
  const {id:chat}=await(await call('agent/chats',{})).json()
  const {id:other}=await(await call('workspaces',{name:'Other'})).json()
  const {id:foreign}=await(await call('pages?workspace='+other,{title:'Foreign',content:'Private'})).json()
  const {id:local}=await(await call('pages',{title:'Local',content:'Note'})).json()
  const path='agent/chats/'+chat
  const turn=(id:number,block:string)=>call(path+'/turn',{page:null,text:'Explain these blocks',blockLinks:[{id,block}]})
  assert.equal((await turn(foreign,'@import')).status,404)
  assert.equal((await turn(local,'missing')).status,409)
  assert.deepEqual((await(await call(path)).json()).messages,[])
})
