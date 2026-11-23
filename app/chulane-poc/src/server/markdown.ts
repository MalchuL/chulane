/** Exchange Rivto writing blocks as Markdown. Keep unsupported data in the document and report losses to the exporter. */
import {validateMarkdownText} from '../shared/markdown-file.ts'
import {pageCreation} from '../shared/page-draft.ts'
import type {DatabaseSync} from 'node:sqlite'
import {activeProject,reviewProjectPath} from './projects.ts'
import {paragraphBlockFactory,separatorBlockFactory} from '@chulane/rivto-react/block-factories'
import {markdownSyntax,markdownFormat,tableMarkdownFormat} from '../shared/markdown-format.ts'
import {toMarkdown} from 'mdast-util-to-markdown'
import {createHash,randomUUID} from 'node:crypto'
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

type ImportedWriting={writing:string;targets:number[]}

/** Resolve a generated list against its recorded workspace. Keep unavailable destinations as ordinary writing. */
function resolveLinkSection(db:DatabaseSync,workspace:number,marker:RegExpExecArray,section:string,list:Extract<ReturnType<typeof fromMarkdown>['children'][number],{type:'list'}>,source:string):ImportedWriting{
  const readable={writing:section,targets:[]}
  const [,scope,installation,originalWorkspace,ids,checksum]=marker
  if(originalWorkspace!==String(workspace)||checksum!==createHash('sha256').update(scope+'\n'+section).digest('hex')||
    !db.prepare('SELECT 1 FROM installation WHERE id=1 AND identity=?').get(installation!))return readable
  const targets=ids!.split(',').map(Number)
  if(targets.length!==list.children.length||targets.some(id=>!Number.isSafeInteger(id)||id<=0))return readable
  const rows=db.prepare('SELECT id FROM pages WHERE workspace=? AND deleted=0 AND id IN (SELECT value FROM json_each(?))').all(workspace,JSON.stringify(targets))
  if(!rows.length)return readable
  const available=new Set(rows.map(row=>Number(row.id)))
  const unresolved=list.children.filter((_,index)=>!available.has(targets[index]!))
  const remainder=unresolved.map(item=>source.slice(item.position!.start.offset,item.position!.end.offset)).join('\n')
  return {writing:remainder?'## Unavailable linked pages\n\n'+remainder:'',targets:[...available]}
}

/** Replace complete top-level link sections in place, preserving writing before, between and after them. */
function importedWriting(db:DatabaseSync,workspace:number,markdown:string):ImportedWriting{
  const literal={writing:markdown,targets:[]}
  if(!markdown.includes('<!-- chulane-page-links-v1 '))return literal
  const source=markdown.replace(/\r\n?/g,'\n')
  const nodes=fromMarkdown(source,markdownSyntax).children
  const parts:string[]=[],targets=new Set<number>()
  let cursor=0
  for(let i=0;i<nodes.length;i++){
    const marker=nodes[i],heading=nodes[i+1],list=nodes[i+2]
    if(marker.type!=='html'||heading?.type!=='heading'||list?.type!=='list')continue
    const match=/^<!-- chulane-page-links-v1 (([a-f0-9]{32}) (\d+) ([\d,]+)) ([a-f0-9]{64}) -->$/.exec(marker.value)
    if(!match)continue
    const end=list.position!.end.offset!
    const section=source.slice(heading.position!.start.offset!,end)
    const resolved=resolveLinkSection(db,workspace,match,section,list,source)
    for(const id of resolved.targets)targets.add(id)
    const preceding=source.slice(cursor,marker.position!.start.offset!).replace(/\n{1,2}$/,'')
    if(preceding)parts.push(preceding)
    if(resolved.writing)parts.push(resolved.writing)
    cursor=end
    // Consume only the separator following the list. Leading spaces in the next code block are meaningful.
    if(source[cursor]==='\n')cursor++
    if(source[cursor]==='\n')cursor++
    i+=2
  }
  if(!cursor)return literal
  if(cursor<source.length)parts.push(source.slice(cursor))
  return {writing:parts.join('\n\n'),targets:[...targets]}
}

/** Create a page from validated Markdown and recheck its destination at the time of insertion. */
export function createMarkdownPage(db:DatabaseSync,workspace:number,title:string,project:unknown,markdown:string){
  const destination=activeProject(db,workspace,project)
  const state=importMarkdown(markdown)
  return Number(db.prepare('INSERT INTO pages(workspace,title,project,plain,state,rev) VALUES(?,?,?,?,?,1)').run(workspace,title,destination,markdown,state).lastInsertRowid)
}

