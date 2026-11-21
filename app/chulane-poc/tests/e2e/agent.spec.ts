/** Exercise Mastra's real HTTP streaming and tool loop against a scripted OpenAI endpoint in both renderers. */
import {chromium,_electron as electron,expect,type Page} from '@playwright/test'
import {createServer} from 'node:http'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {delimiter,join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {serve} from '../../src/server/service.ts'

const dir=await mkdtemp(join(tmpdir(),'chulane-agent-ui-'))
let steps:((input:any)=>{name:string;args:object}|string)[]=[]
let fixtureError:unknown
const fixture=createServer(async(req,res)=>{
  try{
    expect(req.url).toBe('/v1/chat/completions')
    expect(req.headers.authorization).toBe('Bearer fixture-key')
    let data='';for await(const chunk of req)data+=chunk
    const input=JSON.parse(data)
    expect(input.tools.map(t=>t.function.name)).toContain('proposeEdit')
    const step=steps.shift()
    if(!step)throw Error('Unexpected model step')
    const output=step(input)
    if(output==='FAIL'){res.writeHead(401);res.end('{"error":{"message":"invalid key"}}');return}
    res.writeHead(200,{'Content-Type':'text/event-stream'})
    const emit=(delta:object,finish_reason:string|null)=>res.write('data: '+JSON.stringify({id:'chatcmpl-smoke',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta,finish_reason}]})+'\n\n')
    if(typeof output==='string'){
      emit({role:'assistant',content:output==='WAIT'?'Partial answer':output},null)
      if(output==='WAIT')return
      emit({},'stop')
    }else{
      emit({role:'assistant',tool_calls:[{index:0,id:'call-'+steps.length,type:'function',function:{name:output.name,arguments:JSON.stringify(output.args)}}]},null);emit({},'tool_calls')
    }
    res.end('data: [DONE]\n\n')
  }catch(error){fixtureError=error;res.writeHead(400);res.end('fixture assertion failed')}
})
await new Promise<void>(ok=>fixture.listen(0,'127.0.0.1',ok))
const url='http://127.0.0.1:'+(fixture.address() as {port:number}).port+'/v1'
const settings={key:'fixture-key',model:'fixture',url}
const host=await serve({file:join(dir,'web.sqlite'),assets:resolve('dist'),editorKey:'edit',viewerKey:'view',provider:{get:()=>settings}})

