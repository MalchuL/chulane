/** Decode standalone Yjs snapshots at the document persistence and backup boundaries. */
import * as Y from 'yjs'

/** Open the complete state in an empty document. The caller owns the returned document. */
export function openDocumentSnapshot(state:Uint8Array){
  const doc=new Y.Doc()
  try{
    Y.applyUpdate(doc,state)
    // A syntactically valid delta can leave insertions or deletions waiting for absent history.
    if(doc.store.pendingStructs||doc.store.pendingDs)throw Error('Document snapshot requires missing history.')
    return doc
  }catch(error){doc.destroy();throw error}
}
