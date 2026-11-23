/** Measure authenticated search from request to JSON and optionally from browser input to the result-count DOM update. */
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {serve} from '../../src/server/service.ts'
import type {LibrarySearchHit} from '../../src/shared/agent.ts'

/** Report the first sample separately from the median and range of subsequent searches. */
function report(query:string,metric:string,samples:number[]){
  const warm=samples.slice(1).sort((a,b)=>a-b)
  console.log(JSON.stringify({query,metric,firstMs:samples[0],warmMedianMs:warm[Math.floor(warm.length/2)],warmMinMs:warm[0],warmMaxMs:warm.at(-1)}))
}

const browserTiming=process.argv.includes('--browser')
const directory=await mkdtemp(join(tmpdir(),'chulane-search-benchmark-'))
const file=join(directory,'library.sqlite')
const host=await serve({file,assets:browserTiming?resolve('dist'):'.',editorKey:'benchmark'})
const prefix='Measured 42 m. '.repeat(16000)+'🧭Место '.repeat(40)
const prefixLength=Array.from(prefix).length
try{
  const login=await fetch(host.url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'benchmark'})})
  assert.equal(login.status,200)
  const cookie=login.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie)
  const headers={Cookie:cookie,'Content-Type':'application/json'}
  const created=await fetch(host.url+'/api/workspaces',{method:'POST',headers,body:JSON.stringify({name:'Synthetic survey'})})
  assert.equal(created.status,200)
  const {id:workspace}=await created.json()
  const db=new DatabaseSync(file)
  try{
    db.exec('BEGIN')
    const page=db.prepare('INSERT INTO pages(workspace,title,plain) VALUES(?,?,?)')
    const attachment=db.prepare('INSERT INTO files(page,name,bytes,extractedText) VALUES(?,?,?,?)')
    for(let n=0;n<1000;n++){
      const {lastInsertRowid:id}=page.run(workspace,'Notebook '+n,'Field entry '+n)
      if(n<64)for(let i=0;i<2;i++){
        const text=prefix+'Reading '+n+'/'+i+' target beacon'
        attachment.run(id,'notes'+i+'.txt',Buffer.from(text),text)
      }
    }
    db.exec('COMMIT')
  }finally{db.close()}

  for(const query of ['target beacon','absent word']){
    const samples:number[]=[]
    for(let i=0;i<12;i++){
      const start=performance.now()
      const response=await fetch(host.url+'/api/library/search?workspace='+workspace+'&q='+encodeURIComponent(query),{headers})
      assert.equal(response.status,200)
      const hits:LibrarySearchHit[]=await response.json()
      samples.push(performance.now()-start)
      assert.equal(hits.length,query==='target beacon'?64:0)
      for(const [n,hit] of hits.entries()){
        assert.equal(hit.title,'Notebook '+n)
        assert.equal(hit.additionalAttachments?.length,1)
        for(const [i,match] of [hit.attachment,hit.additionalAttachments[0]].entries()){
          assert.equal(match?.name,'notes'+i+'.txt')
          assert.equal(match.matchOffset,prefixLength+('Reading '+n+'/'+i+' ').length)
          assert.ok(match.excerpt.includes(query))
        }
      }
    }
    report(query,'httpToJson',samples)
  }

  if(browserTiming){
    const {chromium,expect}=await import('@playwright/test')
    const browser=await chromium.launch()
    try{
      const page=await browser.newPage()
      await page.context().addCookies([{url:host.url,name:'chulane',value:cookie.slice('chulane='.length)}])
      await page.goto(host.url+'/?workspace='+workspace)
      const input=page.getByRole('textbox',{name:'Search pages'})
      const status=page.getByRole('status',{name:'Library search'})
      await expect(status).toHaveText('1000 pages')
      for(const submit of [false,true]){
        const times=new Map<string,number[]>()
        for(let i=0;i<12;i++)for(const [query,count] of [['target beacon',64],['absent word',0]] as const){
          // Start at the input event. Stop at React's result-count commit, excluding Playwright polling.
          await status.evaluate((node,expected)=>{
            performance.clearMarks('search-input')
            performance.clearMeasures('search-results')
            document.addEventListener('input',()=>performance.mark('search-input'),{capture:true,once:true})
            const observer=new MutationObserver(()=>{
              if(node.textContent!==expected)return
              observer.disconnect()
              performance.measure('search-results','search-input')
            })
            observer.observe(node,{childList:true,characterData:true,subtree:true})
          },count+' pages')
          await input.fill(query)
          if(submit)await input.press('Enter')
          await expect(status).toHaveText(count+' pages')
          const elapsed=await page.evaluate(()=>performance.getEntriesByName('search-results','measure')[0]?.duration)
          assert.ok(typeof elapsed==='number')
          const samples=times.get(query)??[]
          samples.push(elapsed);times.set(query,samples)
          await expect(page.getByRole('list',{name:'Page list'}).getByRole('listitem')).toHaveCount(count)
          await expect(input).toBeFocused()
        }
        for(const [query,samples] of times)report(query,submit?'chromiumSubmitInputToResultsDOM':'chromiumTypingInputToResultsDOM',samples)
      }
    }finally{await browser.close()}
  }
}finally{await host.close();await rm(directory,{recursive:true,force:true})}
