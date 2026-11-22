/** Cache previously opened server workspaces in their Electron origin partition. A named profile can reopen cached reads after session expiry. Membership denials invalidate them. */
import {attachmentDisposition} from '../shared/attachment-filename'
import {workspaceDay,workspaceReplica,type Library,type WorkspaceCatalog} from '../shared/library'
export const desktopServer=navigator.userAgent.includes('Electron/')&&!window.chulaneServers
const activeKey='chulane-active-replica'
const generationKey='chulane-replica-login'
const membershipKey=(profile:string|null)=>'chulane-replica-memberships-'+profile
const cachePrefix='chulane-profile-'

let offlineGeneration:string|null=null

/** Check the active desktop identity immediately before handing recovered data to the download manager. */
export function isCurrentServerProfile(profile:string){
  return profile===localStorage.getItem(activeKey)
}

/** Offer only libraries actually cached for the profile that last signed in on this device. */
export async function cachedSignInWorkspaces(){
  if(!desktopServer||!('caches' in window))return
  const profile=localStorage.getItem(activeKey),generation=localStorage.getItem(generationKey)
  if(!profile||!generation)return
  const cache=await caches.open(cachePrefix+profile)
  const catalog=await cache.match(new URL('/api/workspaces',location.origin))
  if(!catalog)return
  const info:WorkspaceCatalog=await catalog.json()
  if(info.profile!==profile)return
  const stored=new Set((await cache.keys()).map(entry=>entry.url))
  const workspaces=info.workspaces.filter(item=>stored.has(new URL('/api/library?workspace='+item.id,location.origin).href))
  if(generation===localStorage.getItem(generationKey))return {generation,workspaces}
}

/** Scope the user's offline choice to this window and the login that owns the cached directory. */
export function selectCachedSession(generation:string|null){
  offlineGeneration=generation===localStorage.getItem(generationKey)?generation:null
  return offlineGeneration!==null
}

/** Older cached catalogs contain only workspace IDs. Restored workspaces also have a generation marker. */
function cachedReplica(profile:string,workspace:number,membership:string|null){
  const marker=membership&&(JSON.parse(membership) as (number|string)[]).find(item=>typeof item==='string'&&item.startsWith(workspace+'~'))
  return workspaceReplica(profile,workspace,typeof marker==='string'?Number(marker.split('~')[1]):0)
}

/** Canonicalize poll URLs so all revisions share one last readable snapshot. */
function cacheKey(url:URL){
  const key=new URL(url);key.searchParams.delete('since');key.searchParams.delete('live')
  if(key.pathname==='/api/library')key.searchParams.delete('view')
  return key.href
}

/** Protect the offline catalog from in-flight responses belonging to a previous sign-in. */
async function switchProfile(next:string|null){
  const profile=localStorage.getItem(activeKey)
  if(next)localStorage.setItem(activeKey,next);else localStorage.removeItem(activeKey)
  localStorage.setItem(generationKey,crypto.randomUUID())
  if(profile&&profile!==next)await navigator.locks.request(cachePrefix+profile,async()=>{
    localStorage.removeItem(membershipKey(profile))
    await caches.delete(cachePrefix+profile)
  })
}

/** Derive availability from actual cached bodies, including after browser storage eviction. */
async function availableItems<T extends {id:number}>(items:T[],cache:Cache,path:(id:number)=>URL){
  if(!items.length)return []
  const stored=new Set((await cache.keys()).map(entry=>entry.url))
  return items.map(item=>({...item,availableOffline:stored.has(path(item.id).href)}))
}


function attachmentAvailability(response:Response,cache:Cache,url:URL){
  return response.json().then(async files=>Response.json(await availableItems(files,cache,id=>{
    const key=new URL(url);key.pathname+='/'+id;return key
  })))
}

/** Store the offline library and its read guards together so a denied page cannot reopen from cached bytes. */
function cachedLibrary(data:Pick<Library,'pages'|'removedPages'>){
  const retired=(data.removedPages??[]).map(page=>page.id)
  const unavailable=retired.concat(data.pages.filter(page=>page.deleted).map(page=>page.id))
  return Response.json(data,{headers:{'X-Chulane-Removed-Pages':retired.join(','),'X-Chulane-Unavailable-Pages':unavailable.join(','),
    ...(data.pages.some(page=>page.trashRevision)&&{'X-Chulane-Has-Trash-Revisions':'1'})}})
}

/** Both the library and the document index refer to the same workspace-qualified state URL. */
function pageState(url:URL,id:number){
  const key=new URL('/api/pages/'+id+'/state',url);key.searchParams.set('workspace',url.searchParams.get('workspace')!);return key
}

