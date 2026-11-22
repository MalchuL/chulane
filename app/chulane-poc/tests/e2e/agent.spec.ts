/** Exercise Mastra's real HTTP streaming and tool loop against a scripted OpenAI endpoint in both renderers. */
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import {desktopLaunch} from './desktop-launch.ts'
import {chromium,_electron as electron,expect,type Page} from '@playwright/test'
import {createServer} from 'node:http'
import {access,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises'
import {delimiter,join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {serve} from '../../src/server/service.ts'

const dir=await mkdtemp(join(tmpdir(),'chulane-agent-ui-'))
let steps:((input:any)=>{name:string;args:object}|string)[]=[]
let releaseBackground:(()=>void)|undefined
let deletedStreamClosed=false
let fixtureError:unknown
const fixture=createServer(async(req,res)=>{
  try{
    expect(req.url).toBe('/v1/chat/completions')
    expect(req.headers.authorization).toBe('Bearer fixture-key')
    let data='';for await(const chunk of req)data+=chunk
    const input=JSON.parse(data)
    expect(input.tools.map(t=>t.function.name)).toContain('readPage')
    const step=steps.shift()
    if(!step)throw Error('Unexpected model step')
    let output=step(input)
    if(output==='HOLD'){
      await new Promise<void>(resolve=>{releaseBackground=resolve})
      releaseBackground=undefined
      output=steps.shift()!(input)
    }
    if(output==='FAIL'){res.writeHead(401);res.end('{"error":{"message":"invalid key"}}');return}
    res.writeHead(200,{'Content-Type':'text/event-stream'})
    const emit=(delta:object,finish_reason:string|null)=>res.write('data: '+JSON.stringify({id:'chatcmpl-smoke',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta,finish_reason}]})+'\n\n')
    if(typeof output==='string'){
      emit({role:'assistant',content:output==='WAIT'?'Partial answer':output==='WAIT_BG'?'Background partial':output},null)
      if(output==='WAIT_BG'&&JSON.stringify(input.messages).includes('Delete this running task'))res.once('close',()=>{deletedStreamClosed=true})
      if(output==='WAIT'||output==='WAIT_BG')return
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
  await p.getByLabel('Workspace name').fill('Agent acceptance')
  await p.getByRole('button',{name:'Create workspace',exact:true}).click()
  await p.getByRole('button',{name:'Agent',exact:true}).waitFor()
  const name='Field notebook', target='Roadmap'
  const api=(suffix:string,data:object,method='POST')=>p.evaluate(async({suffix,data,method})=>{
    const r=await fetch('/api/'+suffix,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
    if(!r.ok)throw Error(await r.text());return r.json()
  },{suffix,data,method})
  const current=await api('pages',{title:name,content:'Red fox'})
  await api('proposals',{page:current.id,edit:{block:'@import',before:'Red fox',after:'Fresh red fox'}})
  const folder=await api('projects',{name:'Field research'})
  const other=await api('pages',{title:target,content:'Initial roadmap',project:folder.id})
  const passage=await api('pages/import-markdown',{title:'Trail log',content:[...Array.from({length:50},(_,i)=>'Observation '+i),'North ridge marker','🧭'.repeat(8500)+'Supply depot'.padEnd(500,'.')+'Store water on shelf B.','North ridge shelter'].join('\n\n')})
  const tideMap=await api('pages',{title:'Tide map'})
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('tides',doc))
  const writing='Tidal reading in the log'
  try{
    model.blocks.insertBlock({type:'paragraph',content:writing})
    model.elements.insertElement({type:'text',frame:{x:0,y:0,width:150,height:80},zIndex:0,props:{text:'Tidal reading at the pier'}})
    const text=Buffer.from(writing)
    const frame=Array.from(Buffer.concat([text,Y.encodeStateAsUpdate(doc)]))
    await p.evaluate(async({id,frame,length})=>{
      const response=await fetch('/api/pages/'+id+'/state',{method:'PUT',headers:{'If-Match':'0','X-Text-Bytes':String(length)},body:new Uint8Array(frame)})
      if(!response.ok)throw Error(await response.text())
    },{id:tideMap.id,frame,length:text.length})
  }finally{await model.destroy()}
  const anchor=p.locator('[data-block-content]').filter({hasText:'North ridge marker'})
  const routeText='🧭'.repeat(100001)+'The survey gate opens at dawn.'.padEnd(800,'.')+'Return by the eastern bridge.'
  const uploadText=(name:string,text:string)=>p.evaluate(async({page,name,text})=>{
    const response=await fetch('/api/pages/'+page+'/files?workspace=1&name='+encodeURIComponent(name),{method:'POST',body:text})
    if(!response.ok)throw Error(await response.text())
    return (await response.json()).id
  },{page:other.id,name,text})
  const attachment=await uploadText('route.txt',routeText)
  const schedule=await uploadText('schedule.md','The survey gate closes at noon.')
  await p.reload()
  const search=p.getByRole('textbox',{name:'Search pages'})
  await search.fill('north ridge')
  await p.getByRole('button',{name:'Trail log North ridge marker'}).click()
  await expect(anchor).toBeInViewport()
  await p.getByRole('button',{name:'All pages',exact:true}).last().click()
  await search.fill('survey gate')
  await expect(p.getByRole('button',{name:/Roadmap.*route.txt/})).toBeVisible()
  const matches=p.getByRole('button',{name:'Matching attachments for Roadmap'})
  await matches.focus()
  await matches.press('Enter')
  const filesFound=p.getByRole('dialog',{name:'Matching attachments for Roadmap'})
  await expect(filesFound.getByRole('link')).toHaveCount(2)
  await expect(filesFound.getByRole('link',{name:/schedule.md/})).toContainText('The survey gate closes at noon.')
  await expect(filesFound.getByRole('link',{name:/route.txt/})).toHaveAttribute('download','route.txt')
  if(!configure){
    const downloaded=p.waitForEvent('download')
    await filesFound.getByRole('link',{name:/schedule.md/}).click()
    const file=await downloaded
    expect(file.suggestedFilename()).toBe('schedule.md')
    expect(await readFile((await file.path())!,'utf8')).toBe('The survey gate closes at noon.')
  }
  await p.keyboard.press('Escape')
  await expect(matches).toBeFocused()
  await p.getByRole('button',{name:'Clear search'}).click()
  const side=p.getByRole('complementary',{name:'Workspace agent'})
  const originalReview=p.getByRole('alert').filter({hasText:'Fresh red fox'})
  const targetLink=originalReview.getByRole('link')
  await expect(targetLink).toHaveAttribute('href','?workspace=1&page='+current.id+'&block=%40import')
  await targetLink.click()
  const field=p.locator('[data-block-content]').first()
  await expect(field).toHaveText('Red fox')
  await expect(p.locator('[data-block-id="@import"]').first()).toBeInViewport()
  await originalReview.getByRole('button',{name:'approve',exact:true}).click()
  await expect(field).toHaveText('Fresh red fox')
  await p.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(side.getByRole('button',{name:'Send',exact:true})).toBeVisible()
  if(configure){
    const connection=side.getByLabel('Connection',{exact:true})
    await expect(connection).toHaveValue('codex')
    await side.getByRole('button',{name:'Use local codex'}).click()
    await expect(side.getByText('Connected to local codex.')).toBeVisible()
    await side.getByRole('button',{name:'Provider settings'}).click()
    await connection.selectOption('api')
    await side.getByLabel('OpenAI API key').fill('fixture-key')
    await side.getByRole('button',{name:'Save provider'}).click()
    await expect(side.getByRole('button',{name:'Provider settings'})).toBeVisible()
  }
  async function send(text:string){await side.getByLabel('Message the agent').fill(text);await side.getByRole('button',{name:'Send',exact:true}).click()}
  const permissions=side.getByRole('combobox',{name:'Agent permissions'})
  await permissions.selectOption('ask')
  steps=[input=>{
    expect(input.tools.map(tool=>tool.function.name).sort()).toEqual(['browseProject','listLinkedMessages','listReviews','openPage','readAttachment','readBlock','readPage',...(configure?['readPluginDraft']:[]),'readText','searchPages'])
    return {name:'browseProject',args:{project:null,offset:0}}
  },input=>{
    expect(JSON.stringify(input.messages.at(-1))).toContain('Field research')
    return {name:'browseProject',args:{project:folder.id,offset:0}}
  },input=>{
    expect(JSON.stringify(input.messages.at(-1))).toContain(target)
    return {name:'searchPages',args:{query:'north ridge'}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).map(hit=>hit.excerpt)).toEqual(['North ridge marker','North ridge shelter'])
    return {name:'searchPages',args:{query:'tidal reading'}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).map(hit=>hit.excerpt)).toEqual([writing,'Tidal reading at the pier'])
    return {name:'searchPages',args:{query:'survey gate'}}
  },input=>{
    const match=JSON.stringify(input.messages.at(-1))
    expect(match).toContain('The survey gate opens at dawn.')
    expect(match).not.toContain('eastern bridge')
    const [hit,otherFile]=JSON.parse(input.messages.at(-1).content)
    expect(otherFile.attachment.id).toBe(schedule)
    expect(otherFile.attachment.excerpt).toContain('closes at noon')
    expect(hit.attachment.matchOffset).toBe(100005)
    return {name:'readAttachment',args:{id:hit.id,file:hit.attachment.id,offset:hit.attachment.matchOffset}}
  },input=>{
    expect(JSON.stringify(input.messages.at(-1))).toContain('Return by the eastern bridge.')
    return {name:'openPage',args:{id:other.id}}
  },input=>{expect(JSON.stringify(input.messages.at(-1))).toContain('Initial roadmap');return 'HOLD'},()=>'The roadmap is still a draft.']
  await send('Open the roadmap and tell me its status')
  await expect(p.getByRole('heading',{name:target,exact:true})).toBeVisible()
  await expect(side.getByRole('button',{name:'Stop response'})).toBeVisible()
  await expect.poll(()=>!!releaseBackground).toBe(true)
  releaseBackground!()
  await expect(side.getByText('The roadmap is still a draft.')).toBeVisible({timeout:25000})
  await expect(side.getByRole('button',{name:'Apply',exact:true})).toHaveCount(0)
  const save=p.getByRole('button',{name:'Save now'})
  if(await save.isVisible())await save.click()
  await expect(p.locator('.save')).toHaveText('Saved')
  await p.reload()
  await p.getByRole('button',{name:new RegExp(name)}).click()
  await p.getByRole('button',{name:'Agent',exact:true}).click()
  const canvasCitation=side.getByRole('link',{name:'Tide map · Tidal reading at the pier'})
  await expect(canvasCitation).toHaveAttribute('href','?workspace=1&page='+tideMap.id+'&view=canvas')
  await canvasCitation.focus()
  await canvasCitation.press('Enter')
  await expect(p.getByRole('radio',{name:'Canvas',exact:true})).toHaveAttribute('aria-checked','true')
  if(!configure){
    const tab=await p.context().newPage()
    await tab.goto(new URL((await canvasCitation.getAttribute('href'))!,p.url()).href)
    await expect(tab.getByRole('heading',{name:'Tide map'})).toBeVisible()
    await expect(tab.getByRole('radio',{name:'Canvas',exact:true})).toHaveAttribute('aria-checked','true')
    await tab.close()
  }
  await p.getByRole('radio',{name:'Page',exact:true}).click()
  steps=[()=>({name:'listLinkedMessages',args:{before:null}}),input=>{
    const {messages}=JSON.parse(input.messages.at(-1).content)
    const link=messages.flatMap(message=>message.links).find(link=>link.id===tideMap.id&&link.surface==='canvas')
    expect(link).toBeDefined()
    return {name:'openPage',args:{id:link.id,block:null,surface:link.surface}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).canvasText).toContain('Tidal reading at the pier')
    return 'Opened the cited tide map.'
  }]
  await send('Reopen the canvas you cited for the pier')
  await expect(side.getByText('Opened the cited tide map.')).toBeVisible()
  await expect(p.getByRole('radio',{name:'Canvas',exact:true})).toHaveAttribute('aria-checked','true')
  await expect(side.locator('article').filter({hasText:'Opened the cited tide map.'}).getByRole('link',{name:'Tide map',exact:true})).toHaveAttribute('href','?workspace=1&page='+tideMap.id+'&view=canvas')
  await expect(side.getByRole('link',{name:'Tide map · '+writing})).toHaveAttribute('href',new RegExp('page='+tideMap.id+'&block=.+'))
  const blockCitation=side.getByRole('link',{name:'Trail log · North ridge marker'})
  await expect(blockCitation).toHaveAttribute('href',new RegExp('page='+passage.id+'&block=.+'))
  const shelter=side.getByRole('link',{name:'Trail log · North ridge shelter'})
  const shelterHref=(await shelter.getAttribute('href'))!
  expect(shelterHref).not.toBe(await blockCitation.getAttribute('href'))
  await shelter.click()
  await expect(p.locator('[data-block-content]').filter({hasText:'North ridge shelter'})).toBeInViewport()
  await blockCitation.click()
  await expect(anchor).toBeInViewport()
  await p.getByRole('radio',{name:'Canvas',exact:true}).click()
  await blockCitation.focus()
  await blockCitation.press('Enter')
  await expect(p.getByRole('radio',{name:'Page',exact:true})).toHaveAttribute('aria-checked','true')
  await expect(anchor).toBeInViewport()
  await side.getByRole('link',{name,exact:true}).click()
  await expect(field).toHaveText('Fresh red fox')
  const pageCitation=side.getByRole('link',{name:target,exact:true})
  await api('pages/'+other.id,{deleted:true},'PATCH')
  await pageCitation.click()
  await expect(side.getByRole('alert')).toContainText('Source page is in the trash')
  await expect(field).toHaveText('Fresh red fox')
  await expect(pageCitation).toHaveAttribute('href','?workspace=1&page='+other.id)
  const missingFile=side.getByRole('link',{name:'Roadmap · schedule.md'})
  await missingFile.click()
  await expect(side.getByRole('alert')).toContainText('Page is in the trash')
  await expect(missingFile).toBeVisible()
  await api('pages/'+other.id,{deleted:false},'PATCH')
  await expect(missingFile).toHaveAttribute('href','/api/pages/'+other.id+'/files/'+schedule+'?workspace=1')
  const citation=side.getByRole('link',{name:'Roadmap · route.txt'})
  await expect(citation).toHaveAttribute('title',/^survey gate opens at dawn/)
  await expect(citation).toHaveAttribute('href','/api/pages/'+other.id+'/files/'+attachment+'?workspace=1')
  if(configure){
    const output=join(dir,'cited-file')
    await desktop!.evaluate(({BrowserWindow},path)=>{BrowserWindow.getAllWindows()[0]!.webContents.session.once('will-download',(_event,item)=>item.setSavePath(path))},output)
    await citation.click()
    await expect.poll(()=>readFile(output,'utf8').catch(()=>null)).toBe(routeText)
  }else{
    const download=p.waitForEvent('download')
    await citation.click()
    expect((await download).suggestedFilename()).toBe('route.txt')
  }
  steps=[()=>({name:'listLinkedMessages',args:{before:null}}),input=>{
    const {messages}=JSON.parse(input.messages.at(-1).content)
    const earlier=messages.find(message=>message.role==='assistant'&&message.links.some(link=>link.block))
    const blockUrl=new URL(shelterHref,'https://example.test')
    const link=earlier.links.find(link=>link.id===passage.id&&link.block===blockUrl.searchParams.get('block'))
    expect(link).toBeDefined()
    expect(link).not.toHaveProperty('excerpt')
    return {name:'openPage',args:{id:link.id,block:link.block}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).blocks[0].text).toBe('North ridge shelter')
    return {name:'listLinkedMessages',args:{before:null}}
  },input=>{
    const {messages}=JSON.parse(input.messages.at(-1).content)
    const files=messages.find(message=>message.attachments?.some(file=>file.name==='route.txt')).attachments
    const route=files.find(file=>file.name==='route.txt')
    expect(route.file).toBe(attachment)
    return {name:'readAttachment',args:{id:route.id,file:route.file,offset:route.matchOffset}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).text).toContain('Return by the eastern bridge.')
    return 'The cited route returns by the eastern bridge.'
  }]
  await send('Reopen the shelter block and route file you cited earlier')
  await expect(side.getByText('The cited route returns by the eastern bridge.')).toBeVisible()
  await expect(p.getByRole('heading',{name:'Trail log',exact:true})).toBeVisible()
  await expect(p.locator('[data-block-content]').filter({hasText:'North ridge shelter'})).toBeInViewport()
  steps=[()=>({name:'searchPages',args:{query:'Supply depot'}}),input=>{
    const [hit]=JSON.parse(input.messages.at(-1).content)
    expect(hit.excerpt).not.toContain('shelf B')
    expect(hit.readFrom).toEqual({block:hit.block,offset:17000})
    return {name:'readText',args:{id:hit.id,...hit.readFrom}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).text).toContain('Store water on shelf B.')
    return 'Water is on shelf B.'
  }]
  await send('Find the supply depot instructions')
  await expect(side.getByText('Water is on shelf B.')).toBeVisible()
  await expect(side.locator('article[data-author="assistant"]').filter({hasText:'Water is on shelf B.'}).getByRole('link',{name:/Trail log ·/})).toHaveAttribute('href',new RegExp('page='+passage.id+'&block=.+'))
  await expect(permissions).toHaveValue('ask')
  await permissions.selectOption('suggest')
  steps=[()=>({name:'proposeProject',args:{name:'Expeditions',parent:folder.id}}),()=>'Review the new project.']
  await send('Create Expeditions inside Field research')
  const projectReview=side.getByRole('region',{name:'Project proposal'})
  await expect(projectReview).toContainText('Expeditions')
  await expect(projectReview).toContainText('Field research')
  await expect(p.getByRole('button',{name:'Expeditions',exact:true})).toHaveCount(0)
  await projectReview.getByRole('button',{name:'Create project'}).click()
  await expect(projectReview).toContainText('applied')
  await expect(p.getByRole('navigation',{name:'Library'}).getByRole('button',{name:'Expeditions',exact:true})).toBeVisible({timeout:10000})
  const markdown='Pack the compass.\n\nMeet at the trailhead.'
  steps=[()=>({name:'proposePage',args:{title:'Field briefing',project:folder.id,markdown}}),()=>'Review the briefing.']
  await send('Draft a field briefing in Field research')
  const preview=side.getByRole('region',{name:'New page proposal'})
  await expect(preview.locator('pre')).toHaveText(markdown)
  await expect(preview).toContainText('Field research')
  const briefings=()=>p.evaluate(async()=>(await(await fetch('/api/library')).json()).pages.filter((page:{title:string})=>page.title==='Field briefing'))
  expect(await briefings()).toHaveLength(0)
  await api('proposals',{title:'External field briefing',project:folder.id,markdown:'External text'})
  await api('projects/'+folder.id,{deleted:true},'PATCH')
  await expect(preview).toContainText('Folder unavailable')
  await expect(preview.getByRole('button',{name:'Create page'})).toBeDisabled()
  await api('projects/'+folder.id,{deleted:false},'PATCH')
  await api('projects/'+folder.id,{name:'Seasonal survey',baseName:'Field research'},'PATCH')
  await expect(preview).toContainText('Seasonal survey · #'+folder.id+' (requested as Field research)')

  await preview.getByRole('button',{name:'Create page'}).click()
  const resultLink=preview.getByRole('link',{name:'Open page'})
  await resultLink.click()
  await expect(p.locator('[data-block-content]').nth(1)).toHaveText('Meet at the trailhead.')
  expect(await briefings()).toMatchObject([{project:folder.id,plain:markdown}])
  steps=[()=>({name:'listReviews',args:{before:null}}),input=>{
    const reviews=JSON.parse(input.messages.at(-1).content).messages.flatMap(message=>message.pages)
    const applied=reviews.find(review=>review.title==='Field briefing')
    expect(applied.status).toBe('applied')
    return {name:'openPage',args:{id:applied.page,block:null}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).blocks[0].text).toBe('Pack the compass.')
    return 'The field briefing was approved.'
  }]
  await send('Check whether my proposed field briefing was approved and open the result.')
  await expect(side.getByText('The field briefing was approved.')).toBeVisible()
  await expect(side.locator('article[data-author="assistant"]').last().getByRole('link',{name:'Field briefing',exact:true})).toHaveAttribute('href',new RegExp('page='+(await briefings())[0].id+'$'))

  const external=p.getByRole('alert').filter({hasText:'External field briefing'})
  await expect(external).toContainText('Seasonal survey · #'+folder.id+' (requested as Field research)')
  await external.getByRole('button',{name:'approve',exact:true}).click()
  await expect(p.getByRole('heading',{name:'External field briefing',exact:true})).toBeVisible()
  await api('projects/'+folder.id,{name:'Field research',baseName:'Seasonal survey'},'PATCH')
  await expect(preview).toContainText('Seasonal survey · #'+folder.id+' (requested as Field research)')

  await side.getByRole('link',{name,exact:true}).first().click()
  await expect(field).toHaveText('Fresh red fox')
  const scratch=await api('pages',{title:'Station draft'})
  steps=[()=>({name:'readPage',args:{id:scratch.id,offset:0}}),()=>({name:'proposeRename',args:{id:scratch.id,title:'Station index'}}),()=>'Review the page title.']
  await send('Rename Station draft to Station index')
  const rename=side.locator('section').filter({has:p.locator('ins',{hasText:'Station index'})}).last()
  await expect(rename.locator('del')).toHaveText('Station draft')
  let approvalPosts=0
  let reachHost=false
  const approvalRoute='**/api/agent/chats/*/edits/*/apply*'
  if(!configure)await p.route(approvalRoute,async route=>{
    approvalPosts++
    if(reachHost)expect((await route.fetch()).ok()).toBe(true)
    await route.abort('failed')
  })
  await rename.getByRole('button',{name:'Apply',exact:true}).click()
  if(!configure){
    await expect(side.getByRole('alert')).toContainText('The proposal is still pending')
    expect(approvalPosts).toBe(1)
    await expect(rename.getByRole('button',{name:'Apply',exact:true})).toBeVisible()
    reachHost=true
    await rename.getByRole('button',{name:'Apply',exact:true}).click()
    await expect(side.getByRole('status').filter({hasText:'The host recorded this proposal as applied.'})).toBeVisible()
    await expect(side.getByRole('alert')).toHaveCount(0)
    expect(approvalPosts).toBe(2)
    await p.unroute(approvalRoute)
  }
  await expect(rename).toContainText('applied')
  await expect(p.getByRole('region',{name:'Pages in this view'}).getByRole('button',{name:'Station index',exact:true})).toBeVisible({timeout:10000})
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
  const excerpt='Second observation'.padEnd(59,'.')
  const observation=excerpt+'🧭 at camp'
  await fields.nth(1).fill(observation)
  await expect(p.locator('[data-dnd-dropping]')).toHaveCount(0)
  const first=(await field.boundingBox())!,second=(await fields.nth(1).boundingBox())!
  await p.mouse.move(first.x+10,first.y+first.height/2);await p.mouse.down()
  await p.mouse.move(second.x+30,second.y+second.height/2,{steps:15});await p.mouse.up()
  await expect(p.locator('[data-block-selected=true]')).toHaveCount(2)
  const originalIds=await fields.evaluateAll(elements=>elements.map(el=>el.closest('[data-block-id]')!.getAttribute('data-block-id')))
  const linkHandle=p.getByRole('button',{name:'Attach block links to chat'}).nth(1)
  await linkHandle.focus()
  await linkHandle.press('Enter')
  const linkedBlocks=side.getByRole('button',{name:/Remove block link/})
  await expect(linkedBlocks).toHaveCount(2,{timeout:2500})
  await expect(linkedBlocks.nth(1)).toHaveAccessibleName('Remove block link: '+excerpt)
  await expect(side.getByLabel('Message the agent')).toBeFocused()
  await linkedBlocks.first().press('Enter')
  await linkedBlocks.first().press('Enter')
  await p.mouse.move(first.x+10,first.y+first.height/2);await p.mouse.down()
  await p.mouse.move(second.x+30,second.y+second.height/2,{steps:15});await p.mouse.up()
  const grip=(await linkHandle.boundingBox())!
  await p.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await p.mouse.down()
  await p.mouse.move(grip.x+grip.width/2+10,grip.y+grip.height/2,{steps:4})
  await p.mouse.move(area.x+area.width/2,area.y+area.height/2,{steps:25})
  await expect(side.getByRole('form',{name:'Chat composer'})).toHaveAttribute('data-drag','over')
  await p.mouse.up()
  await expect(side.getByRole('button',{name:/Remove block link/})).toHaveCount(2,{timeout:2500})
  await expect(fields).toHaveText(['Fresh red fox',observation])
  await expect(side.getByLabel('Message the agent')).toHaveValue('')
  expect(await fields.evaluateAll(elements=>elements.map(el=>el.closest('[data-block-id]')!.getAttribute('data-block-id')))).toEqual(originalIds)
  let block=''
  const source=(input:any)=>JSON.parse(input.messages.filter(m=>m.role==='user').at(-1).content).currentDocument
  steps=[i=>{const prompt=JSON.parse(i.messages.filter(m=>m.role==='user').at(-1).content)
    expect(prompt.referencedBlocks.map(b=>b.block)).toEqual(originalIds)
    expect(prompt.referencedBlocks.map(b=>b.text)).toEqual(['Fresh red fox',observation])
    expect(prompt.referencedDocuments[0].blocks[0].text).toBe('Initial roadmap')
    const page=source(i);expect(page.blocks[0].text).toBe('Fresh red fox');block=page.blocks[0].id;return {name:'proposeEdit',args:{id:current.id,block,text:'Fresh blue fox'}}},()=> 'Review the color change.']
  await send('Change red to blue')
  await expect(side.getByText('Review the color change.')).toBeVisible({timeout:25000})
  await expect(side.getByRole('button',{name:'Remove '+target})).toHaveCount(0)
  await expect(side.locator('article[data-author="assistant"]').getByRole('link',{name:/Second observation/}).last()).toHaveAttribute('href',/block=/)
  await side.getByRole('button',{name:'Apply',exact:true}).click()
  await expect(field).toHaveText('Fresh blue fox')
  await field.click();await p.keyboard.press('ControlOrMeta+z')
  await expect(field).toHaveText('Fresh red fox')
  await fields.nth(1).fill('Second observation after review')
  steps=[i=>{
    const earlier=i.messages.find(message=>message.role==='user'&&message.content.includes('Change red to blue'))
    for(const id of originalIds)expect(earlier.content).toContain(JSON.stringify({id:current.id,block:id}))
    return {name:'listLinkedMessages',args:{before:null}}
  },i=>{
    const history=JSON.stringify(i.messages.at(-1))
    expect(history).toContain('Change red to blue')
    expect(history).toContain(originalIds[1])
    return {name:'readBlock',args:{id:current.id,block:originalIds[1]}}
  },i=>{
    expect(JSON.stringify(i.messages.at(-1))).toContain('Second observation after review')
    return {name:'readText',args:{id:current.id,block:originalIds[1],offset:7}}
  },i=>{
    expect(JSON.stringify(i.messages.at(-1))).toContain('observation after review')
    return {name:'searchPages',args:{query:'Roadmap'}}
  },i=>{
    expect(JSON.stringify(i.messages.at(-1))).toContain(target);return {name:'readPage',args:{id:other.id,offset:0}}
  },i=>{expect(JSON.stringify(i.messages.at(-1))).toContain('Initial roadmap');return {name:'proposeEdit',args:{id:other.id,block:'',text:'Ship it on Friday'}}},()=> 'Review the Roadmap addition.']
  await send('Add a launch date to Roadmap')
  await expect(side.getByText('Review the Roadmap addition.')).toBeVisible({timeout:25000})
  await p.reload();await p.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(side.locator('article[data-author="assistant"]').getByRole('link',{name:/Second observation/}).last()).toHaveAttribute('href','?workspace=1&page='+current.id+'&block='+encodeURIComponent(originalIds[1]!))
  await side.getByRole('button',{name:'Apply',exact:true}).click()
  await expect(p.locator('.page-surface')).toContainText('Ship it on Friday')
  await field.click()
  await p.keyboard.press('ControlOrMeta+z')
  await expect(p.locator('.page-surface')).not.toContainText('Ship it on Friday')
  await expect(field).toHaveText('Initial roadmap')
  await expect.poll(()=>p.evaluate(async id=>(await(await fetch('/api/source?id='+id)).json()).text,other.id)).toBe('Initial roadmap')
  steps=[i=>{const doc=source(i);return {name:'proposeEdit',args:{id:other.id,block:doc.blocks[0].id,text:'Stale change'}}},()=> 'Check this revision.']
  await send('Revise the introduction')
  await expect(side.getByText('Check this revision.')).toBeVisible()
  await field.fill('Concurrent change')
  await side.getByRole('button',{name:'Apply',exact:true}).click()
  await expect(side.getByRole('alert')).toContainText('target block changed')
  await expect(field).toHaveText('Concurrent change')
  if(configure)await side.getByRole('button',{name:'Dismiss',exact:true}).click()
  else{
    await p.route(approvalRoute,async route=>{
      const competing=await p.request.post(route.request().url().replace('/apply?','/dismiss?'))
      expect(competing.ok()).toBe(true)
      await route.continue()
    })
    await side.getByRole('button',{name:'Apply',exact:true}).click()
    await expect(side.getByRole('status').filter({hasText:'The host recorded this proposal as dismissed.'})).toBeVisible()
    await expect(field).toHaveText('Concurrent change')
    await p.unroute(approvalRoute)
  }
  steps=[()=> 'HOLD',i=>({name:'proposeEdit',args:{id:other.id,block:source(i).blocks[0].id,text:'Based on the old paragraph'}}),
    i=>{expect(JSON.stringify(i.messages.at(-1))).toContain('Read the current block');return {name:'readBlock',args:{id:other.id,block:source(i).blocks[0].id}}},
    i=>{expect(JSON.stringify(i.messages.at(-1))).toContain('Updated during the turn');return {name:'proposeEdit',args:{id:other.id,block:source(i).blocks[0].id,text:'Reviewed updated paragraph'}}},
    ()=>'Review the revised paragraph.']
  await send('Revise while I am editing')
  await expect.poll(()=>!!releaseBackground).toBe(true)
  await field.fill('Updated during the turn')
  await expect.poll(()=>p.evaluate(async id=>(await(await fetch('/api/source?id='+id)).json()).text,other.id)).toContain('Updated during the turn')
  releaseBackground!()
  await expect(side.getByText('Review the revised paragraph.',{exact:true})).toBeVisible()
  await expect(side.getByText('Based on the old paragraph',{exact:true})).toHaveCount(0)
  await expect(side.getByRole('button',{name:'Apply',exact:true})).toHaveCount(1)
  await expect(field).toHaveText('Updated during the turn')
  if(!configure)await p.route(approvalRoute,async route=>{
    expect((await route.fetch()).ok()).toBe(true)
    await route.abort('failed')
  })
  await side.getByRole('button',{name:'Apply',exact:true}).click()
  await expect(field).toHaveText('Reviewed updated paragraph')
  if(!configure){
    await expect(side.getByRole('status').filter({hasText:'The host recorded this proposal as applied.'})).toBeVisible()
    await p.unroute(approvalRoute)
  }
  const reviewFolder=await api('projects',{name:'Winter sample'})
  steps=[()=>({name:'browseProject',args:{project:null,offset:0}}),
    ()=>({name:'proposeProjectRename',args:{id:reviewFolder.id,name:'Spring sample'}}),()=>'Review the folder name.']
  await send('Rename Winter sample to Spring sample')
  const renameReview=side.getByRole('region',{name:'Project proposal'}).filter({hasText:'Spring sample'})
  await expect(renameReview.locator('del')).toHaveText('Winter sample')
  await expect(renameReview.locator('ins')).toHaveText('Spring sample')
  await expect(p.getByRole('navigation',{name:'Library',exact:true}).getByRole('button',{name:'Winter sample'})).toBeVisible()
  await renameReview.getByRole('button',{name:'Apply project rename'}).click()
  await expect(p.getByRole('navigation',{name:'Library',exact:true}).getByRole('button',{name:'Spring sample'})).toBeVisible()
  steps=[()=> 'WAIT'];await send('Wait')
  await expect(side.getByText('Partial answer')).toBeVisible()
  await side.locator('article[data-author="assistant"]').getByRole('link',{name:/Second observation/}).last().click()
  await expect(p.locator('[data-source-page="'+current.id+'"] [data-block-content]').nth(1)).toBeInViewport()
  await expect(side.getByRole('button',{name:'Stop response'})).toBeVisible()
  await p.reload();await p.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(side.getByText('Turn interrupted')).toBeVisible()
  await expect(side.getByText('Partial answer')).toBeVisible()
  const toggle=side.getByRole('button',{name:'Run in background'})
  steps=[input=>{expect(input.tools.map(tool=>tool.function.name)).not.toContain('openPage');return 'HOLD'},()=>({name:'readPage',args:{id:other.id,offset:0}}),
    ()=>({name:'proposeEdit',args:{id:other.id,block:'',text:'From the background task'}}),()=> 'Background result after leaving.']
  await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','true')
  await send('Finish while away')
  await expect(side.getByText('Background task started.')).toBeVisible()
  await expect.poll(()=>!!releaseBackground).toBe(true)
  const home=p.url()
  if(configure)await p.reload()
  else await p.goto('about:blank')
  releaseBackground!()
  if(!configure){
    await expect.poll(async()=>(await(await p.request.get(home.split('?')[0].replace(/\/$/,'')+'/api/agent/tasks')).json())[0]?.status).toBe('complete')
    await p.goto(home)
  }
  await p.getByRole('button',{name:'Agent',exact:true}).click()
  const taskList=p.getByRole('dialog',{name:'Background tasks'})
  await side.getByRole('button',{name:'Background tasks'}).click()
  await taskList.getByRole('button',{name:/Finish while away complete · Review requested/}).click()
  await expect(side.getByText('Background result after leaving.')).toBeVisible()
  await expect(side.locator('article').filter({hasText:'Background result after leaving.'})).toBeFocused()
  const before=await p.evaluate(async id=>(await(await fetch('/api/source?id='+id)).json()).text,other.id)
  expect(before).not.toContain('From the background task')
  await side.getByRole('button',{name:'Apply',exact:true}).click()
  await expect.poll(()=>p.evaluate(async id=>(await(await fetch('/api/source?id='+id)).json()).text,other.id)).toContain('From the background task')
  steps=[()=> 'WAIT_BG']
  await toggle.click();await send('Cancellable task')
  await expect(side.getByText('Background partial')).toBeVisible({timeout:10000})
  await side.getByRole('button',{name:'Background tasks'}).click()
  await taskList.getByRole('button',{name:'Cancel Cancellable task'}).click()
  await expect(taskList.getByRole('button',{name:'Cancellable task cancelled'})).toBeVisible({timeout:10000})
  await p.keyboard.press('Escape')
  await expect(side.getByText('Task cancelled')).toBeVisible()
  steps=[()=> 'FAIL'];await send('Check provider')
  await expect(side.getByRole('alert')).toContainText('Provider request failed')
  expect(steps).toHaveLength(0)
  const conversations=side.getByLabel('Conversation',{exact:true})
  const prior=await conversations.inputValue()
  await side.getByRole('button',{name:'New chat',exact:true}).click()
  await expect(conversations).not.toHaveValue(prior)
  const deleted=await conversations.inputValue()
  steps=[()=> 'WAIT_BG']
  deletedStreamClosed=false
  await toggle.click();await send('Delete this running task')
  await expect(side.getByText('Background partial',{exact:true})).toBeVisible()
  const remove=side.getByRole('button',{name:'Delete conversation',exact:true})
  const confirm=p.getByRole('dialog',{name:'Delete this conversation?'})
  await remove.click();await confirm.getByRole('button',{name:'Cancel'}).press('Enter')
  await expect(conversations).toHaveValue(deleted)
  await remove.click();await confirm.getByRole('button',{name:'Delete conversation'}).press('Enter')
  await expect(conversations).toHaveValue(prior)
  await expect(side.getByText('Delete this running task',{exact:true})).toHaveCount(0)
  const removed=await p.evaluate(async id=>({
    status:(await fetch('/api/agent/chats/'+id)).status,
    tasks:(await(await fetch('/api/agent/tasks')).json()).filter(task=>task.chat===Number(id))
  }),deleted)
  expect(removed).toEqual({status:404,tasks:[]})
  await expect.poll(()=>deletedStreamClosed).toBe(true)
}

