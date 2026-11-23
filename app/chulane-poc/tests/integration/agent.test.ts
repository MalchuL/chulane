/** Check restart recovery and Rivto fidelity independently of a provider or renderer. */
import test from 'node:test'
import {EventEmitter,once} from 'node:events'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DatabaseSync} from 'node:sqlite'
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import {agentDocument,initialEditorState} from '../../src/server/agent-document.ts'
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

test('a legacy review cannot replace a different paragraph with identical text',()=>{
  const page={id:1,title:'Survey',plain:'Repeated text',state:null}
  const initial=initialEditorState(page)
  const doc=new Y.Doc()
  Y.applyUpdate(doc,initial)
  const model=new DocumentModelImpl(new YjsDoc('1',doc))
  try{
    const original=model.blocks.getBlocks()[0]
    model.blocks.insertBlock({type:'paragraph',content:page.plain})
    model.blocks.removeBlock(original.id)
    assert.throws(()=>agentDocument({...page,state:Y.encodeStateAsUpdate(doc)},
      {page:1,block:'@import',before:page.plain,after:'Correction'}),/target block changed/)
  }finally{model.destroy()}
})

test('cold restart keeps shared chat, interrupts an unfinished turn and enforces approval once',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-chat-restart-')),file=join(dir,'workspace.sqlite')
  let connected=false
  const open=()=>serve({file,assets:dir,editorKey:'editor',viewerKey:'viewer',provider:{get:()=>({key:connected?'fixture':'',model:'test'})},
    backgroundEnvironment:{async run(turn){
      const prompt=turn.history.at(-1)?.content??''
      if(prompt.startsWith('Draft ')){turn.tools.proposePage!(prompt,null,'Draft text');turn.publish('Proposed.');return}
      if(prompt==='Find the older review'){
        const recent=turn.tools.listReviews(null)
        assert.deepEqual(recent.messages.map(row=>row.pages[0].title),['Draft 5','Draft 4','Draft 3','Draft 2'])
        const older=turn.tools.listReviews(recent.nextBefore!)
        assert.equal(older.nextBefore,null)
        assert.deepEqual(older.messages.map(row=>row.pages[0].title),['Draft 1','Briefing'])
        assert.equal(older.messages[0].pages[0].status,'dismissed')
        turn.publish('The first draft was dismissed.');return
      }
      if(turn.history.at(-1)?.content==='Acknowledge'){turn.publish('OK');return}
      const {messages,nextBefore}=turn.tools.listReviews(null)
      assert.equal(nextBefore,null)
      assert.equal(messages.length,1)
      const [reviews]=messages
      assert.equal(reviews.edits[0].page,page)
      assert.equal(reviews.edits[0].status,'applied')
      assert.equal(reviews.edits[0].title,'Field notebook')
      assert.equal(reviews.edits[0].requestedBlock,'@import')
      assert.equal(reviews.pages[0].page,created.page)
      assert.equal(reviews.projects[0].name,'Expeditions')
      assert.equal(turn.tools.read(reviews.edits[0].page,reviews.edits[0].block).blocks[0].text,'Edited')
      if(turn.history.at(-1)?.content==='Recheck older approvals'){
        assert.ok(turn.history.every(m=>!m.content.includes('Recorded edit decisions')))
        turn.publish('The original edit was applied.');return
      }
      const previous=turn.history.find(message=>message.role==='assistant'&&message.content.includes('Its final outcome is unknown'))
      assert.match(previous?.content??'',/Recorded project decisions:.*Expeditions.*applied/)
      assert.match(previous?.content??'',/Recorded edit decisions:.*applied/)
      turn.publish('Both proposals were approved.')
    }}})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  let cookie=''
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:data&&JSON.stringify(data)})
  async function login(key:string){cookie=(await call('login',{key})).headers.get('set-cookie')!.split(';')[0]}
  await login('editor')
  await call('workspaces',{name:'Agent test'})
  const {id:chat}=await(await call('agent/chats',{})).json()
  const {id:page}=await(await call('pages',{title:'Notebook',content:'Draft'})).json()
  const {id:other}=await(await call('workspaces',{name:'Other'})).json()
  assert.equal((await call('agent/chats/'+chat+'/turn',{page,text:'Hello'})).status,503)
  await host.close()
  // Fixture captures the database immediately before an unclean shutdown.
  const db=new DatabaseSync(file)
  assert.ok(db.prepare('PRAGMA table_info(chat_messages)').all().some(column=>column.name==='background'))
  db.exec('ALTER TABLE chat_edits DROP COLUMN requestedBlock')
  const m=db.prepare("INSERT INTO chat_messages(chat,role,text,status,background) VALUES(?,'assistant','Partial answer','running',1)").run(chat)
  const e=db.prepare("INSERT INTO chat_edits(message,page,title,block,before,after) VALUES(?,?,'Notebook','@import','Draft','Edited')").run(m.lastInsertRowid,page)
  db.prepare("INSERT INTO chat_edits(message,page,title,block,before,after,status) VALUES(?,?,'Notebook','@import','','Draft','applied')").run(m.lastInsertRowid,page)
  const folder=Number(db.prepare("INSERT INTO projects(workspace,name) VALUES(1,'Library')").run().lastInsertRowid)
  const newPage=db.prepare("INSERT INTO chat_page_requests(message,title,markdown,parent,parentName) VALUES(?,'Briefing','First paragraph',?,'Library')").run(m.lastInsertRowid,folder)
  const projectRequest=db.prepare("INSERT INTO chat_project_requests(message,name) VALUES(?,'Expeditions')").run(m.lastInsertRowid)
  db.close();host=await open();await login('viewer')
  const path='agent/chats/'+chat
  const tasks=await(await call('agent/tasks')).json()
  assert.equal(tasks[0].status,'unknown')
  assert.equal(tasks[0].id,Number(m.lastInsertRowid))
  assert.deepEqual(await(await call('agent/tasks?workspace='+other)).json(),[])
  assert.equal((await call('agent/tasks/'+tasks[0].id+'/cancel',{})).status,403)
  const review=path+'/edits/'+e.lastInsertRowid+'/apply'
  const saved=await(await call(path)).json()
  assert.equal(saved.edits[1].block,'@import')
  assert.equal(saved.edits[1].requestedBlock,null)
  assert.equal(saved.messages[0].status,'unknown');assert.equal(saved.edits[0].status,'pending')
  assert.equal((await call(path+'?workspace='+other)).status,404)
  const createProject=path+'/projects/'+projectRequest.lastInsertRowid+'/apply'
  assert.equal(saved.projects[0].status,'pending')
  assert.equal((await call(createProject,{})).status,403)
  assert.equal((await call(review,{})).status,403)
  await login('editor')
  assert.equal((await call(review+'?workspace='+other,{})).status,404)
  assert.equal((await call(createProject+'?workspace='+other,{})).status,404)
  const createPage=path+'/pages/'+newPage.lastInsertRowid+'/apply'
  const trashFolder=(deleted:boolean)=>fetch(host.url+'/api/projects/'+folder,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({deleted})})
  assert.equal((await trashFolder(true)).status,200)
  assert.equal((await call(createPage,{})).status,400)
  assert.equal((await(await call(path)).json()).pages[0].status,'pending')
  assert.equal((await trashFolder(false)).status,200)
  const pageApprovals=await Promise.all([call(createPage,{}),call(createPage,{})])
  assert.deepEqual(pageApprovals.map(r=>r.status).sort(),[200,409])
  const created=await pageApprovals.find(r=>r.ok)!.json()
  assert.equal((await(await call('source?id='+created.page)).json()).text,'First paragraph')
  const approvals=await Promise.all([call(createProject,{}),call(createProject,{})])
  assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409])
  const renamePage=(title:string)=>fetch(host.url+'/api/pages/'+page,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({title})})
  assert.equal((await renamePage('Field notebook')).status,200)
  assert.equal((await call(review,{})).status,409)
  assert.equal((await call(review,{reviewedTitle:'Notebook'})).status,409)
  assert.equal((await(await call(path)).json()).edits[0].status,'pending')
  assert.equal((await(await call('source?id='+page)).json()).text,'Draft')
  assert.equal((await call(review,{reviewedTitle:'Field notebook'})).status,200)
  const appliedEdit=(await(await call(path)).json()).edits[0]
  assert.equal(appliedEdit.reviewedTitle,'Field notebook')
  assert.equal(appliedEdit.requestedBlock,'@import')
  assert.equal((await call(review,{})).status,409)
  assert.equal((await(await call('source?id='+page)).json()).text,'Edited')
  connected=true
  assert.equal((await call(path+'/turn',{text:'Check what completed',page:null,background:true,allowEdits:false})).status,202)
  assert.equal((await(await call(path)).json()).messages.at(-1).text,'Both proposals were approved.')
  for(let i=0;i<13;i++)await call(path+'/turn',{text:'Acknowledge',page:null,background:true,allowEdits:false})
  await host.close();host=await open();await login('editor')
  await call(path+'/turn',{text:'Recheck older approvals',page:null,background:true,allowEdits:false})
  assert.equal((await(await call(path)).json()).messages.at(-1).text,'The original edit was applied.')
  const sibling='agent/chats/'+(await(await call('agent/chats',{})).json()).id
  for(let i=1;i<=5;i++)await call(path+'/turn',{text:'Draft '+i,page:null,background:true})
  await call(sibling+'/turn',{text:'Draft private sibling',page:null,background:true})
  const oldest=(await(await call(path)).json()).pages.find(row=>row.title==='Draft 1')
  assert.equal((await call(path+'/pages/'+oldest.id+'/dismiss',{})).status,200)
  await call(path+'/turn',{text:'Find the older review',page:null,background:true,allowEdits:false})
  assert.equal((await(await call(path)).json()).messages.at(-1).text,'The first draft was dismissed.')
  await fetch(host.url+'/api/'+sibling,{method:'DELETE',headers:{Cookie:cookie}})
  assert.equal((await fetch(host.url+'/api/'+path,{method:'DELETE',headers:{Cookie:cookie}})).status,200)
  assert.equal((await call(review,{})).status,404)
  assert.equal((await(await call('source?id='+page)).json()).text,'Edited')
  await host.close();host=await open();await login('editor')
  assert.deepEqual((await(await call('agent')).json()).chats,[])
  assert.deepEqual(await(await call('agent/tasks')).json(),[])
  const replacement=await(await call('agent/chats',{})).json()
  assert.notEqual(replacement.id,chat)
  const stored=new DatabaseSync(file)
  assert.equal(stored.prepare('SELECT title FROM chats WHERE id=?').get(chat)!.title,'')
  assert.equal(stored.prepare('SELECT text FROM chat_messages WHERE id=?').get(m.lastInsertRowid)!.text,'')
  assert.equal(stored.prepare('SELECT id FROM chat_edits WHERE id=?').get(e.lastInsertRowid),undefined)
  assert.equal(stored.prepare("SELECT COUNT(*) AS total FROM projects WHERE name='Expeditions'").get()!.total,1)
  stored.close()
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
  const base={settings:{key:'local-fixture',model:'test-codex',url:'http://127.0.0.1:'+(provider.address() as {port:number}).port+'/v1'},
    workspaceCalendar:{today:'2032-02-29',timeZone:'UTC'},current:null,referencedDocuments:[],referencedBlocks:[],signal:AbortSignal.timeout(10000)}
  await runAgent({...base,history:[{role:'user',content:'hello'}],tools:{readProperties:unused,listPageLinks:unused,listJournal:unused,listReviews:unused,listLinkedMessages:unused,findProjects:unused,browse:unused,search:unused,readJournalDay:unused,read:unused,readText:unused,readAttachment:unused,propose:unused},publish:delta=>{text+=delta}})
  assert.equal(requestPath,'/v1/responses');assert.equal(requestBody.model,'test-codex')
  assert.ok(requestBody.tools.some(tool=>tool.name==='proposeEdit'));assert.equal(text,'Hello')
  await runAgent({...base,history:[{role:'user',content:'Look up the date'}],tools:{readProperties:unused,listPageLinks:unused,listJournal:unused,listReviews:unused,listLinkedMessages:unused,findProjects:unused,browse:unused,search:unused,readJournalDay:unused,read:unused,readText:unused,readAttachment:unused},publish:()=>{}})
  assert.deepEqual(requestBody.tools.map(tool=>tool.name).sort(),['browseProject','findProjects','listJournal','listLinkedMessages','listPageLinks','listReviews','readAttachment','readBlock','readJournalDay','readPage','readProperties','readText','searchPages'])
})

