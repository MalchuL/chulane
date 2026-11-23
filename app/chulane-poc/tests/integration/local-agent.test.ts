/** Verify desktop executable discovery using an isolated home and an empty launch PATH. */
import assert from 'node:assert/strict'
import {copyFile,mkdir,mkdtemp,rm,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {serve} from '../../src/server/service.ts'
import {checkLocalAgent} from '../../src/server/local-agent.ts'

const codexHelp='--stdio --disable'

test('a desktop launcher can reach user-installed Codex with a minimal PATH', {skip:process.platform==='win32'},async t=>{
  const home=await mkdtemp(join(tmpdir(),'chulane-cli-home-'))
  t.after(()=>rm(home,{recursive:true,force:true}))
  const bin=join(home,'.local','bin')
  await mkdir(bin,{recursive:true})
  const install=(help:string)=>writeFile(join(bin,'codex'),'#!/bin/sh\ncase "$1 $2" in "login status") exit 0;; "app-server --help") echo "'+help+'";; *) exit 1;; esac\n',{mode:0o700})
  await install(codexHelp.replace('--stdio','--stdio-preview'))
  for(const [key,value] of Object.entries({HOME:home,PATH:home,CHULANE_CODEX_PATH:''})){
    const previous=process.env[key]
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous})
    process.env[key]=value
  }
  await assert.rejects(checkLocalAgent('codex'),/Update Codex CLI.*--stdio/)
  await install(codexHelp)
  await checkLocalAgent('codex')
  await writeFile(join(bin,'codex'),'#!/bin/sh\nexit 1\n')
  await assert.rejects(checkLocalAgent('codex'),/run codex login/i)
  process.env.CHULANE_CODEX_PATH=join(home,'missing')
  await assert.rejects(checkLocalAgent('codex'),{code:'ENOENT',message:/CHULANE_CODEX_PATH/})
})

test('a GUI launch can run a Homebrew CLI and its adjacent Node runtime', {skip:process.platform==='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'chulane GUI launcher '))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const prefix=join(root,'brew tools'),bin=join(prefix,'bin')
  await mkdir(bin,{recursive:true})
  await symlink(process.execPath,join(bin,'node'))
  const program=join(bin,'claude')
  await writeFile(program,'#!/usr/bin/env node\n'+
    'if(process.argv.includes("--version"))process.exit(0)\n'+
    'process.exit(process.argv.slice(-2).join(" ")==="auth status"&&require("node:fs").existsSync(__dirname+"/session")?0:1)\n',{mode:0o700})
  for(const [key,value] of Object.entries({HOME:root,PATH:root,HOMEBREW_PREFIX:prefix,CHULANE_CLAUDE_PATH:''})){
    const previous=process.env[key]
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous})
    process.env[key]=value
  }
  await assert.rejects(checkLocalAgent('claude'),/claude auth login/i)
  await writeFile(join(bin,'session'),'signed in')
  await checkLocalAgent('claude')
  process.env.CHULANE_CLAUDE_PATH=program
  delete process.env.HOMEBREW_PREFIX
  await checkLocalAgent('claude')
  assert.equal(process.env.PATH,root)
})

test('Hermes selection requires the chat options used by the adapter', {skip:process.platform==='win32'},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-hermes-cli-'))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const executable=join(dir,'hermes')
  const previous=process.env.CHULANE_HERMES_PATH
  t.after(()=>{if(previous===undefined)delete process.env.CHULANE_HERMES_PATH;else process.env.CHULANE_HERMES_PATH=previous})
  process.env.CHULANE_HERMES_PATH=executable
  const cli=(help:string)=>writeFile(executable,'#!/bin/sh\nif [ "$1" = --version ]; then exit 0; fi\n[ "$1 $2" = "chat --help" ] || exit 1\necho "'+help+'"\n',{mode:0o700})
  const options='--oneshot --query-file --toolsets --source --format {text,stream-json}'
  await cli(options+' --safe-mode-preview')
  await assert.rejects(checkLocalAgent('hermes'),/--safe-mode/)
  await cli(options.replace('stream-json','json')+' --safe-mode')
  await assert.rejects(checkLocalAgent('hermes'),/stream-json/)
  await cli(options+' --safe-mode')
  await checkLocalAgent('hermes')
})

