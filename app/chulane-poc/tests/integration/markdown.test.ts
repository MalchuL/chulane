/** Verify Markdown exchange against the same binary Rivto state that both hosts open. */
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import {fromMarkdown} from 'mdast-util-from-markdown'
import test from 'node:test'
import assert from 'node:assert/strict'
import {agentDocument} from '../../src/server/agent-document.ts'
import {importMarkdown,exportMarkdown} from '../../src/server/markdown.ts'

test('Markdown constructs become editable blocks while fenced blank lines and list structure survive',()=>{
  const parts=['# Journey','    indented code','- one\n  - two','~~~js\nfirst\n\nsecond\n~~~']
  const source=parts.join('\n\n')
  const state=importMarkdown(source)
  assert.deepEqual(agentDocument({id:9,title:'Journey',state,plain:''}).blocks.map(b=>b.text),['# Journey','    indented code','one','two',parts[3]])
  assert.deepEqual(exportMarkdown(state,'',false),{markdown:source,omitted:[]})
  assert.deepEqual(exportMarkdown(state,'',true).omitted,['attachments'])
})

test('standalone thematic breaks reopen as native dividers while headings and code keep their source',async()=>{
  const heading='Section\n---',code='~~~\n---\n~~~'
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('divider-import',doc))
  try{
    Y.applyUpdate(doc,importMarkdown([heading,'* * *',code,'___'].join('\n\n')))
    assert.deepEqual(model.blocks.getBlocks().map(block=>[block.type,block.content]),[
      ['paragraph',heading],['separator',''],['paragraph',code],['separator','']
    ])
    const exported=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.deepEqual(exported,{markdown:[heading,'---',code,'---'].join('\n\n'),omitted:[]})
    assert.deepEqual(exportMarkdown(importMarkdown(exported.markdown),'',false),exported)
  }finally{await model.destroy()}
})

test('Markdown reference definitions resolve within the same editor block',()=>{
  const source='A [source][home].\n\n[home]: https://example.com'
  const nested='> ![map][home]\n\n> [home]: /map.png'
  for(const references of [source,nested]){
    const parts=['# Notes',references,'`labels[key]: value`']
    const state=importMarkdown(parts.join('\n\n'))
    assert.deepEqual(agentDocument({id:9,title:'References',state,plain:''}).blocks.map(b=>b.text),parts)
    assert.equal(exportMarkdown(state,'',false).markdown,parts.join('\n\n'))
  }
  assert.equal(exportMarkdown(null,'Legacy text',false).markdown,'Legacy text')
})

test('separate reference groups stay editable and overlapping reference spans keep their source order',()=>{
  const parts=['[one]: /one\n\nFirst [one].','Between groups.',
    '[two]: /two\n\nSee [three].\n\nThen [two].\n\n[three]: /three','Literal [key]: value']
  const state=importMarkdown(parts.join('\n\n'))
  assert.deepEqual(agentDocument({id:9,title:'Notes',state,plain:''}).blocks.map(b=>b.text),parts)
})

test('export reports actual losses and keeps the readable contents of extension blocks',async()=>{
  const doc=new Y.Doc()
  const model=new DocumentModelImpl(new YjsDoc('export',doc))
  try{
    model.blocks.insertBlock({type:'plugin-card',content:'Review',props:{color:'red'},children:[
      {type:'paragraph',content:'Send',listProps:{type:'checkbox',checked:true}}]})
    model.elements.insertElement({type:'shape',frame:{x:0,y:0,width:100,height:100},zIndex:0})
    const exported=exportMarkdown(Y.encodeStateAsUpdate(doc),'',true)
    assert.equal(exported.markdown,'Review\n\n- [x] Send')
    assert.deepEqual(exported.omitted.sort(),['attachments','block properties','canvas objects','custom block formatting','outline nesting'])
  }finally{await model.destroy()}
})

test('task export preserves completion and description and reports the remaining task properties',async()=>{
  const doc=new Y.Doc()
  const model=new DocumentModelImpl(new YjsDoc('task-export',doc))
  try{
    model.blocks.insertBlock({type:'todo-item',content:'Collect samples',props:{status:'doing',description:'North shore',priority:2}})
    model.blocks.insertBlock({type:'todo-item',content:'Label jars',props:{status:'done'}})
    assert.deepEqual(exportMarkdown(Y.encodeStateAsUpdate(doc),'',false),{
      markdown:'- [ ] Collect samples\n  North shore\n\n- [x] Label jars',omitted:['block properties']
    })
  }finally{await model.destroy()}
})

