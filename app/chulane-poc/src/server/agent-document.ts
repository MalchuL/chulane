/** Use Rivto's headless document model for the same block IDs and CRDT mutations as the renderer. */
import { YjsDoc } from '@chulane/crdt-doc'
import {documentText} from '../shared/document-text.ts'
import { DocumentModelImpl } from '@chulane/document-model'
import * as Y from 'yjs'

export type AgentEdit = { page: number; block: string; before: string; after: string }
export type PageBody = { id: number; title: string; state: Uint8Array | null; plain: string }

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

/** Read the live block tree or apply one checked replacement, leaving other blocks and canvas objects intact. */
export function agentDocument(page: PageBody, edit?: AgentEdit) {
  const doc = new Y.Doc()
  if (page.state) Y.applyUpdate(doc,page.state)
  const model = new DocumentModelImpl(new YjsDoc(String(page.id), doc))
  try {
    if(!page.state && page.plain)insertInitialParagraph(model,page.plain)
    const base = edit ? Y.encodeStateAsUpdate(doc) : undefined
    const vector = edit ? Y.encodeStateVector(doc) : undefined
    let changedBlock = edit?.block
    if (edit) {
      if (!edit.block) changedBlock = model.blocks.insertBlock({type:'paragraph',content:edit.after}).id
      else {
        const id = edit.block
        if (model.blocks.getBlockNode(id)?.content !== edit.before)
          throw Object.assign(new Error('The target block changed. Ask the agent for a fresh edit.'), {status:409})
        changedBlock = id
        model.blocks.setBlockText(id, edit.after)
      }
    }
    const {blocks,canvasText}=documentText(model)
    return { blocks, canvasText, base, changedBlock, delta: edit ? Y.encodeStateAsUpdate(doc,vector) : undefined, state:edit ? Y.encodeStateAsUpdate(doc) : undefined, plain:blocks.map(block=>block.text).join('\n') }
  } finally { model.destroy() }
}
