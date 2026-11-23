/** Search page and project destinations inside the page actions popover. */
import {useState,type ReactElement} from 'react'
import {Check} from 'lucide-react'
import {Command,CommandEmpty,CommandInput,CommandItem,CommandList,Popover,PopoverContent,PopoverTrigger} from './ui'
import {ScrollArea} from './ui/scroll-area'

type DestinationPickerProps<Id extends number|null>={
  trigger:ReactElement;title:string;search:string;placeholder:string;empty:string
  choices:{id:Id;name:string}[];current?:Id;choose:(id:Id)=>void
}

/** Freeze the originating action while browsing. A concurrent move must retain the originally observed base project. */
export function DestinationPicker<Id extends number|null>({trigger,title,search,placeholder,empty,choices,current,choose}:DestinationPickerProps<Id>){
  const [selection,setSelection]=useState<((id:Id)=>void)|null>(null)
  return <Popover open={selection!==null} onOpenChange={open=>setSelection(()=>open?choose:null)}>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent side="right" align="start" collisionPadding={8} aria-label={title} data-part="destination-picker">
      <Command label={search}><CommandInput placeholder={placeholder}/>
        <ScrollArea data-part="destination-choices"><CommandList><CommandEmpty>{empty}</CommandEmpty>
          {choices.map(({id,name})=><CommandItem key={id??'root'} value={String(id??'root')} keywords={id===null?[name]:[name,'#'+id]}
            aria-label={id===null?name:name+' #'+id} aria-current={id===current||undefined}
            onSelect={()=>{setSelection(null);selection?.(id)}}>
            {id===current&&<Check aria-hidden="true"/>}<span>{name}</span>{id!==null&&<small>#{id}</small>}
          </CommandItem>)}
        </CommandList></ScrollArea>
      </Command>
    </PopoverContent>
  </Popover>
}
