/** Optional paid-provider acceptance check. Uses disposable workspaces and synthetic notes. */
import {chooseAgentMode} from './choose-agent-mode'
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {serve} from '../../src/server/service.ts'
if(!process.env.OPENAI_API_KEY&&!process.env.CHULANE_LOCAL_AGENT)throw Error('Set OPENAI_API_KEY or CHULANE_LOCAL_AGENT on the test host to run live acceptance.')
const host=await serve({file:':memory:',assets:resolve('dist'),registration:true,editorKey:'temporary-live-smoke'})
try{
  let cookie=''
  const call=(path:string,body?:object,session=cookie)=>fetch(host.url+'/api/'+path,{method:body?'POST':'GET',headers:{Cookie:session,'Content-Type':'application/json'},body:body&&JSON.stringify(body)})
  cookie=(await call('login',{key:'temporary-live-smoke'})).headers.get('set-cookie')!.split(';')[0]
  await call('workspaces',{name:'Provider acceptance'})
  const other=(await call('register',{username:'colleague',password:randomUUID()})).headers.get('set-cookie')!.split(';')[0]!
  const foreign=await(await call('workspaces',{name:'Private field notes'},other)).json()
  const label='Survey receipt',code=randomUUID(),privateCode=randomUUID()
  const marker='Station '+randomUUID()
  const hidden=await(await call('pages?workspace='+foreign.id,{title:label,content:marker+'. '+privateCode},other)).json()
  assert.equal((await call('source?workspace='+foreign.id+'&id='+hidden.id)).status,404)
  const receipt=await(await call('pages',{title:label,content:'Awaiting field observation'})).json()
  const browser=await chromium.launch()
  try{
    const context=await browser.newContext()
    const page=await context.newPage()
    await context.addCookies([{url:host.url,name:'chulane',value:cookie.slice('chulane='.length)}])
    const author=await context.newPage()
    await author.goto(host.url+'/?workspace=1&page='+receipt.id)
    const field=author.locator('[data-block-content]').first()
    await expect(field).toHaveText('Awaiting field observation')
    const text=marker+'. '+'Field observation. '.repeat(700)+code
    await field.fill(text)
    const block=await field.locator('xpath=ancestor-or-self::*[@data-block-id][1]').getAttribute('data-block-id')
    assert.ok(block)
    await expect.poll(async()=>(await(await call('source?id='+receipt.id+'&blocks=1')).json()).text).toContain(code)
    assert.equal((await(await call('library')).json()).pages.find(item=>item.id===receipt.id).plain,'Awaiting field observation')
    await page.goto(host.url+'/?workspace=1')
    await page.getByRole('button',{name:'Agent',exact:true}).click()
    await chooseAgentMode(page,'Ask')
    await page.getByLabel('Message the agent').fill('Search page text for the exact phrase "'+marker+'", open the matching page in my editor, then quote the full receipt code recorded at the very end of its long paragraph.')
    await page.getByRole('button',{name:'Send',exact:true}).click()
    const answer=page.locator('article[data-author="assistant"]')
    await expect(answer.locator('[data-part="message"]')).toContainText(code,{timeout:185000})
    const link=answer.getByRole('link',{name:label,exact:true})
    await expect(link).toHaveAttribute('href','?workspace=1&page='+receipt.id)
    assert.ok(!(await answer.innerText()).includes(privateCode))
    const catalog=await(await call('agent')).json()
    const lookupView=await(await call('agent/chats/'+catalog.chats[0].id)).json()
    const reply=lookupView.messages.at(-1)
    assert.equal(reply.status,'complete')
    assert.ok(reply.sources.every(source=>source.id!==hidden.id))
    assert.deepEqual(lookupView.edits,[])
    // A passage read replaces the search excerpt for this block. Verify its anchor in the live text.
    const passage=reply.sources.find(source=>source.id===receipt.id&&source.block===block)
    assert.equal(passage?.readFrom?.block,block)
    assert.ok(passage.excerpt)
    const start=passage.readFrom.offset-passage.excerptOffset
    assert.ok(Number.isInteger(start)&&start>=0)
    assert.equal(text.slice(start,start+passage.excerpt.length),passage.excerpt)
    const blockLink=answer.getByRole('link',{name:label+' · '+passage.excerpt,exact:true})
    await expect(blockLink).toHaveAttribute('href','?'+new URLSearchParams({workspace:'1',page:String(receipt.id),block}))
    console.log('Live provider found the published block from another editor and opened its page.')
    await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible()
    await expect(page.locator('.page-surface')).toContainText(code)
    const files:{id:number;name:string;seal:string}[]=[]
    for(const name of ['dispatch.md','logbook.txt']){
      const seal=randomUUID()
      // Neither the prompt nor the search excerpt contains the seal. Each file requires a passage read.
      const upload=await fetch(host.url+'/api/pages/'+receipt.id+'/files?name='+name,{method:'POST',headers:{Cookie:cookie},
        body:'Earlier observation. '.repeat(6800)+'Waypoint Juniper. '+'.'.repeat(600)+seal+'\n'+'Later observation. '.repeat(7200)})
      assert.equal(upload.status,200)
      files.push({name,seal,id:(await upload.json()).id})
    }
    await page.getByLabel('Message the agent').fill('Search for Waypoint Juniper across the attachments. For every matching file, read the passage there, quote the full UUID following the dots and cite its file.')
    await page.getByRole('button',{name:'Send',exact:true}).click()
    const attachmentAnswer=answer.last()
    for(const file of files){
      await expect(attachmentAnswer.locator('[data-part="message"]')).toContainText(file.seal,{timeout:185000})
      await expect(attachmentAnswer.getByRole('link',{name:label+' · '+file.name})).toHaveAttribute('href','/api/pages/'+receipt.id+'/files/'+file.id+'?workspace=1')
    }
    console.log('Live provider read both matching attachments and cited each original file.')
    const canvasPage=await(await call('pages',{title:'Tide chart'})).json()
    const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('tides',doc)),gauge=randomUUID()
    try{
      model.elements.insertElement({type:'text',frame:{x:0,y:0,width:240,height:80},zIndex:0,props:{text:'Harbor gauge '+gauge}})
      const saved=await fetch(host.url+'/api/pages/'+canvasPage.id+'/state',{method:'PUT',headers:{Cookie:cookie,'If-Match':'0','X-Text-Bytes':'0'},body:Buffer.from(Y.encodeStateAsUpdate(doc))})
      assert.equal(saved.status,200)
    }finally{await model.destroy()}
    await page.getByLabel('Message the agent').fill('Search for Harbor gauge, open the matching canvas in my editor and quote the full gauge identifier.')
    await page.getByRole('button',{name:'Send',exact:true}).click()
    await expect(answer.last().locator('[data-part="message"]')).toContainText(gauge,{timeout:185000})
    await expect(page.getByRole('heading',{name:'Tide chart',exact:true})).toBeVisible()
    await expect(page.getByRole('radio',{name:'Canvas',exact:true})).toHaveAttribute('aria-checked','true')
    await expect(answer.last().getByRole('link',{name:/Tide chart/}).first()).toHaveAttribute('href','?workspace=1&page='+canvasPage.id+'&view=canvas')
    console.log('Live provider opened the matching canvas and cited the gauge identifier.')

    const side=page.getByRole('complementary',{name:'Workspace agent'})
    await side.getByRole('button',{name:'New chat'}).click()
    await chooseAgentMode(page,'Suggest')
    const seal=randomUUID()
    const before='Receiving station: PENDING',issued='Issuing station: '+seal
    const attached:{id:number;block:string}[]=[]
    // Both pages have the same title. The receiving block is outside the active editor at send time.
    const records=await Promise.all([before,issued].map(async content=>{
      const response=await call('pages',{title:'Transfer record',content})
      assert.equal(response.status,200)
      return {id:(await response.json()).id as number,content}
    }))
    for(const record of records){
      await page.getByRole('region',{name:'Pages in this view'}).getByRole('button',{name:'Transfer record · #'+record.id,exact:true}).click()
      const article=page.locator('article[data-source-page="'+record.id+'"]:visible')
      const field=article.locator('[data-block-content]').first()
      await expect(field).toHaveText(record.content)
      const block=await field.evaluate(node=>node.closest<HTMLElement>('[data-block-id]')!.dataset.blockId!)
      attached.push({id:record.id,block})
      await article.getByRole('button',{name:'Attach block links to chat'}).first().click()
    }
    const target=attached[0]!
    await expect(side.getByRole('status',{name:'Attached context'})).toContainText('2 block links')
    await side.getByLabel('Message the agent').fill('Use the two attached blocks. Propose replacing only PENDING in the receiving station block with the exact code from the issuing station block. Preserve the rest of both blocks.')
    await side.getByRole('button',{name:'Send',exact:true}).click()
    const replacement=before.replace('PENDING',seal)
    const proposal=side.getByRole('region',{name:'Replace block text'})
    await expect(proposal.locator('ins')).toHaveText(replacement,{timeout:185000})
    await expect(proposal.locator('del')).toHaveText(before)
    const chatId=await side.getByLabel('Conversation',{exact:true}).inputValue()
    const history=await(await call('agent/chats/'+chatId)).json()
    assert.deepEqual(history.messages.find(m=>m.role==='user').sources.map(({id,block})=>({id,block})),attached)
    assert.deepEqual(history.edits.map(({page,block,status})=>({id:page,block,status})),[{...target,status:'pending'}])
    assert.equal((await(await call('source?id='+target.id)).json()).text,before)
    await proposal.getByRole('button',{name:'Apply',exact:true}).click()
    await expect.poll(async()=>(await(await call('source?id='+target.id)).json()).text).toBe(replacement)
    assert.equal((await(await call('source?id='+attached[1]!.id)).json()).text,issued)
    console.log('Live provider used both attached blocks and proposed one edit on the intended page.')
  }finally{await browser.close()}
  const current=await(await call('pages',{title:'Decision',content:'The launch date is July 8.'})).json()
  const parent=await(await call('projects',{name:'Field study'})).json()
  const project=await(await call('projects',{name:'Milestones',parent:parent.id})).json()
  const decoy=await(await call('pages',{title:'Roadmap',content:'Planning'})).json()
  const target=await(await call('pages',{title:'Roadmap',content:'Planning',project:project.id})).json()
  const chat=await(await call('agent/chats',{})).json(),path='agent/chats/'+chat.id
  const turn=await call(path+'/turn',{text:'Browse Field study and its Milestones subproject. Read the Roadmap page in Milestones and propose appending one paragraph with the launch date from the current page. Leave the identically named root page alone.',page:current.id})
  assert.equal(turn.status,200);await turn.text()
  const view=await(await call(path)).json(),answer=view.messages.at(-1)
  assert.equal(answer.status,'complete')
  assert.ok(answer.sources.some(s=>s.id===target.id))
  const edit=view.edits.find(e=>e.page===target.id && e.status==='pending');assert.ok(edit)
  assert.equal((await call(path+'/edits/'+edit.id+'/apply',{})).status,200)
  assert.match((await(await call('source?id='+target.id)).json()).text,/July 8|8 July|07-08/i)
  assert.equal(view.edits.some(e=>e.page===decoy.id),false)
  assert.equal((await(await call('source?id='+decoy.id)).json()).text,'Planning')
  const rename=await call(path+'/turn',{text:'Read the current page and propose renaming its page title to exactly Launch decision. Keep its paragraphs as they are.',page:current.id})
  assert.equal(rename.status,200);await rename.text()
  const renamedView=await(await call(path)).json()
  assert.equal(renamedView.messages.at(-1).status,'complete')
  const review=renamedView.edits.find(e=>e.kind==='rename'&&e.page===current.id&&e.status==='pending')
  assert.ok(review)
  assert.equal(review.before,'Decision')
  assert.equal(review.after,'Launch decision')
  assert.equal((await(await call('source?id='+current.id)).json()).title,'Decision')
  assert.equal((await call(path+'/edits/'+review.id+'/apply',{})).status,200)
  assert.deepEqual(await(await call('source?id='+current.id)).json(),{id:current.id,title:'Launch decision',text:'The launch date is July 8.'})
  const title='Launch checklist'
  const draftTurn=await call(path+'/turn',{text:'Draft a new page titled Launch checklist in Field study / Milestones. Include the launch date from the current page and leave it pending for review.',page:current.id,allowEdits:true})
  assert.equal(draftTurn.status,200);await draftTurn.text()
  const draftView=await(await call(path)).json()
  assert.equal(draftView.messages.at(-1).status,'complete')
  const proposal=draftView.pages.find(item=>item.status==='pending'&&item.title===title)
  assert.ok(proposal)
  assert.equal(proposal.parent,project.id)
  assert.match(proposal.markdown,/July 8|8 July|07-08/i)
  assert.ok(!(await(await call('library')).json()).pages.some(item=>item.title===title))
  const approved=await call(path+'/pages/'+proposal.id+'/apply',{})
  assert.equal(approved.status,200)
  const {page:created}=await approved.json()
  assert.equal((await(await call('source?id='+created)).json()).text,proposal.markdown)
  console.log('Live provider passed cited lookup, workspace isolation, cross-page edit, reviewed rename and a new page in the requested folder.')
}finally{await host.close()}

