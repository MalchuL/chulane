/** Exercise a structural block move across synchronized replicas using real pointer input. */
import {chromium,firefox,expect,type Locator,type Page} from '@playwright/test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {serve} from '../../src/server/service'

const dir=await mkdtemp(join(tmpdir(),'chulane-tabs-'))
const host=await serve({file:join(dir,'test.sqlite'),assets:resolve('dist'),registration:true})
const browser=await (process.env.CHULANE_TEST_BROWSER==='firefox'?firefox:chromium).launch()
/** Use authenticated application endpoints for fixtures and real editor controls for all edits. */
async function post(client:Page,path:string,data:object={}){
  const response=await client.request.post(host.url+'/api/'+path,{data})
  expect(response.ok(),await response.text()).toBe(true)
  return response.json()
}
try{
  const owner=await browser.newPage({viewport:{width:1400,height:900}})
  await post(owner,'register',{username:'author',password:'a-long-passphrase'})
  const workspace=await post(owner,'workspaces',{name:'Research'})
  const scope='?workspace='+workspace.id
  const dragPage=await post(owner,'pages'+scope,{title:'Split drag'})
  const separatePage=await post(owner,'pages'+scope,{title:'Separate notes'})
  await owner.goto(host.url+'/'+scope+'&page='+dragPage.id)
  const view=owner.locator('article[data-source-page="'+dragPage.id+'"]:visible')
  const original=view.first().locator('[data-block-content]')
  await original.first().waitFor()
  const header=owner.locator('.crumb')
  const headerHeight=await header.evaluate(el=>el.clientHeight)
  await original.first().fill('First')
  await expect.poll(()=>header.evaluate(el=>el.clientHeight)).toBe(headerHeight)
  await original.first().press('End')
  await original.first().press('Enter')
  await owner.keyboard.insertText('Second')
  await original.nth(1).press('Enter')
  await owner.keyboard.insertText('Nested')
  await original.nth(2).press('Tab')
  const child=original.nth(2).locator('xpath=ancestor::*[@data-block-id][1]')
  const parentId=await original.nth(1).evaluate(node=>node.closest('[data-block-id]')!.getAttribute('data-block-id'))
  await expect(child.locator('xpath=ancestor::*[@data-block-id][1]')).toHaveAttribute('data-block-id',parentId!)
  await owner.locator('.dv-active-group').getByRole('button',{name:'Split right'}).click()
  await expect(view).toHaveCount(2)
  await owner.locator('.dv-active-group').getByRole('button',{name:'Split down'}).click()
  await expect(view).toHaveCount(3)
  await view.nth(1).locator('[data-block-content]').first().click()
  await owner.getByRole('navigation',{name:'Library',exact:true}).getByRole('button',{name:'Separate notes',exact:true}).click()
  const separate=owner.locator('article[data-source-page="'+separatePage.id+'"]:visible [data-block-content]')
  await separate.fill('Keep this document here')
  const separateId=await separate.evaluate(node=>node.closest('[data-block-id]')!.getAttribute('data-block-id'))
  await expect(view).toHaveCount(2)
  const replica=view.last().locator('[data-block-content]')
  await expect(replica).toHaveText(['First','Second','Nested'])
  const colleague=await browser.newPage()
  await post(colleague,'register',{username:'peer',password:'another-passphrase'})
  const invitation=await post(owner,'workspaces/invitations'+scope,{username:'peer',role:'viewer'})
  await post(colleague,'invitations/'+invitation.id+'/accept')
  await colleague.goto(host.url+'/'+scope+'&page='+dragPage.id)
  const remote=colleague.locator('[data-block-content]')
  await expect(remote).toHaveText(['First','Second','Nested'])
  await owner.context().setOffline(true)
  /** Read persisted block identity in rendered outline order. */
  const blockIds=(blocks:Locator)=>blocks.evaluateAll(nodes=>nodes.map(node=>node.closest('[data-block-id]')!.getAttribute('data-block-id')))
  const ids=await blockIds(original)
  /** A move retains both identity and nesting across views, synchronization and reload. */
  async function expectMoved(blocks:Locator){
    await expect(blocks).toHaveText(['Second','Nested','First'])
    expect(await blockIds(blocks)).toEqual([ids[1],ids[2],ids[0]])
    await expect(blocks.nth(1).locator('xpath=ancestor::*[@data-block-id][2]')).toHaveAttribute('data-block-id',parentId!)
  }
  const moving=view.first().locator('[data-block-id="'+ids[1]+'"]')
  await moving.locator('.rivto-block-row').first().hover()
  const grip=(await moving.locator('.block-handle').first().boundingBox())!
  const anchor=(await view.last().locator('[data-block-id="'+ids[0]+'"]').boundingBox())!
  await owner.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2)
  await owner.mouse.down()
  await owner.mouse.move(anchor.x+4,anchor.y+3,{steps:12})
  await expect(owner.locator('.rivto-block-drag-preview:visible')).toHaveCount(1)
  await expect(owner.locator('.rivto-block-drop-line:visible')).toHaveCount(1)
  await owner.mouse.up()
  for(const blocks of [original,replica])await expectMoved(blocks)
  await owner.context().setOffline(false)
  await expect(remote).toHaveText(['Second','Nested','First'])
  await original.first().press('ControlOrMeta+z')
  await expect(replica).toHaveText(['First','Second','Nested'])
  await expect(remote).toHaveText(['First','Second','Nested'])
  await original.first().press('ControlOrMeta+Shift+z')
  await expect(remote).toHaveText(['Second','Nested','First'])
  await Promise.all([owner.reload(),colleague.reload()])
  await expect(view).toHaveCount(2)
  for(const blocks of [original,replica,remote])await expectMoved(blocks)
  await expect(separate).toHaveText('Keep this document here')
  expect(await separate.evaluate(node=>node.closest('[data-block-id]')!.getAttribute('data-block-id'))).toBe(separateId)
  console.log('Nested split-view drag preserved block and child IDs offline, synchronized with a viewer, and survived undo, redo and reload. The third pane kept its own document.')
}finally{await browser.close();await host.close();await rm(dir,{recursive:true,force:true})}
