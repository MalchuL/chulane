/** Verify Markdown exchange against the same binary Rivto state that both hosts open. */
import * as Y from 'yjs'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl} from '@chulane/document-model'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {gfmTable} from 'micromark-extension-gfm-table'
import {gfmTableFromMarkdown} from 'mdast-util-gfm-table'
import test from 'node:test'
import assert from 'node:assert/strict'
import {namedReferences,referenceSyntax} from '../../src/shared/named-references.ts'
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

test('table exchange preserves significant whitespace, escaped pipes and literal link labels',()=>{
  const values=['&#32; Field **note** &#32;','&#9;code&#9;','&nbsp;','&emsp;','north&#10;south',
    '<https://example.test/plot\\|station>','[plot](https://example.test/data\\|station)','`a\\|b`']
  const source=['| Label |','| --- |',...values.map(value=>'| '+value+' |')].join('\n')
  function rows(markdown:string){
    const [table]=fromMarkdown(markdown,{extensions:[gfmTable()],mdastExtensions:[gfmTableFromMarkdown()]}).children
    assert.ok(table?.type==='table')
    return JSON.parse(JSON.stringify(table.children, (key,value)=>key==='position'?undefined:value))
  }
  const exported=exportMarkdown(importMarkdown(source),'',false)
  assert.deepEqual(rows(exported.markdown),rows(source))
  assert.deepEqual(exported.omitted,[])
  assert.deepEqual(exportMarkdown(importMarkdown(exported.markdown),'',false),exported)
})

test('native table cell edits preserve literal edge whitespace through Markdown exchange',async()=>{
  const values=['  North  ','\t\t',' **Gauge**\t','', ' South']
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('cell-spaces',doc))
  try{
    model.blocks.insertBlock({type:'table',children:[{type:'table-row',children:values.map(content=>({type:'table-cell',content}))}]})
    const result=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    const [table]=fromMarkdown(result.markdown,{extensions:[gfmTable()],mdastExtensions:[gfmTableFromMarkdown()]}).children
    assert.ok(table?.type==='table')
    assert.deepEqual(table.children[0].children.map(cell=>cell.children.map(node=>node.type==='text'?node.value:node.type)),[
      ['  North  '],['\t\t'],[' ','strong','\t'],[],[' South']
    ])
    assert.deepEqual(result.omitted,[])
    assert.deepEqual(exportMarkdown(importMarkdown(result.markdown),'',false),result)
  }finally{await model.destroy()}
})

test('single-line block markers in editable cells preserve the table and inline formatting',async()=>{
  const cells=['# **Station**','1. *East*','> [Map](/survey)','---','[site]: /north','`a|b`']
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('cell-markers',doc))
  try{
    model.blocks.insertBlock({type:'table',children:[{type:'table-row',children:cells.map(content=>({type:'table-cell',content}))}]})
    const result=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.deepEqual(result.omitted,['block formatting in table cells'])
    const [table]=fromMarkdown(result.markdown,{extensions:[gfmTable()],mdastExtensions:[gfmTableFromMarkdown()]}).children
    assert.ok(table?.type==='table')
    const parsed=table.children[0]!.children.map(cell=>cell.children)
    assert.deepEqual(parsed.map(cell=>cell.map(node=>node.type)),[
      ['text','strong'],['text','emphasis'],['text','link'],['text'],['text'],['inlineCode']
    ])
    assert.deepEqual(parsed.map(cell=>'value' in cell[0]!&&cell[0].value),['# ','1. ','> ','---','[site]: /north','a|b'])
    assert.deepEqual(exportMarkdown(importMarkdown(result.markdown),'',false),{markdown:result.markdown,omitted:[]})
  }finally{await model.destroy()}
})

