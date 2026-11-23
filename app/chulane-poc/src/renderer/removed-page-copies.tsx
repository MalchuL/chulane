/** Offer export or explicit device-only removal when a server tombstone matches a retained page copy. */
import {useEffect,useState} from 'react'
import {Download,FileDown,Trash2} from 'lucide-react'
import {labeledReferences,type Library,type RemovedPage} from '../shared/library'
import {discardRemovedDrafts,exportPendingDocument,pendingSourceContents,recoveryBase64,recoveryIds,recoveryMarkdown} from './document-outbox'
import {withWorkspaceCache} from './offline-server'
import {attachmentFilename} from '../shared/attachment-filename'
import {downloadBlob} from './download'
import {Alert,Button,Dialog,DialogClose,DialogContent,DialogFooter,DialogTitle,DialogTrigger} from './ui'

/** Match a page segment exactly, including its state, attachment list and individually cached files. */
function pageKeys(keys:Request[],id:number){return keys.filter(key=>new URL(key.url).pathname.startsWith('/api/pages/'+id+'/'))}

type CopyProps={workspace:number;profile:string;replica:string;removed:NonNullable<Library['removedPages']>;notify:(message:string)=>void}

/** Recheck the account, workspace generation and permanent deletion at the time of each user action. */
export function RemovedPageCopies({workspace,profile,replica,removed,notify}:CopyProps){
  const [copies,setCopies]=useState<(RemovedPage & {hasWriting:boolean})[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [revision,setRevision]=useState(0)
  useEffect(()=>{
    let current=true
    void withWorkspaceCache(profile,workspace,replica,async(_cache,library,keys)=>{
      const pending=await pendingSourceContents(replica)
      return (library.removedPages??[]).flatMap(page=>{
        const entries=pageKeys(keys,page.id)
        const queued=recoveryIds(page.id,page.day).map(id=>pending.get(replica+'/'+id))
        if(!entries.length&&queued.every(value=>value===undefined))return []
        return [{...page,hasWriting:queued.includes(true)||entries.some(key=>new URL(key.url).pathname.endsWith('/state'))}]
      })
    }).then(items=>{if(current){setCopies(items);setError('')}}).catch(err=>{if(current){setCopies([]);setError(err.message)}})
    return ()=>{current=false}
  },[workspace,profile,replica,removed,revision])
  async function recover(id:number,action:'json'|'markdown'|'discard'){
    setBusy(true);setError('')
    try{
      const result=await withWorkspaceCache(profile,workspace,replica,async(cache,library,keys)=>{
        const page=library.removedPages?.find(item=>item.id===id)
        if(!page)throw Error('Refresh this workspace before recovering a page.')
        const entries=pageKeys(keys,id)
        if(action==='discard'){
          for(const key of entries)await cache.delete(key)
          const catalog=new URL('/api/library?workspace='+workspace,location.origin)
          const stored=await cache.match(catalog)
          delete page.title
          await cache.put(catalog,Response.json(library,{headers:stored?.headers}))
          await discardRemovedDrafts(replica,id,page.day)
          return
        }
        const snapshot=await cache.match(new URL('/api/pages/'+id+'/state?workspace='+workspace,location.origin))
        const state=snapshot?new Uint8Array(await snapshot.arrayBuffer()):undefined
        if(action==='markdown'){
          const {markdown,omitted}=await recoveryMarkdown(replica,id,{state,day:page.day})
          const notice='Markdown exported. Choose JSON to recover downloaded attachments and queued metadata changes.'+(omitted.length?' Omitted '+omitted.join(', ')+'.':'')
          return {blob:new Blob([markdown],{type:'text/markdown'}),filename:(page.title??page.day??'Page '+id)+'.md',notice}
        }
        const url=new URL('/api/pages/'+id+'/files',location.origin)
        url.searchParams.set('workspace',String(workspace))
        const list=await cache.match(url)
        const files:{id:number;name:string}[]=list?await list.json():[]
        const attachments:{id:number;name:string;base64:string}[]=[]
        for(const key of entries){
          const part=new URL(key.url).pathname.split('/').at(-1)
          if(!part||!/^\d+$/.test(part))continue
          const response=await cache.match(key)
          if(!response)continue
          const file=Number(part)
          const name=files.find(item=>item.id===file)?.name??attachmentFilename(response)
          attachments.push({id:file,name:name??'Attachment '+file,base64:await recoveryBase64(await response.blob())})
        }
        const blob=await exportPendingDocument(profile,workspace,id,replica,{...page,state,attachments})
        return {blob,filename:'chulane-workspace-'+workspace+'-page-'+id+'.json'}
      })
      if(result){
        downloadBlob(result.blob,result.filename)
        if(result.notice)notify(result.notice)
      }
      setRevision(value=>value+1)
    }catch(err){setError((err as Error).message)}finally{setBusy(false)}
  }
  if(!copies.length&&!error)return null
  return <section aria-label="Deleted page copies"><Alert><strong>Deleted page copies on this device</strong>
    {labeledReferences(copies,page=>({id:page.id,name:page.title??page.day??'Page '+page.id})).map(({item:page,label})=><div key={page.id}>{label}
      <Button size="icon-sm" variant="ghost" disabled={busy} title="Export local copy (JSON)" aria-label={'Export local copy of '+label} onClick={()=>void recover(page.id,'json')}><Download/></Button>
      {page.hasWriting&&<Button size="icon-sm" variant="ghost" disabled={busy} title="Export as Markdown" aria-label={'Export '+label+' as Markdown'} onClick={()=>void recover(page.id,'markdown')}><FileDown/></Button>}
      <Dialog><DialogTrigger asChild><Button size="icon-sm" variant="ghost" disabled={busy} title="Discard local copy" aria-label={'Discard local copy of '+label}><Trash2/></Button></DialogTrigger>
        <DialogContent aria-describedby={undefined}><DialogTitle>Discard the local copy of {label}?</DialogTitle>
          <p>This removes its downloaded files and unsynced edits from this device.</p><DialogFooter>
          <DialogClose asChild><Button variant="outline" autoFocus>Cancel</Button></DialogClose>
          <DialogClose asChild><Button variant="destructive" onClick={()=>void recover(page.id,'discard')}>Discard local copy</Button></DialogClose>
        </DialogFooter></DialogContent></Dialog></div>)}
    {error&&<p role="alert">{error}</p>}
  </Alert></section>
}
