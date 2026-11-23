/** Initialize a daily Rivto document before a device knows the server-assigned page ID. */
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import * as Y from 'yjs'

/** Encode the shared first paragraph for an ISO calendar day. Apply these bytes to a fresh document before editing. */
export function initialJournalState(day:string,writing=''):Uint8Array{
  const doc=new Y.Doc()
  // Only this immutable seed uses writer zero. Every editing replica keeps its own Yjs writer.
  const writer=doc.clientID
  doc.clientID=0
  const model=new DocumentModelImpl(new YjsDoc(day,doc))
  try{
    const block=model.blocks.insertBlock({id:'@journal-'+day,type:'paragraph',content:''})
    if(writing){
      // Imported writing is a normal edit layered over the seed shared by disconnected devices.
      doc.clientID=writer||1
      model.blocks.setBlockText(block.id,writing)
    }
    return Y.encodeStateAsUpdate(doc)
  }finally{void model.destroy()}
}
