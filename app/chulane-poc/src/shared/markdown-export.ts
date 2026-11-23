/** Serialize writing, canvas labels and page references identically on the host and a disconnected device. */
import {resolveBlockListNumbers,isNumberedListType} from '@chulane/rivto-react/list-numbers'
import {labeledFiles,labeledReferences} from './library.ts'
import {canvasLabels,listMarker,taskDescription} from './document-text.ts'
import {paragraphBlockFactory,separatorBlockFactory} from '@chulane/rivto-react/block-factories'
import {markdownSyntax,tableMarkdownFormat} from './markdown-format.ts'
import {markMarkdownReferences} from './named-references.ts'
import {toMarkdown,type Options} from 'mdast-util-to-markdown'
import {gfmToMarkdown} from 'mdast-util-gfm'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl,type Block} from '@chulane/document-model'
import * as Y from 'yjs'

type MarkdownTable=Extract<ReturnType<typeof fromMarkdown>['children'][number],{type:'table'}>

// Labels are plain text even when they resemble a GFM autolink or a Chulane tag.
const labelFormat:Options={extensions:[gfmToMarkdown()],unsafe:[
  {character:'#',inConstruct:'phrasing',notInConstruct:'link'}
]}

// GFM cells contain inline Markdown. A leading marker belongs to the cell, even at the start of its input string.
const tableCellSyntax={...markdownSyntax,extensions:[...markdownSyntax.extensions,{disable:{null:[
  'blockQuote','list','definition','codeIndented','codeFenced','headingAtx','htmlFlow','setextUnderline','thematicBreak'
]}}]}

/** Serialize rectangular tables with inline Markdown cells. Rich cell subtrees use the ordinary recursive export. */
function exportTable(block:Block,omitted:Set<string>){
  const columns=block.children[0]?.children.length
  if(!columns||block.listProps.type)return
  const table:MarkdownTable={type:'table',children:[]}
  const hasProperties=(item:Block)=>[item.props,item.pluginData,item.listProps].some(data=>Object.keys(data).length>0)
  let lostProperties=hasProperties(block),lostCellFormatting=false
  for(const row of block.children){
    if(row.type!=='table-row'||row.content||row.children.length!==columns)return
    lostProperties||=hasProperties(row)
    const cells:MarkdownTable['children'][number]['children']=[]
    for(const cell of row.children){
      if(cell.type!=='table-cell'||cell.children.length||cell.listProps.type||/[\r\n]/.test(cell.content))return
      let [inline]=fromMarkdown(cell.content,markdownSyntax).children
      const literal=inline?.type==='definition'||inline?.type==='code'||inline?.type==='html'
      if(inline&&inline.type!=='paragraph'){
        // Rivto previews block Markdown in a cell. Keep its source inline and report the presentation loss.
        lostCellFormatting=true
        inline=fromMarkdown(cell.content,tableCellSyntax).children[0]
      }
      if(inline&&inline.type!=='paragraph')return
      if(inline)markMarkdownReferences(inline,cell.content,literal)
      // The standalone Markdown parser trims horizontal padding. In an editor cell it is user-entered text.
      const leading=cell.content.match(/^[ \t]+/)?.[0]??''
      const trailing=cell.content.match(/(?<=[^ \t])[ \t]+$/)?.[0]??''
      const children=inline?.children??[]
      if(leading)children.unshift({type:'text',value:leading})
      if(trailing)children.push({type:'text',value:trailing})
      cells.push({type:'tableCell',children})
      lostProperties||=hasProperties(cell)
    }
    table.children.push({type:'tableRow',children:cells})
  }
  if(lostProperties)omitted.add('block properties')
  if(lostCellFormatting)omitted.add('block formatting in table cells')
  if(block.content)omitted.add('table title placement')
  return [block.content,toMarkdown(table,tableMarkdownFormat).trimEnd()].filter(Boolean).join('\n\n')
}

type PageReference={id:number;title:string;deleted:number}
type PageExportMetadata={
  installation?:string
  page:number
  files:{id:number;name:string}[]
  /** A cached catalog may record attachments before the device has fetched their names. */
  hasFiles:boolean
  tagged:boolean
  fields:boolean
}

/** Serialize labels as literal Markdown text, including names that contain brackets or emphasis. */
function referenceList(heading:string,references:{label:string;url?:string}[]){
  const items=references.map(({label,url})=>{
    const text={type:'text' as const,value:label.replace(/[\r\n]+/g,' ')}
    const content=url?{type:'link' as const,url,children:[text]}:text
    return {type:'listItem' as const,children:[{type:'paragraph' as const,children:[content]}]}
  })
  return toMarkdown({type:'root',children:[
    {type:'heading',depth:2,children:[{type:'text',value:heading}]},
    {type:'list',ordered:false,children:items}
  ]},labelFormat).trimEnd()
}