test('a Hermes initialization failure gives the workspace a safe setup hint', {skip:process.platform==='win32'},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-hermes-init-'))
  const binary=join(dir,'hermes')
  const previous=process.env.CHULANE_HERMES_PATH
  t.after(async()=>{
    if(previous===undefined)delete process.env.CHULANE_HERMES_PATH
    else process.env.CHULANE_HERMES_PATH=previous
    await rm(dir,{recursive:true,force:true})
  })
  process.env.CHULANE_HERMES_PATH=binary
  const host=await serve({file:':memory:',assets:dir,desktop:true,editorKey:'write',provider:{get:()=>({agent:'hermes',key:'',model:''})}})
  t.after(()=>host.close())
  const post=(path:string,data:object)=>fetch(host.url+'/api/'+path,{method:'POST',headers:{Authorization:'Bearer write','Content-Type':'application/json'},body:JSON.stringify(data)})
  await post('workspaces',{name:'Survey'})
  const {id}=await(await post('agent/chats',{})).json()
  for(const error of ['credentials or agent init failed','private-provider-detail']){
    const result=JSON.stringify({type:'result',exit_code:1,error,text:'private-provider-detail'})
    await writeFile(binary,"#!/bin/sh\necho 'private-provider-detail' >&2\necho '"+result+"'\nexit 1\n",{mode:0o700})
    const events=await(await post('agent/chats/'+id+'/turn',{text:'Read the page',page:null})).text()
    assert.match(events,error==='private-provider-detail'?/Check the CLI version/:/Hermes could not initialize.*hermes chat --safe-mode/)
    assert.doesNotMatch(events,/private-provider-detail/)
  }
})

test('Windows npm Codex discovery follows the selected prefix and CPU architecture',async t=>{
  const {findWindowsNpmCodex}=await import('../../src/server/windows-codex.ts')
  const root=await mkdtemp(join(tmpdir(),'chulane windows npm '))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const prefix=join(root,'npm tools'),modules=join(prefix,'node_modules')
  await mkdir(prefix)
  await writeFile(join(prefix,'codex.cmd'),'unused npm launcher')
  for(const [arch,triple,base] of [
    ['x64','x86_64',modules],
    ['arm64','aarch64',join(modules,'@openai','codex','node_modules')],
  ] as const){
    const folder=join(base,'@openai','codex-win32-'+arch,'vendor',triple+'-pc-windows-msvc','bin')
    await mkdir(folder,{recursive:true})
    const binary=join(folder,'codex.exe')
    await writeFile(binary,'fixture')
    assert.equal(await findWindowsNpmCodex([join(root,'absent'),prefix],arch),binary)
  }
  assert.equal(await findWindowsNpmCodex([join(root,'absent')],'x64'),undefined)
})

test('Windows desktop connection checks run the executable behind an npm shim',{skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'chulane npm connection '))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const cpu=process.arch==='arm64'?'aarch64':'x86_64'
  const bin=join(root,'node_modules','@openai','codex-win32-'+process.arch,'vendor',cpu+'-pc-windows-msvc','bin')
  await mkdir(bin,{recursive:true})
  const shim=join(root,'codex.cmd')
  await writeFile(shim,'@exit /b 7')
  await copyFile(process.execPath,join(bin,'codex.exe'))
  const probe=join(root,'login-probe.cjs')
  await writeFile(probe,"if(require('node:path').basename(process.argv[1])==='app-server'&&process.argv[2]==='--help'){console.log("+JSON.stringify(codexHelp)+");process.exit(0)}process.exit(require('node:path').basename(process.argv[1])==='login'&&process.argv[2]==='status'?0:1)")
  for(const [key,value] of Object.entries({CHULANE_CODEX_PATH:shim,NODE_OPTIONS:'--require='+JSON.stringify(probe.replaceAll('\\','/'))})){
    const previous=process.env[key]
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous})
    process.env[key]=value
  }
  await checkLocalAgent('codex')
})

