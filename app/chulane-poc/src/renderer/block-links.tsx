/** Build chat citations from the source document for editor drops and keyboard attachment. */
import {createContext,useContext,useId,useRef,type RefObject} from 'react'
import {PointerSensor,useDraggable} from '@dnd-kit/react'
import {Link2} from 'lucide-react'
import {editorControlProps,useReactPanel,type BlockSlotProps,type ReactEditorExtension} from '@chulane/rivto-react'
import type {BlockSource,Source} from '../shared/agent'
import {textPrefix} from '../shared/document-text'
import {Button} from './ui'

export const BLOCK_REFERENCE='chulane-block-reference'
export const BlockLinkPage=createContext<Source|undefined>(undefined)
export type AttachBlockLinks=(links:BlockSource[],hit?:Element)=>boolean
export const BlockLinkComposer=createContext<RefObject<AttachBlockLinks|null>|null>(null)
const HANDLE='block-link-handle'

/** Read each captured block from its source pane, including blocks outside the viewport. */
export function blockSources(page:Source,ids:readonly string[],blocks:{getBlockNode(id:string):{content:string}|undefined}):BlockSource[]{
  return ids.flatMap(block=>{
    const node=blocks.getBlockNode(block)
    return node?[{id:page.id,title:page.title,block,excerpt:textPrefix(node.content,60)||'Empty block'}]:[]
  })
}

/** Snapshot selection before the grip takes focus so a multi-block gesture retains its membership. */
function BlockLinkHandle({block,page}:{block:BlockSlotProps['block'];page:Source}){
  const panel=useReactPanel()
  const composer=useContext(BlockLinkComposer)
  const links=useRef<BlockSource[]>([]),dragged=useRef(false)
  function capture(){
    const selection=panel.selection.snapshot()?.blocks??[]
    const ids=selection.some(item=>item.id===block.id)?selection.map(item=>item.id):[block.id]
    links.current=blockSources(page,ids,panel.blocks)
  }
  const view=useId()
  const {ref}=useDraggable({id:BLOCK_REFERENCE+view+page.id+'/'+block.id,type:BLOCK_REFERENCE,sensors:[PointerSensor],data:{links,dragged}})
  return <Button {...editorControlProps} ref={ref} className={HANDLE} type="button" size="icon-sm" variant="ghost" contentEditable={false}
    onPointerDownCapture={()=>{dragged.current=false;capture()}} onClick={event=>{
      if(event.detail===0)capture()
      else if(dragged.current)return
      composer?.current?.(links.current)
    }}
    title="Click to attach the selected blocks, or drag them into chat" aria-label="Attach block links to chat"><Link2 size={14}/></Button>
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