test('block links reject missing blocks and foreign pages before a turn is stored',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-block-links-'))
  const host=await serve({file:join(dir,'workspace.sqlite'),assets:dir,editorKey:'editor',viewerKey:'viewer',provider:{get:()=>({key:'fixture',model:'fixture'})}})
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  let cookie=''
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:data&&JSON.stringify(data)})
  cookie=(await call('login',{key:'editor'})).headers.get('set-cookie')!.split(';')[0]
  await call('workspaces',{name:'Agent test'})
  const {id:chat}=await(await call('agent/chats',{})).json()
  const {id:other}=await(await call('workspaces',{name:'Other'})).json()
  const {id:foreign}=await(await call('pages?workspace='+other,{title:'Foreign',content:'Private'})).json()
  const {id:local}=await(await call('pages',{title:'Local',content:'Note'})).json()
  const path='agent/chats/'+chat
  const turn=(id:number,block:string)=>call(path+'/turn',{page:null,text:'Explain these blocks',blockLinks:[{id,block}]})
  const inaccessible=await turn(foreign,'@import')
  assert.equal(inaccessible.status,404)
  assert.equal((await inaccessible.json()).unavailableBlock,undefined)
  const missing=await turn(local,'missing')
  assert.equal(missing.status,409)
  assert.deepEqual((await missing.json()).unavailableBlock,{id:local,block:'missing'})
  const links=[{id:local,block:'first'},{id:local,block:'@import'},{id:local,block:'last'},{id:local,block:'first'}]
  const submit=(blockLinks:typeof links)=>call(path+'/turn',{page:null,text:'Review all references',blockLinks})
  const multiple=await submit(links)
  assert.equal(multiple.status,409)
  assert.deepEqual((await multiple.json()).unavailableBlocks,[links[0],links[2]])
  const forbidden=await submit([...links,{id:foreign,block:'private'}])
  assert.equal(forbidden.status,404)
  assert.equal((await forbidden.json()).unavailableBlocks,undefined)
  assert.deepEqual((await(await call(path)).json()).messages,[])
})

