/** Tag definitions, application controls and navigable source lists for the active workspace. */
import {useEffect,useRef,useState} from 'react'
import {ChevronDown,Hash,List,Plus,Table2,Trash2} from 'lucide-react'
import type {Library,Page,Tag} from '../shared/library'
import type {Source} from '../shared/agent'
import {ScrollArea} from './ui/scroll-area'
import {TagFieldTable} from './tag-table'
import {json} from './api'
import {deviceTagSources} from './offline-search'
import {Checkbox,Button,DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,Input,Label,Popover,PopoverContent,PopoverTrigger} from './ui'

type TagProps={lib:Library;ws:number;refresh:()=>Promise<Library>;report:(message:string)=>void}

type NewTagProps={action:string;suggestions:string[];submit:(name:string)=>Promise<void>;report:(message:string)=>void}
/** Enter or complete a tag name for the action offered by the current view. */
function NewTag({action,suggestions,submit,report}:NewTagProps){
  const [name,setName]=useState('')
  const [menuOpen,setMenuOpen]=useState(false)
  const input=useRef<HTMLInputElement>(null)
  const restoreInput=useRef(false)
  const query=name.trim().normalize('NFC').toLocaleLowerCase()
  const matches=suggestions.filter(value=>value.toLocaleLowerCase().includes(query))
  async function define(){
    await submit(name);setName('')
  }
  return <form data-part="define-tag" onSubmit={event=>{event.preventDefault();void define().catch(err=>report(err.message))}}>
    <Input ref={input} aria-label="Tag name" placeholder="Tag name" value={name} maxLength={101}
      onChange={event=>setName(event.target.value)} onKeyDown={event=>{
        if(event.key==='ArrowDown'&&matches.length&&!event.nativeEvent.isComposing){event.preventDefault();setMenuOpen(true)}
      }}/>
    <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild><Button type="button" size="icon-sm" variant="ghost" aria-label="Tag suggestions"
        title="Tag suggestions" disabled={!matches.length}><ChevronDown/></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Tag suggestions" data-part="tag-suggestions"
        onEscapeKeyDown={()=>{restoreInput.current=true}}
        onCloseAutoFocus={event=>{
          if(restoreInput.current){event.preventDefault();input.current?.focus();restoreInput.current=false}
        }}>
        {matches.map(value=><DropdownMenuItem key={value} onSelect={()=>{setName(value);restoreInput.current=true}}>{value}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    <Button variant="ghost" size="icon-sm" type="submit" aria-label={action} title={action} disabled={!name.trim()}><Plus/></Button>
  </form>
}

type PageTagsProps=TagProps & {page:Page;showTag:(tag:number)=>void;setPageTag:(page:Page,tag:Tag,active:boolean)=>Promise<void>}

/** Manage whole-page assignments. Inline hashtags belong to their individual writing blocks. */
export function PageTags({page,lib,ws,refresh,report,showTag,setPageTag}:PageTagsProps){
  const [pending,setPending]=useState<{tag:number;active:boolean}>()
  const write=lib.role==='editor'&&page.id>0
  const canToggle=write&&(!lib.offline||lib.offlinePageTags===true)
  const path='pages/'+page.id+'/tags?workspace='+ws
  const activeTags=lib.tags.filter(tag=>!tag.deleted)
  const assigned=new Set(lib.applications.filter(item=>item.page===page.id&&item.block==='').map(item=>item.tag))
  /** An empty block ID addresses the whole page in the workspace tag API. */
  async function add(name:string){
    await json(path,'PUT',{name,block:'',active:true})
    await refresh()
  }
  async function toggle(tag:Tag,active:boolean){
    setPending({tag:tag.id,active})
    try{await setPageTag(page,tag,active)}finally{setPending(undefined)}
  }
  return <div data-part="page-tags">
    {activeTags.filter(tag=>assigned.has(tag.id)).map(tag=><Button key={tag.id} size="sm" variant="ghost" onClick={()=>showTag(tag.id)}><span data-copyable="">#{tag.name}</span></Button>)}
    <Popover>
      <PopoverTrigger asChild><Button type="button" size="icon-sm" variant="ghost" title="Page tags" aria-label="Page tags"><Hash/></Button></PopoverTrigger>
      <PopoverContent aria-label="Page tags" data-part="tag-picker">
        {!!activeTags.length&&<ScrollArea role="region" aria-label="Available tags"><div data-part="tag-choices">{activeTags.map(tag=><Label key={tag.id}><Checkbox checked={pending?.tag===tag.id?pending.active:assigned.has(tag.id)} disabled={!canToggle} aria-disabled={!canToggle||!!pending}
          onCheckedChange={checked=>{if(!pending)void toggle(tag,checked===true).catch(err=>report(err.message))}}/><span>#{tag.name}</span></Label>)}</div></ScrollArea>}
        {!activeTags.length&&(!write||lib.offline)&&<p>{write?'Connect to define the first tag.':'No tags defined.'}</p>}
        {write&&!lib.offline&&<NewTag action="Add page tag" report={report} suggestions={activeTags.map(tag=>'#'+tag.name)} submit={add}/>}
      </PopoverContent>
    </Popover>
  </div>
}

/** Resolve block titles from current document state; hidden and trashed targets stay out of the listing. */
export function TagsView({lib,ws,refresh,report,tag,select,open}:TagProps & {tag?:Tag;select:(id?:number)=>void;open:(source:Source)=>Promise<void>}){
  const [table,setTable]=useState(false)
  const [sources,setSources]=useState<Source[]>([])
  const write=lib.role==='editor'&&!lib.offline
  const tableAvailable=!lib.offline||!!lib.tagFields
  useEffect(()=>{
    if(!tag||(table&&tableAvailable))return
    const controller=new AbortController()
    const read=lib.offline?deviceTagSources(lib,ws,tag.id,controller.signal):json('tags/'+tag.id+'/sources?workspace='+ws)
    void read.then(result=>{if(!controller.signal.aborted)setSources(result)}).catch(err=>{
      if(!controller.signal.aborted){setSources([]);report(err.message)}
    })
    return ()=>controller.abort()
  },[tag,ws,table,tableAvailable,lib.offline,lib.replica,lib.role])
  async function trash(){
    await json('tags/'+tag!.id+'?workspace='+ws,'PATCH',{deleted:true})
    await refresh();select()
  }
  return <section className="library"><div className="heading"><h1 data-copyable={tag?'':undefined}>{tag?'#'+tag.name:'Tags'}</h1>
    {tag&&tableAvailable&&<Button variant="ghost" size="icon-sm" title={table?'Show source list':'Show field table'} aria-label={table?'Show source list':'Show field table'} onClick={()=>setTable(!table)}>{table?<List/>:<Table2/>}</Button>}
    {tag&&write&&<Button variant="ghost" size="icon-sm" title="Trash tag" aria-label="Trash tag" onClick={()=>void trash().catch(err=>report(err.message))}><Trash2/></Button>}</div>
    {tag&&!tableAvailable&&<p>Reconnect once to download this workspace’s tag fields.</p>}
    {tag&&table&&tableAvailable?<TagFieldTable offline={lib.offline?lib:undefined} key={[lib.profile,lib.replica,ws,tag.id,lib.offline].join('/')} ws={ws} tag={tag} write={write} report={report} open={open}/>:tag?<div data-part="tag-sources">{sources.length===0&&<p>{lib.offline?'No tagged pages or blocks available on this device.':'No tagged pages or blocks.'}</p>}
      {sources.map(source=><a data-copyable="" key={source.id+'/'+(source.block??'')} href={'?workspace='+ws+'&page='+source.id+(source.block?'&block='+encodeURIComponent(source.block):'')}
        onClick={event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();void open(source).catch(err=>report(err.message))}}>
        {source.title}{source.block&&<small>{source.excerpt}</small>}</a>)}</div>:
      <>{write&&<NewTag action="Define tag" report={report} suggestions={lib.tags.filter(item=>!item.deleted).map(item=>'#'+item.name)} submit={async name=>{
        const {id}=await json('tags?workspace='+ws,'POST',{name});await refresh();select(id)
      }}/>}
        <div data-part="page-tags">{lib.tags.filter(item=>!item.deleted).map(item=><Button key={item.id} size="sm" variant="outline" onClick={()=>select(item.id)}><span data-copyable="">#{item.name}</span></Button>)}</div></>}
  </section>
}
