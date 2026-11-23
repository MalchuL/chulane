import {chromium,firefox,webkit,expect} from '@playwright/test'
import {resolve} from 'node:path'
import {serve} from './src/server/service.ts'
const host=await serve({file:':memory:',assets:resolve('dist'),registration:true,provider:{get:()=>({key:'fixture',model:'fixture'})},backgroundEnvironment:{async run(turn){turn.publish('Photograph the eastern shore at low tide. Take a second frame from the north bank so you can compare the ripple marks across visits.')}}})
try{
for(const engine of [chromium,firefox]){
  const browser=await engine.launch()
  try{
    const p=await browser.newPage({viewport:{width:1360,height:860},deviceScaleFactor:1})
    const errors:string[]=[]
    p.on('pageerror',e=>errors.push(e.message))
    async function create(url:string,data:object){
      const res=await p.request.post(host.url+'/api/'+url,{data})
      expect(res.ok(),await res.text()).toBe(true);return res.json()
    }
    await create('register',{username:'glass'+engine.name(),password:'fixture-passphrase'})
    const {id}=await create('workspaces',{name:'Field notebook'})
    const scope='?workspace='+id
    const names=['Estuary observations','Weather and tides','Sketchbook','Specimen catalogue','Survey routes']
    let first=0
    for(const title of names){
      const doc=await create('pages/import-markdown'+scope,{title,content:'## Morning survey\n\nAt the waterline the sand retained the ripple marks from last night’s tide. The north bank was still in shadow.\n\n## Next visit\n\nReturn at low tide to compare the exposed beds and photograph the eastern shore.'})
      first ||= doc.id
    }
    await p.goto(host.url+'/'+scope+'&page='+first)
    const lens=p.locator('[data-part=workspace-lens]')
    await expect(lens).toBeVisible()
    const field=p.locator('[data-block-content]').first()
    await expect(field).toContainText('Morning survey')
    const tier=engine===chromium?'refract':'frost'
    await expect(lens).toHaveClass(new RegExp('liqui-glass--'+tier))
    if(engine===chromium)await expect(lens.locator('.liqui-glass__refract')).toHaveCSS('backdrop-filter',/url\(/)
    await p.getByRole('button',{name:'Agent',exact:true}).click()
    await p.getByLabel('Message the agent').fill('What should I photograph on the next visit?')
    await p.getByRole('button',{name:'Run in background'}).click()
    await p.getByRole('button',{name:'Send',exact:true}).click()
    await expect(p.getByText('Photograph the eastern shore at low tide.',{exact:false}).last()).toBeVisible()
    await p.getByLabel('Message the agent').fill('Add that to my survey notes.')
    await p.getByLabel('Message the agent').press('Tab')
    await p.screenshot({path:'/tmp/chulane-liquid-glass-'+engine.name()+'.png'})
    await p.getByRole('button',{name:'Appearance',exact:true}).click()
    const appearance=p.getByRole('dialog',{name:'Appearance'})
    const material=appearance.getByLabel('Surface style')
    await expect(appearance).toHaveCSS('backdrop-filter',/blur/)
    await appearance.getByRole('combobox',{name:'Theme',exact:true}).selectOption('terminal')
    await material.selectOption('glass')
    await expect(p.locator('html')).toHaveCSS('color-scheme','dark')
    await expect(lens).toBeVisible()
    await expect(p.locator('.markdown-preview').first()).toHaveCSS('color','rgb(225, 241, 222)')
    await appearance.getByRole('combobox',{name:'Theme',exact:true}).selectOption('chulane')
    const switcher=p.locator('.workspace-switcher')
    const glassBounds=await switcher.boundingBox()
    await material.selectOption('solid')
    expect(await switcher.boundingBox()).toEqual(glassBounds)
    await expect(lens).toHaveCount(0)
    await appearance.getByRole('button',{name:'Cancel'}).click()
    await expect(lens).toBeVisible()
    await p.getByRole('button',{name:'Appearance',exact:true}).click()
    await material.selectOption('solid')
    await appearance.getByRole('button',{name:'Save theme'}).click()
    await p.reload()
    await expect(field).toBeVisible()
    await expect(lens).toHaveCount(0)
    await p.getByRole('button',{name:'Appearance',exact:true}).click()
    await expect(material).toHaveValue('solid')
    await material.selectOption('glass')
    await appearance.getByRole('button',{name:'Save theme'}).click()
    if(engine!==webkit){
    await p.emulateMedia({forcedColors:'active'})
    await expect(lens).toHaveCount(0)
    await p.emulateMedia({forcedColors:'none'})
    await expect(lens).toBeVisible()
    }
    if(engine===chromium){
      const cdp=await p.context().newCDPSession(p)
      await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]})
      await expect(lens).toHaveCount(0)
      await cdp.send('Emulation.setEmulatedMedia',{features:[]})
    }
    await p.setViewportSize({width:390,height:844})
    await p.getByRole('button',{name:'Toggle navigation'}).click()
    await expect(lens).toBeVisible()
    expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await p.screenshot({path:'/tmp/chulane-liquid-glass-mobile-'+engine.name()+'.png'})
    expect(errors).toEqual([])
    console.log(engine.name(),tier,'verified preview, persistence, accessible fallback and mobile navigation')
  }finally{await browser.close()}
}
}finally{await host.close()}
