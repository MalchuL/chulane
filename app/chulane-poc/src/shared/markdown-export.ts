/** Serialize writing, canvas labels and page references identically on the host and a disconnected device. */
import {resolveBlockListNumbers,isNumberedListType} from '@chulane/rivto-react/list-numbers'
import {canvasLabels} from './document-text.ts'
import {paragraphBlockFactory,separatorBlockFactory} from '@chulane/rivto-react/block-factories'
import {gfmTableToMarkdown} from 'mdast-util-gfm-table'
import {toMarkdown} from 'mdast-util-to-markdown'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl,type Block} from '@chulane/document-model'
import * as Y from 'yjs'

type MarkdownTable=Extract<ReturnType<typeof fromMarkdown>['children'][number],{type:'table'}>

/** Serialize rectangular tables with inline Markdown cells. Rich cell subtrees use the ordinary recursive export. */
function exportTable(block:Block,omitted:Set<string>){
  const columns=block.children[0]?.children.length
  if(!columns||block.listProps.type)return
  const table:MarkdownTable={type:'table',children:[]}
  const hasProperties=(item:Block)=>[item.props,item.pluginData,item.listProps].some(data=>Object.keys(data).length>0)
  let lostProperties=hasProperties(block)
  for(const row of block.children){
    if(row.type!=='table-row'||row.content||row.children.length!==columns)return
    lostProperties||=hasProperties(row)
    const cells:MarkdownTable['children'][number]['children']=[]
    for(const cell of row.children){
      if(cell.type!=='table-cell'||cell.children.length||cell.listProps.type||/[\r\n]/.test(cell.content))return
      const [inline]=fromMarkdown(cell.content).children
      if(inline&&inline.type!=='paragraph')return
      cells.push({type:'tableCell',children:inline?.children??[]})
      lostProperties||=hasProperties(cell)
    }
    table.children.push({type:'tableRow',children:cells})
  }
  if(lostProperties)omitted.add('block properties')
  if(block.content)omitted.add('table title placement')
  return [block.content,toMarkdown(table,{extensions:[gfmTableToMarkdown({tablePipeAlign:false})]}).trimEnd()].filter(Boolean).join('\n\n')
}

type PageReference={id:number;title:string;deleted:number}

/** Use the public server address for navigable references. Local profiles and trashed targets retain readable identities. */
export function markdownPageReferences(workspace:number,pages:PageReference[],origin:string|null){
  const items=pages.map(page=>{
    const title={type:'text' as const,value:page.title.replace(/[\r\n]+/g,' ')}
    const content=origin&&!page.deleted
      ? {type:'link' as const,url:origin+'/?workspace='+workspace+'&page='+page.id,children:[title]}
      : {type:'text' as const,value:title.value+' (workspace '+workspace+', page '+page.id+(page.deleted?', in Trash':'')+')'}
    return {type:'listItem' as const,children:[{type:'paragraph' as const,children:[content]}]}
  })
  return toMarkdown({type:'root',children:[
    {type:'heading',depth:2,children:[{type:'text',value:'Linked pages'}]},
    {type:'list',ordered:false,children:items}
  ]}).trimEnd()
}

/** Export the current CRDT state, including block text even when its extension-specific presentation is unavailable. */
export function exportMarkdown(state:Uint8Array|null,plain:string,hasAttachments:boolean){
  const omitted=new Set<string>()
  if(hasAttachments)omitted.add('attachments')
  if(!state)return {markdown:plain,omitted:[...omitted]}
  const doc=new Y.Doc()
  Y.applyUpdate(doc,state)
  const model=new DocumentModelImpl(new YjsDoc('markdown-export',doc))
  try{
    const labels:string[]=[]
    for(const element of model.elements.getElementNodes()){
      omitted.add(element.type==='block'?'canvas card layout':'canvas objects')
      if(element.type==='block')continue
      for(const text of canvasLabels(element)){
        // Canvas editors store literal labels. Serialize as text so punctuation cannot become Markdown markup.
        const children:({type:'text';value:string}|{type:'break'})[]=[]
        for(const line of text.split(/\r\n?|\n/)){
          if(children.length)children.push({type:'break'})
          children.push({type:'text',value:line})
        }
        labels.push(toMarkdown({type:'paragraph',children}).slice(0,-1))
      }
    }
    if(Object.keys(model.pluginData.getAll()).length)omitted.add('document properties')
    /** Scope counters to siblings. Alternating delimiters keep adjacent restarted sequences separate in CommonMark. */
    function renderSiblings(blocks:Block[]):string[]{
      const numbers=resolveBlockListNumbers(blocks)
      let delimiter='.',previousNumber:number|undefined
      return blocks.map(block=>{
        const number=numbers.get(block.id)
        if(previousNumber===undefined)delimiter='.'
        else if(number===1)delimiter=delimiter==='.'?')':'.'
        previousNumber=number
        return render(block,number===undefined?'':number+delimiter+' ')
      })
    }
    /** Render list items with hanging indents and preserve readable text from custom blocks. */
    function render(block:Block,numberMarker:string):string{
      if(block.type==='table'){
        const table=exportTable(block,omitted)
        if(table)return table
      }
      const separator=separatorBlockFactory.isBlock(block)
      const task=block.type==='todo-item'
      if(!paragraphBlockFactory.isBlock(block)&&!separator&&!task)omitted.add('custom block formatting')
      const {type,checked,...extra}=block.listProps
      let marker=type==='list'?'- ':numberMarker
      if(task||type==='checkbox'){
        const complete=task?block.props.status==='done':checked
        marker=complete?'- [x] ':'- [ ] '
      }
      if(Object.keys(block.props).length||Object.keys(block.pluginData).length||Object.keys(extra).length||
        (type&&!marker)||(checked&&type!=='checkbox'))omitted.add('block properties')
      const children=renderSiblings(block.children)
      if(children.length&&!marker)omitted.add('outline nesting')
      const content=separator?['---',block.content].filter(Boolean).join('\n\n'):block.content
      const description=task&&typeof block.props.description==='string'?block.props.description:''
      const nestedList=marker&&block.children.every(child=>child.listProps.type==='list'||child.listProps.type==='checkbox'||isNumberedListType(child.listProps.type))
      const body=[description?content+'\n'+description:content,...children].join(nestedList?'\n':'\n\n')
      return marker?marker+body.replaceAll('\n','\n'+' '.repeat(numberMarker?numberMarker.length:2)):body
    }
    const writing=renderSiblings(model.blocks.getBlocks()).join('\n\n')
    const markdown=[writing,...labels].filter(Boolean).join('\n\n')
    return {markdown,omitted:[...omitted]}
  }finally{void model.destroy()}
}

/** Include navigable links and record the workspace metadata that a Markdown file cannot carry. */
export function exportPageMarkdown(state:Uint8Array|null,plain:string,workspace:number,origin:string|null,
  references:PageReference[],metadata:{attachments:boolean;tagged:boolean;fields:boolean}){
  const result=exportMarkdown(state,plain,metadata.attachments)
  if(references.length){
    result.markdown=[result.markdown,markdownPageReferences(workspace,references,origin)].filter(Boolean).join('\n\n')
    result.omitted.push('editable workspace link relationships')
  }
  if(metadata.tagged)result.omitted.push('tag assignments')
  if(metadata.fields)result.omitted.push('tag field values')
  return result
}
