/** Offer export or explicit device-only removal when a server tombstone matches a retained page copy. */
import {useEffect,useState} from 'react'
import {Download,Trash2} from 'lucide-react'
import type {Library,RemovedPage} from '../shared/library'
import {discardRemovedDrafts,exportPendingDocument,localJournalDay,pendingSources,recoveryBase64} from './document-outbox'
import {withWorkspaceCache} from './offline-server'
import {attachmentFilename} from '../shared/attachment-filename'
import {downloadBlob} from './download'
import {Alert,Button,Dialog,DialogClose,DialogContent,DialogFooter,DialogTitle,DialogTrigger} from './ui'

/** Match a page segment exactly, including its state, attachment list and individually cached files. */
function pageKeys(keys:Request[],id:number){return keys.filter(key=>new URL(key.url).pathname.startsWith('/api/pages/'+id+'/'))}

type CopyProps={workspace:number;profile:string;replica:string;removed:NonNullable<Library['removedPages']>}

/** Recheck the account, workspace generation and permanent deletion at the time of each user action. */
export function RemovedPageCopies({workspace,profile,replica,removed}:CopyProps){
  const [copies,setCopies]=useState<RemovedPage[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [revision,setRevision]=useState(0)
  useEffect(()=>{
    let current=true
    void withWorkspaceCache(profile,workspace,replica,async(_cache,library,keys)=>{
      const pending=(await pendingSources(replica)).map(source=>Number(source.slice(replica.length+1)))
      return (library.removedPages??[]).filter(page=>pageKeys(keys,page.id).length||
        pending.some(id=>id===page.id||(page.day!==null&&localJournalDay(id)===page.day)))
    }).then(items=>{if(current){setCopies(items);setError('')}}).catch(err=>{if(current){setCopies([]);setError(err.message)}})
    return ()=>{current=false}
  },[workspace,profile,replica,removed,revision])
  async function recover(id:number,discard:boolean){
    setBusy(true);setError('')
    try{
      const blob=await withWorkspaceCache(profile,workspace,replica,async(cache,library,keys)=>{
        const page=library.removedPages?.find(item=>item.id===id)
        if(!page)throw Error('Refresh this workspace before recovering a page.')
        const entries=pageKeys(keys,id)
        if(discard){
          for(const key of entries)await cache.delete(key)
          const catalog=new URL('/api/library?workspace='+workspace,location.origin)
          const stored=await cache.match(catalog)
          delete page.title
          await cache.put(catalog,Response.json(library,{headers:stored?.headers}))
          await discardRemovedDrafts(replica,id,page.day)
          return
        }
        const url=new URL('/api/pages/'+id+'/files',location.origin)
        url.searchParams.set('workspace',String(workspace))
        const list=await cache.match(url)
        const files:{id:number;name:string}[]=list?await list.json():[]
        const attachments:{id:number;name:string;base64:string}[]=[]
        let state:Uint8Array|undefined
        for(const key of entries){
          const part=new URL(key.url).pathname.split('/').at(-1)
          const response=await cache.match(key)
          if(!response)continue
          if(part==='state')state=new Uint8Array(await response.arrayBuffer())
          else if(part&&/^\d+$/.test(part)){
            const file=Number(part)
            const name=files.find(item=>item.id===file)?.name??attachmentFilename(response)
            attachments.push({id:file,name:name??'Attachment '+file,base64:await recoveryBase64(await response.blob())})
          }
        }
        return exportPendingDocument(profile,workspace,id,replica,{...page,state,attachments})
      })
      if(blob)downloadBlob(blob,'chulane-workspace-'+workspace+'-page-'+id+'.json')
      setRevision(value=>value+1)
    }catch(err){setError((err as Error).message)}finally{setBusy(false)}
  }
  if(!copies.length&&!error)return null
  return <section aria-label="Deleted page copies"><Alert><strong>Deleted page copies on this device</strong>
    {copies.map(page=><div key={page.id}>{page.title??page.day??'Page '+page.id}
      <Button size="icon-sm" variant="ghost" disabled={busy} title="Export local copy" aria-label="Export local copy" onClick={()=>void recover(page.id,false)}><Download/></Button>
      <Dialog><DialogTrigger asChild><Button size="icon-sm" variant="ghost" disabled={busy} title="Discard local copy" aria-label="Discard local copy"><Trash2/></Button></DialogTrigger>
        <DialogContent aria-describedby={undefined}><DialogTitle>Discard the local copy of {page.title??page.day??'page '+page.id}?</DialogTitle>
          <p>This removes its downloaded files and unsynced edits from this device.</p><DialogFooter>
          <DialogClose asChild><Button variant="outline" autoFocus>Cancel</Button></DialogClose>
          <DialogClose asChild><Button variant="destructive" onClick={()=>void recover(page.id,true)}>Discard local copy</Button></DialogClose>
        </DialogFooter></DialogContent></Dialog></div>)}
    {error&&<p role="alert">{error}</p>}
  </Alert></section>
}
