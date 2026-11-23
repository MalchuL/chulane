/** Hand web links from the agent transcript to the OS browser for this workspace window. */
import {shell,type WebContents} from 'electron'
import {agentWebLink} from '../shared/agent-web-link'

/** Accept only the connected main frame. Keep popup and arbitrary protocol handling outside this IPC channel. */
export function mountAgentWebLinks(contents:WebContents,origin:string){
  contents.ipc.on('agent:open-web-link',(event,href:unknown)=>{
    const frame=event.senderFrame
    if(!frame||frame!==contents.mainFrame||URL.parse(frame.url)?.origin!==origin)return
    const url=agentWebLink(href,origin)
    if(url)void shell.openExternal(url).catch(()=>console.warn('Could not open the agent link in the default browser.'))
  })
}