test('Hermes publishes a partial answer to the shared chat before its process exits', {skip:process.platform==='win32',timeout:20000},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-hermes-stream-'))
  const binary=join(dir,'hermes'),gate=join(dir,'finish')
  const previous=process.env.CHULANE_HERMES_PATH
  t.after(async()=>{
    if(previous===undefined)delete process.env.CHULANE_HERMES_PATH
    else process.env.CHULANE_HERMES_PATH=previous
    await rm(dir,{recursive:true,force:true})
  })
  process.env.CHULANE_HERMES_PATH=binary
  await writeFile(binary,'#!'+process.execPath+'\n'+`
const fs=require('node:fs')
const emit=value=>console.log(JSON.stringify(value))
emit({type:'text',text:'{"message":"First'})
const timer=setInterval(()=>{
  if(!fs.existsSync(${JSON.stringify(gate)}))return
  clearInterval(timer)
  emit({type:'text',text:' reply","actions":[]}'})
  emit({type:'result',exit_code:0,text:JSON.stringify({message:'First reply',actions:[]})})
},20)
`,{mode:0o700})
  const host=await serve({file:':memory:',assets:dir,desktop:true,editorKey:'write',provider:{get:()=>({agent:'hermes',key:'',model:''})}})
  const signal=AbortSignal.timeout(12000)
  t.after(()=>host.close())
  const api=(path:string,data?:object)=>fetch(host.url+'/api/'+path,{headers:{Authorization:'Bearer write','Content-Type':'application/json'},method:data?'POST':'GET',body:JSON.stringify(data),signal})
  await api('workspaces',{name:'Survey'})
  const {id}=await(await api('agent/chats',{})).json()
  const chat='agent/chats/'+id
  const response=await api(chat+'/turn',{text:'Send a reply',page:null})
  try{
    const reader=response.body!.pipeThrough(new TextDecoderStream()).getReader()
    let wire=''
    while(!wire.includes('"delta":"First"')){
      const {done,value}=await reader.read()
      assert.ok(!done,'stream ended before the first delta')
      wire+=value
    }
    const current=async()=>(await(await api(chat)).json()).messages.at(-1)
    assert.equal((await current()).text,'First')
    assert.equal((await current()).status,'running')
    await writeFile(gate,'')
    while(!(await reader.read()).done){}
    const final=await current()
    assert.equal(final.status,'complete')
    assert.equal(final.text,'First reply')
  }finally{await writeFile(gate,'')}
})

test('Claude streams public thinking and structured message text through split Unicode escapes',async()=>{
  const {localReplyStream}=await import('../../src/server/local-agent-stream.ts')
  const text:string[]=[],events:unknown[]=[]
  const stream=localReplyStream('claude',2,delta=>text.push(delta),event=>events.push(event))
  const emit=(event:object)=>stream.consume(JSON.stringify({type:'stream_event',event}))
  emit({type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'Checking the page.'}})
  emit({type:'content_block_stop',index:0})
  emit({type:'content_block_start',index:1,content_block:{name:'StructuredOutput'}})
  emit({type:'content_block_delta',index:2,delta:{partial_json:'{"message":"other tool data'}})
  const json=(partial_json:string)=>emit({type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json}})
  json('{"message":"Map \\uD8')
  assert.deepEqual(text,['Map '])
  json('3D\\uDD')
  assert.deepEqual(text,['Map '])
  json('FA","actions":[]}')
  const answer={message:'Map 🗺',actions:[]}
  stream.consume(JSON.stringify({type:'result',structured_output:answer}))
  stream.finish(JSON.parse(stream.output()).message)
  assert.deepEqual(text,['Map ','🗺'])
  assert.deepEqual(events,[{type:'reasoning',key:'2/0',text:'Checking the page.'},{type:'reasoning-end',key:'2/0'}])
})

