/** Mark portaled application overlays so shell styling stays scoped across the editor boundary. */
import type {ComponentProps} from 'react'
import {ScrollArea} from './scroll-area'
import {GlassSurface} from './glass-surface'
import {PopoverContent as Content} from '../../../vendor/rivto/packages/react-rivto-editor/src/components/ui/popover'
import {DialogContent as DialogBody} from '../../../vendor/rivto/packages/react-rivto-editor/src/components/ui/dialog'
import {DropdownMenuContent as Menu} from '../../../vendor/rivto/packages/react-rivto-editor/src/components/ui/dropdown-menu'

/** Render an anchored application panel using the shared shadcn primitive. */
export function PopoverContent({children,...props}:ComponentProps<typeof Content>){
  return <Content onCloseAutoFocus={event=>{
    // Radix restores focus after the exit animation. Respect a control already focused outside the panel.
    const panel=event.currentTarget
    if(!(panel instanceof HTMLElement))return
    const {activeElement,body}=panel.ownerDocument
    if(activeElement&&activeElement!==body&&!panel.contains(activeElement))event.preventDefault()
  }} {...props} data-app-overlay="popover">
    {props.asChild?children:<>{children}<GlassSurface kind="overlay"/></>}
  </Content>
}
/** Render a modal with the same application selection rules as the shell. */
export function DialogContent({children,...props}:ComponentProps<typeof DialogBody>){
  return <DialogBody {...props} data-app-overlay="dialog">
    {props.asChild?children:<>{children}<GlassSurface kind="overlay"/></>}
  </DialogBody>
}
/** Render an application command menu in its portal. */
export function DropdownMenuContent({children,...props}:ComponentProps<typeof Menu>){
  const list=<ScrollArea tabIndex={-1}>{children}</ScrollArea>
  return <Menu {...props} data-app-overlay="menu">
    {props.asChild?list:<>{list}<GlassSurface kind="overlay"/></>}
  </Menu>
}
