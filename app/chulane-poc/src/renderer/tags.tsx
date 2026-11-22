/** Tag definitions, application controls and navigable source lists for the active workspace. */
import {useEffect,useId,useState} from 'react'
import {Hash,List,Plus,Table2,Trash2} from 'lucide-react'
import type {Library,Page,Tag} from '../shared/library'
import type {Source} from '../shared/agent'
import {TagFieldTable} from './tag-table'
import {json} from './api'
import {deviceTagBlocks,deviceTagSources} from './offline-search'
import {Button,Input,Label,NativeSelect,NativeSelectOption,Popover,PopoverContent,PopoverTrigger} from './ui'

type TagProps={lib:Library;ws:number;refresh:()=>Promise<Library>;report:(message:string)=>void}
type BlockChoice={id:string;text:string}

type NewTagProps=Pick<TagProps,'ws'|'refresh'|'report'> & {suggestions:string[];onDefined?:(tag:number)=>void}
/** Define an explicit workspace tag; a literal hashtag in the document remains ordinary editable text. */
function NewTag({ws,refresh,report,suggestions,onDefined}:NewTagProps){
  const [name,setName]=useState('')
  const list=useId()
  async function define(){
    const {id}=await json('tags?workspace='+ws,'POST',{name})
    setName('');await refresh();onDefined?.(id)
  }
  return <form data-part="define-tag" onSubmit={event=>{event.preventDefault();void define().catch(err=>report(err.message))}}>
    <Input aria-label="Tag name" placeholder="Tag name" list={list} value={name} maxLength={101} onChange={event=>setName(event.target.value)}/>
    <datalist id={list}>{suggestions.map(value=><option key={value} value={value}/>)}</datalist>
    <Button variant="ghost" size="icon-sm" type="submit" aria-label="Define tag" title="Define tag" disabled={!name.trim()}><Plus/></Button>
  </form>
}

/** Choose the whole page or one saved Rivto block, then toggle its explicit tag assignments. */
export function PageTags({page,lib,ws,refresh,report,checkpoint,showTag}:TagProps & {page:Page;checkpoint:()=>Promise<void>;showTag:(tag:number)=>void}){
  const [open,setOpen]=useState(false),[blocks,setBlocks]=useState<BlockChoice[]>([]),[block,setBlock]=useState('')
  const [ready,setReady]=useState(false)
  const [pending,setPending]=useState<{tag:number;block:string;active:boolean}>()
  const write=lib.role==='editor'&&!lib.offline
  const path='pages/'+page.id+'/tags',suffix='?workspace='+ws
  useEffect(()=>{
    if(!open)return
    let active=true
    async function load(){
      await checkpoint()
      const result=lib.offline?await deviceTagBlocks(lib,ws,page.id):await json(path+'/blocks'+suffix)
      if(active){setBlocks(result);setReady(true)}
    }
    void load().catch(err=>{if(active)report(err.message)})
    return ()=>{active=false}
  },[open,path,ws,lib.offline,lib.replica,lib.role])
  const activeTags=lib.tags.filter(tag=>!tag.deleted)
  const applications=lib.applications.filter(item=>item.page===page.id)
  const applied=(tag:number,target:string)=>applications.some(item=>item.tag===tag&&item.block===target)
  const text=block?blocks.find(item=>item.id===block)?.text??'':page.plain
  const suggestions=[...new Set([...activeTags.map(tag=>'#'+tag.name),...(text.normalize('NFC').match(/#[\p{L}\p{M}\p{N}_-]+/gu)??[])])]
  async function toggle(tag:number,active:boolean){
    setPending({tag,block,active})
    try{await json(path+suffix,'PUT',{tag,block,active});await refresh()}finally{setPending(undefined)}
  }
  return <div data-part="page-tags">
    {activeTags.filter(tag=>applied(tag.id,'')).map(tag=><Button key={tag.id} size="sm" variant="ghost" onClick={()=>showTag(tag.id)}>#{tag.name}</Button>)}
    <Popover open={open} onOpenChange={next=>{setReady(false);setBlock('');setOpen(next)}}>
      <PopoverTrigger asChild><Button type="button" size="icon-sm" variant="ghost" title="Page and block tags" aria-label="Page and block tags"><Hash/></Button></PopoverTrigger>
      <PopoverContent aria-label="Page and block tags" data-part="tag-picker">
        <Label>Tag target<NativeSelect aria-label="Tag target" value={block} disabled={!ready} onChange={event=>setBlock(event.target.value)}>
          <NativeSelectOption value="">Whole page</NativeSelectOption>
          {blocks.map((item,index)=><NativeSelectOption value={item.id} key={item.id}>{index+1}. {item.text||'Empty block'}</NativeSelectOption>)}
        </NativeSelect></Label>
        {activeTags.map(tag=><Label key={tag.id}><input type="checkbox" checked={pending?.tag===tag.id&&pending.block===block?pending.active:applied(tag.id,block)} disabled={!write||!ready||!!pending}
          onChange={event=>void toggle(tag.id,event.target.checked).catch(err=>report(err.message))}/>#{tag.name}</Label>)}
        {!activeTags.length&&!write&&<p>No tags defined.</p>}
        {write&&<NewTag ws={ws} refresh={refresh} report={report} suggestions={suggestions}/>}
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
  return <section className="library"><div className="heading"><h1>{tag?'#'+tag.name:'Tags'}</h1>
    {tag&&tableAvailable&&<Button variant="ghost" size="icon-sm" title={table?'Show source list':'Show field table'} aria-label={table?'Show source list':'Show field table'} onClick={()=>setTable(!table)}>{table?<List/>:<Table2/>}</Button>}
    {tag&&write&&<Button variant="ghost" size="icon-sm" title="Trash tag" aria-label="Trash tag" onClick={()=>void trash().catch(err=>report(err.message))}><Trash2/></Button>}</div>
    {tag&&!tableAvailable&&<p>Reconnect once to download this workspace’s tag fields.</p>}
    {tag&&table&&tableAvailable?<TagFieldTable offline={lib.offline?lib:undefined} key={[lib.profile,lib.replica,ws,tag.id,lib.offline].join('/')} ws={ws} tag={tag} write={write} report={report} open={open}/>:tag?<div data-part="tag-sources">{sources.length===0&&<p>{lib.offline?'No tagged pages or blocks available on this device.':'No tagged pages or blocks.'}</p>}
      {sources.map(source=><a key={source.id+'/'+(source.block??'')} href={'?workspace='+ws+'&page='+source.id+(source.block?'&block='+encodeURIComponent(source.block):'')}
        onClick={event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();void open(source).catch(err=>report(err.message))}}>
        {source.title}{source.block&&<small>{source.excerpt}</small>}</a>)}</div>:
      <>{write&&<NewTag ws={ws} refresh={refresh} report={report} suggestions={lib.tags.filter(item=>!item.deleted).map(item=>'#'+item.name)} onDefined={select}/>}
        <div data-part="page-tags">{lib.tags.filter(item=>!item.deleted).map(item=><Button key={item.id} size="sm" variant="outline" onClick={()=>select(item.id)}>#{item.name}</Button>)}</div></>}
  </section>
}
