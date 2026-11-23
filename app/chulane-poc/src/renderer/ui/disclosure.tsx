/** Shared inline disclosure for reviewing stored code, proposed pages and changes. */
import type {ReactNode} from 'react'
import {ScrollArea} from './scroll-area'
import {ChevronRight} from 'lucide-react'
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from '../../../vendor/rivto/packages/react-rivto-editor/src/components/ui/collapsible'
import {Button} from '../../../vendor/rivto/packages/react-rivto-editor/src/components/ui/button'

/** Keep review details at their source with an accessible toggle and a bounded reading area. */
export function Disclosure({label,children}:{label:string;children:ReactNode}){
  return <Collapsible data-part="review-disclosure">
    <CollapsibleTrigger asChild><Button variant="ghost" size="sm"><ChevronRight/>{label}</Button></CollapsibleTrigger>
    <CollapsibleContent>
      <ScrollArea role="region" aria-label={label} tabIndex={0}>{children}</ScrollArea>
    </CollapsibleContent>
  </Collapsible>
}