test('a linked block can be proposed directly and its identity carries into a later turn',async t=>{
  const content='x'.repeat(59)+'🧭'+'x'.repeat(2338)+'🧭'+'x'.repeat(9598)+'🧭'+'x'.repeat(1999)+'END'
  const host=await serve({file:':memory:',assets:'.',editorKey:'write',desktop:true,provider:{get:()=>({key:'fixture',model:'fixture'})},
    backgroundEnvironment:{async run(turn){
      if(turn.referencedBlocks.length){
        const [short,long]=turn.referencedBlocks
        assert.equal(short.text,'Original')
        assert.equal(long.truncated,true)
        assert.throws(()=>turn.tools.propose!(long.page,long.block,'Replace unseen text'),/Read the complete/)
        const [hit]=await turn.tools.search('END')
        assert.deepEqual(hit.readFrom,{block:long.block,offset:14000})
        const tail=turn.tools.readText(hit.id,hit.readFrom!.block,hit.readFrom!.offset)
        assert.equal(tail.text,'END')
        assert.throws(()=>turn.tools.propose!(long.page,long.block,'Missing the middle'),/Read the complete/)
        assert.equal(long.nextOffset,2399)
        const middle=turn.tools.readText(long.page,long.block,long.nextOffset!)
        assert.equal(middle.nextOffset,null)
        assert.equal(long.text,content.slice(0,2399))
        assert.equal(long.text+middle.text,content)
        const preview=turn.tools.read(long.page,long.block).blocks[0]
        assert.equal(preview.nextOffset,11999)
        assert.equal(preview.text+turn.tools.readText(long.page,long.block,preview.nextOffset!).text,content)
        turn.tools.propose!(long.page,long.block,'Reviewed the whole block')
        turn.tools.propose!(short.page,short.block,'First revision')
      }else{
        const {messages}=turn.tools.listLinkedMessages(null)
        const cited=messages.find(message=>message.role==='assistant')?.links.find(link=>link.id===long.id&&link.block)
        assert.deepEqual(cited?.readFrom,{block:'@import',offset:11999})
        const userLink=messages.find(message=>message.role==='user')?.links.find(link=>link.id===long.id)
        assert.ok(userLink&&!userLink.readFrom)
        const previous=turn.history.find(message=>message.role==='user')!
        assert.match(previous.content,/"block":"@import"/)
        assert.doesNotMatch(previous.content,/Original/)
        assert.throws(()=>turn.tools.propose!(short.id,'@import','Unverified follow-up'),/Read the complete/)
        const latest=turn.tools.read(short.id,'@import')
        assert.deepEqual(latest.blocks,[{id:'@import',text:'Original'}])
        assert.throws(()=>turn.tools.read(short.id,'removed-block'),/Block unavailable/)
      }
      turn.publish('Ready for review')
    }}})
  t.after(()=>host.close())
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer write','Content-Type':'application/json'},body:JSON.stringify(data)})
  await call('workspaces',{name:'Research'})
  const short=await(await call('pages',{title:'Short',content:'Original'})).json()
  const long=await(await call('pages',{title:'Long',content})).json()
  const chat=await(await call('agent/chats',{})).json(),path='agent/chats/'+chat.id
  const blockLinks=[{id:short.id,block:'@import'},{id:long.id,block:'@import'}]
  for(const links of [blockLinks,[]]){
    const response=await call(path+'/turn',{page:null,text:links.length?'Edit these blocks':'Revisit the first link',background:true,blockLinks:links})
    assert.equal(response.status,202)
    assert.equal((await(await call(path)).json()).messages.at(-1).status,'complete')
  }
  const {edits}=await(await call(path)).json()
  assert.equal(edits.length,2)
  const longEdit=edits.find(edit=>edit.before===content)
  assert.ok(longEdit)
  assert.equal((await call(path+'/edits/'+longEdit.id+'/apply',{})).status,200)
  assert.equal((await(await call('source?id='+long.id)).json()).text,'Reviewed the whole block')
  const shortEdit=edits.find(edit=>edit.before==='Original')!
  assert.equal((await(await call('source?id='+short.id)).json()).text,'Original')
  assert.equal((await call(path+'/edits/'+shortEdit.id+'/apply',{})).status,200)
  assert.equal((await(await call('source?id='+short.id)).json()).text,'First revision')
})

test('a background environment receives scoped tools and loses them when its task finishes',async t=>{
  const events=new EventEmitter()
  let retained:import('../../src/server/agent-environment.ts').AgentTurn|undefined
  const host=await serve({file:':memory:',assets:'.',editorKey:'editor',provider:{get:()=>({key:'fixture',model:'fixture',url:'http://127.0.0.1:1'})},
    backgroundEnvironment:{async run(turn){
      retained=turn
      if(turn.history.at(-1)?.content==='Wait for shutdown'){
        await once(turn.signal,'abort')
        await once(events,'release',{signal:AbortSignal.timeout(3000)})
        return
      }
      await once(events,'finish',{signal:turn.signal})
      turn.activity!({type:'reasoning',key:'0',text:'Looking '})
      turn.activity!({type:'reasoning',key:'0',text:'up projects.'})
      turn.activity!({type:'reasoning-end',key:'0'})
      const project=turn.tools.browse(null,0)
      turn.publish(project.entries.map(entry=>entry.name).join(', '))
      turn.activity!({type:'tool-start',key:'lookup',name:'readPage',input:{id:10}})
      turn.activity!({type:'tool-end',key:'lookup',failed:true,result:'private provider error'})
    }}})
  let shutdown:Promise<void>|undefined
  t.after(()=>shutdown??host.close())
  let cookie=''
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:data&&JSON.stringify(data)})
  cookie=(await call('login',{key:'editor'})).headers.get('set-cookie')!.split(';')[0]
  await call('workspaces',{name:'Home'})
  await call('projects',{name:'Local project'})
  const other=await(await call('workspaces',{name:'Other'})).json()
  const foreign=await(await call('pages?workspace='+other.id,{title:'Private notes'})).json()
  const chat=await(await call('agent/chats',{})).json(),path='agent/chats/'+chat.id
  const request={page:null,text:'List projects',background:true,allowEdits:false,operationId:'c'.repeat(32)}
  const accepted=await call(path+'/turn',request)
  assert.equal(accepted.status,202)
  const {task}=await accepted.json()
  const retry=await call(path+'/turn',request)
  assert.equal(retry.status,202)
  assert.equal((await retry.json()).task,task)
  assert.equal((await call(path+'/turn',{...request,text:'Changed request'})).status,409)
  assert.ok(retained)
  assert.equal(retained!.tools.propose,undefined)
  assert.throws(()=>retained!.tools.read(foreign.id,0),/Page unavailable/)
  const closed=once(retained!.signal,'abort',{signal:AbortSignal.timeout(3000)})
  events.emit('finish');await closed
  assert.equal((await(await call(path+'/turn',request)).json()).task,task)
  const history=(await(await call(path)).json()).messages
  assert.equal(history.length,2)
  assert.equal(history.at(-1).text,'Local project')
  assert.throws(()=>retained!.tools.browse(null,0))
  const [summary,tool]=history.at(-1).activity
  assert.equal(summary.detail,'Looking up projects.')
  assert.equal(summary.offset,0)
  assert.equal(tool.offset,'Local project'.length)
  assert.equal(tool.state,'failed')
  assert.doesNotMatch(tool.detail,/private/)
  assert.throws(()=>retained!.publish('late output'))
  assert.throws(()=>retained!.activity!({type:'reasoning',key:'0',text:'late activity'}))
  assert.equal((await call(path+'/turn',{page:null,text:'Wait for shutdown',background:true})).status,202)
  const stopping=once(retained!.signal,'abort',{signal:AbortSignal.timeout(3000)})
  let stopped=false
  shutdown=host.close().then(()=>{stopped=true})
  await stopping
  await new Promise(done=>setImmediate(done))
  assert.equal(stopped,false)
  events.emit('release')
  await shutdown
  assert.throws(()=>retained!.tools.browse(null,0),{name:'AbortError'})

})

