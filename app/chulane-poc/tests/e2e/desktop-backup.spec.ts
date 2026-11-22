/** Restore a snapshot made through the local desktop menu into an independent Electron profile. */
import {expect,_electron as electron} from '@playwright/test'
import {mkdtemp,mkdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const dir=await mkdtemp(join(tmpdir(),'chulane-backup-'))
const restored=join(dir,'restored'),snapshot=join(restored,'workspace.sqlite')
const launch=(profile:string)=>electron.launch({args:['.','--user-data-dir='+profile]})
let app=await launch(join(dir,'original'))
try{
  await mkdir(restored)
  const page=await app.firstWindow()
  await page.getByLabel('Workspace name').fill('Expedition')
  await page.getByRole('button',{name:'Create workspace',exact:true}).click()
  await page.getByRole('button',{name:'New page',exact:true}).click()
  await page.getByLabel('Name',{exact:true}).fill('Log')
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await page.locator('[data-block-content]').first().fill('Ice on the lake')
  await page.getByRole('button',{name:'Save now'}).click()
  await expect(page.locator('.save')).toHaveText('Saved')
  await page.locator('input[type=file]:not([accept])').setInputFiles({name:'sample.bin',mimeType:'application/octet-stream',buffer:Buffer.from([0,255,3])})
  await expect(page.getByRole('link',{name:'sample.bin'})).toBeVisible()
  const chat=await page.evaluate(async()=>(await(await fetch('/api/agent/chats',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json()).id)
  expect(chat).toBeGreaterThan(0)
  /** Answer the native save dialog and wait for the result the desktop user sees. */
  const backup=()=>app.evaluate(({Menu,dialog},snapshot)=>new Promise<string>((resolve,reject)=>{
    dialog.showSaveDialog=async()=>({canceled:false,filePath:snapshot})
    dialog.showMessageBox=async options=>{resolve(options.message);return {response:0,checkboxChecked:false}}
    dialog.showErrorBox=(title,message)=>resolve(title+' · '+message)
    const item=Menu.getApplicationMenu()?.getMenuItemById('backup-local-workspaces')
    if(item)item.click()
    else reject(Error('Missing local backup command'))
  }),snapshot)
  expect(await backup()).toBe('Local workspace backup saved')
  await page.locator('[data-block-content]').first().fill('Lake thawed')
  await page.getByRole('button',{name:'Save now'}).click()
  await expect(page.locator('.save')).toHaveText('Saved')
  expect(await backup()).toContain('A file with that name already exists')
  await app.close()
  app=await launch(restored)
  const recovered=await app.firstWindow()
  await recovered.getByRole('main').getByRole('button',{name:/^Log/}).click()
  await expect(recovered.locator('[data-block-content]').first()).toHaveText('Ice on the lake')
  const bytes=await recovered.getByRole('link',{name:'sample.bin'}).evaluate(async link=>[...new Uint8Array(await(await fetch((link as HTMLAnchorElement).href)).arrayBuffer())])
  expect(bytes).toEqual([0,255,3])
  expect(await recovered.evaluate(async id=>(await fetch('/api/agent/chats/'+id)).status,chat)).toBe(200)
  console.log('Native backup restored a document, attachment and chat in a fresh desktop profile.')
}finally{await app.close();await rm(dir,{recursive:true,force:true})}
