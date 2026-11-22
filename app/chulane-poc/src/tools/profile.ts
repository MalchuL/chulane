/** Resolve a tool connection at process startup. Named connections never inherit another profile's address or credential. */
import {toolProfileName} from '../shared/tool-profile.ts'

export type ToolProfile={name?:string;origin:string;workspace:number;credentials:{key:string}|{username:string;password:string}}

/** Consume the optional leading --profile NAME; leave operation arguments untouched, including literal flags in titles. */
export function selectProfile(args:string[]){
  let name=process.env.CHULANE_PROFILE
  if(args[0]==='--profile'){
    args=args.slice(1)
    if(!args[0])throw Error('Supply a name after --profile')
    name=args[0];args=args.slice(1)
  }
  if(name&&!toolProfileName.test(name))throw Error('Use a lowercase profile name of up to 32 letters, digits or underscores, starting with a letter')
  const prefix=name?'CHULANE_PROFILE_'+name.toUpperCase()+'_':'CHULANE_'
  const address=process.env[prefix+'URL']??(!name?'http://127.0.0.1:4173':'')
  const key=process.env[prefix+'ACCESS_KEY']
  const username=process.env[prefix+'USERNAME'],password=process.env[prefix+'PASSWORD']
  if(!address)throw Error('Configure '+prefix+'URL'+(name?' for profile '+name:''))
  if(key&&(username||password))throw Error('Choose either account credentials or an access key for this profile.')
  const credentials=key?{key}:username&&password?{username,password}:null
  if(!credentials)throw Error('Configure '+prefix+'ACCESS_KEY or both '+prefix+'USERNAME and '+prefix+'PASSWORD.')
  let url:URL
  try{url=new URL(address)}catch{throw Error('Invalid server URL in '+prefix+'URL')}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(name&&(url.pathname!=='/'||url.search||url.hash)))
    throw Error('Use an HTTP or HTTPS server origin in '+prefix+'URL')
  if(username&&url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))
    throw Error('Account sign-in requires HTTPS or a loopback server.')
  const workspace=Number(process.env[prefix+'WORKSPACE']??1)
  if(!Number.isSafeInteger(workspace)||workspace<1)throw Error('Invalid workspace ID in '+prefix+'WORKSPACE')
  const profile:ToolProfile={name:name||undefined,origin:url.origin,workspace,credentials}
  return {profile,args}
}
