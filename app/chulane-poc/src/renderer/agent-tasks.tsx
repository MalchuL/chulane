/** Workspace task history stays available after the initiating chat or browser window closes. */
import {useEffect,useState} from 'react'
import {ListChecks,Square} from 'lucide-react'
import {Button,Popover,PopoverContent,PopoverTrigger} from './ui'
import {ScrollArea} from './ui/scroll-area'
import {json} from './api'

type Task={id:number;chat:number;title:string;status:string;pending:number}
type TaskProps={ws:number;write:boolean;disabled:boolean;openResult:(task:Task)=>void}

/** Poll while the task list is visible. Cancellation targets the exact turn even if its chat has since continued. */
export function AgentTasks({ws,write,disabled,openResult}:TaskProps){
  const [open,setOpen]=useState(false),[tasks,setTasks]=useState<Task[]>(),[error,setError]=useState('')
  useEffect(()=>{
    if(!open)return
    let current=true
    let timer:ReturnType<typeof setTimeout>
    async function load(){
      try{const rows=await json('agent/tasks?workspace='+ws);if(current){setTasks(rows);setError('')}}
      catch(err){if(current)setError((err as Error).message)}
      finally{if(current)timer=setTimeout(load,1500)}
    }
    void load()
    return ()=>{current=false;clearTimeout(timer)}
  },[ws,open])
  async function cancel(task:Task){
    try{await json('agent/tasks/'+task.id+'/cancel?workspace='+ws,'POST')}
    catch(err){setError((err as Error).message)}
  }
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
    <Button variant="ghost" size="icon-sm" aria-label="Background tasks" title="Background tasks" disabled={disabled}><ListChecks/></Button>
  </PopoverTrigger><PopoverContent data-part="agent-tasks" aria-label="Background tasks">
    <strong>Background tasks</strong>
    {error&&<small role="alert">{error}</small>}
    {!tasks?<small>Loading…</small>:!tasks.length?<small>No background tasks yet.</small>:<ScrollArea role="region" aria-label="Task list"><ul>{tasks.map(task=><li key={task.id}>
      <Button variant="ghost" size="sm" type="button" onClick={()=>{setOpen(false);openResult(task)}}><span data-copyable="">{task.title}</span><small>{task.status==='unknown'?'Outcome unknown':task.status}{task.pending?' · Review requested':''}</small></Button>
      {write&&task.status==='running'&&<Button variant="ghost" size="icon-sm" aria-label={'Cancel '+task.title} title="Cancel task" onClick={()=>void cancel(task)}><Square/></Button>}
    </li>)}</ul></ScrollArea>}
  </PopoverContent></Popover>
}
