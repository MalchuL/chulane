/** Mount desktop chrome outside the workspace root, including sign-in, offline and older server renderers. */
import {ipcRenderer} from 'electron'

/** Native controls occupy the space outside Electron's titlebar-area rectangle. */
export function installWindowTitle(remote:boolean){
  if(!process.isMainFrame)return
  ipcRenderer.on('window:fullscreen',(_event,full:boolean)=>document.documentElement.toggleAttribute('data-window-fullscreen',full))
  window.addEventListener('DOMContentLoaded',()=>{
    const root=document.documentElement
    root.dataset.desktopWindow=process.platform
    const bar=document.createElement('header')
    bar.setAttribute('aria-label','Window title bar')
    bar.dataset.part='window-title-bar'
    const lane=document.createElement('div')
    lane.dataset.part='window-title-content'
    const mac=process.platform==='darwin'
    const brand=document.createElement(mac?'span':'button')
    brand.dataset.part='window-brand'
    // The layered mark matches Chulane's library icon. The chevron indicates the native application menu.
    brand.innerHTML='<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m3 8 9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5"/></svg><strong>Chulane</strong>'
    if(brand instanceof HTMLButtonElement){
      brand.type='button'
      brand.setAttribute('aria-label','Application menu')
      brand.setAttribute('aria-haspopup','menu')
      brand.title='Application menu'
      brand.addEventListener('click',event=>{
        if(!event.isTrusted)return
        const rect=brand.getBoundingClientRect()
        ipcRenderer.send('window:application-menu',rect.left,rect.bottom)
      })
    }
    const caption=document.createElement('span')
    caption.dataset.part='window-caption'
    const title=()=>{caption.textContent=document.title==='Chulane · Workspace'?'':document.title}
    title()
    new MutationObserver(title).observe(document.head,{subtree:true,childList:true,characterData:true})
    lane.append(brand,caption)
    if(remote){
      const server=document.createElement('span')
      server.dataset.part='window-server'
      server.textContent=location.host
      server.title=location.origin
      lane.append(server)
    }
    bar.append(lane)
    document.body.prepend(bar)
    // The older server UI may have no title-bar stylesheet. Always keep a usable drag area and menu.
    Object.assign(bar.style,{position:'sticky',top:'0',height:'var(--window-title-height, 34px)',background:'var(--caption-surface, var(--rail, #f3f3f7))',zIndex:'70'})
    Object.assign(lane.style,{display:'flex',alignItems:'center',height:'100%',marginLeft:'env(titlebar-area-x, 0px)',width:'env(titlebar-area-width, 100%)',webkitAppRegion:'drag'})
    if(!mac)brand.style.setProperty('app-region','no-drag')
    let lastPalette=''
    /** Sidebar resizing also updates root styles. Repaint the native buttons only when their colors change. */
    function colors(){
      const color=root.style.getPropertyValue('--rail')||'#f3f3f7'
      const ink=root.style.getPropertyValue('--rivto-foreground')||'#242332'
      if(color+ink===lastPalette)return
      lastPalette=color+ink
      ipcRenderer.send('window:caption-colors',color,ink)
    }
    if(!mac){
      colors()
      new MutationObserver(colors).observe(root,{attributes:true,attributeFilter:['style']})
    }
  },{once:true})
}
