/** Let a signed-in account recover its queued documents even after their workspace disappears from its catalog. */
import {useEffect,useState} from 'react'
import {Download,FileDown,RefreshCw} from 'lucide-react'
import {workspaceReplica,type Library,type WorkspaceCatalog} from '../shared/library'
import {exportPendingDocument,exportProjectRenames,localJournalDay,pendingSources,pendingRecoveryInfo,pendingMarkdown,replayMetadata,replayClosedDocuments} from './document-outbox'
import {isCurrentServerProfile} from './offline-server'
import {downloadBlob} from './download'
import {json} from './api'
import {Button,Dialog,DialogContent,DialogTitle,DialogTrigger} from './ui'

/** Recheck pending IDs with each catalog refresh. Merge document snapshots only for the selected download. */
export function PendingRecovery({catalog}:{catalog:WorkspaceCatalog}){
  const [sources,setSources]=useState<string[]>([]),[error,setError]=useState(''),[open,setOpen]=useState(false)
  const [details,setDetails]=useState<Record<string,Awaited<ReturnType<typeof pendingRecoveryInfo>>>>({})
  const [notice,setNotice]=useState('')
  const [syncing,setSyncing]=useState(false)
  const profile=catalog.profile
  useEffect(()=>{
    let current=true
    if(profile)void pendingSources(profile).then(items=>{if(current)setSources(items)}).catch(err=>{if(current)setError(err.message)})
    return ()=>{current=false}
  },[catalog,profile])
  const documents=profile?sources.filter(source=>source.startsWith(profile+'/')).map(source=>{
    const [scope,target]=source.slice(profile.length+1).split('/')
    const kind=target.startsWith('project:')?'project':'page'
    const workspace=Number(scope.split('~')[0]),id=Number(kind==='project'?target.slice('project:'.length):target),replica=profile+'/'+scope
    const entry=catalog.workspaces.find(item=>item.id===workspace)
    const delivery=entry&&workspaceReplica(profile,workspace,entry.restoration)
    return {source,workspace,id,kind,target,replica,delivery,name:entry?.name,blocked:!entry||entry.role==='viewer'}

  }):[]
  const visible=documents.map(doc=>doc.source).join('\n')
  useEffect(()=>{
    let current=true
    if(open&&!visible)setOpen(false)
    if(open&&visible)void (async()=>{
      const items:typeof details={}
      for(const source of visible.split('\n')){
        if(!current)return
        items[source]=await pendingRecoveryInfo(source)
      }
      if(current)setDetails(items)
    })().catch(err=>{if(current)setError(err.message)})
    return ()=>{current=false}
  },[open,visible])
  if(!profile||!documents.length)return null
  async function sync(doc:typeof documents[number]){
    setError('');setSyncing(true)
    try{
      const live:Library=await json('library?workspace='+doc.workspace)
      const available=doc.kind==='project'?live.projects.some(p=>p.id===doc.id):localJournalDay(doc.id)||live.pages.some(p=>p.id===doc.id)
      if(live.offline||live.role!=='editor'||live.profile!==profile||live.replica!==doc.delivery||!available)
        throw Error('Connect with editing access to this restored '+doc.kind+' to sync.')
      const signal=AbortSignal.timeout(30000)
      await replayMetadata(doc.replica,doc.workspace,signal,live.replica,doc.target)
      if(doc.kind==='page')await replayClosedDocuments(doc.replica,doc.workspace,id=>id===doc.id,signal,live.replica)
      const remaining=await pendingSources(profile!)
      if(!remaining.length)setOpen(false)
      setSources(remaining)
    }catch(err){setError((err as Error).message)}finally{setSyncing(false)}
  }
  async function download(doc:typeof documents[number],markdown=false){
    const {workspace,id,replica}=doc
    setError('');setNotice('')
    try{
      // Another tab may have switched the session since this dialog was opened.
      const current:WorkspaceCatalog=await json('workspaces')
      if(current.profile!==profile)throw Error('Sign in as the original account to export these edits.')
      const label=details[doc.source]?.title??'Page '+id
      let blob:Blob,filename:string
      if(markdown){
        const result=await pendingMarkdown(replica,id)
        blob=new Blob([result.markdown],{type:'text/markdown'})
        filename=label+'.md'
        setNotice('Markdown exported. Workspace metadata and attached files are excluded.'+(result.omitted.length?' Omitted '+result.omitted.join(', ')+'.':''))
      }else{
        blob=doc.kind==='project'?await exportProjectRenames(profile!,workspace,id,replica):await exportPendingDocument(profile!,workspace,id,replica)
        filename='chulane-workspace-'+workspace+'-'+doc.kind+'-'+id+'.json'
      }
      if(!isCurrentServerProfile(profile!))throw Error('Sign in as the original account to export these edits.')
      downloadBlob(blob,filename)
    }catch(err){setNotice('');setError((err as Error).message)}
  }
  const needsConsent=documents.some(doc=>!doc.blocked&&doc.delivery!==doc.replica)
  const action=needsConsent?'Review restored workspace edits':'Export unsynced edits'
  return <Dialog open={open} onOpenChange={next=>{setOpen(next);setNotice('');setError('')}}><DialogTrigger asChild>
    <Button size="sm" variant="ghost" title={action} aria-label={action}><Download/>{needsConsent?'Review restored edits':documents.some(doc=>doc.blocked)&&'Unsynced edits'}</Button>
  </DialogTrigger><DialogContent aria-describedby={undefined}><DialogTitle>Unsynced edits on this device</DialogTitle>
    {documents.some(doc=>doc.blocked)&&<p>Editing access is unavailable for one or more workspaces. Your edits are saved here for export.</p>}
    {needsConsent&&<p>This workspace was restored after deletion. Choose which saved edits to sync.</p>}
    {documents.map(doc=><div key={doc.source}><Button variant="outline" onClick={()=>void download(doc)}>
      <Download/>{doc.name??'Workspace '+doc.workspace} · {doc.kind==='project'?'Project · ':''}{details[doc.source]?.title??doc.kind+' '+doc.id}</Button>
      {details[doc.source]?.hasDocument&&<Button variant="ghost" size="icon-sm" title="Export as Markdown" aria-label={'Export '+(details[doc.source]?.title??'Page '+doc.id)+' as Markdown'} onClick={()=>void download(doc,true)}><FileDown/></Button>}
      {!doc.blocked&&doc.delivery!==doc.replica&&<Button variant="ghost" size="icon-sm" disabled={syncing} aria-label={'Sync restored '+doc.kind+' '+doc.id} title={'Sync edits to restored '+doc.kind} onClick={()=>void sync(doc)}><RefreshCw/></Button>}</div>)}
    {notice&&<p role="status">{notice}</p>}
    {error&&<p role="alert">{error}</p>}
  </DialogContent></Dialog>
}
