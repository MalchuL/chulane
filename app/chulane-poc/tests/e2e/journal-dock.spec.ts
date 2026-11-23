/** Drag a journal block between actual split panes, then open a dated entry as a normal page alongside the stack. */
import {chromium,firefox,expect,type Locator} from '@playwright/test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {serve} from '../../src/server/service'
const dir=await mkdtemp(join(tmpdir(),'chulane-journal-dock-'))
const host=await serve({file:join(dir,'test.sqlite'),assets:resolve('dist'),registration:true})
const browser=await (process.env.CHULANE_TEST_BROWSER==='firefox'?firefox:chromium).launch()
try{
  const context=await browser.newContext({viewport:{width:1500,height:950}})
  const page=await context.newPage()
  const post=async(path:string,data:object)=>{
    const response=await page.request.post(host.url+'/api/'+path,{data})
    expect(response.ok(),await response.text()).toBe(true)
    return response.json()
  }
  await post('register',{username:'author',password:'long-journal-passphrase'})
  const ws=await post('workspaces',{name:'Notes'})
  const scope='?workspace='+ws.id
  const today=(await (await page.request.get(host.url+'/api/library'+scope+'&view=journal')).json()).today
  const prior=await post('pages'+scope,{title:'Previous entry',day:'2000-01-01'})
  for(let day=1;day<=7;day++)await post('pages'+scope,{title:'Older notes '+day,day:'2001-01-0'+day})
  await page.goto(host.url+'/'+scope)
  await page.getByRole('navigation',{name:'Library',exact:true}).getByRole('button',{name:'Journal',exact:true}).click()
  const journals=page.getByRole('region',{name:'Journal entries'})
  const entries=journals.getByRole('article',{name:today,exact:true})
  const original=entries.first().locator('[data-block-content]')
  await original.first().fill('First')
  await original.first().press('End')
  await original.first().press('Enter')
  await page.keyboard.insertText('Second')
  await expect(page.getByRole('tab',{name:'Journal',exact:true})).toBeVisible({timeout:2000})
  await page.getByRole('button',{name:'Split right'}).click()
  await expect(entries).toHaveCount(2)
  const second=entries.last().locator('[data-block-content]')
  await expect(second).toHaveText(['First','Second'])
  /** Start on the real Rivto grip and wait for a valid receiver before releasing the pointer. */
  async function moveBefore(source:Locator,target:Locator){
    const block=source.locator('xpath=ancestor::*[@data-block-id][1]')
    const id=await block.getAttribute('data-block-id')
    await block.locator('.rivto-block-row').first().hover()
    const grip=(await block.locator('.block-handle').first().boundingBox())!
    const before=(await target.locator('xpath=ancestor::*[@data-block-id][1]').boundingBox())!
    await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2)
    await page.mouse.down()
    await page.mouse.move(before.x+4,before.y+3,{steps:16})
    await expect(page.locator('.rivto-block-drag-preview:visible')).toHaveCount(1)
    await expect(page.locator('.rivto-block-drop-line:visible')).toHaveCount(1)
    await page.mouse.up()
    return id!
  }
  const id=await moveBefore(original.nth(1),second.first())
  await expect(original).toHaveText(['Second','First'])
  await expect(second.first().locator('xpath=ancestor::*[@data-block-id][1]')).toHaveAttribute('data-block-id',id!)
  const yesterday=journals.last().getByRole('article',{name:'2001-01-07'}).locator('[data-block-content]')
  const transferred=await moveBefore(original.nth(1),yesterday.first())
  await expect(original).toHaveText(['Second'])
  await expect(yesterday.first()).toHaveText('First')
  await expect(yesterday.first().locator('xpath=ancestor::*[@data-block-id][1]')).toHaveAttribute('data-block-id',transferred)
  await page.locator('.dv-active-group').getByRole('button',{name:'Split down'}).click()
  await expect(entries).toHaveCount(3)
  await page.locator('.dv-active-group').getByRole('tab',{name:'Journal',exact:true}).press('Delete')
  await expect(entries).toHaveCount(2)
  await entries.last().getByRole('button',{name:'Open page '+today}).click()
  await expect(journals).toHaveCount(1)
  await expect(page.locator('article.doc:visible [data-block-content]')).toHaveText(['Second'])
  await expect(journals.getByRole('heading',{name:'2001-01-07'})).toBeVisible()
  await page.reload()
  await expect(journals).toHaveCount(1)
  await expect(page.locator('article.doc:visible [data-block-content]')).toHaveText(['Second'])
  // Start from a normal page outside the current date window. "Show in journal" reveals and focuses it.
  await page.goto(host.url+'/'+scope+'&page='+prior.id)
  await page.getByRole('button',{name:'Show 2000-01-01 in journal'}).click()
  const active=page.locator('.dv-active-group').getByRole('region',{name:'Journal entries'})
  const historical=active.getByRole('article',{name:'2000-01-01',exact:true})
  await expect(historical.getByRole('heading')).toBeFocused()
  await historical.getByRole('radio',{name:'Canvas',exact:true}).click()
  await expect(historical.locator('.edgeless-viewport')).toBeVisible()
  await historical.getByRole('radio',{name:'Page',exact:true}).click()
  await expect(historical.locator('[data-block-content]').first()).toBeVisible()
  await historical.getByRole('button',{name:'Properties for 2000-01-01'}).click()
  await expect(page.getByRole('region',{name:'Document properties'}).last()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'Page actions',exact:true}).click()
  await page.getByRole('button',{name:'Rename',exact:true}).click()
  await historical.getByRole('textbox',{name:'Name',exact:true}).fill('Retitled day')
  await historical.getByRole('button',{name:'Save',exact:true}).click()
  await expect(historical.getByText('Retitled day',{exact:true})).toBeVisible()
  await expect(historical.getByRole('heading',{name:'2000-01-01'})).toBeVisible()

  const narrow=await context.newPage()
  await narrow.setViewportSize({width:390,height:844})
  await narrow.goto(host.url+'/'+scope+'&view=journal')
  await expect(narrow.getByRole('tab',{name:'Journal',exact:true})).toBeVisible()
  const timeline=narrow.getByRole('region',{name:'Journal entries'})
  await expect(timeline.getByRole('article').first().getByRole('heading')).toHaveText(today)
  expect(await timeline.evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThanOrEqual(1)
  expect(await narrow.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)

}finally{await browser.close();await host.close();await rm(dir,{recursive:true,force:true})}
