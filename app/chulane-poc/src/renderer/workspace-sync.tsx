/** Coordinate automatic and user-requested document replay and expose its state in the workspace toolbar. */
import {useEffect,useRef,useState} from 'react'
import {RefreshCw} from 'lucide-react'
import {WorkspaceToast} from './ui/workspace-toast'
import type {Library} from '../shared/library'
import {json} from './api'
import {localJournalDay,projectRenameKey,pendingSources,replayClosedDocuments,replayMetadata} from './document-outbox'
import {Button} from './ui'

type SyncProps={closedViews:number;lib:Library;workspace:number;page?:number;mounted:(id:number)=>boolean;checkpoint:()=>Promise<void>}

/** Share one cancellable run and backoff timer between manual retry, reconnection and ordinary navigation. */
export function WorkspaceSync(props:SyncProps){
  const {lib,workspace,page}=props,replica=lib.replica!
  const latest=useRef(props);latest.current=props
  const start=useRef<(manual:boolean)=>void>(()=>{})
  const inspected=useRef<Library|null>(null)
  const incident=useRef('')
  const [pending,setPending]=useState<number>(),[busy,setBusy]=useState(false),[fault,setFault]=useState(''),[toast,setToast]=useState(false)
  const [revision,setRevision]=useState(0)
  function report(message:string){
    setFault(message)
    if(incident.current!==message){incident.current=message;setToast(true)}
  }
  useEffect(()=>{
    let current=true
    void pendingSources(replica).then(rows=>{
      if(!current)return
      const targets=rows.map(source=>source.slice(replica.length+1)).filter(target=>{
        if(target.startsWith('project:'))return true
        const id=Number(target)
        return !lib.removedPages?.some(page=>page.id===id||(id<0&&page.day===localJournalDay(id)))
      })
      setPending(targets.length)
      // A closing day editor may commit a final snapshot just after reconnect replay took its receipts.
      if(inspected.current!==lib&&!lib.offline&&targets.some(target=>target.startsWith('-')))start.current(false)
      inspected.current=lib
    }).catch(()=>{if(current)report('Could not read edits saved on this device.')})
    return ()=>{current=false}
  },[lib,replica,revision])
  useEffect(()=>{
    const controller=new AbortController(),signal=controller.signal
    let timer:ReturnType<typeof setTimeout>|undefined,running=false
    async function run(manual:boolean){
      if(running||signal.aborted)return
      running=true;clearTimeout(timer);setBusy(true)
      try{
        // The catalog may still say offline when the user retries just after reconnecting.
        const current:Library=manual?await json('library?workspace='+workspace):latest.current.lib
        signal.throwIfAborted()
        if(current.offline)throw Error('Server unavailable. Edits remain on this device.')
        if(current.replica!==replica||current.role!=='editor')throw Object.assign(Error('Workspace editing access changed.'),{status:403})
        const allowed=new Set(current.pages.map(item=>item.id))
        // A failing mounted document must not prevent other pages from reaching the server.
        const outcomes=await Promise.allSettled([
          replayMetadata(replica,workspace,signal,replica,undefined,new Set([...current.pages.map(p=>String(p.id)),...current.projects.map(p=>projectRenameKey(p.id))])),
          manual?latest.current.checkpoint():Promise.resolve(),
          replayClosedDocuments(replica,workspace,id=>id<0?!current.removedPages?.some(page=>page.day===localJournalDay(id)):(allowed.has(id)&&!latest.current.mounted(id)),signal)
        ])
        signal.throwIfAborted()
        for(const outcome of outcomes)if(outcome.status==='rejected')throw outcome.reason
        incident.current='';setFault('');setToast(false)
      }catch(error){
        if(!signal.aborted){
          report(error instanceof Error?error.message:'Document sync failed.')
          const status=(error as {status?:number})?.status
          if(!status||status===409||status>=500)timer=setTimeout(()=>void run(manual),3500)
        }
      }finally{
        running=false
        if(!signal.aborted){setBusy(false);setRevision(value=>value+1)}
      }
    }
    start.current=manual=>void run(manual)
    setBusy(false)
    if(!lib.offline)void run(false)
    return ()=>{controller.abort();clearTimeout(timer)}
  },[workspace,page,props.closedViews,replica,lib.offline,lib.pendingMetadataRevision])
  const status=busy?'Syncing…':fault?'Sync error':pending===undefined?'Checking edits…':pending?pending+' '+(pending===1?'item':'items')+' pending':lib.offline?'Offline':'No queued edits'
  return <div data-part="workspace-sync">
    <span role="status" aria-label="Workspace sync status" title={fault||status}>{status}</span>
    <Button size="icon-sm" variant="ghost" disabled={busy} title="Retry workspace sync" aria-label="Retry workspace sync" onClick={()=>start.current(true)}><RefreshCw/></Button>
    {toast&&<WorkspaceToast key={fault} title="Document sync failed" message={fault} background dismiss={()=>setToast(false)}/>}
  </div>
}
