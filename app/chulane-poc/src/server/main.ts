/** Web entry point. The database is private to this installation. */
import {openWorkspaceDatabase} from './workspace-database.ts'
import {serverAccounts} from './accounts.ts'
import {text} from 'node:stream/consumers'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
/** Keep piped input available for deployment scripts and hide both entries at an interactive terminal. */
async function accountPassword(label:string){
  if(!process.stdin.isTTY)return (await text(process.stdin)).replace(/\r?\n$/,'')
  const {default:prompt}=await import('prompts')
  while(true){
    const {password,confirmation}=await prompt([
      {type:'invisible',name:'password',message:label+' password (12–256 characters)'},
      {type:'invisible',name:'confirmation',message:'Confirm password'}
    ])
    if(typeof confirmation!=='string')throw Error(label+' setup cancelled.')
    if(password===confirmation)return confirmation
    console.error('Passwords differ. Enter a new password and confirm it.')
  }
}
const dir=resolve(process.env.CHULANE_DATA || 'data')
await mkdir(dir,{recursive:true})
const command=process.argv[2]
if(command==='create-admin'||command==='create-user'){
  const administrator=command==='create-admin'
  try{
    if(process.argv.length!==4)throw Error('Use '+command+' USERNAME.')
    const password=await accountPassword(administrator?'Administrator':'Account')
    const {db}=openWorkspaceDatabase(resolve(dir,'workspace.sqlite'))
    try{await serverAccounts(db).authenticate(process.argv[3],password,administrator?'bootstrap':'provision')}
    finally{db.close()}
    console.log(administrator?'Server administrator created. Sign in to manage registration.':'Account created. A workspace owner can now invite this username.')
  }catch(error){console.error((error as Error).message);process.exitCode=1}
}else{
  const {Context}=await import('../../../../vendor/cordis/src/index.ts')
  const {serve}=await import('./service.ts')
  const composition=new Context()
  const app=await serve({context:composition,file:resolve(dir,'workspace.sqlite'),assets:fileURLToPath(new URL('../../dist',import.meta.url)),host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||4173),registration:process.env.CHULANE_ALLOW_REGISTRATION==='1',editorKey:process.env.CHULANE_EDITOR_KEY,viewerKey:process.env.CHULANE_VIEWER_KEY})
  console.log(app.url)
  for(const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>void app.close().then(()=>composition.fiber.dispose()))
}
