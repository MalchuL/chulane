/** Exchange Rivto writing blocks as Markdown. Keep unsupported data in the document and report losses to the exporter. */
import {pageCreation} from '../shared/page-draft.ts'
import type {DatabaseSync} from 'node:sqlite'
import {activeProject,reviewProjectPath} from './projects.ts'
import {paragraphBlockFactory,separatorBlockFactory} from '@chulane/rivto-react/block-factories'
import {gfmTable} from 'micromark-extension-gfm-table'
import {gfmTableFromMarkdown} from 'mdast-util-gfm-table'
import {toMarkdown} from 'mdast-util-to-markdown'
import {randomUUID} from 'node:crypto'
import {fromMarkdown,type CompileContext} from 'mdast-util-from-markdown'
import {YjsDoc} from '@chulane/crdt-doc'
import {DocumentModelImpl,type Block} from '@chulane/document-model'
import * as Y from 'yjs'

export {exportMarkdown,markdownPageReferences} from '../shared/markdown-export.ts'

/** Bind the proposed Markdown and its visible destination to the requesting workspace. */
export function reviewPageDraft(db:DatabaseSync,workspace:number,input:unknown){
  const parsed=pageCreation.safeParse(input)
  if(!parsed.success)throw Object.assign(Error('Invalid page draft'),{status:400})
  const {title,markdown,project}=parsed.data
  const projectName=reviewProjectPath(db,workspace,project)
  return {title,draft:{project,projectName,markdown}}
}

/** Create a page from validated Markdown and recheck its destination at the time of insertion. */
export function createMarkdownPage(db:DatabaseSync,workspace:number,title:string,project:unknown,markdown:string){
  const destination=activeProject(db,workspace,project)
  const state=importMarkdown(markdown)
  return Number(db.prepare('INSERT INTO pages(workspace,title,project,plain,state,rev) VALUES(?,?,?,?,?,1)').run(workspace,title,destination,markdown,state).lastInsertRowid)
}

/** Allocate fresh Rivto identities, including each editable cell in an imported table. */
function importedBlock(type:string,content:string,children:Block[]=[]):Block{
  return {id:randomUUID(),type,content,children,props:{},pluginData:{},listProps:{}}
}

/** Import an outline only when each item fits a writing block and an optional nested list. */
function importList(node:Extract<ReturnType<typeof fromMarkdown>['children'][number],{type:'list'}>,markdown:string,paragraph:string):Block[]|undefined{
  if(node.ordered&&node.start!==1)return
  const items:Block[]=[]
  for(const item of node.children){
    const body=item.children[0],position=body?.position
    if(item.children.length>2||body?.type!=='paragraph'||!position||position.start.line!==position.end.line)return
    const nested=item.children[1]
    if(nested&&nested.type!=='list')return
    const children=nested?importList(nested,markdown,paragraph):[]
    if(!children)return
    const source=markdown.slice(position.start.offset,position.end.offset)
    const match=/^\[([ xX])\](?:[ \t]+|$)/.exec(source)
    if(node.ordered&&match)return
    const block=importedBlock(paragraph,match?source.slice(match[0].length):source,children)
    block.listProps=node.ordered?{type:items.length?'numbered_list':'start_numbered_list'}:match?{type:'checkbox',checked:match[1]!==' '}:{type:'list'}
    items.push(block)
  }
  return items
}

/** Expand short GFM rows while preserving the source of aligned, overflowing or extremely sparse tables. */
function importTable(node:Extract<ReturnType<typeof fromMarkdown>['children'][number],{type:'table'}>){
  const columns=node.children[0]!.children.length
  if(node.align?.some(Boolean)||node.children.some(row=>row.children.length>columns))return
  // Bound the number of allocated editor cells by the source size so a sparse table cannot expand quadratically.
  const sourceLength=node.position!.end.offset!-node.position!.start.offset!
  if(node.children.length*columns>sourceLength)return
  const rows=node.children.map(row=>{
    const cells=Array.from({length:columns},(_,index)=>{
      const cell=row.children[index]
      const content=cell?toMarkdown({type:'paragraph',children:cell.children}).trimEnd():''
      return importedBlock('table-cell',content)
    })
    return importedBlock('table-row','',cells)
  })
  return importedBlock('table','',rows)
}

/** Create independent editable blocks from top-level constructs. Preserve document-wide reference definitions together. */
export function importMarkdown(markdown:string){
  const lines=markdown.replace(/\r\n?/g,'\n').split('\n')
  const nodes=fromMarkdown(markdown,{extensions:[gfmTable()],mdastExtensions:[gfmTableFromMarkdown()]}).children
  const references=new Map<string,{start:number;end:number}>()
  /** Rivto resolves a reference within one block. Track its top-level span even inside lists and quotes. */
  function collect(node:CompileContext['stack'][number],index:number){
    if(node.type==='definition'||node.type==='linkReference'||node.type==='imageReference'){
      const span=references.get(node.identifier)
      if(span)span.end=index
      else references.set(node.identifier,{start:index,end:index})
    }
    if('children' in node)for(const child of node.children)collect(child,index)
  }
  nodes.forEach(collect)
  const ends=nodes.map((_,i)=>i)
  for(const {start,end} of references.values())ends[start]=Math.max(ends[start]!,end)
  const parts:Block[]=[]
  const paragraph=paragraphBlockFactory.createEmptyBlock().type
  for(let start=0;start<nodes.length;){
    let end=ends[start]!
    // An overlapping reference can extend this group beyond its original last block.
    for(let next=start+1;next<=end;next++)end=Math.max(end,ends[next]!)
    const node=nodes[start]!
    if(start===end&&node.type==='list'){
      const lists=[importList(node,markdown,paragraph)]
      // Markdown distinguishes adjacent ordered lists by delimiter. Preserve the group when a raw list needs its original delimiter.
      while(node.ordered&&end+1<nodes.length){
        const next=nodes[end+1]!
        if(next.type!=='list'||!next.ordered||ends[end+1]!==end+1)break
        lists.push(importList(next,markdown,paragraph))
        end++
      }
      if(lists.every(items=>items!==undefined)){
        for(const items of lists)for(const item of items)parts.push(item)
        start=end+1
        continue
      }
    }
    const table=start===end&&node.type==='table'?importTable(node):undefined
    if(table)parts.push(table)
    else if(start===end&&node.type==='thematicBreak'){
      parts.push(importedBlock(separatorBlockFactory.createEmptyBlock().type,''))
    }else parts.push(importedBlock(paragraph,lines.slice(node.position!.start.line-1,nodes[end]!.position!.end.line).join('\n')))
    start=end+1
  }
  if(!parts.length)parts.push(importedBlock(paragraph,markdown))
  const doc=new Y.Doc()
  const model=new DocumentModelImpl(new YjsDoc('markdown-import',doc))
  try{
    model.loadSnapshot({version:9,blocks:parts})
    return Y.encodeStateAsUpdate(doc)
  }finally{void model.destroy()}
}
