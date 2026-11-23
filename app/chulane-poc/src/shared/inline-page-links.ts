/** Store inline page references as ordinary Markdown links to stable workspace page IDs. */
import {fromMarkdown} from 'mdast-util-from-markdown'
import {referenceSyntax} from './named-references.ts'
import {toMarkdown} from 'mdast-util-to-markdown'
import {sourceHref,type DocumentTarget} from './agent.ts'

type Root=ReturnType<typeof fromMarkdown>

/** Keep punctuation in the title literal when Rivto renders this link. */
export function pageReference(workspace:number,target:DocumentTarget,title:string){
  return toMarkdown({type:'link',url:sourceHref(workspace,target),children:[{type:'text',value:title}]}).trimEnd()
}

/** Resolve the page, writing block or surface encoded by a Chulane document address. */
export function editorTarget(params:URLSearchParams):DocumentTarget|undefined{
  const page=params.get('page'),id=Number(page)
  if(!page||!/^[1-9]\d*$/.test(page)||!Number.isSafeInteger(id))return
  const block=params.get('block'),surface=params.get('view')
  return block?{id,block}:surface==='canvas'||surface==='page'?{id,surface}:{id}
}

/** Resolve Markdown against the installation reading it. Absolute links to other installations stay external. */
export function referenceTarget(href:string,workspace:number,origin:string){
  let url:URL
  try{url=new URL(href,origin+'/')}catch{return}
  if(url.origin!==origin||url.username||url.password||url.hash||(url.pathname!=='/'&&url.pathname!=='/index.html'))return
  const params=url.searchParams
  if(params.get('workspace')!==String(workspace))return
  for(const key of params.keys()){
    if(!['workspace','page','block','view'].includes(key)||params.getAll(key).length!==1)return
  }
  return editorTarget(params)
}

/** Derive backlinks from the same Markdown link usages and definitions as the rendered writing. */
export function inlinePageLinks(text:string,workspace:number,origin:string,blockLengths?:readonly number[]){
  const links:{target:number;block?:string;surface?:DocumentTarget['surface'];label:string}[]=[]
  if(!text.includes('?')||!/(?:\[|<|https?:\/\/)/i.test(text))return links
  const seen=new Set<string>()
  function scan(markdown:string){
    if(!markdown.includes('?'))return
    const definitions=new Map<string,string>()
    const usages:Extract<Root['children'][number],{type:'link'|'linkReference'}>[]=[]
    function visit(node:Root|Root['children'][number]){
      if(node.type==='definition'){
        // CommonMark gives the first definition precedence, even when it follows the link.
        if(!definitions.has(node.identifier))definitions.set(node.identifier,node.url)
      }else if(node.type==='link'||node.type==='linkReference')usages.push(node)
      else if('children' in node)node.children.forEach(visit)
    }
    visit(fromMarkdown(markdown,referenceSyntax))
    for(const node of usages){
      const url=node.type==='link'?node.url:definitions.get(node.identifier)
      const target=url&&referenceTarget(url,workspace,origin)
      if(!target)continue
      const address=sourceHref(workspace,target)
      if(seen.has(address))continue
      seen.add(address)
      const label=node.children.map(child=>'value' in child?child.value:'').join('')
      links.push({target:target.id,block:target.block,surface:target.surface,label})
    }
  }
  let start=0
  for(const length of blockLengths??[]){
    scan(text.slice(start,start+length))
    start+=length+1
  }
  scan(text.slice(start))
  return links
}
