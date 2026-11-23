/** Verify a real local CLI edits a disposable page through the installed Electron sidebar and explicit review. */
import {chooseAgentMode} from './choose-agent-mode'
import {randomUUID} from 'node:crypto'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {_electron as electron,expect,type ElectronApplication} from '@playwright/test'
import {LOCAL_AGENTS} from '../../src/shared/agent'
import {desktopLaunch} from './desktop-launch'

const agent=LOCAL_AGENTS.find(name=>name===process.env.CHULANE_TEST_LIVE_AGENT)
if(!agent||!process.env.CHULANE_TEST_INSTALLED_DESKTOP)throw Error('Choose codex, claude or hermes and an installed Chulane executable.')
const profile=await mkdtemp(join(tmpdir(),'chulane-live-desktop-'))
const options={...desktopLaunch(profile),env:{...process.env,CHULANE_LOCAL_AGENT:''}}
let app:ElectronApplication|undefined
try{
  app=await electron.launch(options)
  expect(await app.evaluate(({app})=>app.isPackaged)).toBe(true)
  const page=await app.firstWindow()
  await page.getByLabel('Workspace name').fill('Package acceptance')
  await page.getByRole('button',{name:'Create workspace',exact:true}).click()
  await page.getByRole('button',{name:'New page',exact:true}).click()
  await page.getByLabel('Name',{exact:true}).fill('Dispatch receipt')
  await page.getByRole('button',{name:'Save',exact:true}).click()
  const before='Dispatch '+randomUUID()+': pending',after=before.replace('pending','verified')
  const block=page.locator('[data-block-content]').first()
  await block.fill(before)
  await page.getByRole('button',{name:'Agent',exact:true}).click()
  const side=page.getByRole('complementary',{name:'Workspace agent'})
  const connection=side.getByLabel('Connection',{exact:true})
  const settings=side.getByRole('button',{name:'Provider settings'})
  await expect(connection.or(settings)).toBeVisible()
  if(await settings.isVisible())await settings.click()
  await connection.selectOption(agent)
  await side.getByRole('button',{name:'Use local '+agent}).click()
  await expect(side.getByRole('status').filter({hasText:agent==='hermes'?'Hermes chat CLI ready':'Connected to local '+agent})).toBeVisible({timeout:20000})
  await chooseAgentMode(page,'Suggest')
  await side.getByLabel('Message the agent').fill('In the current page, replace the word pending with verified in the existing paragraph. Keep every other character, including the dispatch ID, exactly as written. Propose the block replacement for review.')
  await side.getByRole('button',{name:'Send',exact:true}).click()
  await expect(side.locator('ins')).toHaveText(after,{timeout:185000})
  await expect(block).toHaveText(before)
  await app.close()
  app=await electron.launch(options)
  const reopened=await app.firstWindow()
  await reopened.getByRole('button',{name:/^Dispatch receipt/}).first().click()
  const saved=reopened.locator('[data-block-content]').first()
  await expect(saved).toHaveText(before)
  await reopened.getByRole('button',{name:'Agent',exact:true}).click()
  const review=reopened.getByRole('complementary',{name:'Workspace agent'})
  await expect(review.locator('ins')).toHaveText(after)
  await review.getByRole('button',{name:'Apply',exact:true}).click()
  await expect(saved).toHaveText(after)
  await reopened.getByRole('button',{name:'All pages',exact:true}).last().click()
  await expect(reopened.locator('.library')).toBeVisible()
  await app.close()
  app=await electron.launch(options)
  const restored=await app.firstWindow()
  await restored.getByRole('button',{name:/^Dispatch receipt/}).first().click()
  await expect(restored.locator('[data-block-content]').first()).toHaveText(after)
  console.log('Installed desktop preserved the live '+agent+' proposal across restart and applied the approved edit.')
}finally{try{await app?.close()}finally{await rm(profile,{recursive:true,force:true})}}
