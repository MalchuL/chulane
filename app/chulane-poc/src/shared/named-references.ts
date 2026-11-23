/** Interpret Chulane references only in literal prose left by the GitHub-flavored Markdown parser. */
import {fromMarkdown} from 'mdast-util-from-markdown'
import {gfmFromMarkdown} from 'mdast-util-gfm'
import {gfm} from 'micromark-extension-gfm'
import {decodeString} from 'micromark-util-decode-string'

type Root=ReturnType<typeof fromMarkdown>
type Node=Root|Root['children'][number]
type Inline=Extract<Node,{type:'text'|'link'}>
export type NamedReference={kind:'page'|'tag';name:string}
export const referenceSyntax={extensions:[gfm()],mdastExtensions:[gfmFromMarkdown()]}
const tokens=/(?<![!\[\]])(?:\[\[([^\[\]\r\n]+)\]\]|\[([^\[\]\r\n]+)\])(?![\[(\]])|(?<![\p{L}\p{M}\p{N}_/#])#([\p{L}\p{M}\p{N}_-]+)/gu

/** Match source escapes against the parser's decoded text, including stripped list and quote prefixes. */
function literalText(value:string,raw:string){
  if(value===raw)return value
  const lines=raw.split(/\r\n?|\n/)
  return value.split('\n').map((line,i)=>{
    const source=lines[i]??''
    const start=decodeString(source).lastIndexOf(line)
    if(start<0)return ' '.repeat(line.length)
    const masked=source.replace(/\\[!-/:-@\[-`{-~]|&(?:#\d+|#x[\da-f]+|[a-z][\da-z]*);/gi,
      escape=>decodeString(escape).replace(/[[\]#]/g,'\0'))
    return masked.slice(start,start+line.length)
  }).join('\n')
}

/** Share the exact same recognition and exclusions between preview and committed document metadata. */
function visitReferences(tree:Root,source:string,emit:(ref:NamedReference)=>void,address?:(ref:NamedReference)=>string){
  function visit(node:Node){
    if(!('children' in node)||node.type==='link'||node.type==='linkReference')return
    for(let i=0;i<node.children.length;i++){
      const child=node.children[i]!
      if(child.type!=='text'){visit(child);continue}
      if(!/[#\[]/.test(child.value))continue
      // Rivto file macros can leave surrounding prose in synthetic text nodes without source positions.
      const raw=child.position?source.slice(child.position.start.offset,child.position.end.offset):child.value
      const pieces:Inline[]=[]
      let end=0
      for(const match of literalText(child.value,raw).matchAll(tokens)){
        const kind=match[3]?'tag':'page'
        const name=match[3]?.normalize('NFC')??(match[2]??match[1]!).trim()
        if(!name||name.length>(kind==='tag'?100:250)||/[\p{Cc}]/u.test(name))continue
        emit({kind,name})
        if(!address)continue
        const start=match.index!
        if(start>end)pieces.push({type:'text',value:child.value.slice(end,start)})
        end=start+match[0].length
        pieces.push({type:'link',url:address({kind,name}),children:[{type:'text',value:child.value.slice(start,end)}],
          data:{hProperties:{'data-chulane-reference':kind,'data-reference-name':name,tabIndex:0}}})
      }
      if(pieces.length){
        if(end<child.value.length)pieces.push({type:'text',value:child.value.slice(end)})
        node.children.splice(i,1,...pieces)
        i+=pieces.length-1
      }
    }
  }
  visit(tree)
}

/** Existing Markdown destinations and verbatim spans keep their native typing and Enter behavior. */
export function allowsReferenceCompletion(source:string,offset:number){
  let start=offset
  while(start>0&&source[start-1]==='\\')start--
  if((offset-start)%2)return false
  if(!/[`~<!]|\][(:\[]|^(?: {4}|\t)|:\/\/|\bwww\./im.test(source))return true
  function protectedAt(node:Node):boolean{
    if(!node.position||offset<node.position.start.offset!||offset>=node.position.end.offset!)return false
    if(['link','image','linkReference','imageReference','inlineCode','code','html','definition'].includes(node.type))return true
    return 'children' in node&&node.children.some(protectedAt)
  }
  if(protectedAt(fromMarkdown(source,referenceSyntax)))return false
  // Markdown only recognizes an image or link after its closing delimiter has been typed.
  const prefix=source.slice(0,offset+1)
  const destination=/\]\(([^\s]*)$/.exec(prefix)
  let closing=''
  if(destination)closing=')'.repeat(1+(destination[1]!.match(/\(/g)?.length??0))
  else if(/!\[[^\]\r\n]*$/.test(prefix))closing=']()'
  return !closing||!protectedAt(fromMarkdown(prefix+closing,referenceSyntax))
}

/** Return references from one block, whose Markdown definitions and fences are locally scoped. */
export function namedReferences(source:string){
  const result:NamedReference[]=[]
  if(/[#\[]/.test(source))visitReferences(fromMarkdown(source,referenceSyntax),source,ref=>result.push(ref))
  return result
}

/** Decorate the idle preview without writing Markdown links back into the editor or its undo history. */
export function remarkNamedReferences(workspace:number,page:number){
  const base='?'+new URLSearchParams({workspace:String(workspace),page:String(page)})
  return ()=>(tree:Root,file:{value:unknown})=>visitReferences(tree,String(file.value),()=>{},
    ref=>base+'&'+new URLSearchParams({[ref.kind==='tag'?'refTag':'refPage']:ref.name}))
}
