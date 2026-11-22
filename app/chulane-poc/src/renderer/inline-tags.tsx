/** Complete a hashtag at the writing caret and assign the corresponding workspace tag to that Rivto block. */
import {createContext,useContext,useEffect,useId,useState,type ReactNode} from 'react'
import {createPortal,flushSync} from 'react-dom'
import {usePanel} from '@chulane/rivto-react'
import {BlockDOMSelection} from '@chulane/rivto-page'
import {Hash,Plus,RotateCcw} from 'lucide-react'
import type {Tag} from '../shared/library'

type TagChoice={name:string;id?:number;restore?:boolean}
type WorkspaceTags={tags:Tag[];apply:(page:number,block:string,tag:TagChoice)=>Promise<void>;report:(error:string)=>void}
export const InlineTagsContext=createContext<WorkspaceTags|null>(null)
const surfaceClass='surface-body'
const blockContent='[data-block-content][contenteditable="plaintext-only"]'
type Token={content:HTMLElement;block:string;query:string;end:number;left:number;top:number}

/** Resolve only a complete word ending at a collapsed caret in an actual Rivto writing block. */
function readToken(target:EventTarget|null):Token|null{
  if(!(target instanceof HTMLElement)||!target.matches(blockContent))return null
  const block=target.closest<HTMLElement>('[data-block-id]')?.dataset.blockId
  const selection=target.ownerDocument.getSelection()
  if(!block||!selection?.isCollapsed||!selection.rangeCount||!target.contains(selection.anchorNode))return null
  const caret=selection.getRangeAt(0),prefix=caret.cloneRange()
  prefix.selectNodeContents(target);prefix.setEnd(caret.endContainer,caret.endOffset)
  const before=prefix.toString(),match=/(?:^|\s)#([\p{L}\p{M}\p{N}_-]+)$/u.exec(before)
  if(!match||match[1].normalize('NFC').length>100||/^[\p{L}\p{M}\p{N}_-]/u.test((target.textContent??'').slice(before.length)))return null
  const rect=caret.getBoundingClientRect()
  return {content:target,block,query:match[1],end:before.length,left:rect.left,top:rect.bottom}
}

/** Keep text input, IME and selection under Rivto control until the user accepts a completion. */
export function InlineTagSurface({page,writable,checkpoint,children}:{page:number;writable:boolean;checkpoint:()=>Promise<void>;children:ReactNode}){
  const workspace=useContext(InlineTagsContext),panel=usePanel(),listId=useId()
  const [token,setToken]=useState<Token|null>(null),[index,setIndex]=useState(0)
  // Match the server's canonical name while preserving raw token offsets for the caret.
  const query=token?.query.normalize('NFC')??''
  const existing=workspace?.tags.find(tag=>tag.name===query)
  const typed:TagChoice|null=token?(existing?.deleted?{name:query,restore:true}:existing??{name:query}):null
  const candidates:TagChoice[]=token&&workspace?workspace.tags.filter(tag=>!tag.deleted&&tag.name!==query&&tag.name.toLowerCase().startsWith(query.toLowerCase())).slice(0,6):[]
  if(typed){
    if(existing)candidates.unshift(typed)
    else candidates.push(typed)
  }
  const selected=Math.min(index,candidates.length-1)
  useEffect(()=>{
    if(!token)return
    const host=token.content
    const previous=new Map(['role','aria-autocomplete','aria-controls','aria-expanded','aria-activedescendant'].map(key=>[key,host.getAttribute(key)]))
    host.setAttribute('role','combobox');host.setAttribute('aria-autocomplete','list')
    host.setAttribute('aria-controls',listId);host.setAttribute('aria-expanded','true')
    host.setAttribute('aria-activedescendant',listId+'-'+selected)
    function selectionChanged(){
      const now=readToken(host)
      if(!now||now.end!==token!.end||now.query!==token!.query)setToken(current=>current===token?null:current)
    }
    function reposition(){
      const now=readToken(host)
      if(!now||now.end!==token!.end||now.query!==token!.query||now.top<0||now.top>window.innerHeight)setToken(null)
      else if(now.left!==token!.left||now.top!==token!.top)setToken(now)
    }
    document.addEventListener('selectionchange',selectionChanged)
    window.addEventListener('scroll',reposition,true);window.addEventListener('resize',reposition)
    return ()=>{
      document.removeEventListener('selectionchange',selectionChanged)
      window.removeEventListener('scroll',reposition,true);window.removeEventListener('resize',reposition)
      for(const [key,value] of previous){if(value===null)host.removeAttribute(key);else host.setAttribute(key,value)}
    }
  },[token,selected,listId])
  function detect(target:EventTarget|null){setIndex(0);setToken(writable&&workspace&&page>0?readToken(target):null)}
  async function accept(choice:TagChoice){
    const here=token&&readToken(token.content)
    setToken(null)
    if(!here||!workspace||here.block!==token!.block||here.end!==token!.end||here.query!==token!.query)return
    const text=panel.blocks.getBlockNode(here.block)?.content
    if(text===undefined||text!==here.content.textContent)return
    const start=here.end-here.query.length,after=text.slice(here.end)
    const replacement=choice.name+(after.startsWith(' ')?'':' ')
    flushSync(()=>panel.blocks.updateBlock(here.block,{content:text.slice(0,start)+replacement+after}))
    BlockDOMSelection.focusContent(here.content,start+choice.name.length+1)
    await checkpoint()
    await workspace.apply(page,here.block,choice)
  }
  return <div className={surfaceClass} inert={!writable}
    onInput={e=>{if(!(e.nativeEvent as InputEvent).isComposing)detect(e.target)}}
    onCompositionStart={()=>setToken(null)} onCompositionEnd={e=>detect(e.target)}
    onBlurCapture={()=>setToken(null)} onPointerDownCapture={e=>{if(e.currentTarget.contains(e.target as Node))setToken(null)}}
    onKeyDownCapture={e=>{
      if(!token||!typed||e.nativeEvent.isComposing||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return
      if(!['ArrowDown','ArrowUp','Escape','Enter',' '].includes(e.key))return
      e.preventDefault();e.stopPropagation()
      if(e.key==='Escape')setToken(null)
      else if(e.key==='ArrowDown'||e.key==='ArrowUp')setIndex((selected+(e.key==='ArrowDown'?1:-1)+candidates.length)%candidates.length)
      else void accept(e.key===' '?typed:candidates[selected]!).catch(err=>workspace?.report(err.message))
    }}>{children}
    {token&&createPortal(<div role="listbox" aria-label="Workspace tags" id={listId} data-part="inline-tags" style={{
      left:Math.max(4,Math.min(token.left,window.innerWidth-212)),
      ...(token.top+40*candidates.length+12>innerHeight?{bottom:Math.max(4,innerHeight-token.top+22)}:{top:token.top+4})
    }}>{candidates.map((choice,i)=><button type="button" tabIndex={-1} key={choice.name} id={listId+'-'+i} role="option" aria-selected={i===selected}
      onPointerDown={e=>{e.stopPropagation();e.preventDefault()}} onClick={()=>void accept(choice).catch(err=>workspace?.report(err.message))}>
      {choice.restore?<RotateCcw size={15}/>:choice.id?<Hash size={15}/>:<Plus size={15}/>} {choice.restore?'Restore #':choice.id?'#':'Create #'}{choice.name}
    </button>)}</div>,document.body)}
  </div>
}