// Exercise the desktop-only tool against the selected provider without executing generated code.
const desktopKey=randomUUID()
const desktop=await serve({file:':memory:',assets:'.',desktop:true,editorKey:desktopKey,
  savePlugin:async()=>{throw Error('A model turn must never save a plugin folder on its own.')}})
try{
  const api=async(path:string,data?:object)=>{
    const response=await fetch(desktop.url+'/api/'+path,{method:data?'POST':'GET',
      headers:{Authorization:'Bearer '+desktopKey,'Content-Type':'application/json'},body:JSON.stringify(data)})
    assert.equal(response.status,200)
    return response
  }
  await api('workspaces',{name:'Plugin acceptance'})
  const chat=await(await api('agent/chats',{})).json(),path='agent/chats/'+chat.id
  await(await api(path+'/turn',{text:'Create a desktop plugin called Field note with a slash-menu writing block named Field note. Leave its files in this chat for review.',page:null,allowEdits:true})).text()
  const answer=(await(await api(path)).json()).messages.at(-1)
  assert.equal(answer.status,'complete')
  assert.ok(answer.pluginDraft?.nativeModule.includes('export default'))
  assert.ok(answer.pluginDraft.rendererModule?.includes('MarkdownContent'))
  // The source from the previous turn must come from the saved draft, even if the current page is empty.
  const followup=await api(path+'/turn',{text:'Read the last plugin draft. Rename the plugin to Field notebook, keep both source modules byte-for-byte identical, and submit the revision for review.',page:null,allowEdits:true})
  await followup.text()
  const transcript=await(await api(path)).json(),revision=transcript.messages.at(-1)
  assert.equal(revision.status,'complete')
  assert.deepEqual(revision.pluginDraft,{...answer.pluginDraft,name:'Field notebook'})
  assert.deepEqual(transcript.messages.find(m=>m.id===answer.id).pluginDraft,answer.pluginDraft)
  console.log('Live provider drafted and revised a desktop plugin while preserving both source files.')
}finally{await desktop.close()}
