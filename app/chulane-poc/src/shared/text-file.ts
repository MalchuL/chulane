/** Decode supported writing files consistently for Markdown import, host indexing and offline search. */

/** UTF-8 is the fallback. Only an explicit byte order mark selects either UTF-16 decoder. */
export function decodeTextFile(bytes:Uint8Array,options:Pick<TextDecoderOptions,'ignoreBOM'>={}){
  let encoding='utf-8'
  if(bytes[0]===0xff&&bytes[1]===0xfe)encoding='utf-16le'
  if(bytes[0]===0xfe&&bytes[1]===0xff)encoding='utf-16be'
  return new TextDecoder(encoding,{...options,fatal:true}).decode(bytes)
}
