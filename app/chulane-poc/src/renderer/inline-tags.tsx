/** Complete tags and workspace references at a Rivto writing caret without taking focus from the block. */
import {createContext,useContext,useEffect,useId,useState,type ReactNode} from 'react'
import {useReadOnlyLinks} from './read-only-links'
import {Button} from './ui'
import {createPortal,flushSync} from 'react-dom'
import {usePanel} from '@chulane/rivto-react'
import {BlockDOMSelection} from '@chulane/rivto-page'
import {FileText,Hash,Plus,RotateCcw} from 'lucide-react'
import {allowsReferenceCompletion,namedReferences} from '../shared/named-references'
import {editorLinkTarget,type EditorTarget} from './editor-address'
import {pageReference} from '../shared/inline-page-links'
import type {Source,CitationTarget} from '../shared/agent'
import type {Page,Tag} from '../shared/library'

type TagChoice={name:string;id?:number;restore?:boolean}
type Choice=TagChoice & {target?:CitationTarget;label?:string}
type WorkspaceTags={namedReferences?:{source:number;name:string;target:number}[];openNamed:(source:number,kind:string,name:string)=>Promise<void>;pages:Page[];workspace:number;pageLabel:(page:Page)=>string;searchBlocks:(query:string,signal:AbortSignal)=>Promise<Source[]>;open:(target:EditorTarget)=>Promise<void>;tags:Tag[];apply?:(page:number,block:string,tag:TagChoice)=>Promise<void>;report:(error:string)=>void}
export const InlineTagsContext=createContext<WorkspaceTags|null>(null)
const surfaceClass='surface-body'
const blockContent='[data-block-content][contenteditable="plaintext-only"]'
type Token={opener:'#'|'['|'[['|'((';closing:boolean;content:HTMLElement;block:string;query:string;end:number;left:number;top:number}

