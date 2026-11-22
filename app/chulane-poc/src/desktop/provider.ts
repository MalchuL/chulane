/** The local installation shares one provider across its workspaces. Electron encrypts persisted keys. */
import {safeStorage} from 'electron'
import {readFile,writeFile,rename} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {checkLocalAgent} from '../server/local-agent.ts'
import {LOCAL_AGENTS} from '../shared/agent.ts'
import {join} from 'node:path'
import {environmentProvider,type Provider} from '../server/mastra.ts'

/** Restore the model and encrypted key when OS credential storage is available. */
export async function desktopProvider(dir:string):Promise<Provider>{
  const file=join(dir,'ai-provider.json')
  let settings=environmentProvider()
  const secure=()=>safeStorage.isEncryptionAvailable() && (process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text')
  let encryptedKey:string|undefined
  try{
    const saved=JSON.parse(await readFile(file,'utf8'))
    if(typeof saved.encrypted==='string')encryptedKey=saved.encrypted
    if(LOCAL_AGENTS.includes(saved.agent))settings={...settings,agent:saved.agent}
    if(secure()&&encryptedKey)settings={...settings,key:safeStorage.decryptString(Buffer.from(encryptedKey,'base64')),model:saved.model,agent:LOCAL_AGENTS.includes(saved.agent)?saved.agent:undefined}
  }catch{/* Missing or unavailable keychain leaves environment configuration usable. */}
  /** Rename each complete configuration into place before advertising the switch. */
  async function persist(value:object){
    const temp=file+'.'+randomUUID()+'.tmp'
    await writeFile(temp,JSON.stringify(value),{mode:0o600})
    await rename(temp,file)
  }
  return {get:()=>settings,checkAgent:checkLocalAgent,async selectAgent(agent){
    await checkLocalAgent(agent)
    await persist({agent,model:settings.model,encrypted:encryptedKey})
    settings={...settings,agent}
    return agent==='hermes'?'Hermes chat CLI ready. Send a message to use its configured provider.':'Connected to local '+agent+'.'
  },async save(key,model){
    if(secure()){
      const encrypted=safeStorage.encryptString(key).toString('base64')
      await persist({model,encrypted})
      encryptedKey=encrypted
      settings={...settings,key,model,agent:undefined}
      return 'Provider saved on this device.'
    }
    await persist({})
    encryptedKey=undefined
    settings={...settings,key,model,agent:undefined}
    return 'Provider ready for this session. Secure key storage is unavailable.'
  }}
}
