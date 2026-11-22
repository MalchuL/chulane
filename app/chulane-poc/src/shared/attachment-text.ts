/** Extract and cite the same UTF-8 attachment text on the server and on offline devices. */
export const tabularFormats=['csv','tsv']
export const attachmentFormats=['txt','md','markdown',...tabularFormats]
const utf8=new TextDecoder('utf-8',{fatal:true})

/** Select text formats before reading cached attachment bodies. */
export function supportsAttachmentText(name:string){
  return attachmentFormats.some(extension=>name.toLowerCase().endsWith('.'+extension))
}

/** Accept UTF-8 writing files. Unsupported formats and binary data still upload and download normally. */
export function attachmentText(name:string,bytes:Uint8Array):string|null{
  if(!supportsAttachmentText(name))return null
  try{
    const text=utf8.decode(bytes)
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)?null:text
  }catch{return null}
}

/** Return the search excerpt and the Unicode code-point offset accepted by the attachment reader. */
export function attachmentExcerpt(text:string,literal:RegExp){
  const index=text.search(literal)
  if(index<0)return
  // RegExp reports UTF-16 indices. SQLite substr advances by Unicode code points.
  let matchOffset=index
  const firstSurrogate=text.slice(0,index).search(/[\uD800-\uDBFF]/)
  if(firstSurrogate>=0){
    for(let pos=firstSurrogate;pos<index;pos++){
      if(text.codePointAt(pos)!>0xffff){matchOffset--;pos++}
    }
  }
  let start=Math.max(0,index-80)
  if(start>0&&text.charCodeAt(start)>=0xdc00&&text.charCodeAt(start)<=0xdfff)start--
  let end=Math.min(text.length,start+320)
  if(end<text.length&&text.charCodeAt(end)>=0xdc00&&text.charCodeAt(end)<=0xdfff)end--
  return {excerpt:text.slice(start,end),matchOffset}
}
