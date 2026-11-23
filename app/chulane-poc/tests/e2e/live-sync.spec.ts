/** Two accounts receive typing and committed agent edits while periodic document reconciliation is paused. */
import {chromium,firefox,expect} from '@playwright/test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {serverAccounts} from '../../src/server/accounts'
import {serve} from '../../src/server/service'

const dir=await mkdtemp(join(tmpdir(),'chulane-live-'))
const db=new DatabaseSync(join(dir,'db'))
try{
  const accounts=serverAccounts(db)
  accounts.setRegistration(await accounts.authenticate('writer','long-test-passphrase','bootstrap'),true)
}finally{db.close()}
const host=await serve({file:join(dir,'db'),assets:resolve('dist'),registration:true,
  provider:{get:()=>({model:'fixture',key:'fixture'})},
  backgroundEnvironment:{async run(turn){
    const page=turn.current!.id
    const canvas=turn.tools.readCanvas!(page,0)
    const prior=canvas.elements.find(element=>element.type==='sticker')
    turn.tools.editCanvas!({id:page,element:prior?.id??null,value:{
      type:'sticker',x:30,y:40,width:180,height:100,text:prior?'Updated by agent':'Added by agent',
    }})
  }},
})
const browser=await (process.env.CHULANE_TEST_BROWSER==='firefox'?firefox:chromium).launch()
try{
  const writer=await browser.newPage(),reader=await browser.newPage()
  for(const [client,username] of [[writer,'writer'],[reader,'reader']] as const){
    const signIn=await client.request.post(host.url+'/api/'+(username==='writer'?'login':'register'),{data:{username,password:'long-test-passphrase'}})
    expect(signIn.ok()).toBe(true)
    await client.addInitScript(()=>{
      const interval=window.setInterval.bind(window)
      window.setInterval=(handler,delay,...args)=>interval(handler,delay===500?60000:delay,...args)
    })
  }
  const ws=await (await writer.request.post(host.url+'/api/workspaces',{data:{name:'Shared'}})).json()
  const scope='?workspace='+ws.id
  expect((await reader.request.get(host.url+'/api/document-events'+scope)).status()).toBe(404)
  const invite=await (await writer.request.post(host.url+'/api/workspaces/invitations'+scope,{data:{username:'reader',role:'viewer'}})).json()
  expect((await reader.request.post(host.url+'/api/invitations/'+invite.id+'/accept')).ok()).toBe(true)
  const doc=await (await writer.request.post(host.url+'/api/pages'+scope,{data:{title:'Meeting'}})).json()
  const field=writer.locator('[data-block-content]').first()
  const view=reader.locator('[data-block-content]').first()
  await Promise.all([writer.goto(host.url+'/'+scope+'&page='+doc.id),reader.goto(host.url+'/'+scope+'&page='+doc.id)])
  await expect(view).toBeVisible()
  const participants=writer.getByRole('button',{name:'Document participants'})
  const settings=writer.getByRole('button',{name:'Server settings'})
  await settings.click()
  const policy=writer.getByRole('checkbox',{name:'Allow document presence'})
  await policy.uncheck()
  await expect(reader.getByRole('button',{name:'Document participants'})).toHaveCount(0,{timeout:8000})
  await policy.check()
  await writer.keyboard.press('Escape')
  await participants.click()
  const people=writer.getByRole('dialog',{name:'Document participants'})
  await expect(people.getByRole('listitem')).toHaveText(['reader','writer'])
  const secondWindow=await browser.newPage({storageState:await reader.context().storageState()})
  await secondWindow.goto(reader.url())
  const otherParticipants=secondWindow.getByRole('button',{name:'Document participants'})
  await otherParticipants.click()
  await expect(secondWindow.getByRole('dialog',{name:'Document participants'}).getByRole('listitem')).toHaveText(['reader','writer'])
  const other=await (await writer.request.post(host.url+'/api/pages'+scope,{data:{title:'Other meeting'}})).json()
  await secondWindow.goto(host.url+'/'+scope+'&page='+other.id)
  await otherParticipants.click()
  await expect(secondWindow.getByRole('dialog',{name:'Document participants'}).getByRole('listitem')).toHaveText(['reader'])
  await secondWindow.close()
  const readerParticipants=reader.getByRole('button',{name:'Document participants'})
  await readerParticipants.click()
  const visible=reader.getByRole('checkbox',{name:'Show and share presence'})
  await visible.uncheck()
  await expect(people.getByRole('listitem')).toHaveText(['writer'])
  const subscribed=reader.waitForEvent('websocket',socket=>socket.url().endsWith('/api/document-events'))
  await reader.reload()
  await readerParticipants.click()
  await expect(visible).not.toBeChecked()
  await visible.check()
  await expect(people.getByRole('listitem')).toHaveText(['reader','writer'])
  await reader.keyboard.press('Escape')
  await writer.keyboard.press('Escape')
  await field.click()
  await writer.keyboard.insertText('First observation')
  await expect(view).toHaveText('First observation',{timeout:4000})
  await expect(field).toBeFocused()

  // A window connected through a proxy without WebSocket upgrades still reads live revisions.
  const fallback=await browser.newPage({storageState:await reader.context().storageState()})
  await fallback.route('**/api/document-events?*',route=>route.fulfill({status:404}))
  await fallback.goto(host.url+'/'+scope+'&page='+doc.id)
  const fallbackView=fallback.locator('[data-block-content]').first()
  await expect(fallbackView).toHaveText('First observation')
  await writer.keyboard.insertText(' continued')
  await expect(fallbackView).toHaveText('First observation continued')
  await expect(view).toHaveText('First observation continued')

  // Hold the review response in the approving window after SQLite commits. The other account
  // receives the edit through its subscription, while the original split retains an undo step.
  await writer.getByRole('button',{name:'Split right'}).click()
  const panes=writer.locator('.dv-groupview:visible')
  const current=writer.locator('.dv-active-group [data-block-content]').first()
  await expect(current).toHaveText('First observation continued')
  const proposal=await writer.request.post(host.url+'/api/proposals'+scope,{data:{
    page:doc.id,edit:{block:'',before:'',after:'Reviewed field note'},
  }})
  expect(proposal.ok()).toBe(true)
  const {pending}=await proposal.json()
  const path='**/api/proposals/'+pending+'/approve?*'
  let release!:()=>void
  const delayed=new Promise<void>(resolve=>{release=resolve})
  await writer.route(path,async route=>{
    const response=await route.fetch()
    await delayed
    await route.fulfill({response})
  })
  await writer.getByRole('button',{name:/Review \d+ pending request/}).click()
  const approval=writer.getByRole('alert').filter({hasText:'Reviewed field note'})
  await approval.getByRole('button',{name:'approve',exact:true}).click()
  const blocks=reader.locator('[data-block-content]')
  try{
    await expect(blocks).toHaveText(['First observation continued','Reviewed field note'],{timeout:4000})
    await expect(panes.locator('[data-block-content]')).toHaveText(['First observation continued','First observation continued'])
  }finally{release()}
  await writer.unrouteAll({behavior:'wait'})
  await expect(panes.locator('[data-block-content]')).toHaveCount(4)
  await writer.keyboard.press('Escape')
  await current.press('ControlOrMeta+z')
  await expect(blocks).toHaveText(['First observation continued'],{timeout:4000})
  await expect(panes.locator('[data-block-content]')).toHaveCount(2)
  await current.press('End')
  // A background agent has no initiating editor to relay its canvas changes to the viewer.
  const chat=await (await writer.request.post(host.url+'/api/agent/chats'+scope,{data:{}})).json()
  await reader.getByRole('radio',{name:'Canvas',exact:true}).click()
  const sticker=reader.locator('.edgeless-sticker-text').first()
  for(const [mode,label] of [['append','Added by agent'],['full','Updated by agent']] as const){
    const response=await writer.request.post(host.url+'/api/agent/chats/'+chat.id+'/turn'+scope,{
      data:{text:label,page:doc.id,surface:'canvas',mode,background:true},
    })
    expect(response.status()).toBe(202)
    await expect(sticker).toHaveText(label,{timeout:4000})
  }
  const socket=await subscribed,frames:string[]=[]
  socket.on('framereceived',event=>frames.push(String(event.payload)))
  const members=await (await writer.request.get(host.url+'/api/workspaces/members'+scope)).json()
  const readerId=members.find((member:{name:string})=>member.name==='reader').id
  const disconnected=socket.waitForEvent('close',{timeout:4000})
  expect((await writer.request.delete(host.url+'/api/workspaces/members/'+readerId+scope)).ok()).toBe(true)
  await disconnected
  await writer.keyboard.insertText(' private')
  expect(frames).toEqual([])
  expect((await reader.request.get(host.url+'/api/pages/'+doc.id+'/state'+scope)).status()).toBe(404)
}finally{await browser.close();await host.close();await rm(dir,{recursive:true,force:true})}
