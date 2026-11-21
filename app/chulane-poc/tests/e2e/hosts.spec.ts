/** Rendered smoke check for web and Linux desktop. Uses disposable databases and profiles. */
import {type Page,chromium,_electron as electron,expect} from '@playwright/test'
import {mkdtemp,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {serve} from '../../src/server/service.ts'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'
function textResult(content:unknown):string{
  if(!Array.isArray(content)||typeof content[0]?.text!=='string')throw Error('Expected text tool result')
  return content[0].text
}
const dir=await mkdtemp(join(tmpdir(),'chulane-ui-'))
let browser,host,desktop
async function newPage(p:Page,checkAutosave=false){
  let writes=0
  if(checkAutosave){
    await p.clock.install({time:new Date(2026,0,1)})
    await p.clock.pauseAt(new Date(2026,0,1,0,0,1))
    p.on('request',r=>{if(r.method()==='PUT' && r.url().endsWith('/state'))writes++})
  }
  p.on('pageerror',e=>console.error('Renderer:',e))
  await p.getByRole('button',{name:'New page',exact:true}).click()
  await p.getByLabel('Name',{exact:true}).fill('Field notes')
  await p.getByRole('button',{name:'Save',exact:true}).click()
  await p.locator('.page-surface').waitFor()
  const block=p.locator('[data-block-id]').first()
  await block.click()
  const editable=p.locator('[data-block-content]').first()
  await editable.fill('A durable field observation')
  if(checkAutosave){
    await p.clock.fastForward(299999)
    await expect(p.locator('.save')).toHaveText('Unsaved changes')
    expect(writes).toBe(0)
    await p.clock.fastForward(1)
    await p.clock.resume()
  }else await p.getByRole('button',{name:'Save now'}).click()
  await expect(p.locator('.save')).toHaveText('Saved')
  if(checkAutosave){
    await editable.fill('A later edit')
    await p.clock.fastForward(300000)
    await p.waitForRequest(r=>r.url().includes('/state?since='))
    await expect(p.locator('.save')).toHaveText('Unsaved changes')
    expect(writes).toBe(1)
    await editable.fill('A durable field observation')
    await p.getByRole('button',{name:'Save now'}).click()
    await expect(p.locator('.save')).toHaveText('Saved')
  }
  await p.getByRole('radio',{name:'Canvas',exact:true}).click()
  await expect(p.getByRole('radio',{name:'Canvas',exact:true})).toHaveAttribute('aria-checked','true')
  await p.getByRole('radio',{name:'Page',exact:true}).click()
}
async function reopen(p:Page){await p.getByRole('button',{name:/Field notes/}).click();await expect(p.locator('.page-surface')).toContainText('A durable field observation')}
try{
  if(process.argv[2]!=='desktop'){
    host=await serve({file:join(dir,'web.sqlite'),assets:resolve('dist'),editorKey:'test',viewerKey:'view'})
    browser=await chromium.launch()
    const p=await browser.newPage()
    await p.goto(host.url);await p.getByLabel('Workspace access key').fill('test');await p.getByRole('button',{name:'Open library'}).click()
    await p.setViewportSize({width:360,height:780})
    const menu=p.getByRole('button',{name:'Toggle navigation'})
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded','true')
    await p.locator('.rail').getByRole('button',{name:'Journal',exact:true}).click()
    await expect(menu).toHaveAttribute('aria-expanded','false')
    await expect(p.getByRole('button',{name:'Open today'})).toBeVisible()
    expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBe(360)
    await menu.click()
    await p.locator('.rail').getByRole('button',{name:'All pages',exact:true}).click()
    await p.setViewportSize({width:1280,height:720})
    const opener=p.getByRole('button',{name:'New page',exact:true})
    const modal=p.getByRole('dialog',{name:'New page'})
    for(const dismiss of ['Escape','Cancel']){
      await opener.focus()
      await opener.press('Enter')
      await expect(modal.getByLabel('Name')).toBeFocused({timeout:1500})
      if(dismiss==='Escape')await p.keyboard.press('Escape')
      else await modal.getByRole('button',{name:'Cancel'}).click()
      await expect(modal).toBeHidden()
      await expect(opener).toBeFocused()
    }
    await newPage(p,true);await p.reload()
    const search=p.getByRole('textbox',{name:'Search pages'})
    await search.fill('missing page title')
    await expect(p.getByRole('heading',{name:'No matching pages'})).toBeVisible()
    await p.getByRole('button',{name:'Clear search'}).click()
    await expect(search).toBeFocused()
    await reopen(p)
    const writing=p.locator('[data-block-content]').first()
    await writing.fill('Outside click checkpoint')
    await p.getByRole('heading',{name:'Field notes'}).click()
    await expect(p.locator('.save')).toHaveText('Saved',{timeout:2500})
    expect((await (await p.request.get(host.url+'/api/library')).json()).pages[0].plain).toBe('Outside click checkpoint')
    await writing.fill('A durable field observation')
    // A rejected checkpoint keeps the original editor available for a retry.
    const checkpointUrl='**/api/pages/*/state'
    await p.route(checkpointUrl,route=>route.request().method()==='PUT'
      ?route.fulfill({status:503,json:{error:'Save unavailable'}}):route.continue())
    await p.locator('.rail').getByRole('button',{name:'All pages',exact:true}).click()
    await expect(p.locator('.message[role=alert]')).toContainText('Save unavailable')
    await expect(writing).toHaveText('A durable field observation')
    await p.unroute(checkpointUrl)
    await p.locator('.rail').getByRole('button',{name:'All pages',exact:true}).click()
    await expect(p.locator('.library')).toBeVisible()
    expect((await (await p.request.get(host.url+'/api/library')).json()).pages[0].plain).toBe('A durable field observation')
    await reopen(p)
    const reader=await browser.newPage();await reader.goto(host.url)
    await reader.getByLabel('Workspace access key').fill('view');await reader.getByRole('button',{name:'Open library'}).click()
    await reopen(reader);await expect(reader.locator('.save')).toHaveText('Read only')
    const second=await browser.newPage();await second.goto(host.url);await second.getByLabel('Workspace access key').fill('test');await second.getByRole('button',{name:'Open library'}).click();await reopen(second)
    // Hold both first writes until both editors have modified the same acknowledged revision.
    let writes=0,release!:()=>void;const gate=new Promise<void>(ok=>{release=ok})
    for(const client of [p,second])await client.route('**/state',async route=>{
      if(route.request().method()==='PUT' && ++writes<=2){if(writes===2)release();await Promise.race([gate,new Promise(ok=>setTimeout(ok,1500))])}
      await route.continue()
    })
    async function append(client:Page,text:string){const field=client.locator('[data-block-content]').first();await field.click();await field.press('End');await client.keyboard.insertText(text)}
    await Promise.all([append(p,' alpha'),append(second,' beta')])
    for(const word of ['alpha','beta'])await expect(reader.locator('.page-surface')).toContainText(word,{timeout:10000})
    expect((await (await p.request.get(host.url+'/api/library')).json()).pages[0].plain).toBe('A durable field observation')
    await Promise.all([p,second].map(client=>client.getByRole('button',{name:'Save now'}).click()))
    await expect(p.locator('.save')).toHaveText('Saved')
    await expect(second.locator('.save')).toHaveText('Saved')
    const client=new Client({name:'smoke',version:'1'})
    await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('src/tools/mcp.ts')],env:{CHULANE_URL:host.url,CHULANE_ACCESS_KEY:'test'}}))
    try{
      const result=await client.callTool({name:'search',arguments:{query:'alpha'}})
      const [source]=JSON.parse(textResult(result.content));await second.goto(source.url)
      await expect(second.locator('.page-surface')).toContainText('alpha')
      const proposed=await client.callTool({name:'propose_create',arguments:{title:'Approved via MCP'}})
      if(!JSON.parse(textResult(proposed.content)).pending)throw Error('Missing proposal')
      await p.reload();await p.getByRole('button',{name:'approve',exact:true}).click()
      await expect(p.getByRole('heading',{name:'Approved via MCP'})).toBeVisible()
    }finally{await client.close()}
    await p.getByRole('button',{name:'Save now'}).click()
    await expect(p.locator('.save')).toHaveText('Saved')
    await p.getByRole('button',{name:'All pages',exact:true}).last().click()
    await p.locator('input[accept*="markdown"]').setInputFiles({name:'Expedition.md',mimeType:'text/markdown',buffer:Buffer.from('# Journey\nNorthward')})
    await expect(p.locator('.page-surface')).toContainText('Northward')
    await p.getByRole('button',{name:'Save now'}).click()
    await expect(p.locator('.save')).toHaveText('Saved')
    const actions=p.getByRole('button',{name:'Page actions'})
    await actions.focus()
    await actions.press('Enter')
    await expect(p.getByRole('dialog',{name:'Page actions'})).toBeVisible()
    await p.keyboard.press('Escape')
    await expect(actions).toBeFocused()
    await actions.click()
    await p.getByRole('button',{name:'Markdown',exact:true}).click()
    await expect(p.getByText(/Export includes writing text/)).toBeVisible()
    await p.locator('input[type=file]:not([accept])').setInputFiles({name:'sample.bin',mimeType:'application/octet-stream',buffer:Buffer.from([1,2,255])})
    await expect(p.getByRole('link',{name:'sample.bin'})).toBeVisible()
    if(!await p.getByRole('button',{name:'Move to trash'}).isVisible())await p.getByRole('button',{name:'Page actions'}).click()
    await p.getByRole('button',{name:'Move to trash'}).click()
    await p.getByRole('button',{name:'Trash',exact:true}).click()
    await p.getByRole('button',{name:'Restore',exact:true}).click()
    await p.getByRole('button',{name:'All pages',exact:true}).first().click()
    await p.getByRole('button',{name:/Expedition/}).click()
    await expect(p.getByRole('link',{name:'sample.bin'})).toBeVisible()
    const index=p.getByRole('region',{name:'Pages in this view'})
    await p.locator('[data-block-content]').first().fill('Saved from the page index')
    await index.getByRole('button',{name:'Field notes',exact:true}).click()
    await expect(p.getByRole('heading',{name:'Field notes'})).toBeVisible()
    await index.getByRole('button',{name:'Expedition',exact:true}).click()
    await expect(p.locator('.page-surface')).toContainText('Saved from the page index')
    console.log('Web edit, switch, reload, viewer, concurrent merge and MCP proposal passed.')
  }
  if(process.argv[2]!=='web'){
    const launch=()=>electron.launch({args:['.', '--user-data-dir='+join(dir,'profile')],timeout:20000})
    desktop=await launch();const first=await desktop.firstWindow();await newPage(first)
    // Leave directly, then verify the desktop host reopens the checkpoint after restart.
    await first.getByRole('button',{name:'All pages',exact:true}).last().click()
    await expect(first.locator('.library')).toBeVisible()
    console.log('Desktop page saved');await desktop.close();desktop=await launch()
    const restarted=await desktop.firstWindow();await reopen(restarted)
    const check=await desktop.evaluate(async({Menu,dialog},folder)=>{
      const menu={items(){return Menu.getApplicationMenu()!.items.find(i=>i.label==='Plugins')!.submenu!.items}}
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]})
      dialog.showMessageBox=async()=>({response:1,checkboxChecked:false})
      menu.items()[0].click()
      for(let i=0;i<50&&!menu.items().some(p=>p.label==='Reading break…');i++)await new Promise(r=>setTimeout(r,50))
      const present=menu.items().some(p=>p.label==='Reading break…')
      menu.items().find(i=>i.label==='reading-break')?.submenu!.items[0].click()
      for(let i=0;i<50&&menu.items().some(p=>p.label==='Reading break…');i++)await new Promise(r=>setTimeout(r,50))
      return present && !menu.items().some(p=>p.label==='Reading break…')
    },resolve('examples/reading-break'))
    if(!check)throw Error('Plugin menu lifecycle failed')
    console.log('Desktop edit, switch and process restart passed.')
  }
}finally{await desktop?.close();await browser?.close();await host?.close();await rm(dir,{force:true,recursive:true})}
