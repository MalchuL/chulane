/** Present the host's permission modes in the chat composer and identify automatic edits in chat history. */
import {useState} from 'react'
import {BookOpen,ChevronDown,ListPlus,Pencil,ShieldCheck} from 'lucide-react'
import {agentModes,modeDescriptions,type AgentMode} from '../shared/agent'
import {Button,DropdownMenu,DropdownMenuContent,DropdownMenuRadioGroup,DropdownMenuRadioItem,DropdownMenuTrigger,Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from './ui'

const modes={
  ask:{label:'Ask',title:'Ask only',icon:BookOpen},
  suggest:{label:'Suggest',title:'Suggest edits',icon:Pencil},
  append:{label:'Append',title:'Append only',icon:ListPlus},
  full:{label:'Full',title:'Full access',icon:ShieldCheck},
} satisfies Record<AgentMode,{label:string;title:string;icon:typeof BookOpen}>

type AgentModePickerProps={mode:AgentMode;disabled:boolean;onChange:(mode:AgentMode)=>void}

/** Show the same identifiable icon and short name wherever a mode appears. */
function ModeLabel({mode}:{mode:AgentMode}){
  const {icon:Icon,label}=modes[mode]
  return <><Icon aria-hidden="true"/>{label}</>
}

/** Identify turns that had permission to make immediate changes. */
export function AgentModeBadge({mode}:{mode:AgentMode}){
  return <span data-agent-mode={mode} data-part="mode-badge" title={modes[mode].title+' · '+modeDescriptions[mode]}><ModeLabel mode={mode}/></span>
}

/** Keep the selected mode compact and make every permission description available before selection. */
export function AgentModePicker({mode,disabled,onChange}:AgentModePickerProps){
  const [menuOpen,setMenuOpen]=useState(false)
  return <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
    <TooltipProvider delayDuration={300}><Tooltip>
      <TooltipTrigger asChild><DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-agent-mode={mode} disabled={disabled}
          aria-label={'Agent permissions: '+modes[mode].label}><ModeLabel mode={mode}/><ChevronDown aria-hidden="true"/></Button>
      </DropdownMenuTrigger></TooltipTrigger>
      {!menuOpen&&<TooltipContent data-part="mode-tooltip" side="top" sideOffset={6}>{modes[mode].title} · {modeDescriptions[mode]}</TooltipContent>}
    </Tooltip></TooltipProvider>
    <DropdownMenuContent align="end" side="top" aria-label="Agent permissions" data-part="mode-menu">
      <DropdownMenuRadioGroup value={mode}>
        {agentModes.map(value=><DropdownMenuRadioItem key={value} value={value} textValue={modes[value].label}
          aria-label={modes[value].label} aria-description={modeDescriptions[value]} onSelect={()=>onChange(value)}>
          <div><span data-agent-mode={value}><ModeLabel mode={value}/></span><small>{modeDescriptions[value]}</small></div>
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
