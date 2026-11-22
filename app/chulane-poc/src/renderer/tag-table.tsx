/** Editable tag table. TanStack orders and filters typed cells while Chulane owns document navigation and persistence. */
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {getCoreRowModel,getFilteredRowModel,getSortedRowModel,useReactTable,type ColumnDef} from '@tanstack/react-table'
import {ArrowDown,ArrowUp,ArrowUpDown,Check,Columns3,X} from 'lucide-react'
import type {Source} from '../shared/agent'
import {deviceTagTable} from './offline-search'
import type {Library,Tag} from '../shared/library'
import {fieldKinds,type FieldKind,type FieldValue,type TaggedRow,type TagField,type TagTable} from '../shared/tag-fields'
import {Button,Input,Label,Popover,PopoverContent,PopoverTrigger} from './ui'
import {json} from './api'

type TableProps={offline?:Library;ws:number;tag:Tag;write:boolean;report:(message:string)=>void;open:(source:Source)=>Promise<void>}
type Mutate=(route:string,method:string,data?:object)=>Promise<void>
const empty:TagTable={fields:[],rows:[]}
const labels:Record<FieldKind,string>={text:'Text',number:'Number',date:'Date',checkbox:'Checkbox',choice:'Single choice'}

/** Attach a workspace definition by ID, or create and configure a definition for all tags that share it. */
function FieldSettings({fields,mutate}:{fields:TagField[];mutate:Mutate}){
  const [selected,select]=useState(''),[name,setName]=useState(''),[kind,setKind]=useState<FieldKind>('text'),[options,setOptions]=useState('')
  const field=fields.find(f=>String(f.id)===selected)
  function choose(id:string){
    const next=fields.find(f=>String(f.id)===id)
    select(id);setName(next?.name??'');setKind(next?.kind??'text');setOptions(next?.options.join('\n')??'')
  }
  const [busy,setBusy]=useState(false)
  async function submit(action:'save'|'detach'){
    setBusy(true)
    try{
      const route='/fields'+(field?.attached?'/'+field.id:'')
      if(action==='detach')await mutate(route,'DELETE')
      else if(field&&!field.attached)await mutate(route,'POST',{field:field.id})
      else await mutate(route,field?'PATCH':'POST',{name,kind,options:kind==='choice'?options.split('\n').map(s=>s.trim()).filter(Boolean):[]})
      choose('')
    }finally{setBusy(false)}
  }
  return <Popover><PopoverTrigger asChild><Button size="icon-sm" variant="ghost" title="Manage fields" aria-label="Manage fields"><Columns3/></Button></PopoverTrigger>
    <PopoverContent data-part="field-settings"><form onSubmit={e=>{e.preventDefault();void submit('save').catch(()=>{})}}>
      <Label>Workspace field<select value={selected} onChange={e=>choose(e.target.value)}><option value="">Create field</option>
        {fields.map(f=><option key={f.id} value={f.id}>{f.name} · {labels[f.kind]} · {f.id}</option>)}</select></Label>
      {(!field||field.attached)&&<><Label>Field name<Input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Label>
        <Label>Field type<select value={kind} onChange={e=>setKind(e.target.value as FieldKind)}>{fieldKinds.map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></Label>
        {kind==='choice'&&<Label>Choices, one per line<textarea required value={options} onChange={e=>setOptions(e.target.value)}/></Label>}</>}
      <div>{field?.attached&&<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>void submit('detach').catch(()=>{})}>Detach field</Button>}
        <Button size="sm" disabled={busy} type="submit"><Check/>{field?(field.attached?'Save definition':'Attach field'):'Add field'}</Button></div>
    </form></PopoverContent></Popover>
}

/** Save text on blur and enumerated values on selection, preserving an in-progress draft during refreshes. */
function ValueCell({field,row,write,mutate}:{field:TagField;row:TaggedRow;write:boolean;mutate:Mutate}){
  const value=row.values[field.id]??null
  const label=field.name+' for '+(row.excerpt||row.title)
  const [editing,setEditing]=useState<{text:string;previous:FieldValue}>(),[busy,setBusy]=useState(false)
  async function save(next:FieldValue,previous:FieldValue){
    setBusy(true)
    try{if(next!==previous)await mutate('/fields/'+field.id+'/value','PUT',{page:row.id,block:row.block??'',value:next,previous})}
    finally{setBusy(false);setEditing(undefined)}
  }
  if(!write)return <>{value===null?'—':String(value)}</>
  if(field.kind==='checkbox')return <div data-part="checkbox-cell"><input type="checkbox" aria-label={label} disabled={busy} checked={value===true}
    ref={node=>{if(node)node.indeterminate=value===null}} onChange={e=>void save(e.target.checked,value).catch(()=>{})}/>
    {value!==null&&<Button variant="ghost" size="icon-sm" title={'Clear '+label} aria-label={'Clear '+label} disabled={busy} onClick={()=>void save(null,value).catch(()=>{})}><X/></Button>}</div>
  if(field.kind==='choice'){
    return <select aria-label={label} disabled={busy} value={value===null?'':String(value)} onChange={e=>{
      const raw=e.target.value
      void save(raw===''?null:raw,value).catch(()=>{})
    }}><option value="">—</option>{field.options.map(v=><option key={v} value={v}>{v}</option>)}</select>
  }
  return <input aria-label={label} type={field.kind==='text'?'text':field.kind} step={field.kind==='number'?'any':undefined} readOnly={busy}
    value={editing?.text??String(value??'')} onChange={e=>setEditing({text:e.target.value,previous:editing?editing.previous:value})}
    onBlur={e=>{
      if(!editing)return
      if(e.target.validity.badInput){setEditing(undefined);return}
      const raw=editing.text
      void save(raw===''?null:field.kind==='number'?e.target.valueAsNumber:raw,editing.previous).catch(()=>{})
    }}
    onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape')setEditing(undefined)}}/>
}