/** Resolve only a complete word ending at a collapsed caret in an actual Rivto writing block. */
function readToken(target:EventTarget|null):Token|null{
  if(!(target instanceof HTMLElement)||!target.matches(blockContent))return null
  const block=target.closest<HTMLElement>('[data-block-id]')?.dataset.blockId
  const selection=target.ownerDocument.getSelection()
  if(!block||!selection?.isCollapsed||!selection.rangeCount||!target.contains(selection.anchorNode))return null
  const caret=selection.getRangeAt(0),prefix=caret.cloneRange()
  prefix.selectNodeContents(target);prefix.setEnd(caret.endContainer,caret.endOffset)
  const before=prefix.toString()
  const ref=/(?<![!\[\]])(\[\[?)([^\[\]\r\n]*)(\]?)$/.exec(before)
  const blockRef=/(?:^|\s)\(\(([^()\n]*)$/.exec(before)
  const tag=/(?<![\p{L}\p{M}\p{N}_/#])#([\p{L}\p{M}\p{N}_-]*)$/u.exec(before)
  const opener=blockRef?'((':ref?.[1]==='[['?'[[':ref?'[':'#'
  const query=blockRef?.[1]??ref?.[2]??tag?.[1]
  if(query===undefined||ref?.[3]&&opener!=='[[')return null
  if(opener==='#'&&(query.normalize('NFC').length>100||/^[\p{L}\p{M}\p{N}_-]/u.test((target.textContent??'').slice(before.length))))return null
  if(!allowsReferenceCompletion(target.textContent??'',before.length-query.length-opener.length-Number(!!ref?.[3])))return null
  const rect=caret.getBoundingClientRect()
  return {content:target,block,opener,closing:!!ref?.[3],query,end:before.length,left:rect.left,top:rect.bottom}
}

/** Keep text input, IME and selection under Rivto control until the user accepts a completion. */
export function InlineTagSurface({page,writable,checkpoint,children}:{page:number;writable:boolean;checkpoint:()=>Promise<void>;children:ReactNode}){
  const workspace=useContext(InlineTagsContext),panel=usePanel(),listId=useId()
  const [detected,setToken]=useState<Token|null>(null),[index,setIndex]=useState(0)
  const surface=useReadOnlyLinks(writable)
  const canAssign=!!workspace&&writable&&page>0
  const token=canAssign?detected:null
  useEffect(()=>{if(!canAssign)setToken(null)},[canAssign])
  // Match the server's canonical name while preserving raw token offsets for the caret.
  const query=token?.query.normalize('NFC')??''
  const referencing=token!==null&&token.opener!=='#'
  const existing=token?.opener==='#'?workspace?.tags.find(tag=>tag.name===query):undefined
  const typed:TagChoice|null=token?.opener==='#'&&query?(existing?.deleted?{name:query,restore:true}:existing??{name:query}):null
  const sourceBlock=token?.block
  const blockQuery=token?.opener==='(('?query.trim():''
  const [blockHits,setBlockHits]=useState<{query:string;ws:number;choices:Choice[]}>()
  const ws=workspace?.workspace,search=workspace?.searchBlocks
  useEffect(()=>{
    if(!blockQuery||!ws||!search)return
    const controller=new AbortController()
    const timer=setTimeout(async()=>{
      try{
        const hits=await search(blockQuery,controller.signal)
        const choices=hits.filter(hit=>hit.block&&hit.excerpt&&(hit.id!==page||hit.block!==sourceBlock)).slice(0,8).map(hit=>({
          name:hit.excerpt!,label:hit.title+' · '+hit.excerpt,target:{id:hit.id,block:hit.block}
        }))
        if(!controller.signal.aborted)setBlockHits({query:blockQuery,ws,choices})
      }catch(err){if(!controller.signal.aborted)workspace?.report((err as Error).message)}
    },150)
    return ()=>{clearTimeout(timer);controller.abort()}
  },[blockQuery,ws,search,page,sourceBlock])
  /** Keep page identity separate from the visible label, including for duplicate titles. */
  function choices():Choice[]{
    if(!token||!workspace)return []
    if(token.opener==='((')return blockHits?.query===blockQuery&&blockHits.ws===ws?blockHits.choices:[]
    const term=query.toLowerCase()
    if(referencing){
      return workspace.pages.filter(item=>!item.deleted&&
        (item.title.toLowerCase().includes(term)||'#'+item.id===query))
        .sort((a,b)=>Number(b.title===query)-Number(a.title===query))
        .slice(0,8).map(item=>({target:{id:item.id},name:item.title,label:workspace.pageLabel(item)}))
    }
    const matches=workspace.tags.filter(tag=>!tag.deleted&&tag.name!==query&&tag.name.toLowerCase().startsWith(term)).slice(0,6)
    if(!typed)return matches
    return existing?[typed,...matches]:[...matches,typed]
  }
  const candidates=choices()
  const selected=Math.min(index,candidates.length-1)
  useEffect(()=>{
    if(!token||selected<0)return
    const host=token.content
    const previous=new Map(['role','aria-autocomplete','aria-controls','aria-expanded','aria-activedescendant'].map(key=>[key,host.getAttribute(key)]))
    host.setAttribute('role','combobox');host.setAttribute('aria-autocomplete','list')
    host.setAttribute('aria-controls',listId);host.setAttribute('aria-expanded','true')
    host.setAttribute('aria-activedescendant',listId+'-'+selected)
    document.getElementById(listId+'-'+selected)?.scrollIntoView({block:'nearest'})
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
  function detect(target:EventTarget|null){setIndex(0);const next=canAssign?readToken(target):null;setToken(next)}
  async function accept(choice:Choice){
    const here=token&&readToken(token.content)
    setToken(null)
    if(!here||!workspace||here.block!==token!.block||here.end!==token!.end||here.opener!==token!.opener||here.query!==token!.query)return
    const text=panel.blocks.getBlockNode(here.block)?.content
    if(text===undefined||text!==here.content.textContent)return
    const start=here.end-here.query.length-(choice.target?here.opener.length+Number(here.closing):0)
    let after=text.slice(here.end)
    let label=choice.name
    if(choice.target){
      label=pageReference(workspace.workspace,choice.target,choice.name)
      if(here.opener==='['||here.opener==='[['){
        // Replacing a name inside existing brackets consumes the remainder of that name and its closing brackets.
        const remainder=here.closing?/^\]/:here.opener==='[['?/^[^\[\]\r\n]*\]\]?/:/^[^\[\]\r\n]*\]/
        after=after.replace(remainder,'')
        const shorthand=here.opener+choice.name+(here.opener==='['?']':']]')
        const binding=workspace.namedReferences?.find(ref=>ref.source===page&&ref.name===choice.name)
        const unique=workspace.pages.filter(item=>!item.deleted&&item.title===choice.name).length===1
        // Explicit ID links disambiguate duplicate titles and titles that contain Markdown delimiters.
        if(unique&&(!binding||binding.target===choice.target.id)&&namedReferences(shorthand)[0]?.name===choice.name)label=shorthand
      }
    }
    if(!after||/^[\p{L}\p{N}#]/u.test(after))after=' '+after
    flushSync(()=>panel.blocks.updateBlock(here.block,{content:text.slice(0,start)+label+after}))
    BlockDOMSelection.focusContent(here.content,start+label.length+Number(after.startsWith(' ')))
    await checkpoint()
    if(!choice.target)await workspace.apply?.(page,here.block,choice)
  }
  return <div key={String(writable)} ref={surface} className={surfaceClass}
    onClickCapture={e=>{
      if(!workspace||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return
      const anchor=e.target instanceof Element?e.target.closest('a[href]'):null
      if(anchor instanceof HTMLElement&&anchor.dataset.chulaneReference&&anchor.dataset.referenceName){
        e.preventDefault();e.stopPropagation()
        void workspace.openNamed(page,anchor.dataset.chulaneReference,anchor.dataset.referenceName).catch(err=>workspace.report(err.message))
        return
      }
      const target=anchor instanceof HTMLAnchorElement&&editorLinkTarget(anchor,workspace.workspace)
      if(target){e.preventDefault();e.stopPropagation();void workspace.open(target).catch(err=>workspace.report(err.message))}
    }}
    onInput={e=>{if(!(e.nativeEvent as InputEvent).isComposing)detect(e.target)}}
    onCompositionStart={()=>setToken(null)} onCompositionEnd={e=>detect(e.target)}
    onBlurCapture={()=>setToken(null)} onPointerDownCapture={e=>{if(e.currentTarget.contains(e.target as Node))setToken(null)}}
    onKeyDownCapture={e=>{
      if(!token||e.nativeEvent.isComposing||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return
      if(!candidates.length&&e.key!=='Escape')return
      if(!['ArrowDown','ArrowUp','Escape','Enter'].includes(e.key))return
      e.preventDefault();e.stopPropagation()
      if(e.key==='Escape')setToken(null)
      else if(e.key==='ArrowDown'||e.key==='ArrowUp')setIndex((selected+(e.key==='ArrowDown'?1:-1)+candidates.length)%candidates.length)
      else void accept(candidates[selected]!).catch(err=>workspace?.report(err.message))
    }}>{children}
    {token&&candidates.length>0&&createPortal(<div role="listbox" aria-label={token.opener==='(('?"Block references":referencing?"Page references":"Workspace tags"} id={listId} data-part="inline-tags" style={{
      left:Math.max(4,Math.min(token.left,window.innerWidth-212)),
      ...(token.top+40*candidates.length+12>innerHeight?{bottom:Math.max(4,innerHeight-token.top+22)}:{top:token.top+4})
    }}>{candidates.map((choice,i)=><Button variant="ghost" size="sm" type="button" tabIndex={-1} key={choice.target?choice.target.id+'/'+(choice.target.block??''):choice.name} id={listId+'-'+i} role="option" aria-selected={i===selected}
      onPointerDown={e=>{e.stopPropagation();e.preventDefault()}} onClick={()=>void accept(choice).catch(err=>workspace?.report(err.message))}>
      {choice.target?<FileText size={15}/>:choice.restore?<RotateCcw size={15}/>:choice.id?<Hash size={15}/>:<Plus size={15}/>} {choice.target?choice.label:(choice.restore?'Restore #':choice.id?'#':'Create #')+choice.name}
    </Button>)}</div>,document.body)}
  </div>
}
