/** Durable chat scheduling, author controls and restart recovery through the authenticated host API. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomBytes} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {serve} from '../../src/server/service.ts'
import {codexTurn} from '../../src/server/codex-turn.ts'
import type {LiveSteer} from '../../src/server/agent-environment.ts'

test('queued turns survive restart, preserve FIFO and revisions, and enforce authorship',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chat-queue-')),runs:string[]=[]
  let ready=true
  const start=()=>serve({file:join(dir,'workspace.sqlite'),assets:dir,registration:true,provider:{get:()=>({key:'',agent:ready?'codex':undefined,model:'test'})},
    backgroundEnvironment:{async run(turn){
      const text=turn.history.at(-1)!.content
      runs.push(text)
      if(text==='hold')await new Promise<void>(resolve=>turn.signal.addEventListener('abort',()=>resolve(),{once:true}))
      else turn.publish(text)
    }}})
  let host=await start()
  t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
  const request=(path:string,body?:object,cookie='')=>fetch(host.url+'/api/'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body&&JSON.stringify(body)})
  const signup=async(username:string)=>(await request('register',{username,password:'fixture-passphrase'})).headers.get('set-cookie')!.split(';')[0]!
  const owner=await signup('owner'),writer=await signup('writer')
  const {id:ws}=await(await request('workspaces',{name:'Queue'},owner)).json()
  const call=(route:string,body?:object,actor=owner)=>request(route+'?workspace='+ws,body,actor)
  const {id:invite}=await(await call('workspaces/invitations',{username:'writer',role:'editor'})).json()
  await request('invitations/'+invite+'/accept',{},writer)
  const {id}=await(await call('agent/chats',{})).json(),path='agent/chats/'+id
  await call(path+'/turn',{text:'hold',page:null,background:true})
  const input=(text:string)=>({text,page:null,background:true,operationId:randomBytes(16).toString('hex')})
  const a=input('first')
  const {queued}=await(await call(path+'/queue',a)).json()
  assert.equal((await(await call(path+'/queue',a)).json()).queued,queued)
  const route=path+'/queue/'+queued
  assert.equal((await call(route+'/delete',{revision:1},writer)).status,403)
  assert.equal((await call(route+'/edit',{revision:1,...input('revised')})).status,200)
  assert.equal((await call(route+'/delete',{revision:1})).status,409)
  const {queued:removed}=await(await call(path+'/queue',input('removed'))).json()
  await call(path+'/queue/'+removed+'/delete',{revision:1})
  await call(path+'/queue',input('second'))
  await host.close()
  ready=false;host=await start()
  await delay(650);assert.deepEqual(runs,['hold'])
  ready=true
  for(let i=0;i<60&&runs.length<3;i++)await delay(100)
  assert.deepEqual(runs,['hold','revised','second'])
  const cookie=(await request('login',{username:'owner',password:'fixture-passphrase'})).headers.get('set-cookie')!.split(';')[0]!
  assert.deepEqual((await(await call(path,undefined,cookie)).json()).queue,[])
})

test('Codex only acknowledges steering for the expected active turn',async()=>{
  let handler:LiveSteer|undefined
  const frames:object[]=[]
  const exchange=codexTurn('/tmp','prompt',{},()=>{},next=>{handler=next})
  const receive=(event:object)=>exchange.receive(JSON.stringify(event),frame=>frames.push(frame),()=>{})
  receive({id:3,result:{thread:{id:'thread'}}})
  receive({id:4,result:{turn:{id:'active'}}})
  const pending=handler!('Follow up')
  assert.deepEqual(frames.at(-1),{id:5,method:'turn/steer',params:{threadId:'thread',expectedTurnId:'active',input:[{type:'text',text:'Follow up',text_elements:[]}]}})
  receive({id:5,result:{turnId:'active'}});assert.equal(await pending,true)
  const rejected=handler!('Another');receive({id:6,error:{code:-32601}});assert.equal(await rejected,false)
  const uncertain=handler!('Last');receive({id:7,result:{turnId:'different'}});await assert.rejects(uncertain,/acknowledgement/)
})

test('live steering records acknowledged instructions and holds ambiguous delivery for review',async t=>{
  const instructions:string[]=[]
  const host=await serve({file:':memory:',assets:tmpdir(),editorKey:'test',provider:{get:()=>({agent:'codex',key:'',model:'fixture'})},
    backgroundEnvironment:{async run(turn){
      turn.registerSteer!(async instruction=>{
        instructions.push(instruction)
        if(instructions.length===2)throw Error('No acknowledgement')
        return true
      })
      await new Promise<void>(resolve=>turn.signal.addEventListener('abort',()=>resolve(),{once:true}))
    }}})
  t.after(()=>host.close())
  let cookie=''
  const call=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:data&&JSON.stringify(data)})
  cookie=(await call('login',{key:'test'})).headers.get('set-cookie')!.split(';')[0]!
  await call('workspaces',{name:'Field'})
  const {id:page}=await(await call('pages',{title:'Target',content:'Field notes'})).json()
  const {id}=await(await call('agent/chats',{})).json(),path='agent/chats/'+id
  const {task:message}=await(await call(path+'/turn',{page,text:'Hold',background:true})).json()
  for(const [index,text] of ['Look here','One more'].entries()){
    const {queued}=await(await call(path+'/queue',{text,page,surface:'canvas',background:true,operationId:randomBytes(16).toString('hex')})).json()
    const result=await call(path+'/queue/'+queued+'/steer',{revision:1,message})
    assert.equal(result.ok,index===0)
  }
  const history=await(await call(path)).json()
  assert.equal(instructions.length,2)
  assert.match(instructions[0]!,/Field notes/)
  assert.ok(Array.isArray(JSON.parse(instructions[0]!).context[0].canvas.elements))
  assert.equal(history.messages.filter((m:{text:string})=>m.text==='Look here').length,1)
  assert.match(history.queue[0].error,/unconfirmed/i)
  await call(path+'/stop',{message})
  await delay(650)
  assert.equal((await(await call(path)).json()).queue.length,1)
})