/** Seed two real Rivto pages and verify open-page undo, cross-page edits, stale approvals and interruption. */
async function exercise(p:Page,configure=false){
  await p.getByRole('button',{name:'Agent',exact:true}).waitFor()
  const name='Field notebook', target='Roadmap'
  const api=(suffix:string,data:object)=>p.evaluate(async({suffix,data})=>{
    const r=await fetch('/api/'+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
    if(!r.ok)throw Error(await r.text());return r.json()
  },{suffix,data})
  const current=await api('pages',{title:name,content:'Red fox'})
  const other=await api('pages',{title:target,content:'Initial roadmap'})
  await p.reload()
  const side=p.getByRole('complementary',{name:'Workspace agent'})
  await p.getByRole('button',{name:new RegExp(name)}).click()
  const field=p.locator('[data-block-content]').first()
  await field.fill('Fresh red fox')
  await p.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(side.getByRole('button',{name:'Send',exact:true})).toBeVisible()
  if(configure){
    await side.getByLabel('OpenAI API key').fill('fixture-key')
    await side.getByRole('button',{name:'Save provider'}).click()
    await expect(side.getByRole('button',{name:'Provider settings'})).toBeVisible()
  }
  async function send(text:string){await side.getByLabel('Message the agent').fill(text);await side.getByRole('button',{name:'Send',exact:true}).click()}
  const addPage=side.getByRole('button',{name:'Add page',exact:true})
  await addPage.focus();await addPage.press('Enter')
  const picker=p.getByRole('dialog',{name:'Add page to context'})
  await picker.getByLabel('Find a page').fill('road')
  await picker.getByRole('button',{name:target}).press('Enter')
  await side.getByRole('button',{name:'Remove '+target}).click()
  const handle=await p.getByRole('button',{name:'Drag '+target+' to chat'}).boundingBox()
  const area=await side.getByRole('form',{name:'Chat composer'}).boundingBox()
  if(!handle||!area)throw Error('Workspace page handle or drop target missing')
  await p.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await p.mouse.down()
  await p.mouse.move(handle.x+handle.width/2+10,handle.y+handle.height/2,{steps:4})
  await p.mouse.move(area.x+area.width/2,area.y+area.height/2,{steps:25})
  await expect(side.getByRole('form',{name:'Chat composer'})).toHaveAttribute('data-drag','over')
  await p.mouse.up()
  await expect(side.getByRole('button',{name:'Remove '+target})).toBeVisible()
  await field.click();await field.press('End');await field.press('Enter')
  const fields=p.locator('[data-block-content]')
  await fields.nth(1).fill('Second observation')
  await expect(p.locator('[data-dnd-dropping]')).toHaveCount(0)
  const first=(await field.boundingBox())!,second=(await fields.nth(1).boundingBox())!
  await p.mouse.move(first.x+10,first.y+first.height/2);await p.mouse.down()
  await p.mouse.move(second.x+30,second.y+second.height/2,{steps:15});await p.mouse.up()
  await expect(p.locator('[data-block-selected=true]')).toHaveCount(2)
  const originalIds=await fields.evaluateAll(elements=>elements.map(el=>el.closest('[data-block-id]')!.getAttribute('data-block-id')))
  const linkHandle=p.getByRole('button',{name:'Drag block links to chat'}).nth(1)
  const grip=(await linkHandle.boundingBox())!
  await p.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await p.mouse.down()
  await p.mouse.move(grip.x+grip.width/2+10,grip.y+grip.height/2,{steps:4})
  await p.mouse.move(area.x+area.width/2,area.y+area.height/2,{steps:25})
  await expect(side.getByRole('form',{name:'Chat composer'})).toHaveAttribute('data-drag','over')
  await p.mouse.up()
  await expect(side.getByRole('button',{name:/Remove block link/})).toHaveCount(2,{timeout:2500})
  await expect(fields).toHaveText(['Fresh red fox','Second observation'])
  await expect(side.getByLabel('Message the agent')).toHaveValue('')
  expect(await fields.evaluateAll(elements=>elements.map(el=>el.closest('[data-block-id]')!.getAttribute('data-block-id')))).toEqual(originalIds)
  let block=''
  const source=(input:any)=>JSON.parse(input.messages.filter(m=>m.role==='user').at(-1).content).currentDocument
  steps=[i=>{const prompt=JSON.parse(i.messages.filter(m=>m.role==='user').at(-1).content)
    expect(prompt.referencedBlocks.map(b=>b.block)).toEqual(originalIds)
    expect(prompt.referencedBlocks.map(b=>b.text)).toEqual(['Fresh red fox','Second observation'])
    expect(prompt.referencedDocuments[0].blocks[0].text).toBe('Initial roadmap')
    const page=source(i);expect(page.blocks[0].text).toBe('Fresh red fox');block=page.blocks[0].id;return {name:'proposeEdit',args:{id:current.id,block,text:'Fresh blue fox'}}},()=> 'Review the color change.']
  await send('Change red to blue')
  await expect(side.getByText('Review the color change.')).toBeVisible({timeout:25000})
  await expect(side.getByRole('button',{name:'Remove '+target})).toHaveCount(0)
  await expect(side.getByRole('link',{name:/Second observation/})).toHaveAttribute('href',/block=/)
  await side.getByRole('button',{name:'Apply',exact:true}).click()
  await expect(field).toHaveText('Fresh blue fox')
  await field.click();await p.keyboard.press('Control+z')
  await expect(field).toHaveText('Fresh red fox')
  steps=[()=>({name:'searchPages',args:{query:'Roadmap'}}),i=>{
    expect(JSON.stringify(i.messages.at(-1))).toContain(target);return {name:'readPage',args:{id:other.id,offset:0}}
  },i=>{expect(JSON.stringify(i.messages.at(-1))).toContain('Initial roadmap');return {name:'proposeEdit',args:{id:other.id,block:'',text:'Ship it on Friday'}}},()=> 'Review the Roadmap addition.']
  await send('Add a launch date to Roadmap')
  await expect(side.getByText('Review the Roadmap addition.')).toBeVisible({timeout:25000})
  await p.reload();await p.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(side.getByRole('link',{name:/Second observation/})).toHaveAttribute('href','?workspace=1&page='+current.id+'&block='+encodeURIComponent(originalIds[1]!))
  await side.getByRole('button',{name:'Apply',exact:true}).click()
  await side.getByRole('link',{name:'Open page',exact:true}).last().click()
  await expect(p.locator('.page-surface')).toContainText('Ship it on Friday')
  steps=[i=>{const doc=source(i);return {name:'proposeEdit',args:{id:other.id,block:doc.blocks[0].id,text:'Stale change'}}},()=> 'Check this revision.']
  await send('Revise the introduction')
  await expect(side.getByText('Check this revision.')).toBeVisible()
  await field.fill('Concurrent change')
  await side.getByRole('button',{name:'Apply',exact:true}).click()
  await expect(side.getByRole('alert')).toContainText('target block changed')
  await expect(field).toHaveText('Concurrent change')
  await side.getByRole('button',{name:'Dismiss',exact:true}).click()
  steps=[()=> 'WAIT'];await send('Wait')
  await expect(side.getByText('Partial answer')).toBeVisible()
  await side.getByRole('link',{name:/Second observation/}).click()
  await expect(p.locator('[data-source-page="'+current.id+'"] [data-block-content]').nth(1)).toBeInViewport()
  await expect(side.getByRole('button',{name:'Stop response'})).toBeVisible()
  await p.reload();await p.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(side.getByText('Turn interrupted')).toBeVisible()
  await expect(side.getByText('Partial answer')).toBeVisible()
  steps=[()=> 'FAIL'];await send('Check provider')
  await expect(side.getByRole('alert')).toContainText('Provider request failed')
  expect(steps).toHaveLength(0)
}

let browser,desktop
try{
  browser=await chromium.launch();const p=await browser.newPage()
  await p.goto(host.url);await p.getByLabel('Workspace access key').fill('edit');await p.getByRole('button',{name:'Open library'}).click()
  await exercise(p)
  const switchResponse=await p.request.post(host.url+'/api/agent/provider',{data:{agent:'codex'}})
  expect(switchResponse.status()).toBe(403)
  const reader=await browser.newPage();await reader.goto(host.url);await reader.getByLabel('Workspace access key').fill('view');await reader.getByRole('button',{name:'Open library'}).click()
  await reader.getByRole('button',{name:'Agent',exact:true}).click();await expect(reader.getByText('Read-only conversation')).toBeVisible()
  await expect(reader.getByText('Partial answer')).toBeVisible()
  // Real child processes exercise stdin, output formats and the desktop-only executable selection.
  for(const agent of ['codex','claude','hermes']){
    await writeFile(join(dir,agent),`#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv.includes('--version')||process.argv.includes('login')) process.exit(0);
const {context,results}=JSON.parse(fs.readFileSync(0,'utf8'));
if(context.history.at(-1).content==='Wait locally'){setInterval(()=>{},1000);return;}
const {id,blocks}=context.currentDocument;
const answer=results.length?{message:'Local '+${JSON.stringify(agent)}+' finished.',actions:[]}:{message:'',actions:[{type:'propose',id,block:blocks[0].id,text:'Local edit from '+${JSON.stringify(agent)}}]};
const wrapper=${JSON.stringify(agent)}==='claude'?{structured_output:answer}:${JSON.stringify(agent)}==='hermes'?{type:'result',exit_code:0,text:JSON.stringify(answer)}:answer;
console.log(JSON.stringify(wrapper));
`,{mode:0o700})
  }
  const desktopOptions={args:['.','--user-data-dir='+join(dir,'desktop')],env:{...process.env,PATH:dir+delimiter+process.env.PATH,CHULANE_LOCAL_AGENT:'',OPENAI_API_KEY:'',CHULANE_AI_MODEL:'fixture',CHULANE_OPENAI_BASE_URL:url}}
  desktop=await electron.launch(desktopOptions)
  await exercise(await desktop.firstWindow(),true)
  const local=await desktop.firstWindow()
  const side=local.getByRole('complementary',{name:'Workspace agent'})
  await local.getByRole('main').getByRole('button',{name:/^Field notebook/}).click()
  await expect(local.locator('[data-block-content]').first()).toHaveText('Fresh red fox')
  for(const agent of ['codex','claude','hermes']){
    await side.getByRole('button',{name:'Provider settings'}).click()
    await side.getByLabel('Connection',{exact:true}).selectOption(agent)
    await side.getByRole('button',{name:'Use local '+agent}).click()
    await expect(side.getByText('Connected to local '+agent+'.')).toBeVisible()
    await side.getByLabel('Message the agent').fill('Revise the first paragraph')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    await expect(side.getByText('Local '+agent+' finished.')).toBeVisible()
    await expect(local.locator('[data-block-content]').first()).not.toHaveText('Local edit from '+agent)
    await side.getByRole('button',{name:'Apply',exact:true}).click()
    await expect(local.locator('[data-block-content]').first()).toHaveText('Local edit from '+agent)
  }
  const interrupted=side.locator('article').getByText('Turn interrupted',{exact:true})
  const previousInterruptions=await interrupted.count()
  await side.getByLabel('Message the agent').fill('Wait locally')
  await side.getByRole('button',{name:'Send',exact:true}).click()
  await expect(side.getByText('Responding…')).toBeVisible()
  await side.getByRole('button',{name:'Stop response'}).click()
  await expect(interrupted).toHaveCount(previousInterruptions+1)
  await local.getByRole('button',{name:'All pages',exact:true}).last().click()
  await expect(local.locator('.library')).toBeVisible()
  await desktop.close()
  desktop=await electron.launch(desktopOptions)
  const reopened=await desktop.firstWindow()
  await reopened.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(reopened.getByText('Messages and page context are sent to local hermes.')).toBeVisible()
  console.log('Local Codex, Claude Code and Hermes selections, proposals, approval and restart passed with CLI fixtures.')
  console.log('Mastra sidebar, checkpoint, same-page undo, cross-page edits, stale review, interruption and provider failures passed in Chromium and Electron.')
}finally{
  await browser?.close();await desktop?.close();await host.close();fixture.closeAllConnections();fixture.close();await rm(dir,{recursive:true,force:true})
  if(fixtureError)throw fixtureError
}
