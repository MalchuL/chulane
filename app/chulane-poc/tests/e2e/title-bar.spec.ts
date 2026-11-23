/** Exercise desktop chrome in a disposable profile and confirm the same site uses ordinary browser chrome. */
import {chromium,expect,_electron as electron} from '@playwright/test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {desktopLaunch} from './desktop-launch'

const profile=await mkdtemp(join(tmpdir(),'chulane-title-'))
const app=await electron.launch(desktopLaunch(profile))
try{
  const page=await app.firstWindow()
  const bar=page.getByRole('banner',{name:'Window title bar'})
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('Chulane')
  await page.getByLabel('Workspace name').fill('Field notes')
  await page.getByRole('button',{name:'Create workspace',exact:true}).click()
  await page.getByRole('button',{name:'New page',exact:true}).click()
  await page.getByLabel('Name',{exact:true}).fill('Survey log')
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await expect(bar).toContainText('Survey log')
  await expect(bar).toContainText('Field notes')
  const bounds=await bar.boundingBox()
  expect(bounds!.y).toBe(0)
  expect((await page.locator('.crumb').boundingBox())!.y).toBeGreaterThanOrEqual(bounds!.height)
  await page.getByRole('button',{name:'Appearance',exact:true}).click()
  await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('terminal')
  await page.getByRole('button',{name:'Save theme'}).click()
  await expect(bar).toHaveCSS('background-color','rgb(8, 15, 10)')
  const content=bar.locator('[data-part=window-title-content]')
  await expect(content).toHaveCSS('app-region','drag')
  if(process.platform!=='darwin'){
    await expect(bar.getByRole('button',{name:'Application menu'})).toHaveCSS('app-region','no-drag')
    // Observe the real native menu dispatch without activating a backup or plugin command.
    await app.evaluate(({Menu})=>{
      const menu=Menu.getApplicationMenu()!
      menu.popup=()=>{process.env.CHULANE_TEST_MENU=menu.items.map(item=>item.label).join('|')}
    })
    await bar.getByRole('button',{name:'Application menu'}).press('Enter')
    await expect.poll(()=>app.evaluate(()=>process.env.CHULANE_TEST_MENU)).toContain('Plugins')
  }
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(660,660))
  await page.getByRole('button',{name:'Agent',exact:true}).click()
  const drawer=await page.locator('.agent-panel').boundingBox()
  expect(drawer!.y).toBeGreaterThanOrEqual(bounds!.height)
  await expect(page.getByRole('button',{name:'Close agent'})).toBeInViewport()
  await page.getByRole('button',{name:'Close agent'}).click()
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setFullScreen(true))
  await expect(bar).toBeHidden()
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setFullScreen(false))
  await expect(bar).toBeVisible()
  if(!process.env.CHULANE_TEST_INSTALLED_DESKTOP){
    const browser=await chromium.launch()
    try{
      const tab=await browser.newPage()
      await tab.goto(page.url())
      await expect(tab.getByRole('banner',{name:'Window title bar'})).toHaveCount(0)
    }finally{await browser.close()}
  }
  console.log('Themed desktop title bar, document identity, narrow layout and fullscreen passed.')
}finally{await app.close();await rm(profile,{recursive:true,force:true})}
