/** Project a Rivto document into the same readable blocks and canvas labels for host and device search. */
import type {Block,DocumentModelImpl,ElementNode} from '@chulane/document-model'

/** Group captions live in title. Other canvas labels and existing extension text use text. */
export function canvasLabels(element:ElementNode){
  const {title,text}=element.props
  const values=element.type==='group'&&title!==text?[title,text]:[text]
  return values.filter((value):value is string=>typeof value==='string'&&value.trim().length>0)
}

/** Read the task text stored alongside its editable title. */
export function taskDescription(block:Block){
  return block.type==='todo-item'&&typeof block.props.description==='string'?block.props.description:''
}

/** Render a native list or task marker, preserving the source bullet used by imported Markdown. */
export function listMarker(block:Block,numberMarker:string){
  const {type,checked,markdownBullet}=block.listProps
  const bullet=markdownBullet==='+'||markdownBullet==='*'?markdownBullet:'-'
  if(block.type==='todo-item'||type==='checkbox'){
    const complete=block.type==='todo-item'?block.props.status==='done':checked
    return bullet+(complete?' [x] ':' [ ] ')
  }
  return type==='list'?bullet+' ':numberMarker
}

export type DocumentTextBlock={id:string;text:string;description?:string}

/** Preserve document order and stable block IDs for search citations. */
export function documentText(model:DocumentModelImpl){
  const blocks:DocumentTextBlock[]=[]
  function visit(items:Block[]){
    for(const item of items){
      const description=taskDescription(item)
      blocks.push({id:item.id,text:item.content,...(description&&{description})})
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
  return {offset,excerpt:text.slice(start,end),excerptOffset:offset-start}
}

/** Display the same bounded passage in library and offline search results. */
export function matchingExcerpt(text:string,literal:RegExp){return matchingPassage(text,literal)?.excerpt}

/** Treat punctuation as ordinary search text and preserve Unicode-aware case matching. */
export function literalQuery(query:string){return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'iu')}

type PageLabel={id:number;title:string;day?:string|null}

/** The literal search pattern leaves # and decimal IDs intact. Partial numbers must not match other page IDs. */
function matchesPageId(page:PageLabel,literal:RegExp){return literal.source==='#'+page.id}

/** Page IDs and journal dates stay searchable when an author changes the title. */
export function pageLabelMatches(page:PageLabel,literal:RegExp){
  return matchesPageId(page,literal)||literal.test(page.title)||!!(page.day&&literal.test(page.day))
}

/** Match a whole display name with the same punctuation and Unicode rules as partial search. */
export function wholeLabel(literal:RegExp){return new RegExp('^'+literal.source+'$',literal.flags)}

/** Rank a direct ID first, then exact titles and dates, exact filenames, and remaining matches in their original order. */
export function exactPageLabelsFirst<T extends PageLabel>(matches:readonly T[],literal:RegExp,filename?:(page:T)=>string|undefined):T[]{
  const exactLabel=wholeLabel(literal)
  const byId:T[]=[],exact:T[]=[],files:T[]=[],remaining:T[]=[]
  for(const page of matches){
    if(matchesPageId(page,literal))byId.push(page)
    else if(pageLabelMatches(page,exactLabel))exact.push(page)
    else if(filename&&exactLabel.test(filename(page)??''))files.push(page)
    else remaining.push(page)
  }
  return byId.concat(exact,files,remaining)
}