test('shared turn readers can join late, disconnect and lose access independently',async t=>{
  const gate=new EventEmitter()
  const host=await serve({file:':memory:',assets:'.',editorKey:'edit',viewerKey:'view',
    provider:{get:()=>({key:'fixture',model:'fixture',url:'http://127.0.0.1:1'})},
    backgroundEnvironment:{async run(turn){
      turn.publish('First')
      await once(gate,'finish',{signal:turn.signal})
      turn.activity!({type:'reasoning',key:'summary',text:'Found the page.'})
      turn.activity!({type:'tool-start',key:'lookup',name:'readPage',input:{id:1}})
      turn.publish(' second')
    }}})
  t.after(()=>host.close())
  const api=(path:string,cookie:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',
    signal:AbortSignal.timeout(10000),headers:{Cookie:cookie,'Content-Type':'application/json'},body:data&&JSON.stringify(data)})
  const login=async(key:string)=>(await api('login','',{key})).headers.get('set-cookie')!.split(';')[0]
  const editor=await login('edit'),viewer=await login('view'),another=await login('view')
  await api('workspaces',editor,{name:'Shared'})
  const {id}=await(await api('agent/chats',editor,{})).json(),path='agent/chats/'+id
  assert.equal((await api(path+'/turn',viewer)).status,204)
  const accepted=await api(path+'/turn',editor,{text:'Look it up',page:null,background:true})
  assert.equal(accepted.status,202)
  const {task}=await accepted.json()
  const stream=await api(path+'/turn',viewer),revoked=await api(path+'/turn',another)
  assert.equal(stream.status,200)
  assert.equal((await(await api(path,viewer)).json()).messages.at(-1).text,'First')
  assert.equal((await api('logout',another,{})).status,200)
  assert.deepEqual(JSON.parse(await revoked.text()),{message:task})
  const leaving=await api(path+'/turn',viewer)
  await leaving.body!.cancel()
  gate.emit('finish')
  const events=(await stream.text()).trim().split('\n').map(line=>JSON.parse(line))
  assert.deepEqual(events[0],{message:task})
  assert.ok(events.some(event=>event.part?.detail==='Found the page.'))
  assert.ok(events.some(event=>event.part?.kind==='tool'))
  assert.ok(events.some(event=>event.delta===' second'&&event.offset===5))
  assert.equal((await(await api(path,viewer)).json()).messages.at(-1).status,'complete')
})

test('archiving a workspace interrupts only its own background turns',async t=>{
  const {createServer}=await import('node:http')
  const provider=createServer(()=>{/* Hold each turn open until Chulane interrupts it. */})
  await new Promise<void>(done=>provider.listen(0,'127.0.0.1',done))
  const url='http://127.0.0.1:'+(provider.address() as {port:number}).port+'/v1'
  const host=await serve({file:':memory:',assets:'.',editorKey:'owner',desktop:true,provider:{get:()=>({key:'test',model:'test',url})}})
  t.after(async()=>{await host.close();provider.closeAllConnections();provider.close()})
  const call=(path:string,data?:object,method=data?'POST':'GET')=>fetch(host.url+'/api/'+path,{
    method,headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(data)})
  for(const name of ['Archived','Active']){
    const {id}=await(await call('workspaces',{name})).json()
    const scope='?workspace='+id
    const {id:chat}=await(await call('agent/chats'+scope,{})).json()
    assert.equal((await call('agent/chats/'+chat+'/turn'+scope,{page:null,text:'Hello',background:true})).status,202)
  }
  assert.equal((await call('workspaces/archive',{archived:true},'PUT')).status,200)
  assert.equal((await call('workspaces/archive',{archived:false},'PUT')).status,200)
  const tasks=async(ws:number)=>(await(await call('agent/tasks?workspace='+ws)).json())[0]
  // Cancellation reaches the provider asynchronously.
  const timeout=AbortSignal.timeout(5000)
  while((await tasks(1)).status==='running'){timeout.throwIfAborted();await new Promise(done=>setTimeout(done,10))}
  assert.equal((await tasks(1)).status,'interrupted')
  assert.equal((await tasks(2)).status,'running')
})

test('shared chat deletion belongs to its author or owner and never follows a later editor',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-chat-author-')),file=join(dir,'workspace.sqlite')
  const open=()=>serve({file,assets:dir,registration:true})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(key:string,path:string,method='GET',data?:object)=>fetch(host.url+'/api/'+path,{method,headers:{Cookie:key,'Content-Type':'application/json'},body:JSON.stringify(data)})
  async function login(username:string,register=false){
    const r=await call('',register?'register':'login','POST',{username,password:'a long chat password'})
    return r.headers.get('set-cookie')!.split(';')[0]
  }
  let owner=await login('Owner',true),author=await login('Author',true),editor=await login('Editor',true)
  await call(owner,'workspaces','POST',{name:'Shared'})
  const db=new DatabaseSync(file)
  db.exec("INSERT INTO memberships SELECT 1,id,'editor' FROM accounts WHERE name IN ('Author','Editor')")
  db.close()
  assert.equal((await call(author,'agent/chats','POST',{agent:'hermes'})).status,403)
  const receipt='a'.repeat(32)
  const create=async(operationId?:string)=>Number((await(await call(author,'agent/chats','POST',{operationId})).json()).id)
  const first=await create(receipt),second=await create()
  await host.close();host=await open()
  owner=await login('Owner');author=await login('Author');editor=await login('Editor')
  assert.equal(await create(receipt),first)
  const path=(id:number)=>'agent/chats/'+id
  assert.equal((await call(editor,path(first),'DELETE')).status,403)
  const ownerList=(await(await call(owner,'agent')).json()).chats
  const editorList=(await(await call(editor,'agent')).json()).chats
  assert.ok(ownerList.every(chat=>chat.canDelete))
  assert.ok(editorList.every(chat=>!chat.canDelete))
  // A turn can finish uploading after the author deletes the conversation.
  const {request}=await import('node:http')
  const accepted=once(host.server,'request')
  const upload=request(host.url+'/api/'+path(first)+'/turn',{method:'POST',headers:{Cookie:editor,'Content-Type':'application/json'}})
  const completed=once(upload,'response')
  upload.write(' ');await accepted
  assert.equal((await call(author,path(first),'DELETE')).status,200)
  upload.end(JSON.stringify({page:null,text:'Late turn'}))
  const [late]=await completed
  assert.equal(late.statusCode,404);late.resume()
  assert.equal((await call(author,path(first))).status,404)
  assert.equal((await call(author,'agent/chats','POST',{operationId:receipt})).status,404)
  const members=await(await call(owner,'workspaces/members')).json()
  const authorId=members.find(member=>member.name==='Author').id
  assert.equal((await call(owner,'workspaces/members/'+authorId,'DELETE')).status,200)
  assert.equal((await call(editor,path(second))).status,200)
  assert.equal((await call(author,path(second),'DELETE')).status,404)
  assert.equal((await call(owner,path(second),'DELETE')).status,200)
  assert.deepEqual((await(await call(editor,'agent')).json()).chats,[])
})

