/** A provider must receive the device's latest linked writing, including after the source pane closes. */
import {chromium,expect} from '@playwright/test'
import {resolve} from 'node:path'
import {serve} from '../../src/server/service.ts'

const received:string[][]=[]
const host=await serve({file:':memory:',assets:resolve('dist'),registration:true,
  provider:{get:()=>({key:'fixture',model:'fixture'})},backgroundEnvironment:{async run(turn){
    received.push(turn.referencedBlocks.map(block=>block.text))
    turn.publish('Reviewed the linked writing.')
  }}})
const browser=await chromium.launch()
try{
  const page=await browser.newPage({viewport:{width:1500,height:900}})
  async function create(route:string,data:object){
    const result=await page.request.post(host.url+'/api/'+route,{data})
    expect(result.ok(),await result.text()).toBe(true)
    return result.json()
  }
  await create('register',{username:'writer',password:'fixture-passphrase'})
  const workspace=await create('workspaces',{name:'Survey'})
  const scope='?workspace='+workspace.id
  const source=await create('pages'+scope,{title:'Measurements',content:'First reading'})
  const current=await create('pages'+scope,{title:'Report',content:'Summary'})
  await page.goto(host.url+'/'+scope+'&page='+source.id)
  await page.getByRole('button',{name:'Split right'}).click()
  await page.getByRole('navigation',{name:'Library',exact:true}).getByRole('button',{name:'Report',exact:true}).click()
  await page.getByRole('button',{name:'Agent',exact:true}).click()
  const side=page.getByRole('complementary',{name:'Workspace agent'})
  const sourcePane=page.locator('article[data-source-page="'+source.id+'"]:visible')
  const field=sourcePane.locator('[data-block-content]').first()
  await expect(field).toHaveText('First reading')
  await sourcePane.getByRole('button',{name:'Attach block links to chat'}).first().click()
  const stateRoute='**/api/pages/'+source.id+'/state?**'
  const interruptSync=()=>page.route(stateRoute,route=>route.request().method()==='GET'?route.continue():route.fulfill({status:503,json:{error:'Source sync is offline'}}))
  await interruptSync()
  await field.fill('Revised reading')
  await page.locator('article[data-source-page="'+current.id+'"]:visible [data-block-content]').first().click()
  const composer=side.getByLabel('Message the agent')
  await composer.fill('Check the linked reading')
  await side.getByRole('button',{name:'Run in background'}).click()
  const send=side.getByRole('button',{name:'Send',exact:true})
  await send.click()
  const alert=side.getByRole('alert')
  await expect(alert).toContainText('Source sync is offline')
  expect(received).toEqual([])
  await expect(composer).toHaveValue('Check the linked reading')
  await page.locator('.dv-groupview').filter({has:sourcePane}).getByRole('tab',{name:/Measurements/}).press('Delete')
  await expect(sourcePane).toHaveCount(0)
  const failedWrite=page.waitForResponse(response=>response.url().includes('/pages/'+source.id+'/state?')&&response.request().method()==='PUT'&&response.status()===503)
  await Promise.all([failedWrite,send.click()])
  await expect(send).toBeEnabled()
  await expect(alert).toContainText('Source sync is offline')
  expect(received).toEqual([])
  await page.unroute(stateRoute)
  await send.click()
  await expect.poll(()=>received).toEqual([['Revised reading']])
  await expect(composer).toHaveValue('')
  // Switching away from an unlinked page removes it from this turn's sync requirements.
  const library=page.getByRole('navigation',{name:'Library',exact:true})
  await library.getByRole('button',{name:'Measurements',exact:true}).click()
  await interruptSync()
  await field.fill('Later reading')
  await composer.fill('Review this document')
  await side.getByRole('button',{name:'Run in background'}).click()
  await send.click()
  await expect(alert).toContainText('Source sync is offline')
  await library.getByRole('button',{name:'Report',exact:true}).click()
  await expect(page.locator('article[data-source-page="'+current.id+'"]:visible')).toBeVisible()
  await send.click()
  await expect.poll(()=>received).toEqual([['Revised reading'],[]])
  await expect(composer).toHaveValue('')
  console.log('An unsynced linked block blocked delivery from open and closed panes, then reached the agent once with its latest text.')
}finally{await browser.close();await host.close()}
