/** Shadcn scroll area for vertical lists and two-dimensional property tables. The viewport owns scroll events and the accessible region. */
import {ScrollArea as Scroll} from 'radix-ui'
import type {ComponentProps} from 'react'

type ScrollAreaProps=ComponentProps<typeof Scroll.Viewport>&{horizontal?:boolean}

/** Keep the thumb outside list layout so showing it never shifts text. */
export function ScrollArea({children,className,horizontal=false,...props}:ScrollAreaProps){
  return <Scroll.Root className={className} data-part="scroll-area" type="hover">
    <Scroll.Viewport {...props}>{children}</Scroll.Viewport>
    {horizontal&&<Scroll.Scrollbar orientation="horizontal"><Scroll.Thumb/></Scroll.Scrollbar>}
    <Scroll.Scrollbar orientation="vertical"><Scroll.Thumb/></Scroll.Scrollbar>
  </Scroll.Root>
}