test('membership loss and sign-out interrupt only the initiating session’s waiting turns',async t=>{
  const {createServer}=await import('node:http')
  const provider=createServer(()=>{/* Simulate a provider waiting without publishing or calling tools. */})
  await new Promise<void>(done=>provider.listen(0,'127.0.0.1',done))
  const url='http://127.0.0.1:'+(provider.address() as {port:number}).port+'/v1'
  const dir=await mkdtemp(join(tmpdir(),'chulane-run-access-')),file=join(dir,'workspace.sqlite')
  const open=()=>serve({file,assets:dir,registration:true,provider:{get:()=>({key:'test',model:'test',url})}})
  let host=await open()
  t.after(async()=>{await host.close();provider.closeAllConnections();provider.close();await rm(dir,{recursive:true,force:true})})
  const call=(cookie:string,path:string,method='GET',data?:object)=>fetch(host.url+'/api/'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)})
  async function register(username:string){
    return (await call('','register','POST',{username,password:'long test password'})).headers.get('set-cookie')!.split(';')[0]
  }
  const owner=await register('Owner'),editor=await register('Editor')
  await call(owner,'workspaces','POST',{name:'Shared'})
  const db=new DatabaseSync(file)
  db.exec("INSERT INTO memberships SELECT 1,id,'editor' FROM accounts WHERE name='Editor'")
  const member=db.prepare("SELECT id FROM accounts WHERE name='Editor'").get()!
  db.close()
  async function start(cookie:string){
    const {id}=await(await call(owner,'agent/chats','POST',{})).json()
    const requested=once(provider,'request',{signal:AbortSignal.timeout(5000)})
    assert.equal((await call(cookie,'agent/chats/'+id+'/turn','POST',{page:null,text:'Read my notes',background:true})).status,202)
    await requested
    return id
  }
  const keep=await start(owner)
  async function expectInterrupted(chat:number){
    const timeout=AbortSignal.timeout(3000)
    for(;;){
      const tasks=await(await call(owner,'agent/tasks')).json()
      assert.equal(tasks.find(task=>task.chat===keep).status,'running')
      if(tasks.find(task=>task.chat===chat).status==='interrupted')break
      timeout.throwIfAborted()
      await new Promise(done=>setTimeout(done,20))
    }
  }
  const route='workspaces/members/'+member.id
  const demoted=await start(editor)
  const {id:page}=await(await call(owner,'pages','POST',{title:'Notes',content:'Original'})).json()
  const saved=new DatabaseSync(file)
  const message=saved.prepare("SELECT id FROM chat_messages WHERE chat=? AND role='assistant'").get(demoted)!.id
  const pageDraft=saved.prepare("INSERT INTO chat_page_requests(message,title,markdown) VALUES(?,'New page','Private draft')").run(message).lastInsertRowid
  const project=saved.prepare("INSERT INTO chat_project_requests(message,name) VALUES(?,'Expeditions')").run(message).lastInsertRowid
  const edit=saved.prepare("INSERT INTO chat_edits(message,page,title,block,before,after) VALUES(?,?,'Notes','@import','Original','Changed')").run(message,page).lastInsertRowid
  const rename=saved.prepare("INSERT INTO chat_edits(message,page,title,block,before,after,kind) VALUES(?,?,'Notes','','Notes','Retitled','rename')").run(message,page).lastInsertRowid
  const legacyMessage=saved.prepare("INSERT INTO chat_messages(chat,role,text,status) VALUES(?,'assistant','Old suggestion','complete')").run(demoted).lastInsertRowid
  const legacyProject=saved.prepare("INSERT INTO chat_project_requests(message,name) VALUES(?,'Legacy suggestion')").run(legacyMessage).lastInsertRowid
  saved.close()
  const review='agent/chats/'+demoted+'/'
  assert.equal((await call(owner,route,'PATCH',{role:'viewer'})).status,200)
  await expectInterrupted(demoted)
  for(const path of ['edits/'+edit,'edits/'+rename,'projects/'+project,'pages/'+pageDraft]){
    assert.equal((await call(owner,review+path+'/apply','POST',{})).status,403)
  }
  const pending=await(await call(owner,review.slice(0,-1))).json()
  assert.equal(pending.edits[0].status,'pending')
  assert.equal(pending.projects[0].status,'pending')
  assert.equal((await(await call(owner,'source?id='+page)).json()).text,'Original')
  assert.equal((await(await call(owner,'library')).json()).projects.length,0)
  assert.equal((await call(owner,route,'PATCH',{role:'editor'})).status,200)
  assert.equal((await call(owner,review+'edits/'+edit+'/apply','POST',{})).status,200)
  assert.equal((await call(owner,review+'projects/'+legacyProject+'/apply','POST',{})).status,403)
  assert.equal((await call(owner,review+'projects/'+legacyProject+'/dismiss','POST',{})).status,200)
  const contestants=[{cookie:owner,name:'Owner'},{cookie:editor,name:'Editor'}]
  const approvals=await Promise.all(contestants.map(user=>call(user.cookie,review+'pages/'+pageDraft+'/apply','POST',{})))
  assert.deepEqual(approvals.map(response=>response.status).sort(),[200,409])
  const reviewed=await(await call(owner,review.slice(0,-1))).json()
  assert.equal(reviewed.messages.find(m=>m.role==='user').requestedBy,'Editor')
  assert.equal(reviewed.pages[0].reviewedBy,contestants[approvals.findIndex(response=>response.ok)].name)
  assert.equal(reviewed.edits[0].reviewedBy,'Owner')
  assert.equal(reviewed.projects.find(p=>p.status==='dismissed').reviewedBy,'Owner')
  assert.equal((await(await call(owner,'library')).json()).pages.filter(p=>p.title==='New page').length,1)
  const signedOut=await start(editor)
  assert.equal((await call(editor,'logout','POST')).status,200)
  await expectInterrupted(signedOut)
  const login=await call('','login','POST',{username:'Editor',password:'long test password'})
  const removed=await start(login.headers.get('set-cookie')!.split(';')[0])
  assert.equal((await call(owner,route,'DELETE')).status,200)
  await expectInterrupted(removed)
  await host.close();host=await open()
  const signedIn=await call('','login','POST',{username:'Owner',password:'long test password'})
  const reviewer=signedIn.headers.get('set-cookie')!.split(';')[0]
  assert.equal((await(await call(reviewer,review.slice(0,-1))).json()).pages[0].reviewedBy,reviewed.pages[0].reviewedBy)
  assert.equal((await call(reviewer,review+'projects/'+project+'/apply','POST',{})).status,403)
  assert.equal((await call(reviewer,review+'projects/'+project+'/dismiss','POST',{})).status,200)
  assert.equal((await(await call(reviewer,'library')).json()).projects.length,0)
})

