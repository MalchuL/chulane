/** Exercise Mastra's real HTTP streaming and tool loop against a scripted OpenAI endpoint in both renderers. */
import {chooseAgentMode} from './choose-agent-mode'
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
    if(output==='STREAM_MARKDOWN'){
      emit({role:'assistant',content:'[**First passage**](https://example.org/?workspace=1&page=1)'},null)
      await new Promise<void>(resolve=>{releaseBackground=resolve})
      releaseBackground=undefined
      emit({content:' and a second passage.'},null)
      await new Promise<void>(resolve=>{releaseBackground=resolve})
      releaseBackground=undefined
      emit({},'stop')
    }else if(typeof output==='string'){
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
  const waypoints=await Promise.all([2,1].map(count=>api('pages/import-markdown',{title:'Waypoint notes',content:Array(count).fill('North ridge waypoint').join('\n\n')})))
  const tideMap=await api('pages',{title:'Tide map'})
  const log=await api('pages',{title:'Winter survey',day:'2032-02-29',content:'[Survey map](?workspace=1&page='+tideMap.id+') Tide gauges checked.'})
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('tides',doc))
  const writing='Tidal reading in the log'
  try{
    model.blocks.insertBlock({type:'paragraph',content:writing})
    model.blocks.insertBlock({id:'task-at-pier',type:'todo-item',content:'Check gauge',props:{description:'Inspect the calibration seal'}})
    model.elements.insertElement({type:'text',frame:{x:0,y:0,width:150,height:80},zIndex:0,props:{text:'Tidal reading at the pier'}})
    const text=Buffer.from(writing)
    const frame=Array.from(Buffer.concat([text,Y.encodeStateAsUpdate(doc)]))
    await p.evaluate(async({id,frame,length})=>{
      const response=await fetch('/api/pages/'+id+'/state',{method:'PUT',headers:{'If-Match':'0','X-Text-Bytes':String(length)},body:new Uint8Array(frame)})
      if(!response.ok)throw Error(await response.text())
    },{id:tideMap.id,frame,length:text.length})
  }finally{await model.destroy()}
  const calibration=await api('pages/'+tideMap.id+'/tags',{name:'Calibration',active:true,block:'task-at-pier'},'PUT')
  const tolerance=await api('tags/'+calibration.id+'/fields',{name:'Tolerance',kind:'number'})
  await api('tags/'+calibration.id+'/fields/'+tolerance.id+'/value',{page:tideMap.id,block:'task-at-pier',value:0.25},'PUT')
  const anchor=p.locator('[data-block-content]').filter({hasText:'North ridge marker'})
  const routeText='🧭'.repeat(100001)+'The survey gate opens at dawn.'.padEnd(800,'.')+'Return by the eastern bridge.'
  const uploadText=(name:string,text:string)=>p.evaluate(async({page,name,text})=>{
    const response=await fetch('/api/pages/'+page+'/files?workspace=1&name='+encodeURIComponent(name),{method:'POST',body:text})
    if(!response.ok)throw Error(await response.text())
    return (await response.json()).id
  },{page:other.id,name,text})
  const attachment=await uploadText('route.txt',routeText)
  const sketch=await uploadText('sketch.bin','fixture')
  const schedule=await uploadText('route.txt','The survey gate closes at noon.')
  await p.reload()
  const search=p.getByRole('textbox',{name:'Search pages'})
  await search.fill('calibration seal')
  await p.getByRole('button',{name:'Tide map Inspect the calibration seal'}).click()
  await expect(p.locator('[data-block-id="task-at-pier"]').first()).toBeInViewport()
  await p.getByRole('button',{name:'All pages',exact:true}).last().click()
  await search.fill('north ridge')
  await p.getByRole('button',{name:'Trail log North ridge marker'}).click()
  await expect(anchor).toBeInViewport()
  await p.getByRole('button',{name:'All pages',exact:true}).last().click()
  const searchStatus=p.getByRole('status',{name:'Library search'})
  let releaseSearch:()=>void
  const paused=new Promise<void>(resolve=>{releaseSearch=resolve})
  const delayed='**/api/library/search?*q=survey%20gate'
  await p.route(delayed,async route=>{
    await paused
    await route.fulfill({status:503,json:{error:'Search temporarily unavailable'}})
  },{times:1})
  try{
    const requested=p.waitForRequest(request=>request.url().includes('q=survey%20gate'))
    await search.fill('survey gate')
    await requested
    await expect(searchStatus).toHaveText('Searching…')
    await expect(p.getByRole('heading',{name:'No matching pages'})).toHaveCount(0)
    await expect(search).toBeFocused()
  }finally{releaseSearch!()}
  await expect(searchStatus).toHaveText('Search unavailable')
  await expect(p.getByRole('heading',{name:'No matching pages'})).toHaveCount(0)
  await expect(searchStatus).toHaveText('1 page',{timeout:10000})
  await expect(search).toBeFocused()
  await expect(p.getByRole('button',{name:/Roadmap.*route.txt/})).toBeVisible()
  const matches=p.getByRole('button',{name:'Matching attachments for Roadmap'})
  await matches.focus()
  await matches.press('Enter')
  const filesFound=p.getByRole('dialog',{name:'Matching attachments for Roadmap'})
  await expect(filesFound.getByRole('link')).toHaveCount(2)
  await expect(filesFound.getByRole('link',{name:new RegExp('route.txt · #'+schedule+' ')})).toContainText('The survey gate closes at noon.')
  await expect(filesFound.getByRole('link',{name:new RegExp('route.txt · #'+attachment+' ')})).toHaveAttribute('download','route.txt')
  if(!configure){
    const downloaded=p.waitForEvent('download')
    await filesFound.getByRole('link',{name:new RegExp('route.txt · #'+schedule+' ')}).click()
    const file=await downloaded
    expect(file.suggestedFilename()).toBe('route.txt')
    expect(await readFile((await file.path())!,'utf8')).toBe('The survey gate closes at noon.')
  }
  await p.keyboard.press('Escape')
  await expect(matches).toBeFocused()
  await p.getByRole('button',{name:'Clear search'}).click()
  const side=p.getByRole('complementary',{name:'Workspace agent'})
  await p.getByRole('button',{name:/Review \d+ pending requests?/}).click()
  const originalReview=p.getByRole('alert').filter({hasText:'Fresh red fox'})
  const targetLink=originalReview.getByRole('link')
  await expect(targetLink).toHaveAttribute('href','?workspace=1&page='+current.id+'&block=%40import')
  await targetLink.click()
  const field=p.locator('[data-block-content]').first()
  await expect(field).toHaveText('Red fox')
  await expect(p.locator('[data-block-id="@import"]').first()).toBeInViewport()
  if(!await originalReview.isVisible())await p.getByRole('button',{name:/Review \d+ pending requests?/}).click()
  await originalReview.getByRole('button',{name:'approve',exact:true}).click()
  await expect(field).toHaveText('Fresh red fox')
  await p.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(side.getByRole('button',{name:'Send',exact:true})).toBeVisible()
  // Pinning the active page changes its chip in place. Feedback must leave the transcript still.
  const transcript=side.getByRole('log',{name:'Chat messages'})
  const transcriptHeight=await transcript.evaluate(node=>node.clientHeight)
  await side.getByRole('button',{name:'Add page',exact:true}).press('Enter')
  await p.getByRole('dialog',{name:'Add page to context'}).getByRole('option',{name,exact:true}).click()
  const pinnedPage=side.getByRole('button',{name:'Remove '+name,exact:true})
  await expect(pinnedPage).toBeVisible()
  await expect(side.getByLabel('Message the agent')).toBeFocused()
  expect(await transcript.evaluate(node=>node.clientHeight)).toBe(transcriptHeight)
  const attachedContext=side.getByRole('status',{name:'Attached context'})
  await expect(attachedContext).toHaveText('1 page and 0 block links attached.')
  await pinnedPage.press('Enter')
  await expect(attachedContext).toHaveText('0 pages and 0 block links attached.')
  await expect(side.getByLabel('Message the agent')).toBeFocused()
  await side.getByRole('button',{name:'Add page',exact:true}).press('Enter')
  const contextPicker=p.getByRole('dialog',{name:'Add page to context'})
  const contextSearch=contextPicker.getByRole('combobox',{name:'Find a page'})
  await expect(contextSearch).toBeFocused({timeout:1500})
  await contextSearch.fill('Waypoint notes')
  for(const waypoint of waypoints)await expect(contextPicker.getByRole('option',{name:'Waypoint notes · #'+waypoint.id,exact:true})).toBeVisible()
  const waypointOptions=contextPicker.getByRole('option')
  await expect(waypointOptions.first()).toHaveAttribute('aria-selected','true')
  await contextSearch.press('ArrowDown')
  await expect(waypointOptions.nth(1)).toHaveAttribute('aria-selected','true')
  await expect(contextSearch).toHaveAttribute('aria-activedescendant',(await waypointOptions.nth(1).getAttribute('id'))!)
  await contextSearch.fill('#'+waypoints[1].id)
  await contextSearch.press('Enter')
  const waypointChip=side.getByRole('button',{name:'Remove Waypoint notes · #'+waypoints[1].id,exact:true})
  await expect(waypointChip).toBeVisible()
  await expect(side.getByLabel('Message the agent')).toBeFocused()
  await waypointChip.press('Enter')
  // Identical passages on same-named pages remain independently navigable in the draft.
  const pagesInView=p.getByRole('region',{name:'Pages in this view'})
  const attachedWaypoints:{label:string;href:string}[]=[]
  for(const waypoint of waypoints){
    const pageName='Waypoint notes · #'+waypoint.id
    await pagesInView.getByRole('button',{name:pageName,exact:true}).click()
    const article=p.locator('article[data-source-page="'+waypoint.id+'"]:visible')
    const content=article.locator('[data-block-content]').first()
    await expect(content).toHaveText('North ridge waypoint')
    const block=await content.evaluate(el=>el.closest('[data-block-id]')!.getAttribute('data-block-id')!)
    await article.getByRole('button',{name:'Attach block links to chat'}).first().press('Enter')
    attachedWaypoints.push({label:'North ridge waypoint · '+pageName+' · Block #'+block,
      href:'?workspace=1&page='+waypoint.id+'&block='+encodeURIComponent(block)})
  }
  for(const waypoint of attachedWaypoints)await expect(side.getByRole('link',{name:waypoint.label,exact:true})).toHaveAttribute('href',waypoint.href)
  await side.getByRole('button',{name:'Remove block link: '+attachedWaypoints[0].label,exact:true}).press('Enter')
  await expect(side.getByRole('link',{name:'North ridge waypoint',exact:true})).toHaveAttribute('href',attachedWaypoints[1].href)
  await side.getByRole('button',{name:'Remove block link: North ridge waypoint',exact:true}).press('Enter')
  await pagesInView.getByRole('button',{name,exact:true}).click()
  await expect(field).toHaveText('Fresh red fox')
  if(configure){
    const connection=side.getByLabel('Connection',{exact:true})
    await expect(connection).toHaveValue('codex')
    await side.getByRole('button',{name:'Use local codex'}).click()
    await expect(side.getByText('Connected to local codex.')).toBeVisible()
    const pin=side.getByLabel('Agent for this chat',{exact:true})
    const initialDraft=side.getByLabel('Message the agent')
    await p.getByRole('button',{name:'Attach block links to chat',exact:true}).first().press('Enter')
    await expect(attachedContext).toHaveText('0 pages and 1 block link attached.')
    await initialDraft.fill('Keep these field notes')
    const signedOut=join(dir,'signed-out')
    await writeFile(signedOut,'')
    try{
      await pin.selectOption('claude')
      await expect(side.getByRole('alert')).toContainText('claude auth login')
      await expect(side.getByLabel('Conversation',{exact:true})).toHaveValue('0')
      await expect(initialDraft).toHaveValue('Keep these field notes')
      await expect(attachedContext).toHaveText('0 pages and 1 block link attached.')
      expect(await p.evaluate(async()=>(await(await fetch('/api/agent')).json()).chats)).toEqual([])
    }finally{await rm(signedOut)}
    await pin.selectOption('claude')
    await expect(pin).toHaveValue('claude')
    await expect(initialDraft).toHaveValue('Keep these field notes')
    expect(await p.evaluate(async()=>(await(await fetch('/api/agent')).json()).chats.map((chat:{agent:string})=>chat.agent))).toEqual(['claude'])
    await expect(attachedContext).toHaveText('0 pages and 1 block link attached.')
    await side.getByRole('button',{name:/^Remove block link:/}).press('Enter')
    await pin.selectOption('')
    await expect(pin).toHaveValue('')

    await side.getByRole('button',{name:'Provider settings'}).click()
    await connection.selectOption('api')
    await side.getByLabel('OpenAI API key').fill('fixture-key')
    await side.getByRole('button',{name:'Save provider'}).click()
    await expect(side.getByRole('button',{name:'Provider settings'})).toBeVisible()
  }
  async function send(text:string){await side.getByLabel('Message the agent').fill(text);await side.getByRole('button',{name:'Send',exact:true}).click()}
  const permissions=side.getByRole('button',{name:/^Agent permissions:/})
  await p.mouse.move(0,0)
  await permissions.hover()
  await expect(p.getByRole('tooltip')).toContainText('Review each workspace change')
  await permissions.press('Enter')
  const selected=p.getByRole('menuitemradio',{name:'Suggest',exact:true})
  await expect(selected).toBeChecked()
  await expect(p.getByRole('tooltip')).toBeHidden()
  const items=p.getByRole('menuitemradio')
  await expect(items).toHaveCount(4)
  const colors=await items.evaluateAll(rows=>rows.map(row=>getComputedStyle(row.querySelector('[data-agent-mode]')!).color))
  expect(new Set(colors).size).toBe(4)
  await p.keyboard.press('Escape')
  await expect(permissions).toBeFocused()
  await chooseAgentMode(p,'Ask')
  await expect(permissions.locator('svg').first()).toBeVisible()
  expect(await permissions.evaluate(button=>getComputedStyle(button).borderTopStyle)).toBe('solid')
  if(!configure){
    // Creating the first chat assigns an ID before the message itself is acknowledged.
    await p.route('**/api/agent/chats/*/turn*',route=>route.fulfill({status:503,json:{error:'Agent temporarily unavailable\n'+'Connection failed.\n'.repeat(24)}}),{times:1})
    await send('Open the roadmap and tell me its status')
    await expect(side.getByRole('alert')).toContainText('Agent temporarily unavailable')
    const details=side.getByRole('region',{name:'Error details'})
    expect(await details.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true)
    await expect(side.getByRole('button',{name:'Send',exact:true})).toBeInViewport({ratio:1})
    await expect(side.getByLabel('Message the agent')).toHaveValue('Open the roadmap and tell me its status')
    await expect(side.getByLabel('Conversation',{exact:true})).not.toHaveValue('0')
  }
  steps=[input=>{
    expect(input.tools.map(tool=>tool.function.name).sort()).toEqual(['browseProject','findProjects','listJournal','listLinkedMessages','listPageLinks','listReviews','openPage','readAttachment','readBlock','readCanvas','readJournalDay','readPage',...(configure?['readPluginDraft']:[]),'readProperties','readText','searchPages'])
    return {name:'browseProject',args:{project:null,offset:0,name:'Field research'}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).entries.map(entry=>entry.name)).toEqual(['Field research'])
    return {name:'browseProject',args:{project:folder.id,offset:0}}
  },input=>{
    expect(JSON.stringify(input.messages.at(-1))).toContain(target)
    return {name:'searchPages',args:{query:'north ridge'}}
  },input=>{
    const hits=JSON.parse(input.messages.at(-1).content)
    expect(hits.filter(hit=>hit.id===passage.id).map(hit=>hit.excerpt)).toEqual(['North ridge marker','North ridge shelter'])
    expect(hits.filter(hit=>hit.excerpt==='North ridge waypoint')).toHaveLength(3)
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
  const composer=side.getByRole('textbox',{name:'Message the agent'})
  for(const shortcut of ['Shift+Enter','Alt+Enter','Control+Enter']){
    await composer.fill('Open the roadmap and tell me its status')
    await composer.evaluate((field:HTMLTextAreaElement)=>field.setSelectionRange(16,21))
    await composer.press(shortcut)
    await expect(composer).toHaveValue('Open the roadmap\ntell me its status')
    expect(await composer.evaluate((field:HTMLTextAreaElement)=>field.selectionStart)).toBe(17)
    await composer.press('ControlOrMeta+z')
    await expect(composer).toHaveValue('Open the roadmap and tell me its status')
    await composer.press('ControlOrMeta+Shift+z')
    await expect(composer).toHaveValue('Open the roadmap\ntell me its status')
  }
  for(const composition of [{isComposing:true},{keyCode:229},{repeat:true}]){
    await composer.dispatchEvent('keydown',{key:'Enter',...composition})
  }
  await expect(side.getByRole('button',{name:'Send',exact:true})).toBeEnabled()
  const posted=p.waitForRequest(req=>req.method()==='POST'&&new URL(req.url()).pathname.endsWith('/turn'))
  await composer.press('Enter')
  expect((await posted).postDataJSON().text).toBe('Open the roadmap\ntell me its status')
  await expect(p.getByRole('heading',{name:target,exact:true})).toBeVisible()
  for(const id of [attachment,schedule]){
    const file=p.getByRole('region',{name:'Document properties'}).getByRole('link',{name:'route.txt · #'+id,exact:true})
    await expect(file).toHaveAttribute('download','route.txt')
    await expect(file).toHaveAttribute('href','/api/pages/'+other.id+'/files/'+id+'?workspace=1')
  }
  await expect(side.getByRole('button',{name:'Stop response'})).toBeVisible()
  await expect.poll(()=>!!releaseBackground).toBe(true)
  releaseBackground!()
  await expect(side.getByText('The roadmap is still a draft.')).toBeVisible({timeout:25000})
  await expect(side.getByRole('button',{name:'Apply',exact:true})).toHaveCount(0)
  const save=p.getByRole('button',{name:'Save now'})
  if(await save.isVisible())await save.click()
  await expect(p.locator('.save')).toHaveText('Saved')
  // Recorded citations retain their names when the underlying page is renamed.
  await api('pages/'+waypoints[1].id,{title:'Revised waypoints',baseTitle:'Waypoint notes'},'PATCH')
  await p.reload()
  await p.getByRole('button',{name:new RegExp(name)}).click()
  await p.getByRole('button',{name:'Agent',exact:true}).click()
  for(const [index,page] of waypoints.entries()){
    const citations=side.locator('[data-part=sources] a').filter({hasText:'Waypoint notes · #'+page.id+' · North ridge waypoint'})
    await expect(citations).toHaveCount(index===0?2:1)
    for(const link of await citations.all()){
      const address=new URL((await link.getAttribute('href'))!,p.url())
      const block=address.searchParams.get('block')!
      expect(address.searchParams.get('page')).toBe(String(page.id))
      if(index===0)await expect(link).toHaveAccessibleName('Waypoint notes · #'+page.id+' · North ridge waypoint · Block #'+block)
      await link.press('Enter')
      await expect.poll(()=>new URL(p.url()).searchParams.get('block')).toBe(block)
      await expect(p.locator('[data-block-id="'+block+'"]').first()).toBeInViewport()
      await expect(p.getByRole('heading',{name:index===0?'Waypoint notes':'Revised waypoints',exact:true})).toBeVisible()
    }
  }
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
  steps=[()=>({name:'listPageLinks',args:{id:log.id,after:0}}),input=>{
    const {entries}=JSON.parse(input.messages.at(-1).content)
    expect(entries).toEqual([{id:tideMap.id,title:'Tide map'}])
    return {name:'readPage',args:{id:entries[0].id,offset:0}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).blocks[0].text).toBe(writing)
    return {name:'listPageLinks',args:{id:tideMap.id,after:0,direction:'incoming'}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).entries).toContainEqual({id:log.id,title:'Winter survey',day:'2032-02-29'})
    return 'The winter survey links to the tide map.'
  }]
  await send('Follow the page linked from Winter survey and check which pages reference it')
  await expect(side.getByText('The winter survey links to the tide map.')).toBeVisible()
  const linkAnswer=side.locator('article').filter({hasText:'The winter survey links to the tide map.'})
  await expect(linkAnswer.locator('[data-part=sources] a').filter({hasText:'Winter survey'})).toHaveAttribute('href','?workspace=1&page='+log.id)
  const linkLookup=linkAnswer.getByRole('button',{name:/List page links/}).first()
  await linkLookup.click()
  await expect(linkLookup).toHaveAttribute('aria-expanded','true')
  await expect(side.getByRole('region',{name:/List page links/})).toContainText('Tide map')
  await linkLookup.click()
  const pageAddress=new URL('?view=page&page='+passage.id+'&workspace=1',p.url()).href
  const blockAddress='?workspace=1&page='+tideMap.id+'&block=task-at-pier'
  steps=[()=>`[Trail writing](?view=page&page=${passage.id}&workspace=1), [Trail web](${pageAddress}) and [Gauge task](${blockAddress})`]
  await send('Link to the writing and the gauge task')
  const writingLink=side.getByRole('link',{name:'Trail writing',exact:true})
  const gaugeLink=side.getByRole('link',{name:'Gauge task',exact:true})
  async function checkWebLink(link:import('@playwright/test').Locator,address:string){
    const original=p.url()
    if(configure){
      await desktop!.evaluate(({shell})=>{
        delete process.env.CHULANE_TEST_OPENED_LINK
        shell.openExternal=async url=>{process.env.CHULANE_TEST_OPENED_LINK=url}
      })
      await link.press('Enter')
      await expect.poll(()=>desktop!.evaluate(()=>process.env.CHULANE_TEST_OPENED_LINK)).toBe(address)
    }else{
      const [tab]=await Promise.all([p.waitForEvent('popup'),link.press('Enter')])
      await expect(tab).toHaveURL(address)
      await tab.close()
    }
    expect(p.url()).toBe(original)
  }
  await checkWebLink(side.getByRole('link',{name:'Trail web',exact:true}),pageAddress)
  const openWindows=p.context().pages().length
  await writingLink.press('Enter')
  await expect(p.getByRole('heading',{name:'Trail log',exact:true})).toBeVisible()
  await expect(p.getByRole('radio',{name:'Page',exact:true})).toHaveAttribute('aria-checked','true')
  expect(p.context().pages()).toHaveLength(openWindows)
  await gaugeLink.click()
  await expect.poll(()=>new URL(p.url()).searchParams.get('block')).toBe('task-at-pier')
  await expect(p.locator('[data-block-id="task-at-pier"]').first()).toBeInViewport()
  if(!configure){
    const [tab]=await Promise.all([p.context().waitForEvent('page'),gaugeLink.click({modifiers:['ControlOrMeta']})])
    await expect.poll(()=>new URL(tab.url()).searchParams.get('block')).toBe('task-at-pier')
    await tab.close()
  }
  steps=[input=>{
    const prompt=JSON.parse(input.messages.at(-1).content)
    expect(prompt.workspaceCalendar.today).toBe(new Intl.DateTimeFormat('sv-SE',{timeZone:prompt.workspaceCalendar.timeZone}).format(new Date()))
    return {name:'listJournal',args:{before:'2032-03-01'}}
  },input=>{
    const {entries}=JSON.parse(input.messages.at(-1).content)
    const day=entries.find(entry=>entry.id===log.id)
    expect(day).toMatchObject({day:'2032-02-29',title:'Winter survey'})
    return {name:'readJournalDay',args:{day:day.day}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content)).toMatchObject({id:log.id,day:'2032-02-29',title:'Winter survey'})
    return {name:'listLinkedMessages',args:{before:null}}
  },input=>{
    const {messages}=JSON.parse(input.messages.at(-1).content)
    const link=messages.flatMap(message=>message.links).find(link=>link.id===tideMap.id&&link.surface==='canvas')
    expect(link).toBeDefined()
    return {name:'openPage',args:{id:link.id,block:null,surface:link.surface}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).canvasText).toContain('Tidal reading at the pier')
    return {name:'readText',args:{id:tideMap.id,block:null,offset:6}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).text).toBe('reading at the pier')
    return {name:'readText',args:{id:tideMap.id,block:'task-at-pier',offset:0,field:'description'}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).text).toBe('Inspect the calibration seal')
    return {name:'readProperties',args:{id:tideMap.id,block:'task-at-pier',offset:0}}
  },input=>{
    const [property]=JSON.parse(input.messages.at(-1).content).entries
    expect(property).toMatchObject({tag:{name:'Calibration'},field:{name:'Tolerance',value:0.25}})
    return 'Opened the cited tide map. The recorded tolerance is 0.25.'
  }]
  await send('Reopen the canvas you cited for the pier and check the recorded tolerance')
  const propertyAnswer=side.locator('article').filter({hasText:'The recorded tolerance is 0.25.'})
  await expect(propertyAnswer.locator('[data-part=sources] a[href*="block=task-at-pier"]')).toHaveCount(1)
  await propertyAnswer.getByRole('button',{name:/Read properties/}).click()
  await expect(propertyAnswer.getByRole('region',{name:/Read properties/})).toContainText('Tolerance')
  await expect(p.getByRole('radio',{name:'Canvas',exact:true})).toHaveAttribute('aria-checked','true')
  await expect(side.locator('article').filter({hasText:'Opened the cited tide map.'}).getByRole('link',{name:'Tide map · reading at the pier',exact:true})).toHaveAttribute('href','?workspace=1&page='+tideMap.id+'&view=canvas')
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
  const missingFile=side.getByRole('link',{name:'Roadmap · route.txt · #'+schedule,exact:true})
  await missingFile.click()
  await expect(side.getByRole('alert')).toContainText('Page is in the trash')
  await expect(missingFile).toBeVisible()
  await api('pages/'+other.id,{deleted:false},'PATCH')
  await expect(missingFile).toHaveAttribute('href','/api/pages/'+other.id+'/files/'+schedule+'?workspace=1')
  const citation=side.getByRole('link',{name:'Roadmap · route.txt · #'+attachment,exact:true})
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
    const blockUrl=new URL(shelterHref,'https://example.test')
    const link=messages.filter(message=>message.role==='assistant').flatMap(message=>message.links)
      .find(link=>link.id===passage.id&&link.block===blockUrl.searchParams.get('block'))
    expect(link).toBeDefined()
    expect(link).not.toHaveProperty('excerpt')
    return {name:'openPage',args:{id:link.id,block:link.block}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).blocks[0].text).toBe('North ridge shelter')
    return {name:'listLinkedMessages',args:{before:null}}
  },input=>{
    const {messages}=JSON.parse(input.messages.at(-1).content)
    const files=messages.find(message=>message.attachments?.some(file=>file.name==='route.txt')).attachments
    const route=files.find(file=>file.file===attachment)
    expect(route.file).toBe(attachment)
    return {name:'readAttachment',args:{id:route.id,file:route.file,offset:route.matchOffset}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).text).toContain('Return by the eastern bridge.')
    return {name:'readAttachment',args:{id:other.id,file:'all',offset:0}}
  },input=>{
    const {files}=JSON.parse(input.messages.at(-1).content)
    expect(files).toContainEqual({id:sketch,name:'sketch.bin',readable:false})
    expect(files).toContainEqual({id:attachment,name:'route.txt',readable:true})
    return 'The cited route returns by the eastern bridge.'
  }]
  await send('Reopen the shelter block and route file you cited earlier')
  await expect(side.getByText('The cited route returns by the eastern bridge.')).toBeVisible()
  await expect(p.getByRole('heading',{name:'Trail log',exact:true})).toBeVisible()
  await expect(p.locator('[data-block-content]').filter({hasText:'North ridge shelter'})).toBeInViewport()
  let supplyBlock=''
  steps=[()=>({name:'searchPages',args:{query:'Supply depot'}}),input=>{
    const [hit]=JSON.parse(input.messages.at(-1).content)
    supplyBlock=hit.block
    expect(hit.excerpt).not.toContain('shelf B')
    expect(hit.readFrom).toEqual({block:hit.block,offset:17000})
    return {name:'readText',args:{id:hit.id,...hit.readFrom}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).text).toContain('Store water on shelf B.')
    return {name:'readText',args:{id:passage.id,block:supplyBlock,offset:17500}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).text).toBe('Store water on shelf B.')
    return 'Water is on shelf B.'
  }]
  await send('Find the supply depot instructions')
  await expect(side.getByText('Water is on shelf B.')).toBeVisible()
  await expect(side.locator('article[data-author="assistant"]').filter({hasText:'Water is on shelf B.'}).getByRole('link',{name:'Trail log · Store water on shelf B.'})).toHaveAttribute('href',new RegExp('page='+passage.id+'&block=.+'))
  await side.getByRole('link',{name:'Trail log · Store water on shelf B.'}).click()
  const citedWriting=p.locator('[data-block-id="'+supplyBlock+'"] [data-block-content]').first()
  // Edit the cited block directly so the model has to relocate the saved quote in the next turn.
  await citedWriting.fill('Updated inventory. '+'🧭'.repeat(8500)+'Supply depot'.padEnd(500,'.')+'Store water on shelf B.')
  steps=[()=>({name:'listLinkedMessages',args:{before:null}}),input=>{
    const citation=JSON.parse(input.messages.at(-1).content).messages.find(message=>message.prompt==='Water is on shelf B.')
    const link=citation.links.find(link=>link.block===supplyBlock)
    return {name:'readText',args:{id:link.id,...link.readFrom,message:citation.message}}
  },input=>{
    expect(JSON.parse(input.messages.at(-1).content).text).toBe('Store water on shelf B.')
    return 'The relocated passage still specifies shelf B.'
  }]
  await send('Recheck the same passage after my inventory edit')
  await expect(side.getByText('The relocated passage still specifies shelf B.')).toBeVisible()
  await expect(permissions).toHaveText('Ask')
  await p.getByRole('radio',{name:'Canvas',exact:true}).click()
  await chooseAgentMode(p,'Append')
  const sticky={type:'sticker',x:40,y:60,width:200,height:100,text:'Tide board'}
  let elementId=''
  steps=[input=>{
    const board=JSON.parse(input.messages.filter(m=>m.role==='user').at(-1).content).currentDocument
    expect(board.surface).toBe('canvas')
    return {name:'editCanvas',args:{id:board.id,element:null,value:sticky}}
  },input=>{const added=JSON.parse(input.messages.at(-1).content);expect(added.applied).toBeTruthy();elementId=added.element;return 'Added the sticky.'}]
  await send('Add a sticky to this canvas')
  await expect(side.getByText('Added the sticky.',{exact:true})).toBeVisible()
  await expect(p.locator('.edgeless-sticker-text').filter({hasText:'Tide board'}).first()).toBeVisible()
  await expect(side.getByRole('region',{name:'Add canvas element'})).toContainText('applied')
  steps=[()=>({name:'readCanvas',args:{id:passage.id,offset:0}}),()=>({name:'editCanvas',args:{id:passage.id,element:elementId,value:{...sticky,text:'Harbor plan'}}}),()=>'Ready to review the label.']
  await send('Relabel the sticky')
  const canvasReview=side.getByRole('region',{name:'Edit canvas element'}).last()
  await expect(canvasReview).toContainText('Harbor plan')
  await canvasReview.getByRole('button',{name:'Apply',exact:true}).click()
  await expect(p.locator('.edgeless-sticker-text').filter({hasText:'Harbor plan'}).first()).toBeVisible()
  await chooseAgentMode(p,'Full')
  steps=[()=>({name:'readCanvas',args:{id:passage.id,offset:0}}),()=>({name:'editCanvas',args:{id:passage.id,element:elementId,value:null}}),()=>'Removed the sticky.']
  await send('Remove the sticky')
  await expect(side.getByText('Removed the sticky.',{exact:true})).toBeVisible()
  await expect(p.locator('.edgeless-sticker-text').filter({hasText:'Harbor plan'})).toHaveCount(0)
  await p.getByRole('radio',{name:'Page',exact:true}).click()
  await chooseAgentMode(p,'Suggest')
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

  await p.getByRole('button',{name:/Review \d+ pending requests?/}).click()
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
  await picker.getByRole('combobox',{name:'Find a page'}).fill('road')
  await picker.getByRole('combobox',{name:'Find a page'}).press('Enter')
  const pageList=p.getByRole('region',{name:'Pages in this view'})
  await pageList.getByRole('button',{name:target,exact:true}).click()
  await expect(side.getByTitle('Current document: '+target,{exact:true})).toBeVisible()
  await addPage.click()
  await picker.getByRole('option',{name:'Station index',exact:true}).click()
  await pageList.getByRole('button',{name,exact:true}).click()
  await expect(side.getByRole('button',{name:'Remove '+target})).toBeVisible({timeout:1500})
  await addPage.click()
  await picker.getByRole('option',{name,exact:true}).click()
  await addPage.click()
  await expect(picker.getByRole('option',{name:'Trail log',exact:true})).toBeDisabled()
  await p.keyboard.press('Escape')
  await expect(addPage).toBeFocused()
  await side.getByRole('button',{name:'Remove '+name,exact:true}).click()
  await expect(side.getByTitle('Current document: '+name,{exact:true})).toBeVisible()
  await addPage.click()
  await picker.getByRole('option',{name,exact:true}).click()
  await side.getByRole('button',{name:'Remove Station index'}).click()
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
  // A completed reference drop must leave the editor's native caret at the end for the split.
  await expect(fields).toHaveText(['Fresh red fox',''])
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
  const handleBounds=(await linkHandle.boundingBox())!
  const x=handleBounds.x+handleBounds.width/2,y=handleBounds.y+handleBounds.height/2
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+16,y,{steps:4})
  await expect(side.getByRole('form',{name:'Chat composer'})).toHaveAttribute('data-drag','ready')
  await p.mouse.move(x,y);await p.keyboard.press('Escape');await p.mouse.up()
  await expect(attachedContext).toHaveText('2 pages and 0 block links attached.')
  await linkHandle.click()
  const linkedBlocks=side.getByRole('button',{name:/Remove block link/})
  await expect(linkedBlocks).toHaveCount(2,{timeout:2500})
  await expect(linkedBlocks.nth(1)).toHaveAccessibleName('Remove block link: '+excerpt)
  await expect(side.getByLabel('Message the agent')).toBeFocused()
  await linkedBlocks.first().press('Enter')
  await expect(side.getByLabel('Message the agent')).toBeFocused()
  await expect(attachedContext).toHaveText('2 pages and 1 block link attached.')
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
  await linkedBlocks.last().click()
  await fields.nth(1).hover()
  await p.locator('.block-handle').nth(1).dragTo(side.getByRole('log',{name:'Chat messages'}))
  await expect(linkedBlocks.nth(1)).toHaveAccessibleName('Remove block link: '+excerpt)
  await expect(fields).toHaveText(['Fresh red fox',observation])
  await expect(side.getByLabel('Message the agent')).toHaveValue('')
  expect(await fields.evaluateAll(elements=>elements.map(el=>el.closest('[data-block-id]')!.getAttribute('data-block-id')))).toEqual(originalIds)
  const chatPicker=side.getByLabel('Conversation',{exact:true})
  const originalChat=await chatPicker.inputValue()
  const message=side.getByLabel('Message the agent')
  const runMode=side.getByRole('button',{name:'Run in background'})
  await runMode.click()
  await message.fill('Review these two blocks')
  await api('pages/'+other.id,{deleted:true},'PATCH')
  const missingPage=side.getByRole('button',{name:'Remove '+target+' · #'+other.id+' (unavailable)'})
  await expect(missingPage).toBeVisible({timeout:10000})
  await expect(side.getByRole('button',{name:'Send',exact:true})).toBeDisabled()
  await expect(message).toHaveValue('Review these two blocks')
  await api('pages/'+other.id,{deleted:false},'PATCH')
  await expect(side.getByRole('button',{name:'Remove '+target,exact:true})).toBeVisible({timeout:10000})
  await expect(side.getByRole('button',{name:'Send',exact:true})).toBeEnabled()
  await side.getByRole('button',{name:'New chat',exact:true}).click()
  await expect(chatPicker).not.toHaveValue(originalChat)
  const otherChat=await chatPicker.inputValue()
  await expect(message).toHaveValue('',{timeout:1500})
  await expect(runMode).toHaveAttribute('aria-pressed','false')
  await expect(linkedBlocks).toHaveCount(0)
  await expect(side.getByRole('button',{name:'Remove '+target})).toHaveCount(0)
  await message.fill('Separate conversation')
  await chatPicker.selectOption(originalChat)
  await expect(message).toHaveValue('Review these two blocks')
  await expect(runMode).toHaveAttribute('aria-pressed','true')
  await runMode.click()
  await expect(linkedBlocks).toHaveCount(2)
  await expect(side.getByRole('button',{name:'Remove '+target})).toBeVisible()
  await chatPicker.selectOption(otherChat)
  await expect(message).toHaveValue('Separate conversation')
  await side.getByRole('button',{name:'Delete conversation',exact:true}).click()
  await p.getByRole('dialog',{name:'Delete this conversation?'}).getByRole('button',{name:'Delete conversation'}).click()
  await expect(chatPicker).toHaveValue(originalChat)
  // Both removed blocks must be identified on the first send, while the valid links stay attached.
  const emptyIds:string[]=[]
  for(let count=3;count<=4;count++){
    await fields.last().press('End')
    await fields.last().press('Enter')
    await expect(fields).toHaveCount(3)
    emptyIds.push(await fields.last().evaluate(node=>node.closest('[data-block-id]')!.getAttribute('data-block-id')!))
    await p.getByRole('button',{name:'Attach block links to chat'}).last().press('Enter')
    await expect(linkedBlocks).toHaveCount(count)
    await fields.last().press('Backspace')
    await expect(fields).toHaveCount(2)
  }
  for(const block of emptyIds){
    const link=side.getByRole('link',{name:'Empty block · '+name+' · Block #'+block,exact:true})
    await expect(link).toHaveAttribute('href','?workspace=1&page='+current.id+'&block='+encodeURIComponent(block))
  }
  await side.getByRole('button',{name:'Send',exact:true}).click()
  for(const block of emptyIds){
    await expect(side.getByRole('button',{name:'Remove block link: Empty block · '+name+' · Block #'+block+' (unavailable)',exact:true})).toBeVisible({timeout:2000})
  }
  await expect(message).toHaveValue('Review these two blocks')
  await side.getByRole('button',{name:'Remove block link: Empty block · '+name+' · Block #'+emptyIds[1]+' (unavailable)',exact:true}).press('Enter')
  await expect(message).toBeFocused()
  await expect(side.getByText(/Restore the unavailable block/)).toBeVisible()
  await side.getByRole('button',{name:'Remove block link: Empty block (unavailable)',exact:true}).click()
  await expect(linkedBlocks).toHaveCount(2)
  await expect(side.getByText(/Restore the unavailable block/)).toHaveCount(0)
  const revisedObservation='Second observation revised before sending'
  await fields.nth(1).fill(revisedObservation)
  let block=''
  const source=(input:any)=>JSON.parse(input.messages.filter(m=>m.role==='user').at(-1).content).currentDocument
  steps=[i=>{const prompt=JSON.parse(i.messages.filter(m=>m.role==='user').at(-1).content)
    expect(prompt.referencedBlocks.map(b=>b.block)).toEqual(originalIds)
    expect(prompt.referencedBlocks.map(b=>b.text)).toEqual(['Fresh red fox',revisedObservation])
    expect(prompt.referencedDocuments[0].blocks[0].text).toBe('Initial roadmap')
    const page=source(i);expect(page.blocks[0].text).toBe('Fresh red fox');block=page.blocks[0].id;return {name:'proposeEdit',args:{id:current.id,block,text:'Fresh blue fox'}}},()=> 'Review the color change.']
  const sentContext=p.waitForRequest(r=>r.method()==='POST'&&new URL(r.url()).pathname.endsWith('/turn'))
  await send('Change red to blue')
  expect((await sentContext).postDataJSON()).toMatchObject({page:current.id,references:[other.id]})
  await expect(side.getByText('Review the color change.')).toBeVisible({timeout:25000})
  await expect(side.getByRole('button',{name:'Remove '+target})).toHaveCount(0)
  await expect(side.locator('article[data-author="assistant"]').getByRole('link',{name:/Second observation/}).last()).toHaveAttribute('href',/block=/)
  const textReview=side.getByRole('region',{name:'Replace block text'}).filter({hasText:'Fresh blue fox'})
  await expect(textReview.getByRole('link',{name:name+' · #'+current.id,exact:true})).toHaveAttribute('href','?workspace=1&page='+current.id+'&block='+encodeURIComponent(block),{timeout:1500})
  await api('pages/'+current.id,{title:'Renamed field notebook'},'PATCH')
  const reviewedLink=textReview.getByRole('link',{name:'Renamed field notebook · #'+current.id,exact:true})
  await expect(reviewedLink).toBeVisible({timeout:10000})
  await expect(textReview).toContainText('Requested for “'+name+'”')
  await textReview.getByRole('button',{name:'Apply',exact:true}).click()
  await expect(field).toHaveText('Fresh blue fox')
  await api('pages/'+current.id,{title:name},'PATCH')
  await expect(textReview).toContainText('Approved as “Renamed field notebook”',{timeout:10000})
  await expect(textReview.getByRole('link',{name:name+' · #'+current.id,exact:true})).toHaveAttribute('href','?workspace=1&page='+current.id+'&block='+encodeURIComponent(block))
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
  await expect(p.getByRole('tab',{name:target,selected:true,exact:true})).toBeVisible()
  await expect(p.locator('.page-surface')).toContainText('Ship it on Friday')
  const appended=p.locator('[data-block-id]').filter({hasText:'Ship it on Friday'}).last()
  const appendedId=await appended.getAttribute('data-block-id')
  expect(appendedId).toBeTruthy()
  await expect(side.getByRole('region',{name:'Append paragraph'}).filter({hasText:'Ship it on Friday'}).getByRole('link')).toHaveAttribute('href','?workspace=1&page='+other.id+'&block='+encodeURIComponent(appendedId!))
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
  const reviewFolder=await api('projects',{name:'Winter sample',parent:folder.id})
  steps=[()=>({name:'findProjects',args:{name:'winTER sam',match:'path',offset:0}}),
    ()=>({name:'proposeProjectRename',args:{id:reviewFolder.id,name:'Spring sample'}}),()=>'Review the folder name.']
  await send('Rename Winter sample to Spring sample')
  const renameReview=side.getByRole('region',{name:'Project proposal'}).filter({hasText:'Spring sample'})
  await expect(renameReview.locator('del')).toHaveText('Winter sample')
  await expect(renameReview.locator('ins')).toHaveText('Spring sample')
  await expect(p.getByRole('navigation',{name:'Library',exact:true}).getByRole('button',{name:'Winter sample'})).toBeVisible()
  await renameReview.getByRole('button',{name:'Apply project rename'}).click()
  await expect(p.getByRole('navigation',{name:'Library',exact:true}).getByRole('button',{name:'Spring sample'})).toBeVisible()
  if(!configure){
    const prompt='Check the station twice'
    steps=[()=>'First station report.']
    await p.route('**/api/agent/chats/*/turn*',async route=>{
      expect((await route.fetch()).ok()).toBe(true)
      await route.fulfill({status:502,json:{error:'Turn acknowledgement lost'}})
    },{times:1})
    await send(prompt)
    await expect(side.getByRole('alert')).toContainText('Turn acknowledgement lost')
    await send(prompt)
    await expect(message).toHaveValue('')
    await expect(transcript.getByText('First station report.',{exact:true})).toHaveCount(1)
    await expect(transcript.getByText(prompt,{exact:true})).toHaveCount(1)
    steps=[()=>'Second station report.']
    // Read the start of the thread after submitting, before the host acknowledges the turn.
    await expect.poll(()=>transcript.evaluate(node=>node.scrollTop)).toBeGreaterThan(0)
    await p.route('**/api/agent/chats/*/turn*',async route=>{
      await transcript.evaluate(async node=>{
        const scrolled=new Promise(resolve=>node.addEventListener('scroll',resolve,{once:true}))
        node.scrollTop=0
        await scrolled
      })
      await route.continue()
    },{times:1})
    await send(prompt)
    await expect(transcript.getByText('Second station report.',{exact:true})).toBeVisible()
    await expect(transcript.getByText(prompt,{exact:true})).toHaveCount(2)
    expect(await transcript.evaluate(node=>node.scrollTop)).toBe(0)
  }
  steps=[()=> 'STREAM_MARKDOWN'];await send('Show a formatted answer')
  const liveAnswer=side.locator('article[data-author="assistant"]').last()
  await expect(liveAnswer.locator('strong').filter({hasText:'First passage'})).toBeVisible()
  await expect(side.getByRole('button',{name:'Stop response'})).toBeVisible()
  const focusedLink=liveAnswer.getByRole('link',{name:'First passage'})
  let observer:Page|undefined
  if(!configure){
    const reader=await p.context().browser()!.newPage()
    observer=reader
    await reader.request.post(host.url+'/api/login',{data:{key:'view'}})
    await reader.goto(host.url)
    const id=await side.getByLabel('Conversation',{exact:true}).inputValue()
    const connected=reader.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/agent/chats/'+id+'/turn')
    await reader.getByRole('button',{name:'Agent',exact:true}).click()
    const conversation=reader.getByLabel('Conversation',{exact:true})
    if(await conversation.inputValue()!==id)await conversation.selectOption(id)
    expect((await connected).status()).toBe(200)
    await expect(reader.getByRole('link',{name:'First passage'})).toBeVisible()
    await expect(reader.getByRole('button',{name:'Stop response'})).toHaveCount(0)
    // The second passage must reach this reader even when history snapshots are unavailable.
    await reader.route('**/api/agent/chats/'+id+'?*',route=>route.abort())
  }
  await focusedLink.focus()
  releaseBackground!()
  await expect(liveAnswer).toContainText('First passage and a second passage.')
  if(observer){
    await expect(observer.locator('article[data-author="assistant"]').last()).toContainText('First passage and a second passage.')
    await observer.close()
  }
  await expect(side.getByRole('button',{name:'Stop response'})).toBeVisible()
  releaseBackground!()
  await expect(focusedLink).toBeFocused()
  if(!configure)await p.context().route('https://example.org/**',route=>route.fulfill({body:'External research source'}))
  await checkWebLink(focusedLink,'https://example.org/?workspace=1&page=1')
  steps=[()=> 'WAIT'];await send('Wait')
  await expect(side.getByText('Partial answer')).toBeVisible()
  await side.locator('article[data-author="assistant"]').getByRole('link',{name:/Second observation/}).last().click()
  await expect(p.locator('[data-source-page="'+current.id+'"] [data-block-content]').nth(1)).toBeInViewport()
  await expect(side.getByRole('button',{name:'Stop response'})).toBeVisible()
  await message.fill('Queued question')
  await message.press('Enter')
  const waiting=side.getByLabel('Queued messages')
  await expect(waiting).toContainText('Queued question')
  await message.fill('My other draft')
  await waiting.getByRole('button',{name:'Edit queued message'}).click()
  await message.fill('Edited question')
  await message.press('Enter')
  await expect(message).toHaveValue('My other draft')
  await expect(waiting).toContainText('Edited question')
  await waiting.getByRole('button',{name:'Delete queued message'}).click()
  await expect(waiting).toHaveCount(0)
  await p.reload();await p.getByRole('button',{name:'Agent',exact:true}).click()
  await side.getByRole('button',{name:'Stop response'}).click()
  await expect(side.getByText('Turn interrupted')).toBeVisible()
  await expect(side.getByText('Partial answer')).toBeVisible()
  const toggle=side.getByRole('button',{name:'Run in background'})
  steps=[input=>{expect(input.tools.map(tool=>tool.function.name)).not.toContain('openPage');return 'HOLD'},()=>({name:'readPage',args:{id:other.id,offset:0}}),
    ()=>({name:'proposeEdit',args:{id:other.id,block:'',text:'From the background task'}}),()=> 'Background result after leaving.']
  await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','true')
  const backgroundTitle='Finish while away '+'x'.repeat(70)
  await send(backgroundTitle)
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
  await expect(taskList.getByText('Background tasks',{exact:true})).toHaveCSS('user-select','none')
  await expect(taskList.getByText(backgroundTitle,{exact:true})).toHaveCSS('user-select','text')
  const taskViewport=taskList.getByRole('region',{name:'Task list'})
  expect(await taskViewport.evaluate(node=>node.scrollWidth-node.clientWidth)).toBe(0)
  await taskList.getByRole('button',{name:backgroundTitle+' complete · Review requested',exact:true}).click()
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
if(process.argv.slice(2).join(' ')==='app-server --help'){
  console.log('--disable'+(fs.existsSync(require('node:path').join(__dirname,'old-codex'))?'':' --stdio'));process.exit(0);
}
if(process.argv.slice(2).join(' ')==='chat --help'){
  console.log(fs.existsSync(require('node:path').join(__dirname,'old-hermes'))?'--format text':'--oneshot --query-file --safe-mode --toolsets --source --format {text,stream-json}');process.exit(0);
}
if(process.argv.includes('--version')||process.argv.includes('login')) process.exit(0);
const provider=${JSON.stringify(agent)};
const emit=obj=>console.log(JSON.stringify(obj));
const event=(method,params)=>emit({method,params:{threadId:'test',...params}});
function runPrompt(prompt){
const {context,results,schema,publishedMessages}=JSON.parse(prompt);
if(context.history.at(-1).content==='Stream a field note'){
  const start='{"actions":[],"message":"A **live** field note';
  if(provider==='codex'){
    event('item/started',{item:{type:'agentMessage',id:'progress',phase:'commentary'}});
    event('item/agentMessage/delta',{itemId:'progress',delta:'Reading your field note.'});
    event('item/completed',{item:{type:'agentMessage',id:'progress',phase:'commentary',text:'Reading your field note.'}});
    event('item/started',{item:{type:'agentMessage',id:'partial',phase:'partial_answer'}});
    event('item/agentMessage/delta',{itemId:'partial',delta:'Found **two entries**.'});
    event('item/completed',{item:{type:'agentMessage',id:'partial',phase:'partial_answer',text:'Found **two entries**.'}});
    event('item/reasoning/summaryTextDelta',{itemId:'r',summaryIndex:0,delta:'Checking the notebook.'});
    event('item/completed',{item:{id:'r',type:'reasoning',summary:['Checking the notebook.']}});
    event('item/started',{item:{id:'a',type:'agentMessage',phase:'final_answer'}});
    event('item/agentMessage/delta',{itemId:'a',delta:start});
  }else if(provider==='claude'){
    const part=e=>emit({type:'stream_event',event:e});
    part({type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'Checking the notebook.'}});
    part({type:'content_block_stop',index:0});
    part({type:'content_block_start',index:1,content_block:{name:'StructuredOutput'}});
    part({type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:start}});
  }else emit({type:'text',text:start});
  const wait=setInterval(()=>{
    if(!fs.existsSync(require('node:path').join(__dirname,'release-'+provider)))return;
    clearInterval(wait);
    finish({actions:[],message:'A **live** field note completed.'});
  },20);return;
}
if(context.history.at(-1).content==='Check Hermes initialization'){
  console.log(JSON.stringify({type:'result',exit_code:1,error:'credentials or agent init failed',text:'private-cli-diagnostic'}));
  process.exitCode=1;return;
}
if(context.history.at(-1).content==='Try a forbidden proposal'&&['"propose"','"proposeProject"','"proposeProjectRename"','"proposePage"','"proposeRename"','"draftPlugin"'].some(action=>JSON.stringify(schema).includes(action))){
  fs.writeFileSync(require('node:path').join(__dirname,'unexpected-write-tool'),'exposed');
}
const waiting=context.history.at(-1).content==='Wait locally';
if(waiting&&results.length){
  fs.writeFileSync(require('node:path').join(__dirname,'waiting-cli'),String(process.pid));
  setInterval(()=>{},1000);return;
}
if(!context.workspaceCalendar?.today||!context.workspaceCalendar.timeZone)throw Error('Missing workspace calendar');
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
if(context.history.at(-1).content==='Read the calibration tolerance'){
  if(!results.length)answer={message:'',actions:[{type:'search',query:'#Calibration'}]};
  else if(results.length===1){
    const {id,block}=results[0].result[0];
    answer={message:'',actions:[{type:'readProperties',id,block,offset:0}]};
  }else answer={message:'Calibration tolerance: '+results[1].result.entries[0].field.value,actions:[]};
}
if(context.history.at(-1).content==='Read the leap day entry'){
  if(!results.length)answer={message:'',actions:[{type:'listJournal',before:'2032-03-01'}]};
  else if(results.length===1)answer={message:'',actions:[{type:'readJournalDay',day:results[0].result.entries[0].day}]};
  else if(results.length===2)answer={message:'',actions:[{type:'listPageLinks',id:results[1].result.id,after:0}]};
  else if(results.length===3)answer={message:'',actions:[{type:'listPageLinks',id:results[2].result.entries[0].id,after:0,direction:'incoming'}]};
  else if(!results[3].result.entries.some(entry=>entry.id===results[1].result.id))throw Error('Missing journal backlink');
  else answer={message:results[1].result.blocks[0].text+' Linked page: '+results[2].result.entries[0].title,actions:[]};
}
if(context.history.at(-1).content==='Revise the first paragraph'){
  if(!results.length)answer={message:'',actions:[{type:'propose',id,block:'missing-block',text:'Stale replacement'},requestedAction]};
  else if(results.length===1&&results[0].error?.status===409)answer={message:'',actions:[{type:'readBlock',id,block:blocks[0].id}]};
  else if(results.length===2&&results[1].result?.blocks)answer={message:'',actions:[requestedAction]};
  else if(results.length!==3||!results[2].result?.pending)throw Error('Unexpected conflict recovery sequence');
}
if(context.history.at(-1).content==='Rename the sample project'){
  if(!results.length)answer={message:'',actions:[{type:'findProjects',offset:0,name:'sPRING sa',match:'path'}]};
  else if(results.length===1&&results[0].result.entries.length===1)answer={message:'',actions:[{type:'proposeProjectRename',id:results[0].result.entries[0].id,name:'Sample '+${JSON.stringify(agent)}}]};
  else answer={message:'Review the sample name.',actions:[]};
}
if(context.history.at(-1).content==='Open Trail log'){
  if(!results.length)answer={message:'',actions:[{type:'search',query:'North ridge shelter'}]};
  else if(results.length===1)answer={message:'',actions:[{type:'openPage',id:results[0].result[0].id,block:results[0].result[0].block}]};
  else answer={message:'Opened '+results[1].result.title+' with '+${JSON.stringify(agent)},actions:[]};
}
if(waiting)answer={message:'I will check the project list.',actions:[{type:'browse',project:null,offset:0}]};
finish(answer);
}
function finish(answer){
  if(provider==='codex'){
    if(!answer.message.startsWith('A **live** field note'))event('item/completed',{item:{type:'reasoning',id:'summary',summary:['Checking the supplied page context.']}});
    event('item/completed',{item:{type:'agentMessage',id:'a',text:JSON.stringify(answer)}});
    event('turn/completed',{turn:{status:'completed'}});
  }else emit(provider==='claude'?{type:'result',structured_output:answer}:{type:'result',exit_code:0,text:JSON.stringify(answer)});
}
if(provider==='codex'){
  if(!process.argv.includes('--stdio'))throw Error('Expected App Server');
  require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
    const req=JSON.parse(line);
    if(req.method==='initialize')emit({id:req.id,result:{}});
    if(req.method==='config/read')emit({id:req.id,result:{config:{mcp_servers:{unrelated:{}}}}});
    if(req.method==='thread/start'){
      if(req.params.config.mcp_servers.unrelated.enabled!==false)throw Error('Inherited MCP server enabled');
      if(!req.params.ephemeral||req.params.sandbox!=='read-only'||req.params.approvalPolicy!=='never')throw Error('Unrestricted test thread');
      emit({id:req.id,result:{thread:{id:'test'}}});
    }
    if(req.method==='turn/start'){
      if(!req.params.outputSchema)throw Error('Missing response schema');
      emit({id:req.id,result:{turn:{id:'turn'}}});runPrompt(req.params.input[0].text);
    }
  });
}else runPrompt(fs.readFileSync(0,'utf8'));
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
  await chooseAgentMode(local,'Suggest')
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
    if(agent==='codex'){
      const marker=join(dir,'old-codex')
      await writeFile(marker,'')
      await side.getByRole('button',{name:'Use local codex'}).click()
      await expect(side.getByRole('alert')).toContainText('Update Codex CLI. Its app server is missing --stdio.')
      await rm(marker)
    }
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
    await chooseAgentMode(local,'Full')
    await side.getByLabel('Message the agent').fill('Stream a field note')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    const streaming=side.locator('article[data-author="assistant"]').last()
    await expect(streaming.locator('strong').filter({hasText:'live'})).toBeVisible()
    await expect(streaming).not.toContainText('completed.')
    if(agent==='codex'){
      const trace=streaming.getByRole('group',{name:'Agent activity'}).filter({hasText:'Agent update'})
      const update=trace.getByRole('button',{name:/Agent update/})
      await update.focus()
      await update.press('Enter')
      await expect(trace.getByText('Reading your field note.',{exact:true})).toBeVisible()
      await expect(streaming.locator('[data-slot=trace]').getByText(/two entries|live field note/)).toHaveCount(0)
      await expect(streaming.locator('strong').filter({hasText:'two entries'})).toBeVisible()
    }
    if(agent!=='hermes'){
      await streaming.getByRole('button',{name:/^Thinking/}).click()
      await expect(streaming).toContainText('Checking the notebook.')
    }
    await writeFile(join(dir,'release-'+agent),'')
    await expect(streaming).toContainText('A live field note completed.')
    await chooseAgentMode(local,'Ask')
    if(agent==='hermes'){
      await side.getByLabel('Message the agent').fill('Check Hermes initialization')
      await side.getByRole('button',{name:'Send',exact:true}).click()
      await expect(side.getByRole('alert')).toContainText('hermes chat --safe-mode')
      await expect(side).not.toContainText('private-cli-diagnostic')
    }
    await side.getByLabel('Message the agent').fill('Read the leap day entry')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    await expect(side.locator('article[data-author="assistant"]').last()).toContainText('Tide gauges checked. Linked page: Tide map')
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
    await side.getByLabel('Message the agent').fill('Read the calibration tolerance')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    await expect(side.locator('article[data-author="assistant"]').last()).toContainText('Calibration tolerance: 0.25')
    await side.getByLabel('Message the agent').fill('Try a forbidden proposal')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    await expect(side.getByRole('alert')).toContainText('Local '+agent+' request failed')
    await expect(side.getByRole('button',{name:'Apply',exact:true})).toHaveCount(0)
    await expect(access(join(dir,'unexpected-write-tool'))).rejects.toMatchObject({code:'ENOENT'})
    await chooseAgentMode(local,'Suggest')
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
    const turn=side.locator('article').last()
    await turn.getByRole('button',{name:/^Thinking/}).click()
    await expect(turn.getByRole('group',{name:'Agent activity'}).filter({hasText:'Thinking'})).toContainText('Checking the supplied page context.')
    if(end==='stop')await side.getByRole('button',{name:'Stop response'}).click()
    else{
      await local.reload()
      await local.getByRole('button',{name:'Agent',exact:true}).click()
      await side.getByRole('button',{name:'Stop response'}).click()
    }
    await expect(interrupted).toHaveCount(previousInterruptions+1)
    if(end==='reload'){
      await turn.getByRole('button',{name:/^Thinking/}).click()
      await expect(turn.getByRole('group',{name:'Agent activity'}).filter({hasText:'Thinking'})).toContainText('Checking the supplied page context.')
    }
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
  await chooseAgentMode(reopened,'Suggest')
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