/** Render the active field definitions with stable row identity for page and block cells. */
export function TagFieldTable({offline,ws,tag,write,report,open}:TableProps){
  const [data,setData]=useState<TagTable>(empty)
  const latest=useRef(0)
  const base='tags/'+tag.id,suffix='?workspace='+ws
  const load=useCallback(async(signal?:AbortSignal)=>{
    const ticket=++latest.current
    const result=offline?await deviceTagTable(offline,ws,tag.id,signal??new AbortController().signal):await json(base+'/table'+suffix)
    if(ticket===latest.current)setData(result)
  },[base,suffix,offline,ws,tag.id])
  useEffect(()=>{
    const controller=new AbortController()
    void load(controller.signal).catch(err=>{if(!controller.signal.aborted)report(err.message)})
    return ()=>{controller.abort();latest.current++}
  },[tag,load,report])
  async function mutate(route:string,method:string,body?:object){
    try{await json(base+route+suffix,method,body);await load()}
    catch(err){report((err as Error).message);void load().catch(()=>{});throw err}
  }
  const attached=useMemo(()=>data.fields.filter(f=>f.attached),[data.fields])
  const columns=useMemo<ColumnDef<TaggedRow>[]>(()=>[
    {id:'source',header:'Source',accessorFn:r=>r.title+(r.block?' · '+r.excerpt:'')},
    ...attached.map(f=>({id:String(f.id),header:f.name,accessorFn:(r:TaggedRow)=>r.values[f.id]??undefined,filterFn:'includesString' as const,sortingFn:f.kind==='text'||f.kind==='choice'?'text' as const:'basic' as const,sortUndefined:'last' as const}))
  ],[attached])
  const table=useReactTable({columns,data:data.rows,getRowId:r=>r.id+'/'+(r.block??''),getCoreRowModel:getCoreRowModel(),getFilteredRowModel:getFilteredRowModel(),getSortedRowModel:getSortedRowModel(),enableMultiSort:false})
  return <div data-part="tag-table">{write&&<FieldSettings fields={data.fields} mutate={mutate}/>}
    <div data-part="table-scroll" tabIndex={0} role="region" aria-label={'Fields for #'+tag.name}><table><caption>#{tag.name} fields</caption>
      <thead><tr>{table.getFlatHeaders().map(h=>{
        const order=h.column.getIsSorted(),Icon=order==='asc'?ArrowUp:order==='desc'?ArrowDown:ArrowUpDown
        const title=String(h.column.columnDef.header)
        return <th key={h.id} scope="col" aria-sort={order==='asc'?'ascending':order==='desc'?'descending':undefined}>
          <button type="button" onClick={h.column.getToggleSortingHandler()} aria-label={'Sort by '+title}>{title}<Icon aria-hidden="true" size={14}/></button>
          <input type="search" aria-label={'Filter '+title} placeholder="Filter…" value={String(h.column.getFilterValue()??'')} onChange={e=>h.column.setFilterValue(e.target.value)}/>
        </th>
      })}</tr></thead><tbody>{table.getRowModel().rows.map(row=><tr key={row.id}><th scope="row"><a href={suffix+'&page='+row.original.id+(row.original.block?'&block='+encodeURIComponent(row.original.block):'')} onClick={e=>{
        if(e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return
        e.preventDefault();void open(row.original).catch(err=>report(err.message))
      }}>{row.getValue<string>('source')}</a></th>
      {attached.map(field=><td key={field.id}><ValueCell field={field} row={row.original} write={write} mutate={mutate}/></td>)}</tr>)}</tbody></table></div>
    {!table.getRowModel().rows.length&&<p>No matching tagged pages or blocks.</p>}
  </div>
}
