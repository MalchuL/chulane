/** Decode Markdown files before import and validate the Unicode text accepted by the page API. */
import {decodeTextFile} from './text-file.ts'

export const markdownImportLimit=1024*1024
const sizeMessage='Markdown exceeds 1 MiB of UTF-8 text. Split it into smaller pages or attach the original file.'
const encodingMessage='Save the Markdown file as UTF-8 or UTF-16 with a byte order mark, then import it again.'

/** Apply the import budget to the writing, excluding its optional file signature. */
export function validateMarkdownText(text:string){
  const writing=text.startsWith('\uFEFF')?text.slice(1):text
  if(writing.length>markdownImportLimit||new TextEncoder().encode(writing).byteLength>markdownImportLimit)
    throw Object.assign(Error(sizeMessage),{status:413})
  if(text.includes('\0'))throw Object.assign(Error('Markdown contains a null character. Remove it and save as UTF-8, or attach the original file.'),{status:400})
  if(/[\uD800-\uDFFF]/u.test(text))throw Object.assign(Error(encodingMessage),{status:400})
}

/** Detect UTF-16 from its signature and defer stripping the signature to the shared import operation. */
export async function readMarkdownFile(file:Blob){
  // UTF-16 can use two bytes per ASCII character plus its two-byte signature.
  if(file.size>2*markdownImportLimit+2)throw Error(sizeMessage)
  const bytes=new Uint8Array(await file.arrayBuffer())
  let text:string
  try{text=decodeTextFile(bytes,{ignoreBOM:true})}
  catch{throw Error(encodingMessage)}
  validateMarkdownText(text)
  return text
}