test('Codex partial answers stream as visible updates and cannot complete a structured turn',async()=>{
  const {localReplyStream}=await import('../../src/server/local-agent-stream.ts')
  const text:string[]=[],events:unknown[]=[]
  const stream=localReplyStream('codex',0,delta=>text.push(delta),event=>events.push(event))
  const send=(method:string,params:object)=>stream.consume(JSON.stringify({method,params}))
  const item={id:'p',type:'agentMessage',phase:'partial_answer'}
  send('item/started',{item})
  send('item/agentMessage/delta',{itemId:'p',delta:'Found '})
  assert.deepEqual(events,[{type:'commentary',key:'0/p',text:'Found '}])
  send('item/completed',{item:{...item,text:'Found the page.'}})
  assert.deepEqual(events.slice(1),[{type:'commentary',key:'0/p',text:'the page.'},{type:'commentary-end',key:'0/p'}])
  assert.throws(()=>stream.output(),/structured reply/)
  const structured={...item,id:'s'},reply='{"actions":[],"message":"Ready"}'
  send('item/started',{item:structured})
  send('item/agentMessage/delta',{itemId:'s',delta:'{"actions":[],'})
  assert.equal(events.length,3)
  send('item/completed',{item:{...structured,text:reply}})
  assert.deepEqual(events.slice(3),[{type:'commentary',key:'0/s',text:'Ready'},{type:'commentary-end',key:'0/s'}])
  assert.throws(()=>stream.output(),/structured reply/)
  assert.deepEqual(text,[])
  send('item/completed',{item:{...item,id:'a',phase:'final_answer',text:reply}})
  assert.equal(stream.output(),reply)
  assert.deepEqual(text,['Ready'])
})

test('local providers publish answer fragments before completion, including when actions come first',async()=>{
  const {localReplyStream}=await import('../../src/server/local-agent-stream.ts')
  for(const agent of ['codex','hermes','claude'] as const){
    const text:string[]=[],events:unknown[]=[]
    const stream=localReplyStream(agent,0,delta=>text.push(delta),event=>events.push(event))
    const send=(record:object)=>stream.consume(JSON.stringify(record))
    const first='{"actions":[],"message":"Read '
    const last='the page."}'
    const answer=JSON.parse(first+last)
    if(agent==='codex'){
      send({method:'item/reasoning/textDelta',params:{itemId:'r',delta:'Private provider data'}})
      assert.equal(events.length,0)
      send({method:'item/reasoning/summaryTextDelta',params:{itemId:'r',summaryIndex:0,delta:'Checking pages.'}})
      assert.equal(events.length,1)
      send({method:'item/started',params:{item:{type:'agentMessage',id:'a',phase:'final_answer'}}})
    }
    if(agent==='claude')send({type:'stream_event',event:{type:'content_block_start',index:1,content_block:{name:'StructuredOutput'}}})
    const delta=(part:string)=>{
      if(agent==='codex')send({method:'item/agentMessage/delta',params:{itemId:'a',delta:part}})
      else if(agent==='hermes')send({type:'text',text:part})
      else send({type:'stream_event',event:{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:part}}})
    }
    delta(first)
    assert.deepEqual(text,['Read '],agent)
    delta(last)
    assert.deepEqual(text,['Read ','the page.'],agent)
    if(agent==='codex')send({method:'item/completed',params:{item:{id:'a',type:'agentMessage',text:first+last}}})
    else if(agent==='hermes')send({type:'result',exit_code:0,text:first+last})
    else send({type:'result',structured_output:answer})
    stream.finish(JSON.parse(stream.output()).message)
    assert.equal(text.join(''),answer.message)
  }
})
