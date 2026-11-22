/** Vite supplies this build's public assets. Private workspace responses are cached separately by the signed-in renderer. */
const assets=__CHULANE_ASSETS__
const shell='chulane-shell-'+assets.find(path=>path.endsWith('.js'))
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(shell)
  await cache.addAll(['/',...assets])
  await self.skipWaiting()
})()))
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('chulane-shell-')&&name!==shell)await caches.delete(name)
  await self.clients.claim()
})()))
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url)
  if(request.method!=='GET'||url.origin!==self.location.origin)return
  if(request.mode==='navigate'&&url.pathname==='/'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request)
        if(![502,503,504].includes(response.status))return response
      }catch{/* A stopped host and an unreachable network use the same installed shell. */}
      return await (await caches.open(shell)).match('/')||Response.error()
    })())
  }else if(assets.includes(url.pathname)){
    event.respondWith((async()=>await (await caches.open(shell)).match(url.pathname)||fetch(request))())
  }
})