/** Access retained page bytes under the same account lock that guards membership changes and cache writes. */
export async function withWorkspaceCache<T>(profile:string,workspace:number,replica:string,
  action:(cache:Cache,library:Library,keys:Request[])=>Promise<T>){
  if(!desktopServer)throw Error('Local page copies are available in the desktop app.')
  return navigator.locks.request(cachePrefix+profile,async()=>{
    const generation=localStorage.getItem(generationKey)
    const membership=localStorage.getItem(membershipKey(profile))
    function check(){
      if(profile!==localStorage.getItem(activeKey)||generation!==localStorage.getItem(generationKey)||
        membership!==localStorage.getItem(membershipKey(profile))||!membership||!JSON.parse(membership).includes(workspace)||
        replica!==cachedReplica(profile,workspace,membership))throw Error('Workspace account changed.')
    }
    check()
    const cache=await caches.open(cachePrefix+profile)
    const saved=await cache.match(new URL('/api/library?workspace='+workspace,location.origin))
    if(!saved)throw Error('Local workspace copy is unavailable.')
    const library:Library=await saved.json()
    if(library.replica!==replica)throw Error('Workspace copy changed.')
    const keys=(await cache.keys()).filter(key=>new URL(key.url).searchParams.get('workspace')===String(workspace))
    check()
    const result=await action(cache,library,keys)
    check()
    return result
  })
}