test('struck text stays editable in table cells and wrapped checklist items',()=>{
  const source='| Notes | Example |\n| --- | --- |\n| ~~old~~ **new** | `~~literal~~` |\n\n- [ ] ~~closed~~\n  reopened'
  const state=importMarkdown(source)
  const writing=agentDocument({id:1,title:'Checklist',plain:'',state}).blocks.map(block=>block.text)
  assert.ok(writing.includes('~~old~~ **new**'))
  assert.ok(writing.includes('~~closed~~\nreopened'))
  const exported=exportMarkdown(state,'',false)
  assert.match(exported.markdown,/\| ~~old~~ \*\*new\*\* \| `~~literal~~` \|/)
  assert.ok(exported.markdown.includes('- [ ] ~~closed~~\n  reopened'))
  assert.deepEqual(exportMarkdown(importMarkdown(exported.markdown),'',false),exported)
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

test('Markdown attachment labels distinguish visible duplicates and keep each download destination',async()=>{
  const {exportPageMarkdown}=await import('../../src/shared/markdown-export.ts')
  const files=[{id:4,name:'field notes.txt'},{id:5,name:'field  notes.txt'},{id:6,name:'field notes.txt · #4'}]
  const {markdown}=await exportPageMarkdown(null,'',2,'https://example.test',[],{page:7,files,hasFiles:true,tagged:false,fields:false})
  const list=fromMarkdown(markdown).children.at(-1)
  assert.ok(list?.type==='list')
  const links=list.children.map(item=>{
    const paragraph=item.children[0]
    assert.ok(paragraph.type==='paragraph')
    const link=paragraph.children[0]
    assert.ok(link.type==='link')
    return [link.children.map(node=>node.type==='text'&&node.value).join(''),link.url]
  })
  assert.equal(new Set(links.map(([label])=>label)).size,3)
  assert.equal(links[2][0],files[2].name)
  assert.equal(links[1][0],'field notes.txt · #5')
  assert.deepEqual(links.map(([,url])=>url),files.map(file=>'https://example.test/api/pages/7/files/'+file.id+'?workspace=2'))
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

test('importing exported labels only creates references from intentional writing',async()=>{
  const {exportPageMarkdown}=await import('../../src/shared/markdown-export.ts')
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('literal-labels',doc))
  try{
    model.blocks.insertBlock({type:'paragraph',content:'See [Expedition] #survey'})
    model.elements.insertElement({type:'text',frame:{x:0,y:0,width:120,height:50},zIndex:0,
      props:{text:'Station #north\n[Map #east] [[Island]]'}})
    const state=Y.encodeStateAsUpdate(doc)
    for(const origin of [null,'https://example.test']){
      const {markdown}=await exportPageMarkdown(state,'',2,origin,[{id:8,title:'[Lost] #route',deleted:1}],
        {page:7,files:[{id:4,name:'[Photo] #scan.pdf'}],hasFiles:true,tagged:false,fields:false})
      const restored=agentDocument({id:9,title:'Imported',state:importMarkdown(markdown),plain:''})
      assert.deepEqual(restored.blocks.flatMap(block=>namedReferences(block.text)),[
        {kind:'page',name:'Expedition'},{kind:'tag',name:'survey'}
      ])
    }
  }finally{await model.destroy()}
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
      '- [x] First line\n  continuation','- [x] [Read][ref]\n\n[ref]: /map']){
      assert.equal(exportMarkdown(importMarkdown(raw),'',false).markdown,raw)
    }
  }finally{await model.destroy()}
})

test('wrapped list paragraphs keep native checkboxes, inline formatting and nested items',async()=>{
  const source='- [ ] Pack **camera**  \r\n  and lens\r\n  - \\[x] Literal\r\n    marker\r\n- [x] Read gauge\r\nlazy continuation\r\n\r\n1. Record\r\n   pressure\r\n2. Finish'
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('wrapped-list',doc))
  try{
    Y.applyUpdate(doc,importMarkdown(source))
    const [pack,read,record,finish]=model.blocks.getBlocks()
    assert.deepEqual(pack.listProps,{type:'checkbox',checked:false})
    assert.deepEqual(read.listProps,{type:'checkbox',checked:true})
    assert.equal(read.content,'Read gauge\nlazy continuation')
    assert.equal(record.listProps.type,'start_numbered_list')
    assert.equal(record.content,'Record\npressure')
    assert.equal(finish.listProps.type,'numbered_list')
    const body=fromMarkdown(pack.content).children[0]
    assert.ok(body.type==='paragraph')
    assert.deepEqual(body.children.map(node=>node.type),['text','strong','break','text'])
    assert.equal(pack.children[0].listProps.type,'list')
    model.blocks.updateBlock(pack.id,{listProps:{...pack.listProps,checked:true}})
    const result=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.deepEqual(result.omitted,[])
    assert.deepEqual(exportMarkdown(importMarkdown(result.markdown),'',false),result)
    assert.match(result.markdown,/^- \[x\] Pack/)
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
    model.blocks.updateBlock(pack.id,{listProps:{...pack.listProps,checked:true}})
    const result=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.deepEqual(result.omitted,[])
    assert.deepEqual(exportMarkdown(importMarkdown(result.markdown),'',false),result)
    assert.match(result.markdown,/  \* \[x\] Pack supplies\n    \* Camera \*\*lens\*\*/)
  }finally{await model.destroy()}
})

