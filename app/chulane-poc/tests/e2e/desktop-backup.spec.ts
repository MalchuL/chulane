/** Restore a snapshot made through the local desktop menu into an independent Electron profile. */
import {desktopLaunch} from './desktop-launch'
import {chromium,expect,_electron as electron,type Browser,type ElectronApplication} from '@playwright/test'
import {access,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {DatabaseSync} from 'node:sqlite'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const dir=await mkdtemp(join(tmpdir(),'chulane-backup-'))
const restored=join(dir,'restored expedition'),snapshot=join(dir,'expedition.sqlite')
const launch=(profile:string)=>electron.launch(desktopLaunch(profile))
/** Invoke the native File menu and capture the path handed to the OS without opening a file manager. */
async function revealedDatabase(application:ElectronApplication){
  return application.evaluate(({Menu,shell})=>{
    const item=Menu.getApplicationMenu()?.getMenuItemById('show-local-database')
    if(!item)throw Error('Missing command to show the local workspace database')
    const reveal=shell.showItemInFolder
    let file=''
    shell.showItemInFolder=path=>{file=path}
    try{item.click();return file}finally{shell.showItemInFolder=reveal}
  })
}
let copy:Browser|undefined
const app=await launch(join(dir,'original'))
try{
  if(process.env.CHULANE_TEST_INSTALLED_DESKTOP)expect(await app.evaluate(({app})=>app.isPackaged)).toBe(true)
  const page=await app.firstWindow()
  await page.getByLabel('Workspace name').fill('Expedition')
  expect(await revealedDatabase(app)).toBe(join(dir,'original','workspace.sqlite'))
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
  const backup=(file=snapshot)=>app.evaluate(({Menu,dialog},snapshot)=>new Promise<string>((resolve,reject)=>{
    dialog.showSaveDialog=async()=>({canceled:false,filePath:snapshot})
    dialog.showMessageBox=async options=>{resolve(options.message);return {response:0,checkboxChecked:false}}
    dialog.showErrorBox=(title,message)=>resolve(title+' · '+message)
    const item=Menu.getApplicationMenu()?.getMenuItemById('backup-local-workspaces')
    if(item)item.click()
    else reject(Error('Missing local backup command'))
  }),file)
  expect(await backup()).toBe('Local workspace backup saved')
  await page.locator('[data-block-content]').first().fill('Lake thawed')
  await page.getByRole('button',{name:'Save now'}).click()
  await expect(page.locator('.save')).toHaveText('Saved')
  expect(await backup()).toContain('A file with that name already exists')
  const fixture=new DatabaseSync(join(dir,'original','workspace.sqlite'))
  try{fixture.exec('PRAGMA foreign_keys=OFF; UPDATE pages SET project=-1')}finally{fixture.close()}
  expect(await backup(join(dir,'rejected.sqlite'))).toContain('Broken foreign key in pages')
  const incomplete=new DatabaseSync(join(dir,'original','workspace.sqlite'))
  try{incomplete.exec('DROP TABLE chat_edits')}finally{incomplete.close()}
  expect(await backup(join(dir,'incomplete.sqlite'))).toContain('Missing workspace table: chat_edits')
  /** Choose a snapshot and a new profile location using the installed File menu. */
  const restore=(target:string,source=snapshot,open=false)=>app.evaluate(({Menu,dialog},{snapshot,target,open})=>new Promise<string>((resolve,reject)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[snapshot]})
    dialog.showSaveDialog=async()=>({canceled:false,filePath:target})
    dialog.showMessageBox=async options=>{
      const button=options.buttons?.indexOf(open?'Open restored copy':'Done')??-1
      if(button<0)reject(Error('Missing restore completion action'))
      resolve(options.detail??options.message)
      return {response:button,checkboxChecked:false}
    }
    dialog.showErrorBox=(title,message)=>resolve(title+' · '+message)
    const item=Menu.getApplicationMenu()?.getMenuItemById('restore-local-workspaces')
    if(item)item.click()
    else reject(Error('Missing local restore command'))
  }),{snapshot:source,target,open})
  const corrupt=join(dir,'corrupt.sqlite'),rejected=join(dir,'rejected-profile')
  await writeFile(corrupt,'Incomplete download')
  expect(await restore(rejected,corrupt)).toContain('Local workspace restore failed')
  await expect(access(rejected)).rejects.toMatchObject({code:'ENOENT'})
  // Add a debugging port only in the test process so Playwright can inspect the independently launched copy.
  await app.evaluate(()=>{
    const {channel}=process.getBuiltinModule('node:diagnostics_channel')!
    channel('tracing:child_process.spawn:start').subscribe(event=>{
      const {options}=event as {options:{args:string[]}}
      if(options.args.some(arg=>arg.startsWith('--user-data-dir=')))options.args.push('--remote-debugging-port=0')
    })
  })
  const savedCopy=join(dir,'saved for later')
  expect(await restore(savedCopy)).toContain(savedCopy)
  expect(await restore(restored,snapshot,true)).toContain(restored)
  expect(await restore(restored)).toContain('already exists')
  const portFile=join(restored,'DevToolsActivePort')
  await expect.poll(()=>access(portFile).then(()=>true,()=>false),{timeout:15000}).toBe(true)
  const [port,endpoint]=(await readFile(portFile,'utf8')).trim().split(/\r?\n/)
  copy=await chromium.connectOverCDP('ws://127.0.0.1:'+port+endpoint,{timeout:10000})
  await expect(access(join(savedCopy,'DevToolsActivePort'))).rejects.toMatchObject({code:'ENOENT'})
  const context=copy.contexts()[0]
  context.setDefaultTimeout(10000)
  const recovered=context.pages()[0]??await context.waitForEvent('page')
  await expect(page.locator('[data-block-content]').first()).toHaveText('Lake thawed')
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.close()))
  await expect.poll(()=>app.process().exitCode,{timeout:10000}).toBe(0)
  await recovered.getByRole('main').getByRole('button',{name:/^Log/}).click()
  await expect(recovered.locator('[data-block-content]').first()).toHaveText('Ice on the lake')
  const bytes=await recovered.getByRole('link',{name:'sample.bin'}).evaluate(async link=>[...new Uint8Array(await(await fetch((link as HTMLAnchorElement).href)).arrayBuffer())])
  expect(bytes).toEqual([0,255,3])
  expect(await recovered.evaluate(async id=>(await fetch('/api/agent/chats/'+id)).status,chat)).toBe(200)
  const savedProfile=await launch(savedCopy)
  try{
    await (await savedProfile.firstWindow()).getByRole('main').getByRole('button',{name:/^Log/}).waitFor()
    expect(await revealedDatabase(savedProfile)).toBe(join(savedCopy,'workspace.sqlite'))
  }finally{await savedProfile.close()}
  console.log('Native backup restored a document, attachment and chat in a fresh desktop profile.')
}finally{
  for(const page of copy?.contexts().flatMap(context=>context.pages())??[])await page.close().catch(()=>{})
  await copy?.close().catch(()=>{})
  await app.close().catch(()=>{})
  await rm(dir,{recursive:true,force:true,maxRetries:5})
}