/** Mirror authorized workspace reads and acknowledged uploads. Replay writes always reach the authenticated server. */
export async function serverRequest(path:string,init?:RequestInit):Promise<Response>{
  const url=new URL('/api/'+path,location.origin)
  if(!desktopServer||!('caches' in window))return fetch(url,init)
  const method=init?.method??'GET'
  const state=/^\/api\/pages\/\d+\/state$/.test(url.pathname)
  const files=/^\/api\/pages\/\d+\/files(?:\/(\d+))?$/.exec(url.pathname)
  const fileList=!!files&&!files[1],upload=fileList&&method==='POST'&&init?.body instanceof Blob
  const catalog=url.pathname==='/api/workspaces',library=url.pathname==='/api/library'
  const generation=localStorage.getItem(generationKey),active=localStorage.getItem(activeKey)
  const membership=localStorage.getItem(membershipKey(active))
  const directory=new URL('/api/workspaces',url)
  const readable=method==='GET'&&(catalog||library||state||!!files)
  let response:Response
  try{
    const remoteUrl=new URL(url)
    if(library&&method==='GET'){
      remoteUrl.searchParams.set('includeTagFields','1')
      remoteUrl.searchParams.set('includeExportMetadata','1')
    }
    response=await fetch(remoteUrl,readable&&!files?.[1]&&!init?.signal?{...init,signal:AbortSignal.timeout(10000)}:init)
    if(readable&&active&&([502,503,504].includes(response.status)||(response.status===401&&generation!==null&&offlineGeneration===generation)))
      throw Object.assign(Error('Server unavailable'),{status:response.status})
  }
  catch(err){
    if(init?.signal?.aborted||!readable||!active||localStorage.getItem(generationKey)!==generation)throw err
    const expected=new Headers(init?.headers).get('X-Chulane-Replica')
    const ws=Number(url.searchParams.get('workspace'))
    if((state||files)&&expected!==cachedReplica(active,ws,membership))throw err
    const cache=await caches.open(cachePrefix+active),cached=await cache.match(cacheKey(url))
    if(!catalog&&membership&&!JSON.parse(membership).includes(Number(url.searchParams.get('workspace'))))throw err
    if(localStorage.getItem(activeKey)!==active||localStorage.getItem(generationKey)!==generation||membership!==localStorage.getItem(membershipKey(active)))throw err
    if(state||files){
      const saved=await cache.match(new URL('/api/library?workspace='+ws,url))
      const id=url.pathname.split('/')[3]
      if(saved?.headers.get('X-Chulane-Unavailable-Pages')?.split(',').includes(id))
        return Response.json({error:'Page unavailable.'},{status:410})
    }
    if(!cached&&fileList)return Response.json([])
    if(!cached&&files)throw Error('Download this attachment while online to keep it on this device.')
    if(!cached){if(state)throw Error('Open this document online once to use it offline');throw err}
    if(fileList)return attachmentAvailability(cached,cache,url)
    const headers=new Headers(cached.headers);headers.set('X-Chulane-Offline','1')
    if(library){
      const directoryResponse=await cache.match(directory)
      if(!directoryResponse)throw err
      const info=await directoryResponse.json(),data=await cached.json()
      const entry=info.workspaces.find(item=>item.id===Number(url.searchParams.get('workspace')))
      if(!entry)throw err
      // The catalog may have refreshed after the last successful library read.
      data.today=workspaceDay(entry.timeZone)
      data.owner=entry.role==='owner'
      data.role=data.owner?'editor':entry.role
      if(data.role==='viewer'){data.proposals=[];data.titleConflicts=[];data.projectNameConflicts=[];data.moveConflicts=[]}
      data.pages=await availableItems(data.pages,cache,id=>pageState(url,id))
      return Response.json({...data,signInRequired:(err as {status?:number})?.status===401,workspaces:info.workspaces,archivedWorkspaces:info.archivedWorkspaces,profile:active},{headers})
    }
    const unchanged=state&&url.searchParams.get('since')===headers.get('X-Revision')
    return new Response(unchanged?null:cached.body,{status:unchanged?204:200,headers})
  }
  if(response.ok&&method==='POST'&&['/api/login','/api/register','/api/logout'].includes(url.pathname)){
    await switchProfile(response.headers.get('X-Chulane-Profile'));return response
  }
  if(localStorage.getItem(generationKey)!==generation){
    if(files&&active)throw Error('Workspace account changed.')
    return response
  }
  const profile=response.headers.get('X-Chulane-Profile')
  if(catalog&&response.ok&&method==='GET'){
    if(profile!==active)await switchProfile(profile)
    if(profile&&'serviceWorker' in navigator)void navigator.serviceWorker.register('/offline-shell.js').catch(()=>{})
  }
  if(!profile||profile!==localStorage.getItem(activeKey))return response
  const key=cacheKey(url)
  if(!upload&&!readable&&!(state&&method==='PUT'&&!url.searchParams.has('live')))return response
  if(response.status===204)return response
  let cachedFile=false
  await navigator.locks.request(cachePrefix+profile,async()=>{
    if(localStorage.getItem(activeKey)!==profile)return
    const current=localStorage.getItem(membershipKey(profile))
    // A newer catalog or denial can arrive in another window while this request is in flight.
    if(membership!==current&&!(catalog&&active!==profile))return
    const cache=await caches.open(cachePrefix+profile)
    async function updateCatalog(info:WorkspaceCatalog){
      const allowed=info.workspaces.map(item=>item.id).sort((a,b)=>a-b)
      const epochs=info.workspaces.filter(item=>item.restoration).map(item=>item.id+'~'+item.restoration).sort()
      const next=JSON.stringify([...allowed,...epochs])
      const previousDirectory=await cache.match(directory)
      const changed=epochs.filter(epoch=>!previousDirectory||!current||!JSON.parse(current).includes(epoch)).map(epoch=>Number(epoch.split('~')[0]))
      if(current!==next||!previousDirectory){
        // Write the catalog last. An interrupted purge is retried after the next successful fetch.
        await cache.delete(directory)
        localStorage.setItem(membershipKey(profile),next)
        for(const entry of await cache.keys()){
          const scope=new URL(entry.url).searchParams.get('workspace')
          if(scope&&(!allowed.includes(Number(scope))||changed.includes(Number(scope))))await cache.delete(entry)
          else if(scope&&current===null&&new URL(entry.url).pathname==='/api/library'){
            // Remove duplicated catalogs left in retained workspace records by earlier builds.
            const cached=await cache.match(entry)
            if(cached){const data=await cached.json();delete data.workspaces;delete data.archivedWorkspaces;await cache.put(entry,Response.json(data))}
          }
        }
      }
      const {invitations,...offlineCatalog}=info
      await cache.put(directory,Response.json(offlineCatalog))
    }
    if(!response.ok){
      if(library&&[403,404,410].includes(response.status)){
        const previous=await cache.match(directory)
        const info=previous?await previous.json():{profile,role:'editor',desktop:false,workspaces:[]}
        info.workspaces=info.workspaces.filter(item=>item.id!==Number(url.searchParams.get('workspace')))
        await updateCatalog(info)
      }else if((state||files)&&response.status===410&&
        (response.headers.has('X-Chulane-Page-Trashed')||response.headers.has('X-Chulane-Permanently-Deleted'))){
        const ws=Number(url.searchParams.get('workspace'))
        if(new Headers(init?.headers).get('X-Chulane-Replica')!==cachedReplica(profile,ws,current))return
        const libraryKey=new URL('/api/library?workspace='+ws,url)
        const saved=await cache.match(libraryKey)
        if(!saved)return
        const data:Library=await saved.json()
        const id=Number(url.pathname.split('/')[3]),page=data.pages.find(page=>page.id===id)
        if(!page)return
        if(response.headers.has('X-Chulane-Permanently-Deleted')){
          data.pages=data.pages.filter(page=>page.id!==id)
          data.removedPages=[...(data.removedPages??[]),{id,day:page.day,title:page.title}]
        }else{
          const revision=Number(response.headers.get('X-Chulane-Trash-Revision'))
          if((page.trashRevision??0)>revision||(page.deleted&&(page.trashRevision??0)===revision))return
          page.deleted=1
          page.trashRevision=revision
        }
        await cache.put(libraryKey,cachedLibrary(data))
      }else if((state||files)&&[403,404].includes(response.status)){
        // A stale window can receive a replica denial after a restored page has already been cached.
        const expected=cachedReplica(profile,Number(url.searchParams.get('workspace')),current)
        if(new Headers(init?.headers).get('X-Chulane-Replica')===expected)await cache.delete(key)
      }
      return
    }
    if(catalog){await updateCatalog(await response.clone().json());return}
    if(library){
      const data=await response.clone().json()
      const {workspaces,archivedWorkspaces,invitations,...workspace}=data
      await updateCatalog({profile,role:data.role,desktop:data.desktop,workspaces,archivedWorkspaces})
      const previous=await cache.match(key)
      if(data.removedPages?.length||previous?.headers.get('X-Chulane-Removed-Pages')||previous?.headers.has('X-Chulane-Has-Trash-Revisions')){
        const prior:Library|undefined=previous&&await previous.json()
        // A slower catalog read cannot revive a retired ID. Retain only device-known titles.
        const retired=new Map((prior?.removedPages??[]).map(page=>[page.id,page]))
        const known=new Map(prior?.pages.map(page=>[page.id,page]))
        for(const page of data.removedPages??[])if(!retired.has(page.id))retired.set(page.id,{...page,title:known.get(page.id)?.title})
        for(const page of data.pages){
          const cached=known.get(page.id)
          known.delete(page.id)
          if(cached&&(cached.trashRevision??0)>(page.trashRevision??0)){
            page.deleted=cached.deleted
            page.trashRevision=cached.trashRevision
          }
        }
        // An older full catalog may even predate this page. Only an explicit tombstone retires its ID.
        for(const page of known.values())if(page.trashRevision)data.pages.push(page)
        workspace.removedPages=data.removedPages=[...retired.values()]
        workspace.pages=data.pages=data.pages.filter(page=>!retired.has(page.id))
      }
      await cache.put(key,cachedLibrary(workspace))
      data.pages=await availableItems(data.pages,cache,id=>pageState(url,id))
      response=Response.json(data,{headers:response.headers})
    }else if(!current||JSON.parse(current).includes(Number(url.searchParams.get('workspace')))){
      // A delayed download must not recreate a copy the user discarded after learning of the deletion.
      const libraryKey=new URL('/api/library',url);libraryKey.searchParams.set('workspace',url.searchParams.get('workspace')!)
      const saved=await cache.match(libraryKey)
      const page=Number(url.pathname.split('/')[3])
      if(saved?.headers.get('X-Chulane-Removed-Pages')?.split(',').includes(String(page)))return
      if(method==='GET'){
        await cache.put(key,response.clone())
        cachedFile=!!files?.[1]
      }
      else if(upload&&init?.body instanceof Blob){
        const {id}=await response.clone().json()
        if(Number.isSafeInteger(id)&&id>0){
          const target=new URL(url);target.pathname+='/'+id;target.searchParams.delete('name')
          await cache.put(target,new Response(init.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':attachmentDisposition(url.searchParams.get('name')??'Attachment')}}))
        }
      }else if(init?.body instanceof Blob){
        const {rev}=await response.clone().json()
        const bytes=init.body.slice(Number(new Headers(init.headers).get('X-Text-Bytes')))
        await cache.put(key,new Response(bytes,{headers:{'X-Revision':String(rev)}}))
      }
    }
  }).catch(error=>{
    // The server has already accepted the upload or returned the bytes. A full disk must not invite a duplicate upload.
    if(!files||!response.ok||!(error instanceof DOMException)||error.name!=='QuotaExceededError')throw error
  })
  if(files&&response.ok){
    const allowed=localStorage.getItem(membershipKey(profile))
    if(localStorage.getItem(activeKey)!==profile||(allowed&&!JSON.parse(allowed).includes(Number(url.searchParams.get('workspace')))))
      throw Error('Workspace access changed.')
    if(files[1]){
      const headers=new Headers(response.headers);headers.set('X-Chulane-File-Cached',cachedFile?'1':'0')
      return new Response(response.body,{headers})
    }
  }
  if(fileList&&method==='GET'&&response.ok)return attachmentAvailability(response,await caches.open(cachePrefix+profile),url)
  return response
}
