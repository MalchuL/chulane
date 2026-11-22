/** Install a folder into a real Electron profile and exercise its saved Rivto block through the native plugin menu. */
import {chromium,expect,_electron as electron} from '@playwright/test'
import {serve} from '../../src/server/service.ts'
import {appendFile,cp,mkdtemp,rename,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

const dir=await mkdtemp(join(tmpdir(),'chulane-plugin-block-'))
const folder=join(dir,'reading-break'),unmounted=join(dir,'unmounted')
await cp(resolve('examples/reading-break'),folder,{recursive:true})
const launch=()=>electron.launch({args:['.','--user-data-dir='+dir]})
let app=await launch()
/** Click a native menu action, automating only the folder chooser and trust confirmation. */
async function plugin(action:string){
  await app.evaluate(({Menu,dialog},{action,folder})=>{
    const menu=Menu.getApplicationMenu()!.items.find(item=>item.label==='Plugins')!.submenu!
    if(action==='Install from folder…'){
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]})
      dialog.showMessageBox=async()=>({response:1,checkboxChecked:false})
    }
    const items=action==='Install from folder…'?menu.items:menu.items.find(item=>item.id===folder||item.label==='reading-break')!.submenu!.items
    items.find(item=>item.label===action)!.click()
  },{action,folder})
}
try{
  let page=await app.firstWindow()
  await page.getByLabel('Workspace name').fill('Plugin test')
  await page.getByRole('button',{name:'Create workspace',exact:true}).click()
  await page.getByRole('button',{name:'New page',exact:true}).click()
  await page.getByLabel('Name',{exact:true}).fill('Notebook')
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await plugin('Install from folder…')
  await expect.poll(()=>app.evaluate(({Menu})=>Menu.getApplicationMenu()!.items.find(item=>item.label==='Plugins')!.submenu!.items.some(item=>item.label==='Reading break…'))).toBe(true)
  await page.locator('[data-block-content]').first().click()
  await page.keyboard.type('/reflection')
  const command=page.locator('[data-slash-command="type.reading-break.reflection"]')
  await expect(command).toBeVisible()
  await command.click()
  const modules=await page.evaluate(async()=>(await fetch('/api/desktop/renderers')).json())
  expect(modules).toHaveLength(1)
  const moduleUrl=new URL('/api/desktop/renderers/'+modules[0]+'.mjs',page.url()).href
  expect((await fetch(moduleUrl)).status).toBe(404)
  const block=page.locator('[data-block-type="reading-break.reflection"]').first()
  const id=await block.getAttribute('data-block-id')
  expect(id).toBeTruthy()
  await block.locator('[data-block-content]').fill('Look up from the page')
  await page.getByRole('heading',{name:'Notebook',exact:true}).click()
  await expect(page.locator('.save')).toHaveText('Saved')
  await plugin('Disable')
  await expect(block.getByRole('note')).toContainText('Look up from the page')
  await plugin('Enable')
  await expect(block.locator('[data-block-content]')).toHaveText('Look up from the page')
  await plugin('Remove')
  await expect(block.getByRole('note')).toContainText('reading-break.reflection')
  expect(await page.evaluate(async url=>(await fetch(url)).status,moduleUrl)).toBe(404)
  await app.close();app=await launch();page=await app.firstWindow()
  await page.getByRole('button',{name:/Notebook/}).click()
  const reopened=page.locator('[data-block-id="'+id+'"]').first()
  await expect(reopened.getByRole('note')).toContainText('Look up from the page')
  await plugin('Install from folder…')
  await expect(reopened.locator('[data-block-content]')).toHaveText('Look up from the page')
  await reopened.locator('[data-block-content]').fill('Resumed after reinstall')
  await page.getByRole('heading',{name:'Notebook',exact:true}).click()
  await expect(page.locator('.save')).toHaveText('Saved')
  await app.close()
  await rename(folder,unmounted)
  app=await launch();page=await app.firstWindow()
  await page.getByRole('button',{name:/Notebook/}).click({timeout:8000})
  const missing=page.locator('[data-block-id="'+id+'"]').first()
  await expect(missing.getByRole('note')).toContainText('Resumed after reinstall')
  const menuItems=()=>app.evaluate(({Menu},folder)=>{
    const entry=Menu.getApplicationMenu()!.items.find(item=>item.label==='Plugins')!.submenu!.items.find(item=>item.id===folder)
    return entry?.submenu?.items.map(item=>item.label)
  },folder)
  await expect.poll(menuItems).toContain('Retry')
  await rename(unmounted,folder)
  // A rejected ES module evaluation is cached, even after its external dependency becomes available.
  await appendFile(join(folder,'plugin.mjs'),"\nimport {existsSync} from 'node:fs'; if(!existsSync(new URL('./ready',import.meta.url)))throw Error('Waiting for plugin data');")
  await plugin('Retry')
  await expect.poll(menuItems).toContain('Waiting for plugin data')
  await expect(missing.getByRole('note')).toContainText('Resumed after reinstall')
  await writeFile(join(folder,'ready'),'')
  await plugin('Retry')
  await expect(missing.locator('[data-block-content]')).toHaveText('Resumed after reinstall')
  await expect.poll(menuItems).not.toContain('Retry')
  await app.close()
  await rename(folder,unmounted)
  app=await launch();await app.firstWindow()
  await expect.poll(menuItems).toContain('Retry')
  await plugin('Disable')
  await expect.poll(menuItems).toEqual(['Enable','Remove'])
  await app.close();await rename(unmounted,folder)
  app=await launch();page=await app.firstWindow()
  await page.getByRole('button',{name:/Notebook/}).click()
  await expect(page.locator('[data-block-id="'+id+'"]').first().getByRole('note')).toContainText('Resumed after reinstall')
  await expect.poll(menuItems).toEqual(['Enable','Remove'])
  await app.close()
  const web=await serve({file:join(dir,'workspace.sqlite'),assets:resolve('dist'),editorKey:'web-editor'})
  try{
    const browser=await chromium.launch()
    try{
      const tab=await browser.newPage()
      await tab.goto(web.url)
      await tab.getByLabel('Workspace access key').fill('web-editor')
      await tab.getByRole('button',{name:'Open library'}).click()
      await tab.getByRole('button',{name:/Notebook/}).click()
      await expect(tab.locator('[data-block-id="'+id+'"]').first().getByRole('note')).toContainText('Resumed after reinstall')
      expect(await tab.evaluate(()=>Boolean(window.chulanePluginBlocks))).toBe(false)
      expect((await tab.request.get(web.url+'/api/desktop/renderers')).status()).toBe(404)
    }finally{await browser.close()}
  }finally{await web.close()}
  console.log('Linux Electron preserved the plugin block across removal, restart, reinstall and a missing plugin folder. Chromium opened its saved content in the fallback.')
}finally{await app.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.destroy()}).catch(()=>{});await app.close().catch(()=>{});await rm(dir,{recursive:true,force:true})}
