/** Web entry point. The database is private to this installation. */
import {openWorkspaceDatabase} from './workspace-database.ts'
import {serverAccounts} from './accounts.ts'
import {text} from 'node:stream/consumers'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const dir=resolve(process.env.CHULANE_DATA || 'data')
await mkdir(dir,{recursive:true})
if(process.argv[2]==='create-admin'){
  if(process.argv.length!==4||process.stdin.isTTY)throw Error('Pass a new username as the argument and the password on standard input.')
  const password=(await text(process.stdin)).replace(/\r?\n$/,'')
  const {db}=openWorkspaceDatabase(resolve(dir,'workspace.sqlite'))
  try{await serverAccounts(db).authenticate(process.argv[3],password,'bootstrap')}
  finally{db.close()}
  console.log('Server administrator created. Sign in to manage registration.')
}else{
  const {Context}=await import('../../../../vendor/cordis/src/index.ts')
  const {serve}=await import('./service.ts')
  const composition=new Context()
  const app=await serve({context:composition,file:resolve(dir,'workspace.sqlite'),assets:fileURLToPath(new URL('../../dist',import.meta.url)),host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||4173),registration:process.env.CHULANE_ALLOW_REGISTRATION==='1',editorKey:process.env.CHULANE_EDITOR_KEY,viewerKey:process.env.CHULANE_VIEWER_KEY})
  console.log(app.url)
  for(const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>void app.close().then(()=>composition.fiber.dispose()))
}
