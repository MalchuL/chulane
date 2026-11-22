/** Format the original attachment name identically on server downloads and offline cached responses. */

/** Encode the UTF-8 extended filename parameter, including punctuation reserved by RFC 8187. */
export function attachmentDisposition(name:string){
  const encoded=encodeURIComponent(name).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase())
  return "attachment; filename*=UTF-8''"+encoded
}

/** Read the UTF-8 filename written by Chulane downloads and cached uploads. */
export function attachmentFilename(response:Response){
  const encoded=response.headers.get('Content-Disposition')?.split("filename*=UTF-8''")[1]
  if(encoded){try{return decodeURIComponent(encoded)}catch{/* Ignore an invalid cached filename. */}}
}
