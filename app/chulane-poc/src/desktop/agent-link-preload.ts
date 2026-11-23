/** Forward a user's activation of a web link in the agent transcript across the isolated desktop boundary. */
import {installWindowTitle} from './window-title-preload'
import {ipcRenderer} from 'electron'
import {agentWebLink} from '../shared/agent-web-link'

installWindowTitle(process.argv.includes('--chulane-server-window'))

/** Keyboard activation also produces a trusted click. Other document and application links keep their normal behavior. */
function openAgentLink(event:MouseEvent){
  if(!event.isTrusted||event.defaultPrevented||event.button!==(event.type==='auxclick'?1:0))return
  const link=event.target instanceof Element&&event.target.closest('[data-part="agent-markdown"] a[href]')
  if(!(link instanceof HTMLAnchorElement))return
  const url=agentWebLink(link.getAttribute('href'),location.href)
  if(!url)return
  event.preventDefault()
  ipcRenderer.send('agent:open-web-link',url)
}
window.addEventListener('click',openAgentLink,true)
window.addEventListener('auxclick',openAgentLink,true)
