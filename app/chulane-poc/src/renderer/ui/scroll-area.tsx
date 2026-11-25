/** Shadcn scroll area for vertical lists and two-dimensional property tables. The viewport owns scroll events and the accessible region. */
import {ScrollArea as Scroll} from 'radix-ui'
import {LiquiGlass} from '@liqui-design/glass'
import {useContext,type ComponentProps} from 'react'
import {GlassEnabled} from './glass-surface'
import './liqui-controls.css'

type ScrollAreaProps=ComponentProps<typeof Scroll.Viewport>&{horizontal?:boolean}

/** Keep the thumb outside list layout so showing it never shifts text. */
export function ScrollArea({children,className,horizontal=false,...props}:ScrollAreaProps){
  const glass=useContext(GlassEnabled)
  // Radix measures and drags the outer thumb. Clear glass keeps its moving surface free of filters.
  const thumb=glass?<Scroll.Thumb asChild><LiquiGlass data-part="scroll-thumb" material="clear" radius={5} corner="round"/></Scroll.Thumb>:<Scroll.Thumb/>
  return <Scroll.Root className={className} data-part="scroll-area" type="hover">
    <Scroll.Viewport {...props}>{children}</Scroll.Viewport>
    {horizontal&&<Scroll.Scrollbar orientation="horizontal">{thumb}</Scroll.Scrollbar>}
    <Scroll.Scrollbar orientation="vertical">{thumb}</Scroll.Scrollbar>
  </Scroll.Root>
}