test('Markdown keeps literal canvas labels after the writing, without duplicating block cards',async()=>{
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('canvas-export',doc))
  try{
    const block=model.blocks.insertBlock({type:'paragraph',content:'# Field notes'})
    const frame={x:0,y:0,width:120,height:50}
    model.elements.insertElement({type:'block',frame,zIndex:0,props:{startBlockId:block.id,endBlockId:block.id}})
    for(const [type,text] of [['text','# Station'],['sticker','*Samples*\nSecond line'],['connector','<north> &amp; south']]){
      model.elements.insertElement({type,frame,zIndex:1,props:{text}})
    }
    model.elements.insertElement({type:'group',frame,zIndex:2,props:{title:'[Marsh samples](/field)'}})
    const state=Y.encodeStateAsUpdate(doc)
    const result=exportMarkdown(state,'',false)
    assert.deepEqual(fromMarkdown(result.markdown).children.map(node=>
      [node.type,'children' in node?node.children.map(child=>'value' in child?child.value:child.type):[]]
    ),[['heading',['Field notes']],['paragraph',['# Station']],['paragraph',['*Samples*','break','Second line']],['paragraph',['<north> &amp; south']],['paragraph',['[Marsh samples](/field)']]])
    assert.match(agentDocument({id:1,title:'Notes',plain:'',state}).canvasText,/Marsh samples/)
    assert.deepEqual(result.omitted.sort(),['canvas card layout','canvas objects'])
  }finally{await model.destroy()}
})

test('a pipe table becomes editable native cells and survives Markdown export and import',async()=>{
  const source='Field notes\n\n| Station | Reading |\n| --- | --- |\n| **North** | `a\\|b` |\n| South |'
  const state=importMarkdown(source)
  const doc=new Y.Doc()
  Y.applyUpdate(doc,state)
  const model=new DocumentModelImpl(new YjsDoc('survey',doc))
  try{
    const table=model.blocks.getBlocks()[1]!
    assert.equal(table.type,'table')
    assert.deepEqual(table.children.map(row=>row.children.map(cell=>cell.content)),[['Station','Reading'],['**North**','`a|b`'],['South','']])
    const exported=exportMarkdown(state,'',false)
    assert.deepEqual(exported.omitted,[])
    assert.deepEqual(agentDocument({id:1,title:'Copy',plain:'',state:importMarkdown(exported.markdown)}).blocks.map(b=>b.text),
      agentDocument({id:1,title:'Survey',plain:'',state}).blocks.map(b=>b.text))
    model.blocks.setBlockText(table.id,'Station measurements')
    model.blocks.updateBlock(table.children[0]!.children[0]!.id,{props:{tableColumnWidth:220}})
    const named=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.ok(named.markdown.startsWith('Field notes\n\nStation measurements\n\n|'))
    assert.deepEqual(named.omitted.sort(),['block properties','table title placement'])
  }finally{await model.destroy()}
})

test('tables with alignment or shared references keep their source, and nested native cells retain their writing',async()=>{
  const wide=['| Site |'+' Value |'.repeat(80),'| --- |'+' --- |'.repeat(80),...Array(20).fill('| North |')].join('\n')
  for(const source of [wide,'| Label |\n| --- |\n| North | extra reading |','| Location | Count |\n| :--- | ---: |\n| North | 1 |',
    '| Site |\n| --- |\n| [North][map] |\n\n[map]: /north']){
    const state=importMarkdown(source)
    assert.equal(exportMarkdown(state,'',false).markdown,source)
  }
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('nested-cell',doc))
  try{
    model.blocks.insertBlock({type:'table',content:'Field notes',children:[{type:'table-row',children:[
      {type:'table-cell',content:'North',children:[{type:'paragraph',content:'Second reading'}]}
    ]}]})
    const result=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.match(result.markdown,/Field notes[\s\S]+North[\s\S]+Second reading/)
    assert.ok(result.omitted.includes('custom block formatting'))
  }finally{await model.destroy()}
})

test('linked page titles stay literal when they contain Markdown or line breaks',async()=>{
  const {markdownPageReferences}=await import('../../src/server/markdown.ts')
  const title='[*Map*](old)\n<script>old</script>'
  const text=markdownPageReferences(2,[{id:8,title,deleted:0}],'https://example.test')
  const list=fromMarkdown(text).children.at(-1)
  assert.ok(list?.type==='list')
  const paragraph=list.children[0].children[0]
  assert.ok(paragraph.type==='paragraph')
  const link=paragraph.children[0]
  assert.ok(link.type==='link')
  assert.equal(link.url,'https://example.test/?workspace=2&page=8')
  assert.deepEqual(link.children.map(node=>node.type==='text'&&node.value),[title.replace('\n',' ')])
})

