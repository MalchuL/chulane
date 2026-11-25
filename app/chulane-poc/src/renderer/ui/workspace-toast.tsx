/** Display workspace feedback outside the document layout using the shared Radix announcement region. */
import {X} from 'lucide-react'
import {Toast} from 'radix-ui'
import {Button} from './index'
import {GlassSurface} from './glass-surface'

type WorkspaceToastProps={
  message:string;title?:string;error?:boolean;background?:boolean;temporary?:boolean;dismiss:()=>void
}

/** Keep user-requested results readable until dismissed. Background sync also retains its toolbar status. */
export function WorkspaceToast({message,title,error,background,temporary,dismiss}:WorkspaceToastProps){
  return <Toast.Root data-part="workspace-toast" data-error={error||undefined} open
    type={background?'background':'foreground'} duration={background||temporary?undefined:Infinity}
    role={error?'alert':undefined} aria-live={error?'off':undefined}
    onOpenChange={open=>{if(!open)dismiss()}}>
    <GlassSurface kind="overlay"/>
    {title&&<Toast.Title data-part="toast-title">{title}</Toast.Title>}
    <Toast.Description data-copyable="">{message}</Toast.Description>
    <Toast.Close asChild><Button size="icon-sm" variant="ghost" aria-label="Dismiss" title="Dismiss"><X/></Button></Toast.Close>
  </Toast.Root>
}