test('adjacent bullet lists keep separate groups through a native checkbox edit and reimport',async()=>{
  const source='- Notebook\n- Map\n+ [ ] Camera\n+ Lens\n* Tripod'
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('packing',doc))
  try{
    Y.applyUpdate(doc,importMarkdown(source))
    const blocks=model.blocks.getBlocks()
    assert.deepEqual(blocks.map(block=>block.listProps.type),['list','list','checkbox','list','list'])
    model.blocks.updateBlock(blocks[2].id,{listProps:{...blocks[2].listProps,checked:true}})
    const result=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.deepEqual(fromMarkdown(result.markdown).children.map(node=>node.type==='list'&&node.children.length),[2,2,1])
    assert.match(result.markdown,/^\+ \[x\] Camera$/m)
    assert.deepEqual(result.omitted,[])
    assert.deepEqual(exportMarkdown(importMarkdown(result.markdown),'',false),result)
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

test('editing beside a numbered reference list preserves its start and original delimiter',async()=>{
  const source='1) Review notes\n2) Mark checks\n\n7. Inspect [gauge][map]\n\n[map]: /stations'
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('list-boundary',doc))
  try{
    Y.applyUpdate(doc,importMarkdown(source))
    const [first,second]=model.blocks.getBlocks()
    assert.equal(second.listProps.type,'numbered_list')
    model.blocks.removeBlock(first.id)
    model.blocks.updateBlock(second.id,{content:'Mark field checks'})
    const exported=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.deepEqual(exported,{markdown:'1) Mark field checks\n\n7. Inspect [gauge][map]\n\n[map]: /stations',omitted:[]})
    assert.deepEqual(fromMarkdown(exported.markdown).children.map(node=>node.type==='list'?node.start:node.type),[1,7,'definition'])
  }finally{await model.destroy()}
})

test('empty list items and parents containing only a nested list remain editable across exchange',async()=>{
  const source='1. Pack\n2.\n3. - Lens\n   -\n   - Battery'
  const state=importMarkdown(source)
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('empty-items',doc))
  try{
    Y.applyUpdate(doc,state)
    const items=model.blocks.getBlocks()
    assert.deepEqual(items.map(item=>[item.listProps.type,item.content]),[
      ['start_numbered_list','Pack'],['numbered_list',''],['numbered_list','']])
    assert.deepEqual(items[2].children.map(child=>[child.listProps.type,child.content]),[
      ['list','Lens'],['list',''],['list','Battery']])
    const exported=exportMarkdown(state,'',false)
    assert.deepEqual(exported.omitted,[])
    assert.deepEqual(exportMarkdown(importMarkdown(exported.markdown),'',false),exported)
  }finally{await model.destroy()}
})

test('two-digit numbered parents retain their nested ordered and bulleted children on reimport',()=>{
  const source=Array.from({length:10},(_,index)=>(index+1)+'. Stop '+(index+1)).join('\n')+'\n    1. Pack\n       - Lens'
  const result=exportMarkdown(importMarkdown(source),'',false)
  assert.deepEqual(result.omitted,[])
  assert.match(result.markdown,/10\. Stop 10\n {4}1\. Pack\n {7}- Lens$/)
  assert.deepEqual(exportMarkdown(importMarkdown(result.markdown),'',false),result)
})