/** Use the public server address for navigable references. Local profiles and trashed targets retain readable identities. */
export function markdownPageReferences(workspace:number,pages:PageReference[],origin:string|null){
  return referenceList('Linked pages',labeledReferences(pages,page=>({id:page.id,name:page.title})).map(({item:page,label})=>origin&&!page.deleted
    ? {label,url:origin+'/?workspace='+workspace+'&page='+page.id}
    : {label:page.title+' (workspace '+workspace+', page '+page.id+(page.deleted?', in Trash':'')+')'}))
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
        labels.push(toMarkdown({type:'paragraph',children},labelFormat).slice(0,-1))
      }
    }
    if(Object.keys(model.pluginData.getAll()).length)omitted.add('document properties')
    /** Scope counters to siblings. Alternating delimiters keep adjacent restarted sequences separate in CommonMark. */
    function renderSiblings(blocks:Block[]):string[]{
      const numbers=resolveBlockListNumbers(blocks)
      let delimiter='.',previousNumber:number|undefined
      return blocks.map(block=>{
        const number=numbers.get(block.id)
        if(previousNumber===undefined)delimiter=block.listProps.markdownDelimiter===')'?')':'.'
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
      const {type,checked,markdownBullet,markdownDelimiter,...extra}=block.listProps
      const marker=listMarker(block,numberMarker)
      if(Object.keys(block.props).length||Object.keys(block.pluginData).length||Object.keys(extra).length||
        (markdownBullet!==undefined&&(markdownBullet!==marker[0]||!(type==='list'||type==='checkbox'||task)))||
        (markdownDelimiter!==undefined&&(markdownDelimiter!==')'||!isNumberedListType(type)))||
        (type&&!marker)||(checked&&type!=='checkbox'))omitted.add('block properties')
      const children=renderSiblings(block.children)
      if(children.length&&!marker)omitted.add('outline nesting')
      const content=separator?['---',block.content].filter(Boolean).join('\n\n'):block.content
      const description=taskDescription(block)
      const nestedList=marker&&block.children.every(child=>child.listProps.type==='list'||child.listProps.type==='checkbox'||isNumberedListType(child.listProps.type))
      const body=[description?content+'\n'+description:content,...children].join(nestedList?'\n':'\n\n')
      return marker?marker+body.replace(/\n(?=[^\n])/g,'\n'+' '.repeat(numberMarker?numberMarker.length:2)):body
    }
    const writing=renderSiblings(model.blocks.getBlocks()).join('\n\n')
    const markdown=[writing,...labels].filter(Boolean).join('\n\n')
    return {markdown,omitted:[...omitted]}
  }finally{void model.destroy()}
}

/** Include navigable links and record the workspace metadata that a Markdown file cannot carry. */
export async function exportPageMarkdown(state:Uint8Array|null,plain:string,workspace:number,origin:string|null,
  references:PageReference[],metadata:PageExportMetadata){
  const result=exportMarkdown(state,plain,metadata.hasFiles||metadata.files.length>0)
  if(metadata.files.length){
    const attachments=referenceList('Attachments',labeledFiles(metadata.files).map(({item:file,label})=>({
      label,url:origin?origin+'/api/pages/'+metadata.page+'/files/'+file.id+'?workspace='+workspace:undefined
    })))
    const source=origin?'':'Search for `#'+metadata.page+'` in workspace '+workspace+' to open the original attachments.'
    result.markdown=[result.markdown,attachments,source].filter(Boolean).join('\n\n')
  }
  if(references.length){
    let section=markdownPageReferences(workspace,references,origin)
    if(metadata.installation&&globalThis.crypto?.subtle){
      const scope=[metadata.installation,workspace,references.map(page=>page.id).join(',')].join(' ')
      // Keep ordinary Markdown readable. Only an intact generated section can be replaced with native links.
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope+'\n'+section)))
      const checksum=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('')
      section='<!-- chulane-page-links-v1 '+scope+' '+checksum+' -->\n\n'+section
    }
    if(!metadata.installation||!globalThis.crypto?.subtle||references.some(page=>page.deleted))result.omitted.push('editable workspace link relationships')
    result.markdown=[result.markdown,section].filter(Boolean).join('\n\n')
  }
  if(metadata.tagged)result.omitted.push('tag assignments')
  if(metadata.fields)result.omitted.push('tag field values')
  return result
}
