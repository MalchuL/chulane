/** Exercise independent chat runs and a queued edit while an unrelated composer draft stays intact. */
import {chromium,expect} from '@playwright/test'
import {resolve} from 'node:path'
import {serve} from '../../src/server/service.ts'

const executed:string[]=[]
const host=await serve({file:':memory:',registration:true,assets:resolve('dist'),provider:{get:()=>({key:'fixture',model:'test',url:'http://127.0.0.1:1/v1'})},
  backgroundEnvironment:{async run(turn){
    const text=turn.history.at(-1)!.content
    executed.push(text)
    if(text==='Hold')await new Promise<void>(done=>turn.signal.addEventListener('abort',()=>done(),{once:true}))
    else turn.publish(text)
  }}})
const browser=await chromium.launch()
try{
  const page=await browser.newPage()
  async function post(path:string,data:object){
    const response=await page.request.post(host.url+'/api/'+path,{data})
    expect(response.ok(),await response.text()).toBe(true);return response.json()
  }
  await post('register',{username:'queuewriter',password:'fixture-passphrase'})
  await post('workspaces',{name:'Research'})
  const doc=await post('pages?workspace=1',{title:'Report',content:'First reading'})
  await page.goto(host.url+'/?workspace=1&page='+doc.id)
  await page.getByRole('button',{name:'Agent',exact:true}).click()
  const panel=page.getByRole('complementary',{name:'Workspace agent'})
  const field=panel.getByLabel('Message the agent')
  await panel.getByRole('button',{name:'Run in background'}).click()
  await field.fill('Hold');await field.press('Enter')
  await expect(panel.getByRole('button',{name:'Stop response'})).toBeVisible()
  await panel.getByRole('button',{name:'Run in background'}).click()
  await field.fill('A');await field.press('Enter')
  const queue=panel.getByLabel('Queued messages')
  await expect(queue).toContainText('A')
  await field.fill('Draft B')
  await page.getByRole('button',{name:'Attach block links to chat'}).first().click()
  await field.evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(2,2))
  await queue.getByRole('button',{name:'Edit queued message'}).click()
  await expect(field).toHaveValue('A')
  await field.fill('Edited A')
  await page.getByRole('button',{name:'Attach block links to chat'}).first().click()
  await field.press('Enter')
  await expect(field).toHaveValue('Draft B')
  await expect(panel.getByRole('button',{name:'Remove block link: First reading'})).toBeVisible()
  expect(await field.evaluate((el:HTMLTextAreaElement)=>el.selectionStart)).toBe(2)
  await panel.getByRole('button',{name:'New chat',exact:true}).click()
  await panel.getByRole('button',{name:'Run in background'}).click()
  await field.fill('Other chat');await field.press('Enter')
  await expect.poll(()=>executed).toEqual(['Hold','Other chat'])
  await panel.getByRole('navigation',{name:'Open conversations'}).getByRole('button',{name:/^Hold/}).click()
  await expect(field).toHaveValue('Draft B')
  await queue.getByRole('button',{name:'Steer now'}).click()
  await expect.poll(()=>executed).toEqual(['Hold','Other chat','Edited A'])
  // Fill the actual draft with the maximum block context at a narrow viewport.
  const large=await post('pages/import-markdown?workspace=1',{title:'Long context',content:Array.from({length:32},(_,i)=>i+'x'.repeat(100)).join('\n\n')})
  await page.goto(host.url+'/?workspace=1&page='+large.id)
  await page.getByRole('button',{name:'Agent',exact:true}).click()
  await expect(field).toHaveValue('Draft B')
  await panel.getByRole('button',{name:'Remove block link: First reading'}).click()
  const grips=page.getByRole('button',{name:'Attach block links to chat'})
  await expect(grips).toHaveCount(32)
  for(const grip of await grips.all())await grip.press('Enter')
  await page.setViewportSize({width:490,height:580})
  await field.fill('long line\n'.repeat(100))
  const context=panel.getByLabel('Message context')
  expect(await context.evaluate(el=>el.scrollHeight>el.clientHeight&&el.scrollWidth<=el.clientWidth+1)).toBe(true)
  await expect(panel.getByRole('button',{name:'Send',exact:true})).toBeInViewport()
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  console.log('Two chats ran independently. Editing and steering preserved the other draft, its block link, and caret.')
}finally{await browser.close();await host.close()}
