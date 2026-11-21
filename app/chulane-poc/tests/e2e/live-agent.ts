/** Optional paid-provider acceptance check. Uses one temporary workspace with synthetic notes. */
import assert from 'node:assert/strict'
import {serve} from '../../src/server/service.ts'
if(!process.env.OPENAI_API_KEY&&!process.env.CHULANE_LOCAL_AGENT)throw Error('Set OPENAI_API_KEY or CHULANE_LOCAL_AGENT on the test host to run live acceptance.')
const host=await serve({file:':memory:',assets:'.',editorKey:'temporary-live-smoke'})
try{
  let cookie=''
  const call=(path:string,body?:object)=>fetch(host.url+'/api/'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body&&JSON.stringify(body)})
  cookie=(await call('login',{key:'temporary-live-smoke'})).headers.get('set-cookie')!.split(';')[0]
  const current=await(await call('pages',{title:'Decision',content:'The launch date is July 8.'})).json()
  const target=await(await call('pages',{title:'Roadmap',content:'Planning'})).json()
  const chat=await(await call('agent/chats',{})).json(),path='agent/chats/'+chat.id
  const turn=await call(path+'/turn',{text:'Find and read Roadmap. Append one paragraph with the launch date from my current page to Roadmap. Propose this edit using the tool.',page:current.id})
  assert.equal(turn.status,200);await turn.text()
  const view=await(await call(path)).json(),answer=view.messages.at(-1)
  assert.equal(answer.status,'complete')
  assert.ok(answer.sources.some(s=>s.id===target.id))
  const edit=view.edits.find(e=>e.page===target.id && e.status==='pending');assert.ok(edit)
  assert.equal((await call(path+'/edits/'+edit.id+'/apply',{})).status,200)
  assert.match((await(await call('source?id='+target.id)).json()).text,/July 8|8 July|07-08/i)
  console.log('Live provider read the second page, cited it, and proposed a durable edit.')
}finally{await host.close()}
