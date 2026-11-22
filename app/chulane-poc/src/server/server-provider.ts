/** Persist the server's model in workspace snapshots and keep its API credential on this host. */
import {randomUUID} from 'node:crypto'
import {readFileSync,rmSync,writeFileSync} from 'node:fs'
import type {DatabaseSync} from 'node:sqlite'
import {z} from 'zod'
import {environmentProvider,type ProviderSettings} from './mastra.ts'


/** The database pointer changes only after the new private key file is complete. */
export function serverProvider(db:DatabaseSync,file:string){
  db.exec('CREATE TABLE IF NOT EXISTS server_provider(id INTEGER PRIMARY KEY CHECK(id=1),model TEXT NOT NULL,credential TEXT NOT NULL)')
  const current=db.prepare('SELECT model,credential FROM server_provider WHERE id=1')
  function keyPath(credential:unknown){return file+'.provider-'+z.uuid().parse(credential)}
  function get():ProviderSettings{
    const fallback=environmentProvider(),saved=current.get()
    if(!saved)return fallback
    let key=''
    try{key=readFileSync(keyPath(saved.credential),'utf8')}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
    return {key,model:String(saved.model),url:fallback.url}
  }
  function status(){
    const {model,key,agent,url}=get()
    return {model,hasApiKey:!!key,agent,custom:!!current.get(),endpoint:new URL(url||'https://api.openai.com/v1').origin}
  }
  /** Rotate credentials atomically. An empty key retains the currently configured API credential. */
  function save(key:string,model:string){
    const credential=randomUUID(),previous=current.get()
    const secret=key||get().key
    if(!secret)throw Object.assign(Error('Enter an OpenAI API key'),{status:400})
    writeFileSync(keyPath(credential),secret,{mode:0o600,flag:'wx',flush:true})
    try{db.prepare('INSERT OR REPLACE INTO server_provider VALUES(1,?,?)').run(model,credential)}
    catch(error){rmSync(keyPath(credential),{force:true});throw error}
    if(previous)rmSync(keyPath(previous.credential),{force:true})
  }
  function reset(){
    const previous=current.get()
    db.exec('DELETE FROM server_provider')
    if(previous)rmSync(keyPath(previous.credential),{force:true})
  }
  return {get,status,save,reset}
}
