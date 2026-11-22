/** Project a Rivto document into the same readable blocks and canvas labels for host and device search. */
import type {Block,DocumentModelImpl,ElementNode} from '@chulane/document-model'

/** Group captions live in title. Other canvas labels and existing extension text use text. */
export function canvasLabels(element:ElementNode){
  const {title,text}=element.props
  const values=element.type==='group'&&title!==text?[title,text]:[text]
  return values.filter((value):value is string=>typeof value==='string'&&value.trim().length>0)
}

/** Preserve document order and stable block IDs for search citations. */
export function documentText(model:DocumentModelImpl){
  const blocks:{id:string;text:string}[]=[]
  function visit(items:Block[]){
    for(const item of items){
      blocks.push({id:item.id,text:item.content})
      visit(item.children)
    }
  }
  visit(model.blocks.getBlocks())
  const canvasText=model.elements.getElementNodes().flatMap(canvasLabels).join('\n')
  return {blocks,canvasText}
}

/** Keep a UTF-16 offset inside the string and before any surrogate pair it would split. */
export function textBoundary(text:string,offset:number){
  const end=Math.min(offset,text.length)
  return end>0&&/[\uD800-\uDBFF]/.test(text.charAt(end-1))&&/[\uDC00-\uDFFF]/.test(text.charAt(end))?end-1:end
}

/** A preview's length can be passed directly to a subsequent document range read. */
export function textPrefix(text:string,limit:number){return text.slice(0,textBoundary(text,limit))}

/** Locate the first literal match in UTF-16 coordinates used by the document range reader. */
export function matchingPassage(text:string,literal:RegExp){
  const offset=text.search(literal)
  if(offset<0)return
  const start=textBoundary(text,Math.max(0,offset-64))
  const end=textBoundary(text,start+320)
  return {offset,excerpt:text.slice(start,end)}
}

/** Display the same bounded passage in library and offline search results. */
export function matchingExcerpt(text:string,literal:RegExp){return matchingPassage(text,literal)?.excerpt}

/** Treat punctuation as ordinary search text and preserve Unicode-aware case matching. */
export function literalQuery(query:string){return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'iu')}
