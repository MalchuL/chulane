/** Recognize explicit web destinations in agent Markdown before resolving relative document references. */
export function agentWebLink(href:unknown,base:string){
  if(typeof href!=='string'||!/^(?:https?:)?\/\//i.test(href))return
  const url=URL.parse(href,base)
  if(url&&(url.protocol==='https:'||url.protocol==='http:')&&!url.username&&!url.password)return url.href
}