test('project browsing stays within active folders and pages and continues across batches',async t=>{
  const {browseProject}=await import('../../src/server/projects.ts')
  const dir=await mkdtemp(join(tmpdir(),'chulane-browse-')),file=join(dir,'workspace.sqlite')
  const host=await serve({file,assets:dir,editorKey:'fixture'})
  const db=new DatabaseSync(file)
  t.after(async()=>{db.close();await host.close();await rm(dir,{recursive:true,force:true})})
  db.exec(`INSERT INTO workspaces(id,name) VALUES(1,'Local'),(2,'Other');
    INSERT INTO projects(id,workspace,name,parent,trashRoot) VALUES(1,1,'Research',NULL,NULL),(2,1,'Nested',1,NULL),(3,2,'Foreign',NULL,NULL),(4,1,'Trash',NULL,4);
    INSERT INTO pages(workspace,title,project,day,deleted) VALUES(1,'Journal',NULL,'2026-11-22',0),(1,'Unfiled',NULL,NULL,0),(2,'Foreign page',NULL,NULL,0),(1,'Deleted page',1,NULL,1)`)
  const insert=db.prepare('INSERT INTO pages(workspace,title,project) VALUES(1,?,1)')
  for(let i=0;i<40;i++)insert.run('Note '+String(i).padStart(2,'0'))
  assert.deepEqual(browseProject(db,1,null,0).entries.map(entry=>entry.name),['Research','Unfiled'])
  assert.throws(()=>browseProject(db,1,3,0),/Unknown project/)
  assert.throws(()=>browseProject(db,1,4,0),/Unknown project/)
  const first=browseProject(db,1,1,0)
  assert.equal(first.entries.length,40);assert.equal(first.nextOffset,40)
  assert.deepEqual({...first.entries[0]},{kind:'project',name:'Nested',id:2})
  const second=browseProject(db,1,1,first.nextOffset!)
  assert.deepEqual(second.entries.map(entry=>entry.name),['Note 39']);assert.equal(second.nextOffset,null)
  const login=await fetch(host.url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'fixture'})})
  const cookie=login.headers.get('set-cookie')!.split(';')[0]
  const catalog=await fetch(host.url+'/api/projects?workspace=1',{headers:{Cookie:cookie}})
  assert.deepEqual(await catalog.json(),[
    {id:1,workspace:1,name:'Research',parent:null,trashRoot:null},
    {id:2,workspace:1,name:'Nested',parent:1,trashRoot:null},
  ])
  const browse=(query:string)=>fetch(host.url+'/api/projects/browse?workspace=1'+query,{headers:{Cookie:cookie}})
  assert.deepEqual(await(await browse('&project=1&offset=40')).json(),{entries:second.entries.map(row=>({...row})),nextOffset:null})
  const lookup=(name:string,offset=0,match='exact')=>fetch(host.url+'/api/projects/find?workspace=1&name='+encodeURIComponent(name)+'&offset='+offset+'&match='+match,{headers:{Cookie:cookie}})
  const nested="Camp / 100% & _"
  const folder=db.prepare('INSERT INTO projects(workspace,name,parent,trashRoot) VALUES(?,?,?,?)')
  const idsByName=Array.from({length:41},(_,i)=>Number(folder.run(1,nested,i%2?1:2,null).lastInsertRowid))
  folder.run(2,nested,null,null);folder.run(1,nested,null,4);folder.run(1,nested+' annex',null,null)
  const matches=await (await lookup(nested)).json()
  assert.deepEqual(matches.entries.map(row=>row.id),idsByName.slice(0,40))
  assert.deepEqual(matches.entries.slice(0,2).map(row=>row.path),['Research / Nested / '+nested,'Research / '+nested])
  assert.equal(matches.nextOffset,40)
  assert.deepEqual(await(await lookup(nested,40)).json(),{entries:[{id:idsByName[40],name:nested,path:'Research / Nested / '+nested}],nextOffset:null})
  const branch='Échantillons / 100%_'
  const branchId=Number(folder.run(1,branch,null,null).lastInsertRowid)
  const childId=Number(folder.run(1,'Stations',branchId,null).lastInsertRowid)
  folder.run(2,branch,null,null);folder.run(1,branch,null,4)
  const pathQuery='éCHANTILLONS / 100%_ / sta'
  assert.deepEqual(await(await lookup(pathQuery,0,'path')).json(),{entries:[{id:childId,name:'Stations',path:branch+' / Stations'}],nextOffset:null})
  assert.deepEqual((await(await lookup('100%_',0,'path')).json()).entries.map(entry=>entry.id),[branchId,childId])
  const pathBatch=await(await lookup('camp / 100%',0,'path')).json()
  assert.equal(pathBatch.nextOffset,40)
  const pathTail=await(await lookup('camp / 100%',pathBatch.nextOffset,'path')).json()
  assert.equal(pathTail.nextOffset,null)
  assert.equal(new Set([...pathBatch.entries,...pathTail.entries].map(row=>row.id)).size,42)
  assert.equal((await lookup(nested,0,'unknown')).status,400)
  assert.equal((await lookup(' ')).status,400)
  assert.equal((await lookup(nested,-1)).status,400)
  const title='Съёмка 100% & _'
  const ids=Array.from({length:41},()=>Number(insert.run(title).lastInsertRowid))
  insert.run(title+' appendix')
  db.prepare('INSERT INTO pages(workspace,title) VALUES(1,?)').run(title)
  const named=async(offset:number)=>await(await browse('&project=1&name='+encodeURIComponent(title)+'&offset='+offset)).json()
  const batch=await named(0)
  assert.deepEqual(batch.entries.map(entry=>entry.id),ids.slice(0,40))
  assert.equal(batch.nextOffset,40)
  assert.deepEqual(await named(batch.nextOffset),{entries:[{kind:'page',id:ids[40],name:title}],nextOffset:null})
  for(const query of ['&name=','&name='+('a'.repeat(251)),'&project=3','&project=4','&project=','&project=-1','&offset=-1','&offset=1.2','&offset=9007199254740992'])
    assert.equal((await browse(query)).status,400,query)
})

test('agent title reviews require a current read and explicit approval against the observed title',async t=>{
  let unread:number
  const host=await serve({file:':memory:',assets:'.',desktop:true,editorKey:'write',provider:{get:()=>({key:'fixture',model:'fixture'})},
    backgroundEnvironment:{async run(turn){
      assert.throws(()=>turn.tools.proposeRename!(unread,'Unseen'),/Read the current page/)
      assert.throws(()=>turn.tools.proposeRename!(turn.current!.id,'   '),/Invalid agent request/)
      turn.tools.proposeRename!(turn.current!.id,'Survey plan')
      turn.publish('Review the proposed title.')
    }}})
  t.after(()=>host.close())
  const call=(path:string,data?:object,method=data?'POST':'GET')=>fetch(host.url+'/api/'+path,{method,headers:{Authorization:'Bearer write','Content-Type':'application/json'},body:data&&JSON.stringify(data)})
  await call('workspaces',{name:'Research'})
  unread=(await(await call('pages',{title:'Other page'})).json()).id
  const page=await(await call('pages',{title:'Draft',content:'Keep my text'})).json()
  const chat=await(await call('agent/chats',{})).json(),path='agent/chats/'+chat.id
  async function propose(){
    await call(path+'/turn',{page:page.id,text:'Rename this page',background:true})
    const item=(await(await call(path)).json()).edits.at(-1)
    assert.equal(item.kind,'rename')
    assert.equal(item.status,'pending')
    return path+'/edits/'+item.id+'/apply'
  }
  const stale=await propose()
  assert.equal((await(await call('source?id='+page.id)).json()).title,'Draft')
  await call('pages/'+page.id,{title:'Human title'},'PATCH')
  assert.equal((await call(stale,{})).status,409)
  const fresh=await propose()
  assert.equal((await call(fresh,{})).status,200)
  assert.equal((await call(fresh,{})).status,409)
  assert.deepEqual(await(await call('source?id='+page.id)).json(),{id:page.id,title:'Survey plan',text:'Keep my text'})
})

