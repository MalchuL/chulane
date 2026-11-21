/** Chulane contributes a reference grip to Rivto rows. The editor's structural move grip stays independent. */
import {createContext,useContext,useRef} from 'react'
import {useDraggable} from '@dnd-kit/react'
import {Link2} from 'lucide-react'
import {editorControlProps,useReactPanel,type BlockSlotProps,type ReactEditorExtension} from '@chulane/rivto-react'
import type {BlockSource,Source} from '../shared/agent'
import {Button} from './ui'

export const BLOCK_REFERENCE='chulane-block-reference'
export const BlockLinkPage=createContext<Source|undefined>(undefined)
const HANDLE='block-link-handle'

/** Snapshot selection before the grip takes focus so a multi-block gesture retains its membership. */
function BlockLinkHandle({block,page}:{block:BlockSlotProps['block'];page:Source}){
  const panel=useReactPanel()
  const links=useRef<BlockSource[]>([])
  function capture(){
    const selection=panel.selection.snapshot()?.blocks??[]
    const ids=selection.some(item=>item.id===block.id)?selection.map(item=>item.id):[block.id]
    links.current=ids.map(id=>({id:page.id,block:id,title:page.title,excerpt:panel.blocks.getBlockNode(id)?.content.slice(0,60)||'Empty block'}))
  }
  const {ref}=useDraggable({id:BLOCK_REFERENCE+page.id+'/'+block.id,type:BLOCK_REFERENCE,data:{links}})
  return <Button {...editorControlProps} ref={ref} className={HANDLE} type="button" size="icon-sm" variant="ghost" contentEditable={false}
    onPointerDownCapture={capture} onKeyDownCapture={event=>{if(event.key===' '||event.key==='Enter')capture()}}
    title="Drag this block or the selected blocks into chat" aria-label="Drag block links to chat"><Link2 size={14}/></Button>
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
