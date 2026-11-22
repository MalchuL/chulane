/** Measure authenticated library search and JSON delivery against a disposable, disk-backed SQLite database. */
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {serve} from '../../src/server/service.ts'
import type {LibrarySearchHit} from '../../src/shared/agent.ts'

const directory=await mkdtemp(join(tmpdir(),'chulane-search-benchmark-'))
const file=join(directory,'library.sqlite')
const host=await serve({file,assets:'.',editorKey:'benchmark'})
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
    const warm=samples.slice(1).sort((a,b)=>a-b)
    console.log(JSON.stringify({query,firstMs:samples[0],warmMedianMs:warm[5],warmMinMs:warm[0],warmMaxMs:warm.at(-1)}))
  }
}finally{await host.close();await rm(directory,{recursive:true,force:true})}