test('a conversation can pin a local agent while its sibling follows the desktop default',async t=>{
  const agents:string[]=[],checks:string[]=[]
  const host=await serve({file:':memory:',assets:'.',editorKey:'write',desktop:true,
    provider:{get:()=>({agent:'codex',model:'',key:''}),checkAgent:async agent=>{
      checks.push(agent)
      if(agent==='claude')throw Object.assign(Error('Claude unavailable'),{status:400})
    }},backgroundEnvironment:{async run(turn){agents.push(turn.settings.agent!);turn.publish('Done')}}})
  t.after(()=>host.close())
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer write','Content-Type':'application/json'},body:JSON.stringify(data)})
  await call('workspaces',{name:'Research'})
  const operationId='e'.repeat(32)
  assert.equal((await call('agent/chats',{agent:'claude',operationId})).status,400)
  assert.deepEqual((await(await call('agent')).json()).chats,[])
  const createPinned=()=>call('agent/chats',{agent:'hermes',operationId})
  const pinned=await(await createPinned()).json()
  assert.deepEqual(await(await createPinned()).json(),pinned)
  assert.equal((await call('agent/chats',{agent:'codex',operationId})).status,409)
  assert.deepEqual(checks,['claude','hermes'])
  const first='agent/chats/'+pinned.id
  const second='agent/chats/'+(await(await call('agent/chats',{})).json()).id
  assert.equal((await call(first+'/provider',{agent:'claude'})).status,400)
  assert.equal((await call(first+'/provider',{agent:'/bin/sh'})).status,400)
  for(const path of [first,second]){
    assert.equal((await call(path+'/turn',{page:null,text:'Hello',background:true})).status,202)
  }
  assert.deepEqual(agents,['hermes','codex'])
  assert.equal((await call(first+'/provider',{agent:null})).status,200)
  assert.equal((await call(first+'/turn',{page:null,text:'Hello again',background:true})).status,202)
  assert.deepEqual(agents,['hermes','codex','codex'])
})

test('plugin drafts survive restart and only an explicit local desktop save reaches the filesystem callback',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-plugin-draft-'))
  const draft={name:'Checklist',nativeModule:'export default function checklist(){}',rendererModule:null}
  let saves=0,originalMessage=0,foreignMessage=0
  const open=()=>serve({file:join(dir,'workspace.sqlite'),assets:dir,desktop:true,editorKey:'desktop',
    provider:{get:()=>({key:'fixture',model:'fixture'})},
    savePlugin:async(source,authorize)=>{authorize();assert.deepEqual(source,draft);saves++;return dir},
    backgroundEnvironment:{async run(turn){
      if(turn.history.at(-1)?.content==='Revise the checklist'){
        const source=turn.tools.readPluginDraft!(null)
        assert.deepEqual(source,draft)
        assert.deepEqual(turn.tools.readPluginDraft!(originalMessage),draft)
        assert.throws(()=>turn.tools.readPluginDraft!(foreignMessage),/unavailable/i)
        assert.ok(turn.history.some(entry=>entry.content.includes('Checklist')&&entry.content.includes(String(originalMessage))))
        turn.tools.draftPlugin?.({...source,name:'Revised checklist'})
      }else if(turn.tools.draftPlugin)turn.tools.draftPlugin(draft)
      turn.publish(turn.tools.draftPlugin?'Draft ready':'Read only')
    }}})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(path:string,data?:object,headers:Record<string,string>={Authorization:'Bearer desktop'})=>fetch(host.url+'/api/'+path,{
    method:data?'POST':'GET',headers:{...headers,'Content-Type':'application/json'},body:data&&JSON.stringify(data)})
  await call('workspaces',{name:'Local'})
  const chat='agent/chats/'+(await(await call('agent/chats',{})).json()).id
  const retryDraft={text:'Draft a checklist',page:null,background:true,allowEdits:true,operationId:'d'.repeat(32)}
  for(const allowEdits of [false,true]){
    await call(chat+'/turn',{...retryDraft,allowEdits,operationId:allowEdits?retryDraft.operationId:undefined})
    const answer=(await(await call(chat)).json()).messages.at(-1)
    assert.equal(answer.status,'complete')
    assert.deepEqual(answer.pluginDraft,allowEdits?draft:undefined)
  }
  assert.equal(saves,0)
  await host.close();host=await open()
  const message=(await(await call(chat)).json()).messages.at(-1)
  assert.deepEqual(message.pluginDraft,draft)
  originalMessage=message.id
  assert.deepEqual(await(await call(chat+'/turn',retryDraft)).json(),{task:originalMessage,chat:Number(chat.split('/').at(-1)),replayed:true})
  assert.equal((await(await call(chat)).json()).messages.length,4)
  const sibling='agent/chats/'+(await(await call('agent/chats',{})).json()).id
  await call(sibling+'/turn',{text:'Create a separate draft',page:null,background:true})
  foreignMessage=(await(await call(sibling)).json()).messages.at(-1).id
  for(const allowEdits of [false,true]){
    await call(chat+'/turn',{text:'Revise the checklist',page:null,background:true,allowEdits})
    const {messages}=await(await call(chat)).json()
    assert.equal(messages.at(-1).status,'complete')
    assert.deepEqual(messages.at(-1).pluginDraft,allowEdits?{...draft,name:'Revised checklist'}:undefined)
    assert.deepEqual(messages.find(row=>row.id===originalMessage).pluginDraft,draft)
  }
  const path=chat+'/plugins/'+message.id+'/save'
  const login=await call('login',{key:'desktop'},{})
  const Cookie=login.headers.get('set-cookie')!.split(';')[0]!
  assert.equal((await call(path,{},{Cookie})).status,403)
  assert.equal(saves,0)
  assert.deepEqual(await(await call(path,{})).json(),{folder:dir})
  assert.equal(saves,1)
})

