/** Verify that an interrupted upload survives reload and replays after the writer closes in each browser engine. */
import {chromium,expect,firefox,webkit} from '@playwright/test'
import {resolve} from 'node:path'
import {serve} from '../../src/server/service.ts'

const host=await serve({file:':memory:',assets:resolve('dist'),registration:true})
try{
  for(const engine of [webkit,firefox,chromium]){
    const browser=await engine.launch()
    try{
      const page=await browser.newPage()
      /** Use the same account cookie as the browser when inspecting the host copy. */
      async function create(path:string,data:object){
        const response=await page.request.post(host.url+'/api/'+path,{data})
        expect(response.ok(),await response.text()).toBe(true)
        return response.json()
      }
      await create('register',{username:'writer-'+engine.name(),password:'fixture-passphrase'})
      const workspace=await create('workspaces',{name:'Survey'})
      const scope='?workspace='+workspace.id
      const notes=await create('pages/import-markdown'+scope,{title:'Field notes',content:'Original notes'})
      const index=await create('pages/import-markdown'+scope,{title:'Index',content:'Survey index'})
      const readHost=async(id:number)=>(await (await page.request.get(host.url+'/api/source'+scope+'&id='+id)).json()).text
      const field=page.locator('[data-block-content]').first()
      const status=page.getByRole('status',{name:'Workspace sync status'})
      await page.goto(host.url+'/'+scope)
      await expect(status).toHaveText('No queued edits')
      await page.goto(host.url+'/'+scope+'&page='+notes.id)
      await expect(field).toHaveText('Original notes')

      const route='**/api/pages/*/state?**'
      await page.route(route,request=>request.request().method()==='GET'?request.continue():request.fulfill({status:503,json:{error:'Uploads interrupted'}}))
      await page.context().setOffline(true)
      await field.fill('Tide falling')
      await expect(page.locator('.save')).toHaveText('Saved on device · waiting to sync')
      await page.context().setOffline(false)
      await page.reload()
      await expect(field).toHaveText('Tide falling')
      // A reload gives this document a second writer in the same device queue.
      await field.fill('Tide falling at noon')
      await expect(page.locator('.save')).toHaveText('Saved on device · waiting to sync')
      expect(await readHost(notes.id)).toBe('Original notes')
      await page.goto(host.url+'/'+scope+'&page='+index.id)
      await expect(field).toHaveText('Survey index')
      await field.fill('Two locations surveyed')
      await expect(page.locator('.save')).toHaveText('Saved on device · waiting to sync')
      await page.goto(host.url+'/'+scope)
      await expect(page.getByRole('heading',{name:'All pages',exact:true})).toBeVisible()
      expect(await readHost(index.id)).toBe('Survey index')
      await page.unroute(route)
      await page.getByRole('button',{name:'Retry workspace sync'}).click()
      await expect.poll(()=>readHost(notes.id)).toBe('Tide falling at noon')
      await expect.poll(()=>readHost(index.id)).toBe('Two locations surveyed')
      await expect(status).toHaveText('No queued edits')
      await page.goto(host.url+'/'+scope+'&page='+notes.id)
      await expect(field).toHaveText('Tide falling at noon')
      console.log(engine.name()+' recovered offline writing after reload and synced both closed pages.')
    }finally{await browser.close()}
  }
}finally{await host.close()}
