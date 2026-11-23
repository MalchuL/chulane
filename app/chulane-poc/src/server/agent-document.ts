/** Use Rivto's headless document model for the same block IDs and CRDT mutations as the renderer. */
import {applyCanvas,inspectCanvas} from './agent-canvas.ts'
import { YjsDoc } from '@chulane/crdt-doc'
import type {DescriptionPreview,DocumentContext} from './agent-environment.ts'
import {documentText,textPrefix,type DocumentTextBlock} from '../shared/document-text.ts'
import { DocumentModelImpl } from '@chulane/document-model'
import * as Y from 'yjs'
import {openDocumentSnapshot} from './document-snapshot.ts'

export type AgentEdit = { page: number; block: string; before: string; after: string; canvas?:boolean }
export type PageBody = { id: number; title: string; day?:string|null; state: Uint8Array | null; plain: string }

/** Reserve each block's text budget for editable writing first. Descriptions have independent offsets. */
export function blockPreview(block:DocumentTextBlock,limit:number){
  const text=textPrefix(block.text,limit)
  const details:DescriptionPreview={}
  if(block.description){
    details.description=textPrefix(block.description,limit-text.length)
    if(details.description!==block.description)details.descriptionNextOffset=details.description.length
  }
  return {text,...(text!==block.text&&{truncated:true,nextOffset:text.length}),...details}
}

/** Slice ordered blocks for a tool response. Text offsets resume within a block and the block offset advances across blocks. */
export function documentPreview(document:ReturnType<typeof documentText>,offset:number,oneBlock=false){
  if(!Number.isSafeInteger(offset)||offset<0)throw Object.assign(Error('Invalid block offset'),{status:400})
  if(offset>document.blocks.length)throw Object.assign(Error('Block offset is past the current end. Read again from offset 0.'),{status:409})
  const blocks:DocumentContext['blocks']=[]
  const canvas=!oneBlock&&offset===0?textPrefix(document.canvasText,4000):''
  let budget=24000-canvas.length
  for(const block of document.blocks.slice(offset,offset+(oneBlock?1:40))){
    const preview=blockPreview(block,12000)
    const size=preview.text.length+(preview.description?.length??0)
    if(blocks.length && size>budget)break
    blocks.push({id:block.id,...preview})
    budget-=size
  }
  const more=!oneBlock&&offset+blocks.length<document.blocks.length
  const canvasTextTruncated=canvas.length<document.canvasText.length
  return {blocks,more,nextBlockOffset:more?offset+blocks.length:null,...(canvas&&{canvasText:canvas,canvasTextTruncated,...(canvasTextTruncated&&{canvasNextOffset:canvas.length})})}
}

/** Preserve @import references to text-only pages. Blank pages receive a new Rivto block identity. */
function insertInitialParagraph(model:DocumentModelImpl,plain:string){
  model.blocks.insertBlock({type:'paragraph',content:plain,...(plain?{id:'@import'}:{})})
}

/** Seed Rivto once so independently opened editors can merge typing into the same initial paragraph. */
export function initialEditorState(page:Pick<PageBody,'id'|'plain'>){
  const doc=new Y.Doc()
  const model=new DocumentModelImpl(new YjsDoc(String(page.id),doc))
  try{
    insertInitialParagraph(model,page.plain)
    return Y.encodeStateAsUpdate(doc)
  }finally{void model.destroy()}
}

/** Read the requested geometry from the same durable or live snapshot used for editing. */
export function agentCanvas(page:PageBody,offset:number){
  const doc=page.state?openDocumentSnapshot(page.state):new Y.Doc()
  const model=new DocumentModelImpl(new YjsDoc(String(page.id),doc))
  try{return inspectCanvas(model,offset)}finally{model.destroy()}
}

/** Read the live block tree or apply one checked replacement, leaving other blocks and canvas objects intact. */
export function agentDocument(page: PageBody, edit?: AgentEdit) {
  const doc = page.state ? openDocumentSnapshot(page.state) : new Y.Doc()
  const model = new DocumentModelImpl(new YjsDoc(String(page.id), doc))
  try {
    if(!page.state && page.plain)insertInitialParagraph(model,page.plain)
    const base = edit ? Y.encodeStateAsUpdate(doc) : undefined
    const vector = edit ? Y.encodeStateVector(doc) : undefined
    let changedBlock = edit?.block
    if (edit) {
      if(edit.canvas)changedBlock=applyCanvas(model,edit.block,edit.before,edit.after)
      else if (!edit.block) changedBlock = model.blocks.insertBlock({type:'paragraph',content:edit.after}).id
      else {
        const id = edit.block
        if (model.blocks.getBlockNode(id)?.content !== edit.before)
          throw Object.assign(new Error('The target block changed. Ask the agent for a fresh edit.'), {status:409})
        changedBlock = id
        model.blocks.setBlockText(id, edit.after)
      }
    }
    const {blocks,canvasText}=documentText(model)
    const taskDescriptions=blocks.flatMap(block=>block.description?[block.description]:[]).join('\n')
    return { blocks, canvasText, taskDescriptions, base, changedBlock, delta: edit ? Y.encodeStateAsUpdate(doc,vector) : undefined, state:edit ? Y.encodeStateAsUpdate(doc) : undefined, plain:blocks.map(block=>block.text).join('\n') }
  } finally { model.destroy() }
}
