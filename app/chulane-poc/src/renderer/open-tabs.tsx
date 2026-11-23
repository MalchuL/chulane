/** Choose or close an open document in an overflowing Dockview group, using the same checkpoint as its tab. */
import {useRef,useState} from 'react'
import {Check,ChevronDown,X} from 'lucide-react'
import type {IDockviewHeaderActionsProps,IDockviewPanel} from 'dockview-react'
import {Button,Input,Popover,PopoverContent,PopoverTrigger} from './ui'
import {ScrollArea} from './ui/scroll-area'

type OpenTabsProps=Pick<IDockviewHeaderActionsProps,'group'|'activePanel'> & {closeTab:(id:string)=>void}

/** Resolve choices against the live group so moving or closing a tab also updates an open chooser. */
export function OpenTabs({group,activePanel,closeTab}:OpenTabsProps){
  const [open,setOpen]=useState(false),[query,setQuery]=useState('')
  const search=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null)
  const activated=useRef(false)
  const filter=query.trim().toLocaleLowerCase()
  const choices=open?group.panels.filter(panel=>panel.title?.toLocaleLowerCase().includes(filter)):[]
  /** Retain the exact pane and surface when the same page also has a tab in a different split. */
  function choose(panel:IDockviewPanel){
    activated.current=true
    panel.api.setActive()
    setOpen(false)
  }
  return <Popover open={open} onOpenChange={value=>{if(value){activated.current=false;setQuery('')}setOpen(value)}}>
    <PopoverTrigger asChild><Button ref={trigger} data-part="open-tabs-trigger" variant="ghost" size="icon-sm" title="Find open tab" aria-label="Find open tab"><ChevronDown/></Button></PopoverTrigger>
    <PopoverContent align="end" aria-label="Open tabs" data-part="open-tabs" onCloseAutoFocus={event=>{
      if(!group.element.isConnected)return
      const focus=document.activeElement
      // A click outside may have already placed the caret in a different document.
      if(!activated.current&&focus&&focus!==document.body&&event.currentTarget instanceof HTMLElement&&!event.currentTarget.contains(focus)){
        event.preventDefault();return
      }
      if(activated.current||!trigger.current?.getClientRects().length){event.preventDefault();group.model.focusActiveTab()}
    }}>
      <Input ref={search} type="search" aria-label="Find tab" placeholder="Find tab…" value={query} onChange={event=>setQuery(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing&&choices[0]){event.preventDefault();choose(choices[0])}}}/>
      <ScrollArea data-part="open-tab-choices" tabIndex={-1}>
        {choices.map(panel=><div key={panel.id} data-part="open-tab-row">
          <Button variant="ghost" size="sm" title={panel.title} aria-current={activePanel===panel||undefined} onClick={()=>choose(panel)}>
            <span>{panel.title}</span>{activePanel===panel&&<Check/>}
          </Button>
          <Button size="icon-sm" variant="ghost" title={'Close '+panel.title} aria-label={'Close '+panel.title} onClick={()=>{search.current?.focus();closeTab(panel.id)}}><X/></Button>
        </div>)}
        {!choices.length&&<p role="status">No matching tabs</p>}
      </ScrollArea>
    </PopoverContent>
  </Popover>
}