test('a loose checklist retains paragraph boundaries, inline marks and editable nested items',async()=>{
  const source='- [ ] Pack lens\r\n\r\n  Carry a **spare**\r\n  battery.\r\n\r\n  [x] Literal note\r\n  - Caps\r\n- Return'
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('loose-list',doc))
  try{
    Y.applyUpdate(doc,importMarkdown(source))
    const [pack,home]=model.blocks.getBlocks()
    assert.equal(pack?.listProps.type,'checkbox')
    assert.equal(pack.content,'Pack lens\n\nCarry a **spare**\nbattery.\n\n[x] Literal note')
    assert.equal(pack.children[0]?.content,'Caps')
    assert.equal(home?.content,'Return')
    model.blocks.updateBlock(pack.id,{listProps:{...pack.listProps,checked:true}})
    const result=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    const [list]=fromMarkdown(result.markdown).children
    assert.ok(list.type==='list')
    assert.deepEqual(list.children[0].children.map(node=>node.type),['paragraph','paragraph','paragraph','list'])
    assert.match(result.markdown,/^- \[x\] Pack lens\n\n  Carry/)
    assert.deepEqual(result.omitted,[])
    assert.deepEqual(exportMarkdown(importMarkdown(result.markdown),'',false),result)
    for(const [marker,type] of [['*','list'],['1)','start_numbered_list']] as const){
      const indent=' '.repeat(marker.length+1)
      const markdown=marker+' Parent\n\n'+indent+'Second paragraph\n'+indent+'- Child'
      const copy=new Y.Doc(),outline=new DocumentModelImpl(new YjsDoc('loose-outline',copy))
      try{
        Y.applyUpdate(copy,importMarkdown(markdown))
        const [parent]=outline.blocks.getBlocks()
        assert.equal(parent.listProps.type,type)
        assert.equal(parent.content,'Parent\n\nSecond paragraph')
        assert.equal(parent.children[0].content,'Child')
        const exported=exportMarkdown(Y.encodeStateAsUpdate(copy),'',false)
        assert.deepEqual(exportMarkdown(importMarkdown(exported.markdown),'',false),exported)
      }finally{await outline.destroy()}
    }
    const interleaved='- Parent\n  - Child\n\n  Follow-up after the child'
    assert.equal(exportMarkdown(importMarkdown(interleaved),'',false).markdown,interleaved)
  }finally{await model.destroy()}
})

test('table exchange keeps a pipe in a named page title, a colon after it, and the fragment of an ordinary link',()=>{
  const cell=String.raw`[North\|West]: see https://example.org/harbor#east and &#35;sample`
  const first=importMarkdown('| Notes |\n| --- |\n| '+cell+' |')
  const exported=exportMarkdown(first,'',false)
  for(const state of [first,importMarkdown(exported.markdown)]){
    const writing=agentDocument({id:1,title:'Survey',state,plain:''}).blocks.at(-1)!.text
    assert.deepEqual(namedReferences(writing),[{kind:'page',name:'North|West'}])
    const [paragraph]=fromMarkdown(writing,referenceSyntax).children
    assert.ok(paragraph?.type==='paragraph')
    assert.deepEqual(paragraph.children.flatMap(node=>node.type==='link'?[node.url]:[]),['https://example.org/harbor#east'])
  }
})

test('table export retains Chulane references inside a heading and keeps indented code literal',async()=>{
  const doc=new Y.Doc(),model=new DocumentModelImpl(new YjsDoc('formatted-reference-cells',doc))
  try{
    model.blocks.insertBlock({type:'table',children:[{type:'table-row',children:[
      {type:'table-cell',content:'# Read **[Field notes]** #tide'},
      {type:'table-cell',content:'    [Not a page] #sample'},
    ]}]})
    const exported=exportMarkdown(Y.encodeStateAsUpdate(doc),'',false)
    assert.deepEqual(exported.omitted,['block formatting in table cells'])
    const cells=agentDocument({id:1,title:'Fieldwork',plain:'',state:importMarkdown(exported.markdown)}).blocks.slice(-2)
    assert.deepEqual(cells.map(cell=>namedReferences(cell.text)),[
      [{kind:'page',name:'Field notes'},{kind:'tag',name:'tide'}],[]
    ])
  }finally{await model.destroy()}
})
