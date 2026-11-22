/** Chulane contributes a reference grip to Rivto rows. The editor's structural move grip stays independent. */
import {createContext,useContext,useRef,type RefObject} from 'react'
import {PointerSensor,useDraggable} from '@dnd-kit/react'
import {Link2} from 'lucide-react'
import {editorControlProps,useReactPanel,type BlockSlotProps,type ReactEditorExtension} from '@chulane/rivto-react'
import type {BlockSource,Source} from '../shared/agent'
import {textPrefix} from '../shared/document-text'
import {Button} from './ui'

export const BLOCK_REFERENCE='chulane-block-reference'
export const BlockLinkPage=createContext<Source|undefined>(undefined)
export type AttachBlockLinks=(links:BlockSource[])=>void
export const BlockLinkComposer=createContext<RefObject<AttachBlockLinks|null>|null>(null)
const HANDLE='block-link-handle'

/** Snapshot selection before the grip takes focus so a multi-block gesture retains its membership. */
function BlockLinkHandle({block,page}:{block:BlockSlotProps['block'];page:Source}){
  const panel=useReactPanel()
  const composer=useContext(BlockLinkComposer)
  const links=useRef<BlockSource[]>([])
  function capture(){
    const selection=panel.selection.snapshot()?.blocks??[]
    const ids=selection.some(item=>item.id===block.id)?selection.map(item=>item.id):[block.id]
    links.current=ids.map(id=>({id:page.id,block:id,title:page.title,excerpt:textPrefix(panel.blocks.getBlockNode(id)?.content??'',60)||'Empty block'}))
  }
  const {ref}=useDraggable({id:BLOCK_REFERENCE+page.id+'/'+block.id,type:BLOCK_REFERENCE,sensors:[PointerSensor],data:{links}})
  return <Button {...editorControlProps} ref={ref} className={HANDLE} type="button" size="icon-sm" variant="ghost" contentEditable={false}
    onPointerDownCapture={capture} onClick={event=>{
      // Native keyboard and assistive activation produce a click with zero detail.
      if(event.detail===0){capture();composer?.current?.(links.current)}
    }}
    title="Drag into chat, or press Enter to attach the selected blocks" aria-label="Attach block links to chat"><Link2 size={14}/></Button>
}

/** Mount a drag source only while the editable workspace chat is visible. */
function BlockLinkSlot({block}:BlockSlotProps){
  const page=useContext(BlockLinkPage)
  return page?<BlockLinkHandle block={block} page={page}/>:null
}

/** The surface registry owns the grip across page switches and editor teardown. */
export const blockLinkExtension:ReactEditorExtension={
  id:'chulane.chat-block-links',
  setup(editor){editor.surfaces.registerBlockSlot({position:'end',component:BlockLinkSlot})},
}
