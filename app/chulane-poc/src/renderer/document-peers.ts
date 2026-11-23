/** Synchronously relay Yjs transactions between mounted views in one renderer. Each view owns its editor and undo history. */
import * as Y from 'yjs'

type DocumentRoom={views:Map<Y.Doc,()=>void>;reviewer?:Y.Doc}
const rooms=new Map<string,DocumentRoom>()
const readyViews=new WeakSet<Y.Doc>()
export const peerOrigin=Symbol('local document view')

/** Hydrate a joining view from a live peer before its editor seeds an empty page. Release the room on unmount. */
export function joinDocumentViews(key:string,doc:Y.Doc,resume:()=>void) {
  const room:DocumentRoom=rooms.get(key)??{views:new Map()}
  const existing=Array.from(room.views.keys()).find(peer=>readyViews.has(peer))
  if(existing)Y.applyUpdate(doc,Y.encodeStateAsUpdate(existing),peerOrigin)
  room.views.set(doc,resume)
  rooms.set(key,room)
  function relay(update:Uint8Array,origin:unknown){
    if(origin===peerOrigin)return
    for(const other of room.views.keys())if(other!==doc)Y.applyUpdate(other,update,peerOrigin)
  }
  doc.on('update',relay)
  /** All local panes receive the originating transaction before resuming HTTP reconciliation. */
  function finishReview(){
    if(room.reviewer!==doc)return
    room.reviewer=undefined
    for(const wake of room.views.values())wake()
  }
  function leave(){
    doc.off('update',relay)
    room.views.delete(doc)
    finishReview()
    if(!room.views.size)rooms.delete(key)
  }
  return {hydrated:!!existing,ready:()=>readyViews.add(doc),leave,
    get reviewing(){return !!room.reviewer},
    beginReview(){
      if(room.reviewer)throw Error('An edit is being applied')
      room.reviewer=doc
    },finishReview,
  }
}
