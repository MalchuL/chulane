/** Anchor shell settings to their opener while keeping the document available behind them. */
import {useId,type ComponentProps,type ReactElement,type ReactNode} from 'react'
import {Popover as Primitive} from 'radix-ui'
import {X} from 'lucide-react'
import {Button,Popover,PopoverContent,PopoverTrigger} from './index'

type SettingsPanelProps=Pick<ComponentProps<typeof Popover>,'open'|'onOpenChange'>&{
  title:string;trigger:ReactElement;children:ReactNode;className?:string
}

/** Use the same focus return, dismissal and viewport bounds for each settings entry point. */
export function SettingsPanel({title,trigger,children,className,...props}:SettingsPanelProps){
  const heading=useId()
  return <Popover {...props}><PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent align="start" collisionPadding={8} aria-labelledby={heading} className={className} data-part="settings-panel">
      <header><h2 id={heading}>{title}</h2><Primitive.Close asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Close" title="Close"><X/></Button>
      </Primitive.Close></header>
      {children}
    </PopoverContent>
  </Popover>
}