test('a follow-up finds older linked blocks and cited files within its own conversation after restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-old-links-')),file=join(dir,'workspace.sqlite')
  let foreignMessage=0
  const open=()=>serve({file,assets:dir,editorKey:'write',desktop:true,provider:{get:()=>({key:'fixture',model:'fixture'})},
    backgroundEnvironment:{async run(turn){
      const prompt=turn.history.at(-1)?.content
      if(prompt==='Original prompt'||prompt==='Other conversation'){
        const hits=await turn.tools.search('Field badge')
        const scanned=hits.find(hit=>hit.attachment?.name==='badge.md')!
        const tail=turn.tools.readAttachment(scanned.id,scanned.attachment!.id,Array.from('🧭 Field badge ').length)
        assert.ok('text' in tail&&tail.text==='742')
        turn.tools.readAttachment(scanned.id,scanned.attachment!.id,100)
        await turn.tools.search('Field badge')
        const report=hits.find(hit=>hit.title==='Independent report')!
        assert.equal(turn.tools.readText(report.id,report.block!,12).text,'measured at noon')
      }
      if(prompt==='Find my original links'||prompt==='Check the removed source'){
        assert.ok(turn.history.every(m=>!m.content.includes('Original prompt')))
        const recent=turn.tools.listLinkedMessages(null)
        assert.equal(recent.messages.length,4)
        const messages=[...recent.messages]
        let cursor=recent.nextBefore
        while(cursor!==null){
          const batch=turn.tools.listLinkedMessages(cursor)
          assert.ok(batch.messages.every(row=>row.message<cursor!))
          messages.push(...batch.messages)
          cursor=batch.nextBefore
        }
        assert.deepEqual(messages.slice(-2).map(m=>m.prompt),['Recorded','Original prompt'])
        assert.ok(messages.every(m=>m.prompt!=='Other conversation'))
        const original=messages.at(-2)!
        const cited=original.links.find(link=>link.title==='Independent report'&&link.block)
        assert.ok(cited?.block)
        assert.equal('excerpt' in cited,false)
        assert.deepEqual(cited.readFrom,{block:cited.block,offset:12})
        const reread=()=>turn.tools.readText(cited.id,cited.readFrom!.block,cited.readFrom!.offset,original.message)
        assert.throws(()=>turn.tools.readText(cited.id,cited.block!,12,foreignMessage),/citation unavailable/)
        if(prompt==='Check the removed source')assert.throws(reread,/ambiguous/)
        else{
          assert.equal(reread().text,'measured at noon')
          assert.equal(turn.tools.read(cited.id,cited.block).blocks[0].text,'Revised instrument reading: Field badge measured at noon')
        }
        const [file]=original.attachments!
        assert.equal(file.name,'badge.md')
        assert.equal(file.matchOffset,2)
        assert.equal(file.readOffset,14)
        if(prompt==='Check the removed source')assert.throws(()=>turn.tools.readAttachment(file.id,file.file,file.readOffset!),/unavailable/i)
        else{
          const passage=turn.tools.readAttachment(file.id,file.file,file.readOffset!)
          assert.ok('text' in passage&&passage.text==='742')
        }
        const [page,block]=messages.at(-1)!.links
        assert.equal(page.title,'Context page')
        assert.equal(block.block,'@import')
        assert.equal('excerpt' in block,false)
        if(prompt==='Check the removed source'){
          assert.throws(()=>turn.tools.read(block.id,block.block!),/Page unavailable/)
          turn.publish('Source unavailable')
        }else turn.publish(turn.tools.read(block.id,block.block!).blocks[0].text)
      }else turn.publish('Recorded')
    }}})
  let host=await open()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer write','Content-Type':'application/json'},body:JSON.stringify(data)})
  await call('workspaces',{name:'Research'})
  const {id}=await(await call('pages',{title:'Context page',content:'Original observation'})).json()
  const uploaded=await fetch(host.url+'/api/pages/'+id+'/files?name=badge.md',{method:'POST',headers:{Authorization:'Bearer write'},body:'🧭 Field badge 742'})
  assert.equal(uploaded.status,200)
  const chat=await(await call('agent/chats',{})).json(),other=await(await call('agent/chats',{})).json()
  const path='agent/chats/'+chat.id
  const send=async(channel:string,text:string,linked:boolean)=>{
    const result=await call(channel+'/turn',{page:null,text,background:true,allowEdits:false,...(linked&&{references:[id],blockLinks:[{id,block:'@import'}]})})
    assert.equal(result.status,202)
    assert.equal((await(await call(channel)).json()).messages.at(-1).status,'complete')
  }
  const report=await(await call('pages/import-markdown',{title:'Independent report',content:'Introduction\n\nField badge measured at noon'})).json()
  await send('agent/chats/'+other.id,'Other conversation',true)
  foreignMessage=(await(await call('agent/chats/'+other.id)).json()).messages.at(-1).id
  await send(path,'Original prompt',true)
  const saved=(await(await call(path)).json()).messages.at(-1).sources.find((source:{id:number;block?:string})=>source.id===report.id&&source.block)
  assert.equal(saved.excerpt,'measured at noon')
  for(let i=0;i<12;i++)await send(path,'Later turn '+i,i<4)
  const {pending}=await(await call('proposals',{page:id,edit:{block:'@import',before:'Original observation',after:'New observation'}})).json()
  assert.equal((await call('proposals/'+pending+'/approve',{})).status,200)
  const reportBlocks=(await(await call('source?id='+report.id+'&blocks=1')).json()).blocks
  const revision=await(await call('proposals',{page:report.id,edit:{block:reportBlocks[1].id,before:'Field badge measured at noon',after:'Revised instrument reading: Field badge measured at noon'}})).json()
  assert.equal((await call('proposals/'+revision.pending+'/approve',{})).status,200)
  await host.close();host=await open()
  await send(path,'Find my original links',false)
  assert.equal((await(await call(path)).json()).messages.at(-1).text,'New observation')
  const trash=await fetch(host.url+'/api/pages/'+id,{method:'PATCH',headers:{Authorization:'Bearer write','Content-Type':'application/json'},body:JSON.stringify({deleted:true})})
  assert.equal(trash.status,200)
  const duplicate=await(await call('proposals',{page:report.id,edit:{block:reportBlocks[1].id,before:'Revised instrument reading: Field badge measured at noon',after:'A: measured at noon. B: measured at noon.'}})).json()
  assert.equal((await call('proposals/'+duplicate.pending+'/approve',{})).status,200)
  await send(path,'Check the removed source',false)
  assert.equal((await(await call(path)).json()).messages.at(-1).text,'Source unavailable')
})

test('a collaborator editing a block during a turn requires a fresh read before a proposal is recorded',async t=>{
  const read=new EventEmitter()
  const resume=once(read,'resume'),started=once(read,'started')
  const host=await serve({file:':memory:',assets:'.',editorKey:'write',desktop:true,provider:{get:()=>({key:'fixture',model:'fixture'})},
    backgroundEnvironment:{async run(turn){
      const {id,blocks}=turn.current!,block=blocks[0].id
      assert.equal(blocks[0].text,'First observation')
      read.emit('started');await resume
      assert.throws(()=>turn.tools.propose!(id,block,'Revision of old text'),{status:409})
      const updated=turn.tools.read(id,block)
      assert.equal(updated.blocks[0].text,'Second observation')
      turn.tools.propose!(id,block,'Revised second observation')
      turn.publish('Ready for review')
    }}})
  t.after(async()=>{read.emit('resume');await host.close()})
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer write','Content-Type':'application/json'},body:JSON.stringify(data)})
  await call('workspaces',{name:'Research'})
  const {id}=await(await call('pages',{title:'Log',content:'First observation'})).json()
  const chat=await(await call('agent/chats',{})).json(),path='agent/chats/'+chat.id
  await call(path+'/turn',{page:id,text:'Revise the observation',background:true})
  await started
  const {pending}=await(await call('proposals',{page:id,edit:{block:'@import',before:'First observation',after:'Second observation'}})).json()
  assert.equal((await call('proposals/'+pending+'/approve',{})).status,200)
  read.emit('resume')
  const result=await(await call(path)).json()
  assert.equal(result.messages.at(-1).status,'complete')
  assert.deepEqual(result.edits.map(edit=>[edit.before,edit.after]),[['Second observation','Revised second observation']])
  assert.equal((await(await call('source?id='+id)).json()).text,'Second observation')
  assert.equal((await call(path+'/edits/'+result.edits[0].id+'/apply',{})).status,200)
  assert.equal((await(await call('source?id='+id)).json()).text,'Revised second observation')
})