/** Import a user-selected Markdown file and restore its eligible page links in the same transaction. */
export function importMarkdownPage(db:DatabaseSync,workspace:number,title:string,project:unknown,markdown:string){
  validateMarkdownText(markdown)
  db.exec('SAVEPOINT import_markdown_page')
  try{
    // mdast measures offsets after the file signature. Slice and store the same text it parses.
    const {writing,targets}=importedWriting(db,workspace,markdown.replace(/^\uFEFF/,''))
    const page=createMarkdownPage(db,workspace,title,project,writing)
    if(targets.length)db.prepare('INSERT INTO page_links(source,target) SELECT ?,value FROM json_each(?)').run(page,JSON.stringify(targets))
    db.exec('RELEASE import_markdown_page')
    return page
  }catch(error){db.exec('ROLLBACK TO import_markdown_page; RELEASE import_markdown_page');throw error}
}

/** Allocate fresh Rivto identities, including each editable cell in an imported table. */
function importedBlock(type:string,content:string,children:Block[]=[]):Block{
  return {id:randomUUID(),type,content,children,props:{},pluginData:{},listProps:{}}
}

/** Import an outline only when each item fits a Markdown writing block followed by nested lists. */
function importList(node:Extract<ReturnType<typeof fromMarkdown>['children'][number],{type:'list'}>,markdown:string,paragraph:string):Block[]|undefined{
  if(node.ordered&&node.start!==1)return
  const offset=node.position!.start.offset!
  // CommonMark permits up to nine digits before the ordered delimiter.
  const parenthesized=node.ordered&&/^\d{1,9}\)/.test(markdown.slice(offset,offset+10))
  const items:Block[]=[]
  for(const item of node.children){
    const paragraphs:string[]=[]
    const children:Block[]=[]
    let checked:boolean|undefined
    for(const part of item.children){
      if(part.type==='list'){
        const outline=importList(part,markdown,paragraph)
        if(!outline)return
        for(const child of outline)children.push(child)
        continue
      }
      // A Rivto block displays its writing before its children. Keep interleaved source in its original order.
      if(part.type!=='paragraph'||children.length)return
      const position=part.position!
      const source=markdown.slice(position.start.offset,position.end.offset)
      const marker=/^\[([ xX])\](?:[ \t]+|(?=[\r\n]|$))/
      const match=paragraphs.length===0?marker.exec(source):null
      if(match){
        if(node.ordered)return
        checked=match[1]!==' '
      }
      let content=match?source.slice(match[0].length):source
      if(position.start.line!==position.end.line){
        // The parser removes structural indentation, including lazy continuations and nested markers.
        const [first,...rest]=part.children
        const inline=match&&first?.type==='text'?[{...first,value:first.value.replace(marker,'')},...rest]:part.children
        content=toMarkdown({...part,children:inline},markdownFormat).slice(0,-1).replace(/\r\n?/g,'\n')
      }
      paragraphs.push(content)
    }
    const block=importedBlock(paragraph,paragraphs.join('\n\n'),children)
    block.listProps=node.ordered?{type:items.length?'numbered_list':'start_numbered_list'}:checked!==undefined?{type:'checkbox',checked}:{type:'list'}
    // CommonMark starts a new list when the bullet character changes.
    const bullet=markdown[item.position!.start.offset!]
    if(parenthesized)block.listProps.markdownDelimiter=')'
    if(bullet==='+'||bullet==='*')block.listProps.markdownBullet=bullet
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
      const content=cell?toMarkdown({type:'paragraph',children:cell.children},tableMarkdownFormat).slice(0,-1):''
      return importedBlock('table-cell',content)
    })
    return importedBlock('table-row','',cells)
  })
  return importedBlock('table','',rows)
}

/** Create independent editable blocks from top-level constructs. Preserve document-wide reference definitions together. */
export function importMarkdown(markdown:string){
  const lines=markdown.replace(/\r\n?/g,'\n').split('\n')
  const nodes=fromMarkdown(markdown,markdownSyntax).children
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
      const items=importList(node,markdown,paragraph)
      if(items){
        for(const item of items)parts.push(item)
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
