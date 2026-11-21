/** Separate page drag handles let chat reuse workspace pages without taking over editor gestures. */
import {useDraggable} from '@dnd-kit/react'
import {GripVertical} from 'lucide-react'
import {Button} from './ui'
import type {Source} from '../shared/agent'

export const PAGE_REFERENCE='chulane-page-reference'
export const CHAT_COMPOSER='chulane-chat-composer'
const HANDLE='page-reference-handle'
/** Register the handle only while chat is open. Both the sidebar index and library use stable page IDs. */
export function PageDragHandle({page}:{page:Source}){
  const title='Drag '+page.title+' to chat'
  const {ref}=useDraggable({id:PAGE_REFERENCE+page.id,type:PAGE_REFERENCE,data:{pageId:page.id}})
  return <Button ref={ref} type="button" variant="ghost" size="icon-sm" className={HANDLE} aria-label={title} title={title}><GripVertical/></Button>
}
