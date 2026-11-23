/** Show named participants in the selected document and remember a member's visibility choice on this device. */
import {useEffect,useState} from 'react'
import {Users} from 'lucide-react'
import {watchDocumentPresence} from './document-events'
import {Button,Checkbox,Label} from './ui'
import {SettingsPanel} from './ui/settings-panel'
import {ScrollArea} from './ui/scroll-area'

type ParticipantsProps={workspace:number;page:number;profile:string;replica?:string}

/** Closing the popover keeps presence active. Hiding presence or backgrounding the browser tab leaves the list. */
export function DocumentParticipants({workspace,page,profile,replica}:ParticipantsProps){
  const key='chulane.hide-presence.'+profile
  const [visible,setVisible]=useState(()=>localStorage.getItem(key)!=='1')
  const [names,setNames]=useState<string[]>()
  useEffect(()=>{
    function sync(event:StorageEvent){if(event.key===key||event.key===null)setVisible(localStorage.getItem(key)!=='1')}
    window.addEventListener('storage',sync);return ()=>window.removeEventListener('storage',sync)
  },[key])
  useEffect(()=>{
    let leave:(()=>void)|undefined
    function share(){
      leave?.();leave=undefined;setNames(undefined)
      if(visible&&!document.hidden)leave=watchDocumentPresence(workspace,replica,{page,update:setNames})
    }
    share();document.addEventListener('visibilitychange',share)
    return ()=>{document.removeEventListener('visibilitychange',share);leave?.()}
  },[workspace,page,replica,visible])
  return <SettingsPanel title="Document participants" trigger={<Button size="icon-sm" variant="ghost" aria-label="Document participants"
    data-part="document-participants" title={visible&&names?.length?`${names.length} viewing this document`:'Document participants'}><Users/>{visible&&names&&names.length>1&&<span>{names.length}</span>}</Button>}>
    <Label><Checkbox checked={visible} onCheckedChange={checked=>{
      const next=checked===true
      if(next)localStorage.removeItem(key);else localStorage.setItem(key,'1')
      setVisible(next)
    }}/>Show and share presence</Label>
    {visible&&(names?.length?<ScrollArea data-part="participant-list" role="region" aria-label="People viewing this document"><ul>{names.map(name=><li key={name}>{name}</li>)}</ul></ScrollArea>
      :<small role="status">Waiting for live presence</small>)}
  </SettingsPanel>
}