test('Markdown checklists import as independently editable checkbox blocks',async()=>{
  const source='- [ ] Pack **camera**\n- [X] Charge battery'
  const doc=new Y.Doc()
  Y.applyUpdate(doc,importMarkdown(source))
  const model=new DocumentModelImpl(new YjsDoc('checklist',doc))
  try{
    const items=model.blocks.getBlocks()
    assert.deepEqual(items.map(block=>[block.content,block.listProps]),[
      ['Pack **camera**',{type:'checkbox',checked:false}],['Charge battery',{type:'checkbox',checked:true}]])
    assert.deepEqual(exportMarkdown(Y.encodeStateAsUpdate(doc),'',false),{
      markdown:'- [ ] Pack **camera**\n\n- [x] Charge battery',omitted:[]})
    for(const raw of ['- \\[x] Literal marker','1. [ ] Ordered','7. From notebook\n\n1) Restart','1) First\n\n7. Resume','- [ ] Parent\n  - Child',
      '* Parent\n\n  Second paragraph\n* Last',
      '- [x] First line\n  continuation','- [x] [Read][ref]\n\n[ref]: /map']){
      assert.equal(exportMarkdown(importMarkdown(raw),'',false).markdown,raw)
    }
  }finally{await model.destroy()}
})

test('mixed nested Markdown lists preserve editable hierarchy and checkbox state across exchange',async()=>{
  const source='* Expedition\r\n  * [ ] Pack supplies\r\n    * Camera **lens**\r\n  * [x] Confirm transport\r\n* Return'
  const doc=new Y.Doc()
  Y.applyUpdate(doc,importMarkdown(source))
  const model=new DocumentModelImpl(new YjsDoc('packing-list',doc))
  try{
    const [trip,home]=model.blocks.getBlocks()
    assert.equal(trip?.listProps.type,'list')
    assert.equal(home?.content,'Return')
    const [pack,transport]=trip.children
    assert.equal(pack?.listProps.checked,false)
    assert.equal(transport?.listProps.checked,true)
    assert.equal(pack?.children[0]?.content,'Camera **lens**')
    assert.ok(pack)
    model.blocks.updateBlock(pack.id,{listProps:{type:'checkbox',checked:true}})
    const result=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.deepEqual(result.omitted,[])
    assert.deepEqual(exportMarkdown(importMarkdown(result.markdown),'',false),result)
    assert.match(result.markdown,/  - \[x\] Pack supplies\n    - Camera \*\*lens\*\*/)
  }finally{await model.destroy()}
})

test('ordered outlines keep their displayed numbering, sibling restarts and nested checkboxes',async()=>{
  const source='1. North\n   - [ ] Read gauge\n2. South\n\n1) Restart\n\nInterval\n\n7. From notebook'
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('numbered',doc))
  try{
    Y.applyUpdate(doc,importMarkdown(source))
    const blocks=model.blocks.getBlocks()
    assert.deepEqual(blocks.map(block=>block.listProps.type),['start_numbered_list','numbered_list','start_numbered_list',undefined,undefined])
    assert.equal(blocks[0]!.children[0]!.listProps.type,'checkbox')
    const exported=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.deepEqual(exported.omitted,[])
    assert.deepEqual(fromMarkdown(exported.markdown).children.map(node=>node.type==='list'?[node.start,node.children.length]:node.type),[[1,2],[1,1],'paragraph',[7,1]])
    assert.deepEqual(exportMarkdown(importMarkdown(exported.markdown),'',false),exported)
    model.blocks.insertBlock({type:'paragraph',content:'Interval'})
    model.blocks.insertBlock({type:'paragraph',content:'Continue',listProps:{type:'continue_numbered_list'}})
    assert.match(exportMarkdown(Y.encodeStateAsUpdate(doc),'',false).markdown,/2\. Continue$/)
  }finally{await model.destroy()}
})

test('two-digit numbered parents retain their nested ordered and bulleted children on reimport',()=>{
  const source=Array.from({length:10},(_,index)=>(index+1)+'. Stop '+(index+1)).join('\n')+'\n    1. Pack\n       - Lens'
  const result=exportMarkdown(importMarkdown(source),'',false)
  assert.deepEqual(result.omitted,[])
  assert.match(result.markdown,/10\. Stop 10\n {4}1\. Pack\n {7}- Lens$/)
  assert.deepEqual(exportMarkdown(importMarkdown(result.markdown),'',false),result)
})
