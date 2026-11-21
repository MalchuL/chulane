/** Use Rivto's headless document model for the same block IDs and CRDT mutations as the renderer. */
import { YjsDoc } from '@chulane/crdt-doc'
import { DocumentModelImpl, type Block } from '@chulane/document-model'
import * as Y from 'yjs'

export type AgentEdit = { page: number; block: string; before: string; after: string }
export type PageBody = { id: number; title: string; state: Uint8Array | null; plain: string }

/** Read the live block tree or apply one checked replacement, leaving other blocks and canvas objects intact. */
export function agentDocument(page: PageBody, edit?: AgentEdit) {
  const doc = new Y.Doc()
  if (page.state) Y.applyUpdate(doc, page.state)
  const model = new DocumentModelImpl(new YjsDoc(String(page.id), doc))
  const flatten = (blocks: Block[]): Block[] => blocks.flatMap(block => [block, ...flatten(block.children)])
  try {
    // Text-only imports receive stable virtual identity until the first Rivto checkpoint.
    const initial = !page.state && page.plain ? model.blocks.insertBlock({type:'paragraph', content:page.plain}) : null
    const base = edit ? Y.encodeStateAsUpdate(doc) : undefined
    const vector = edit ? Y.encodeStateVector(doc) : undefined
    let changedBlock = edit?.block
    if (edit) {
      if (!edit.block) changedBlock = model.blocks.insertBlock({type:'paragraph',content:edit.after}).id
      else {
        const id = edit.block === '@import' ? initial?.id : edit.block
        if (!id || model.blocks.getBlockNode(id)?.content !== edit.before)
          throw Object.assign(new Error('The target block changed. Ask the agent for a fresh edit.'), {status:409})
        changedBlock = id
        model.blocks.setBlockText(id, edit.after)
      }
    }
    const blocks = flatten(model.blocks.getBlocks()).map(({id,content}) => ({id: id === initial?.id ? '@import' : id, text:content}))
    return { blocks, base, changedBlock, delta: edit ? Y.encodeStateAsUpdate(doc,vector) : undefined, state:edit ? Y.encodeStateAsUpdate(doc) : undefined, plain:blocks.map(block=>block.text).join('\n') }
  } finally { model.destroy() }
}
