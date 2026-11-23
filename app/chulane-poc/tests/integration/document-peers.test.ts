/** The renderer must apply local document changes before the editing transaction returns, even without a host. */
import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import {joinDocumentViews} from '../../src/renderer/document-peers'

test('views hydrate from their document and receive updates synchronously until closed',()=>{
  const writer=new Y.Doc(),reader=new Y.Doc(),other=new Y.Doc()
  const first=joinDocumentViews('workspace/page',writer,()=>{})
  writer.getText().insert(0,'draft')
  first.ready()
  const second=joinDocumentViews('workspace/page',reader,()=>{})
  const separate=joinDocumentViews('another-workspace/page',other,()=>{})
  try{
    assert.equal(second.hydrated,true)
    assert.equal(reader.getText().toString(),'draft')
    reader.getText().insert(5,' edited')
    assert.equal(writer.getText().toString(),'draft edited')
    assert.equal(other.getText().length,0)
    second.leave()
    writer.getText().insert(0,'new ')
    assert.equal(reader.getText().toString(),'draft edited')
  }finally{
    first.leave();separate.leave()
    writer.destroy();reader.destroy();other.destroy()
  }
})


test('split views pause server reconciliation together until the reviewer finishes or leaves',()=>{
  const editor=new Y.Doc(),split=new Y.Doc(),resumed:string[]=[]
  const reviewing=joinDocumentViews('page',editor,()=>resumed.push('editor'))
  const sibling=joinDocumentViews('page',split,()=>resumed.push('split'))
  try{
    reviewing.beginReview()
    assert.equal(sibling.reviewing,true)
    assert.throws(()=>sibling.beginReview(),/being applied/)
    split.getText().insert(0,'typed during review')
    assert.equal(editor.getText().toString(),'typed during review')
    reviewing.finishReview()
    assert.deepEqual(resumed,['editor','split'])
    reviewing.beginReview()
    reviewing.leave()
    assert.equal(sibling.reviewing,false)
    assert.deepEqual(resumed,['editor','split','split'])
  }finally{
    sibling.leave()
    editor.destroy();split.destroy()
  }
})