let browser,desktop:Awaited<ReturnType<typeof electron.launch>>|undefined
try{
  browser=await chromium.launch();const context=await browser.newContext();const p=await context.newPage()
  await p.goto(host.url);await p.getByLabel('Workspace access key').fill('edit');await p.getByRole('button',{name:'Open library'}).click()
  await exercise(p)
  const switchResponse=await p.request.post(host.url+'/api/agent/provider',{data:{agent:'codex'}})
  expect(switchResponse.status()).toBe(403)
  const listed=await(await p.request.get(host.url+'/api/agent')).json()
  expect((await p.request.post(host.url+'/api/agent/chats/'+listed.chats[0].id+'/provider',{data:{agent:'codex'}})).status()).toBe(403)
  const reader=await browser.newPage();await reader.goto(host.url);await reader.getByLabel('Workspace access key').fill('view');await reader.getByRole('button',{name:'Open library'}).click()
  await reader.getByRole('button',{name:'Agent',exact:true}).click();await expect(reader.getByText('Read-only conversation')).toBeVisible();await expect(reader.getByRole('button',{name:'Delete conversation'})).toHaveCount(0)
  await expect(reader.getByText('Partial answer')).toBeVisible()
  const currentChat=await reader.getByLabel('Conversation',{exact:true}).inputValue()
  expect((await p.request.delete(host.url+'/api/agent/chats/'+currentChat)).status()).toBe(200)
  await expect(reader.getByLabel('Conversation',{exact:true})).toHaveValue('0')
  await expect(reader.getByText('Partial answer')).toHaveCount(0)
  // Real child processes exercise stdin, output formats and the desktop-only executable selection.
  // A desktop PATH lookup must never fall through to the machine's signed-in Codex.
  await writeFile(join(dir,'codex'),'#!/bin/sh\nexit 1\n',{mode:0o700})
  for(const agent of ['codex','claude','hermes']){
    await writeFile(join(dir,agent==='codex'?'custom codex':agent),`#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv.slice(-2).join(' ')==='auth status')process.exit(fs.existsSync(require('node:path').join(__dirname,'signed-out'))?1:0);
if(process.argv.slice(2).join(' ')==='chat --help'){
  console.log(fs.existsSync(require('node:path').join(__dirname,'old-hermes'))?'--format text':'--oneshot --query-file --safe-mode --toolsets --source --format {text,stream-json}');process.exit(0);
}
if(process.argv.includes('--version')||process.argv.includes('login')) process.exit(0);
const {context,results,schema,publishedMessages}=JSON.parse(fs.readFileSync(0,'utf8'));
if(context.history.at(-1).content==='Try a forbidden proposal'&&['"propose"','"proposeProject"','"proposeProjectRename"','"proposePage"','"proposeRename"','"draftPlugin"'].some(action=>JSON.stringify(schema).includes(action))){
  fs.writeFileSync(require('node:path').join(__dirname,'unexpected-write-tool'),'exposed');
}
const waiting=context.history.at(-1).content==='Wait locally';
if(waiting&&results.length){
  fs.writeFileSync(require('node:path').join(__dirname,'waiting-cli'),String(process.pid));
  setInterval(()=>{},1000);return;
}
const {id,blocks}=context.currentDocument;
const browsing=context.history.at(-1).content==='List projects and quote the second block';
const projectName='Local '+${JSON.stringify(agent)}+' project';
const creating=context.history.at(-1).content==='Suggest a root project';
const makePage=context.history.at(-1).content==='Draft a root page';
const requestedAction=makePage?{type:'proposePage',title:'Local page '+${JSON.stringify(agent)},project:null,markdown:'Draft content'}:creating
  ? {type:'proposeProject',name:projectName,parent:null}
  : browsing ? {type:'browse',project:null,offset:0} : {type:'propose',id,block:blocks[0].id,text:'Local edit from '+${JSON.stringify(agent)}};
const renaming=context.history.at(-1).content==='Suggest a new title';
let answer={message:'',actions:[renaming?{type:'proposeRename',id,title:'Notebook '+${JSON.stringify(agent)}}:requestedAction]};
if(browsing&&!results.length)answer.message='I will look through the project list.';
if(browsing&&results.length===1){
  if(publishedMessages?.[0]!=='I will look through the project list.')throw Error('Missing earlier reply');
  answer={message:'',actions:[{type:'listLinkedMessages',before:null}]};
}else if(browsing&&results.length===2&&Array.isArray(results[1].result.messages)){
  answer={message:'',actions:[{type:'readText',id,block:blocks[1].id,offset:0}]};
}else if(results.length){
  const message=browsing?results[0].result.entries.map(item=>item.name).join(', ')+' — '+results[2].result.text:'Local '+${JSON.stringify(agent)}+' finished.';
  answer={message:renaming?'Title ready for review.':creating?'Project ready for review.':message,actions:[]};
}
if(context.history.at(-1).content==='Revise the first paragraph'){
  if(!results.length)answer={message:'',actions:[{type:'propose',id,block:'missing-block',text:'Stale replacement'},requestedAction]};
  else if(results.length===1&&results[0].error?.status===409)answer={message:'',actions:[{type:'readBlock',id,block:blocks[0].id}]};
  else if(results.length===2&&results[1].result?.blocks)answer={message:'',actions:[requestedAction]};
  else if(results.length!==3||!results[2].result?.pending)throw Error('Unexpected conflict recovery sequence');
}
if(context.history.at(-1).content==='Rename the sample project'){
  if(!results.length)answer={message:'',actions:[{type:'browse',project:null,offset:0}]};
  else if(results.length===1)answer={message:'',actions:[{type:'proposeProjectRename',id:results[0].result.entries.find(p=>p.name==='Spring sample').id,name:'Sample '+${JSON.stringify(agent)}}]};
  else answer={message:'Review the sample name.',actions:[]};
}
if(context.history.at(-1).content==='Open Trail log'){
  if(!results.length)answer={message:'',actions:[{type:'search',query:'North ridge shelter'}]};
  else if(results.length===1)answer={message:'',actions:[{type:'openPage',id:results[0].result[0].id,block:results[0].result[0].block}]};
  else answer={message:'Opened '+results[1].result.title+' with '+${JSON.stringify(agent)},actions:[]};
}
if(waiting)answer={message:'I will check the project list.',actions:[{type:'browse',project:null,offset:0}]};
const wrapper=${JSON.stringify(agent)}==='claude'?{structured_output:answer}:${JSON.stringify(agent)}==='hermes'?{type:'result',exit_code:0,text:JSON.stringify(answer)}:answer;
console.log(JSON.stringify(wrapper));
`,{mode:0o700})
  }
  const desktopOptions={...desktopLaunch(join(dir,'desktop')),env:{...process.env,CHULANE_CODEX_PATH:join(dir,'custom codex'),PATH:dir+delimiter+process.env.PATH,CHULANE_LOCAL_AGENT:'',OPENAI_API_KEY:'',CHULANE_AI_MODEL:'fixture',CHULANE_OPENAI_BASE_URL:url}}
  desktop=await electron.launch(desktopOptions)
  await exercise(await desktop.firstWindow(),true)
  const local=await desktop.firstWindow()
  const side=local.getByRole('complementary',{name:'Workspace agent'})
  const nativeModule="export default function plugin(ctx,{command}){ctx.effect(()=>command('Survey checklist',()=>{}))}"
  const rendererModule=await readFile(resolve('examples/reading-break/renderer.mjs'),'utf8')
  steps=[()=>({name:'draftPlugin',args:{name:'Survey checklist',nativeModule,rendererModule}}),()=>'Review the plugin files.']
  await side.getByLabel('Agent permissions').selectOption('suggest')
  await side.getByLabel('Message the agent').fill('Create a desktop plugin for a survey checklist')
  await side.getByRole('button',{name:'Send',exact:true}).click()
  const draft=side.getByRole('group',{name:'Survey checklist'})
  await draft.getByText('plugin.mjs',{exact:true}).click()
  await expect(draft.locator('pre').first()).toHaveText(nativeModule)
  const installed=()=>desktop!.evaluate(({Menu})=>Menu.getApplicationMenu()!.items.find(x=>x.label==='Plugins')!.submenu!.items.some(x=>x.label==='Survey checklist'))
  await desktop.evaluate(({dialog},root)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]})
    dialog.showMessageBox=async()=>({response:0,checkboxChecked:false})
  },dir)
  await draft.getByRole('button',{name:'Save plugin folder'}).click()
  await expect(side.getByText(/Plugin saved in /)).toBeVisible()
  expect(await installed()).toBe(false)
  const saved=(await readdir(dir)).filter(name=>name.startsWith('chulane-survey-checklist-'))
  expect(saved).toHaveLength(1)
  expect(await readFile(join(dir,saved[0]!,'plugin.mjs'),'utf8')).toBe(nativeModule)
  expect(await readFile(join(dir,saved[0]!,'renderer.mjs'),'utf8')).toBe(rendererModule)
  await desktop.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false})})
  await draft.getByRole('button',{name:'Save plugin folder'}).click()
  await expect.poll(installed).toBe(true)
  const revisionName='Survey observations'
  steps=[()=>({name:'readPluginDraft',args:{message:null}}),input=>{
    const source=JSON.parse(input.messages.at(-1).content)
    expect(source).toEqual({name:'Survey checklist',nativeModule,rendererModule})
    return {name:'draftPlugin',args:{...source,name:revisionName,nativeModule:nativeModule.replace('Survey checklist',revisionName)}}
  },()=>'Review the revised plugin files.']
  await side.getByLabel('Message the agent').fill('Rename the native command and preserve the editor block')
  await side.getByRole('button',{name:'Send',exact:true}).click()
  const revision=side.getByRole('group',{name:revisionName})
  await revision.getByText('renderer.mjs',{exact:true}).click()
  await expect(revision.locator('pre').last()).toHaveText(rendererModule)
  await expect(draft.locator('pre').first()).toHaveText(nativeModule)
  await expect(side.getByText('Review the revised plugin files.',{exact:true})).toBeVisible()
  await local.getByRole('button',{name:'All pages',exact:true}).last().click()
  await local.getByRole('main').getByRole('button',{name:/^Field notebook/}).click()
  await expect(local.locator('[data-block-content]').first()).toHaveText('Fresh red fox')
  for(const agent of ['codex','claude','hermes']){
    await side.getByRole('button',{name:'Provider settings'}).click()
    await side.getByLabel('Connection',{exact:true}).selectOption(agent)
    if(agent==='claude'){
      const marker=join(dir,'signed-out')
      await writeFile(marker,'')
      await side.getByRole('button',{name:'Use local claude'}).click()
      await expect(side.getByRole('alert')).toContainText('claude auth login')
      expect(await local.evaluate(async()=>(await(await fetch('/api/agent')).json()).agent)).toBe('codex')
      await rm(marker)
    }
    if(agent==='hermes'){
      const marker=join(dir,'old-hermes')
      await writeFile(marker,'')
      await side.getByRole('button',{name:'Use local hermes'}).click()
      await expect(side.getByRole('alert')).toContainText('Update Hermes Agent.')
      expect(await local.evaluate(async()=>(await(await fetch('/api/agent')).json()).agent)).toBe('claude')
      await rm(marker)
    }
    await side.getByRole('button',{name:'Use local '+agent}).click()
    await expect(side.getByText(agent==='hermes'?'Hermes chat CLI ready. Send a message to use its configured provider.':'Connected to local '+agent+'.')).toBeVisible()
    await side.getByLabel('Agent permissions').selectOption('ask')
    await side.getByLabel('Message the agent').fill('List projects and quote the second block')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    await expect(side.locator('article[data-author="assistant"]').last()).toContainText('I will look through the project list.')
    await expect(side.locator('article[data-author="assistant"]').last()).toContainText('Field research')
    await expect(side.locator('article[data-author="assistant"]').last()).toContainText('Second observation after review')
    const priorTitle=await local.getByRole('main').getByRole('heading',{level:1}).first().innerText()
    await side.getByLabel('Message the agent').fill('Open Trail log')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    await expect(local.getByRole('heading',{name:'Trail log',exact:true})).toBeVisible()
    const opened=side.locator('article[data-author="assistant"]').last()
    await expect(opened).toContainText('Opened Trail log with '+agent)
    await expect(local.locator('[data-block-content]').filter({hasText:'North ridge shelter'})).toBeInViewport()
    await opened.getByRole('link',{name:priorTitle,exact:true}).click()
    await expect(local.getByRole('heading',{name:priorTitle,exact:true})).toBeVisible()
    await side.getByLabel('Message the agent').fill('Try a forbidden proposal')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    await expect(side.getByRole('alert')).toContainText('Local '+agent+' request failed')
    await expect(side.getByRole('button',{name:'Apply',exact:true})).toHaveCount(0)
    await expect(access(join(dir,'unexpected-write-tool'))).rejects.toMatchObject({code:'ENOENT'})
    await side.getByLabel('Agent permissions').selectOption('suggest')
    await side.getByLabel('Message the agent').fill('Revise the first paragraph')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    await expect(side.getByText('Local '+agent+' finished.')).toBeVisible()
    await expect(local.locator('[data-block-content]').first()).not.toHaveText('Local edit from '+agent)
    await side.getByRole('button',{name:'Apply',exact:true}).click()
    await expect(local.locator('[data-block-content]').first()).toHaveText('Local edit from '+agent)
    await side.getByLabel('Message the agent').fill('Draft a root page')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    const pageDraft=side.getByRole('region',{name:'New page proposal'}).filter({hasText:'Local page '+agent})
    await expect(pageDraft.locator('pre')).toHaveText('Draft content')
    await pageDraft.getByRole('button',{name:'Dismiss page proposal'}).click()
    await expect(pageDraft).toContainText('dismissed')
    await side.getByLabel('Message the agent').fill('Suggest a root project')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    const proposal=side.getByRole('region',{name:'Project proposal'}).filter({hasText:'Local '+agent+' project'})
    await proposal.getByRole('button',{name:'Dismiss project proposal'}).click()
    await expect(proposal).toContainText(/dismissed/i)
    await side.getByLabel('Message the agent').fill('Rename the sample project')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    const renameSample=side.getByRole('region',{name:'Project proposal'}).filter({hasText:'Sample '+agent})
    await expect(renameSample.locator('del')).toHaveText('Spring sample')
    await expect(renameSample.getByRole('button',{name:'Apply project rename'})).toBeVisible()
    await renameSample.getByRole('button',{name:'Dismiss project proposal'}).click()
    await side.getByLabel('Message the agent').fill('Suggest a new title')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    const renamed='Notebook '+agent
    await expect(side.locator('ins').filter({hasText:renamed})).toBeVisible()
    await side.getByRole('button',{name:'Apply',exact:true}).click()
    await expect(local.getByRole('heading',{name:renamed,exact:true})).toBeVisible({timeout:10000})
  }
  const chatAgent=side.getByLabel('Agent for this chat',{exact:true})
  await chatAgent.selectOption('codex')
  await expect(chatAgent).toHaveValue('codex')
  await side.getByLabel('Message the agent').fill('Revise the first paragraph')
  await side.getByRole('button',{name:'Send',exact:true}).click()
  await expect(side.locator('ins').last()).toHaveText('Local edit from codex')
  await side.getByRole('button',{name:'Dismiss',exact:true}).click()
  const interrupted=side.locator('article').getByText('Turn interrupted',{exact:true})
  const waitingPid=join(dir,'waiting-cli')
  for(const end of ['stop','reload']){
    const previousInterruptions=await interrupted.count()
    await side.getByLabel('Message the agent').fill('Wait locally')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    await expect.poll(()=>access(waitingPid).then(()=>true,()=>false)).toBe(true)
    const pid=Number(await readFile(waitingPid,'utf8'))
    await expect(side.locator('article').last()).toContainText('I will check the project list.')
    if(end==='stop')await side.getByRole('button',{name:'Stop response'}).click()
    else{
      await local.reload()
      await local.getByRole('button',{name:'Agent',exact:true}).click()
    }
    await expect(interrupted).toHaveCount(previousInterruptions+1)
    await expect.poll(()=>{
      try{process.kill(pid,0);return true}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;throw error}
    }).toBe(false)
    await rm(waitingPid)
  }
  await local.getByRole('button',{name:'All pages',exact:true}).last().click()
  await expect(local.locator('.library')).toBeVisible()
  await desktop.close()
  desktop=await electron.launch(desktopOptions)
  const reopened=await desktop.firstWindow()
  await reopened.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(reopened.getByLabel('Agent for this chat',{exact:true})).toHaveValue('codex')
  await expect(reopened.getByRole('option',{name:'Device default · hermes'})).toHaveCount(1)
  const stopped=reopened.locator('article[data-author="assistant"]').last()
  await expect(stopped).toContainText('I will check the project list.')
  await expect(stopped).toContainText('Turn interrupted')
  // Crash only this disposable desktop host after its provider has returned a proposal and begun the next step.
  const recoverySide=reopened.getByRole('complementary',{name:'Workspace agent'})
  await recoverySide.getByLabel('Agent for this chat',{exact:true}).selectOption('')
  await expect(recoverySide.getByLabel('Agent for this chat',{exact:true})).toHaveValue('')
  await recoverySide.getByRole('button',{name:'Provider settings'}).click()
  await recoverySide.getByLabel('Connection',{exact:true}).selectOption('api')
  await recoverySide.getByLabel('OpenAI API key').fill('fixture-key')
  await recoverySide.getByRole('button',{name:'Save provider'}).click()
  await recoverySide.getByLabel('Agent permissions').selectOption('suggest')
  await recoverySide.getByRole('button',{name:'Run in background'}).click()
  steps=[()=>({name:'proposeProject',args:{name:'Recovery sampling',parent:null}}),()=>'WAIT_BG']
  await recoverySide.getByLabel('Message the agent').fill('Prepare a recovery project')
  await recoverySide.getByRole('button',{name:'Send',exact:true}).click()
  const projectReview=recoverySide.getByRole('region',{name:'Project proposal'}).filter({hasText:'Recovery sampling'})
  await expect(projectReview).toBeVisible({timeout:10000})
  await expect.poll(()=>steps.length).toBe(0)
  const closed=desktop.waitForEvent('close')
  desktop.process().kill('SIGKILL')
  await closed
  desktop=await electron.launch(desktopOptions)
  const restored=await desktop.firstWindow()
  await restored.getByRole('button',{name:'Agent',exact:true}).click()
  await restored.getByRole('button',{name:'Background tasks'}).click()
  await restored.getByRole('dialog',{name:'Background tasks'}).getByRole('button',{name:/Prepare a recovery project.*Outcome unknown.*Review requested/}).click()
  const recovery=restored.locator('article:focus')
  await expect(recovery).toContainText('Turn outcome unknown')
  await expect(restored.getByRole('navigation',{name:'Library'}).getByRole('button',{name:'Recovery sampling',exact:true})).toHaveCount(0)
  const savedProject=restored.getByRole('region',{name:'Project proposal'}).filter({hasText:'Recovery sampling'})
  await savedProject.getByRole('button',{name:'Create project'}).click()
  await expect(savedProject).toContainText('applied')
  await expect(restored.getByRole('navigation',{name:'Library'}).getByRole('button',{name:'Recovery sampling',exact:true})).toHaveCount(1)
  console.log('Local Codex, Claude Code and Hermes selections, proposals, approval and restart passed with CLI fixtures.')
  console.log('Mastra sidebar, checkpoint, same-page undo, cross-page edits, stale review, interruption and provider failures passed in Chromium and Electron.')
}finally{
  await browser?.close();await desktop?.close();await host.close();fixture.closeAllConnections();fixture.close();await rm(dir,{recursive:true,force:true})
  if(fixtureError)throw fixtureError
}
