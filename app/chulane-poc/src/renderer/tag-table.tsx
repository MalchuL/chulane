/** Editable tag table. TanStack orders and filters typed cells while Chulane owns document navigation and persistence. */
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {filterFns,functionalUpdate,getCoreRowModel,getFilteredRowModel,getSortedRowModel,useReactTable,type Column,type ColumnDef,type ColumnFiltersState,type FilterFn,type SortingFn,type SortingState} from '@tanstack/react-table'
import {ArrowDown,ArrowUp,ArrowUpDown,Check,CircleSlash,Columns3,RefreshCw,X} from 'lucide-react'
import type {Source} from '../shared/agent'
import {deviceTagTable} from './offline-search'
import type {Library,Tag} from '../shared/library'
import {fieldKinds,type FieldKind,type FieldValue,type TaggedRow,type TagField,type TagTable} from '../shared/tag-fields'
import {Checkbox,Button,Input,Label,Textarea,NativeSelect,NativeSelectOption,Popover,PopoverContent,PopoverTrigger} from './ui'
import {ScrollArea} from './ui/scroll-area'
import {json} from './api'

type TableProps={offline?:Library;ws:number;tag:Tag;write:boolean;report:(message:string)=>void;open:(source:Source)=>Promise<void>}
type Mutate=(route:string,method:string,data?:object,onError?:(message:string)=>void,confirmed?:(latest:TagTable)=>boolean)=>Promise<void>
type TableView={data:TagTable;columnFilters:ColumnFiltersState;sorting:SortingState}
const empty:TableView={data:{fields:[],rows:[]},columnFilters:[],sorting:[]}

/** Apply the refreshed schema and its compatible view settings together, before TanStack evaluates any rows. */
function refreshView(current:TableView,data:TagTable):TableView{
  /** A renamed field keeps its filter when its identity and value type still match. */
  function retainedField(id:string){
    const fieldId=Number(id)
    const field=data.fields.find(item=>item.id===fieldId&&item.attached)
    return field&&current.data.fields.some(old=>old.id===field.id&&old.kind===field.kind&&old.attached)?field:undefined
  }
  const columnFilters=current.columnFilters.filter(({id,value})=>{
    if(id==='source')return true
    const field=retainedField(id)
    return !!field&&(field.kind!=='choice'||value==='null'||field.options.some(option=>JSON.stringify(option)===value))
  })
  return {data,columnFilters,sorting:current.sorting.filter(({id})=>id==='source'||retainedField(id))}
}
const labels:Record<FieldKind,string>={text:'Text',number:'Number',date:'Date',checkbox:'Checkbox',choice:'Single choice'}

const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'})
const sortText:SortingFn<TaggedRow>=(a,b,id)=>collator.compare(a.getValue(id),b.getValue(id))

// Encoding distinguishes an unset cell, an unchecked box and a user-defined choice named "null".
const matchesOption:FilterFn<TaggedRow>=(row,id,filter)=>JSON.stringify(row.getValue(id)??null)===filter

/** Null selects empty cells. TanStack removes an empty input string to show all values again. */
function includingEmpty(match:FilterFn<TaggedRow>):FilterFn<TaggedRow>{
  return (row,id,value,meta)=>{
    if(value!==null)return match(row,id,value,meta)
    const cell=row.getValue(id)
    return cell==null||cell===''
  }
}

const fieldFilters={
  text:includingEmpty(filterFns.includesString),number:includingEmpty(filterFns.weakEquals),date:includingEmpty(filterFns.equals),
  checkbox:matchesOption,choice:matchesOption
} as const

/** Use the field's input vocabulary for its filter. An empty control clears the TanStack filter. */
function FieldFilter({column,field}:{column:Column<TaggedRow>;field?:TagField}){
  const label='Filter '+String(column.columnDef.header)
  const value=String(column.getFilterValue()??'')
  if(field?.kind==='choice'||field?.kind==='checkbox'){
    const options=field.kind==='choice'?field.options:[true,false]
    return <NativeSelect aria-label={label} value={value} onChange={event=>column.setFilterValue(event.target.value)}>
      <NativeSelectOption value="">All values</NativeSelectOption>
      <NativeSelectOption value="null">No value</NativeSelectOption>
      {options.map(option=><NativeSelectOption key={JSON.stringify(option)} value={JSON.stringify(option)}>
        {typeof option==='string'?option:option?'Checked':'Unchecked'}
      </NativeSelectOption>)}
    </NativeSelect>
  }
  const type=field?.kind==='number'||field?.kind==='date'?field.kind:'search'
  const emptyOnly=column.getFilterValue()===null
  const input=<Input type={type} step={type==='number'?'any':undefined} aria-label={label} placeholder={emptyOnly?'No value':'Filter…'}
    value={value} onChange={event=>column.setFilterValue(event.target.value)}/>
  if(!field)return input
  const toggleLabel='Show empty '+field.name+' values'
  return <div data-part="field-filter">{input}
    <Button type="button" variant="ghost" size="icon-sm" title={toggleLabel} aria-label={toggleLabel} aria-pressed={emptyOnly}
      onClick={()=>column.setFilterValue(emptyOnly?undefined:null)}><CircleSlash aria-hidden="true"/></Button>
  </div>
}

/** Attach a workspace definition by ID, or create and configure a definition for all tags that share it. */
function FieldSettings({fields,mutate}:{fields:TagField[];mutate:Mutate}){
  const [field,select]=useState<TagField>(),[name,setName]=useState(''),[kind,setKind]=useState<FieldKind>('text'),[options,setOptions]=useState('')
  const [error,setError]=useState(''),feedback=useId()
  function choose(id:string){
    const next=fields.find(f=>String(f.id)===id)
    select(next);setError('');setName(next?.name??'');setKind(next?.kind??'text');setOptions(next?.options.join('\n')??'')
  }
  const [busy,setBusy]=useState(false)
  async function submit(action:'save'|'detach'){
    setBusy(true);setError('')
    try{
      const route='/fields'+(field?.attached?'/'+field.id:'')
      if(action==='detach')await mutate(route,'DELETE',undefined,setError)
      else if(field&&!field.attached)await mutate(route,'POST',{field:field.id},setError)
      else await mutate(route,field?'PATCH':'POST',{
        name,kind,
        previous:field&&{name:field.name,kind:field.kind,options:field.options},
        options:kind==='choice'?options.split('\n').map(s=>s.trim()).filter(Boolean):[]
      },setError)
      choose('')
    }finally{setBusy(false)}
  }
  return <Popover><PopoverTrigger asChild><Button size="icon-sm" variant="ghost" title="Manage fields" aria-label="Manage fields"><Columns3/></Button></PopoverTrigger>
    <PopoverContent data-part="field-settings"><form aria-label="Manage tag fields" aria-describedby={error?feedback:undefined} onSubmit={e=>{e.preventDefault();void submit('save').catch(()=>{})}}>
      <Label>Workspace field<NativeSelect disabled={busy} value={field?.id??''} onChange={e=>choose(e.target.value)}><NativeSelectOption value="">Create field</NativeSelectOption>
        {fields.map(f=><NativeSelectOption key={f.id} value={f.id}>{f.name} · {labels[f.kind]} · {f.id}</NativeSelectOption>)}</NativeSelect></Label>
      {(!field||field.attached)&&<><Label>Field name<Input readOnly={busy} required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Label>
        <Label>Field type<NativeSelect disabled={busy} value={kind} onChange={e=>setKind(e.target.value as FieldKind)}>{fieldKinds.map(k=><NativeSelectOption key={k} value={k}>{labels[k]}</NativeSelectOption>)}</NativeSelect></Label>
        {kind==='choice'&&<Label>Choices, one per line<Textarea readOnly={busy} required value={options} onChange={e=>setOptions(e.target.value)}/></Label>}</>}
      {error&&<div><small role="alert" id={feedback}>{error}</small>
        {field&&<Button type="button" size="icon-sm" variant="ghost" aria-label="Load latest field definition" title="Load latest field definition"
          disabled={busy} onClick={()=>choose(String(field.id))}><RefreshCw/></Button>}</div>}
      <div>{field?.attached&&<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>void submit('detach').catch(()=>{})}>Detach field</Button>}
        <Button size="sm" disabled={busy} type="submit"><Check/>{field?(field.attached?'Save definition':'Attach field'):'Add field'}</Button></div>
    </form></PopoverContent></Popover>
}

/** Save text on blur and enumerated values on selection, preserving an in-progress draft during refreshes. */
function ValueCell({field,row,write,mutate}:{field:TagField;row:TaggedRow;write:boolean;mutate:Mutate}){
  const value=row.values[field.id]??null
  const label=field.name+' for '+(row.excerpt||row.title)
  const [editing,setEditing]=useState<{draft:FieldValue;previous:FieldValue}>(),[busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const feedbackId=useId()
  const control=useRef<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>(null)
  const conflict=editing!==undefined&&value!==editing.previous
  async function save(next:FieldValue,previous:FieldValue){
    setBusy(true);setError('')
    try{
      if(next!==previous)await mutate('/fields/'+field.id+'/value','PUT',{page:row.id,block:row.block??'',value:next,previous},setError,latest=>{
        const saved=latest.rows.find(item=>item.id===row.id&&item.block===row.block)
        // A missing row or detached column must never look like a successfully cleared value.
        return !!saved&&latest.fields.some(item=>item.id===field.id&&item.attached&&item.kind===field.kind)&&(saved.values[field.id]??null)===next
      })
      setEditing(undefined)
    }finally{setBusy(false)}
  }
  if(!write)return <>{value===null?'—':String(value)}</>
  const feedback=!busy&&(conflict||!!error)
  const displayed=editing?editing.draft:value
  const props={
    ref:(node:HTMLInputElement|HTMLSelectElement|HTMLButtonElement|null)=>{control.current=node},
    'aria-label':label,'aria-describedby':feedback?feedbackId:undefined
  }
  /** Keep a changed selection local once a conflict requires an explicit decision. */
  function choose(next:FieldValue){
    if(busy)return
    setEditing({draft:next,previous:editing?editing.previous:value})
    if(!feedback)void save(next,value).catch(()=>{})
  }
  /** Retry against the version the user reviewed, respecting the input's native validation. */
  function commit(previous:FieldValue){
    if(busy||!editing)return
    let next=editing.draft
    const input=control.current
    if(input instanceof HTMLInputElement){
      if(!input.reportValidity())return
      next=input.value===''?null:field.kind==='number'?input.valueAsNumber:input.value
    }
    void save(next,previous).catch(()=>{})
  }
  function discard(){setEditing(undefined);setError('')}
  const unavailable=field.kind==='choice'&&typeof displayed==='string'&&!field.options.includes(displayed)
  let editor
  if(field.kind==='checkbox'){
    editor=<div data-part="checkbox-cell"><Checkbox {...props} aria-disabled={busy||undefined} checked={displayed===null?'indeterminate':displayed===true}
      onCheckedChange={checked=>choose(checked===true)}/>
      {displayed!==null&&<Button variant="ghost" size="icon-sm" title={'Clear '+label} aria-label={'Clear '+label} disabled={busy} onClick={()=>{control.current?.focus();choose(null)}}><X/></Button>}</div>
  }else if(field.kind==='choice'){
    editor=<NativeSelect {...props} aria-invalid={feedback&&unavailable} aria-disabled={busy||undefined} value={String(displayed??'')} onChange={e=>choose(e.target.value||null)}>
      <NativeSelectOption value="" disabled={busy}>—</NativeSelectOption>
      {unavailable&&<NativeSelectOption value={String(displayed)} disabled>{displayed} (unavailable)</NativeSelectOption>}
      {field.options.map(v=><NativeSelectOption key={v} value={v} disabled={busy}>{v}</NativeSelectOption>)}</NativeSelect>
  }else{
    editor=<Input {...props} type={field.kind} step={field.kind==='number'?'any':undefined} readOnly={busy}
      value={String(displayed??'')} onChange={e=>setEditing({draft:e.target.value,previous:editing?editing.previous:value})}
      onBlur={()=>{if(editing&&!feedback)commit(editing.previous)}}
      onKeyDown={e=>{
        if(e.nativeEvent.isComposing)return
        if(e.key==='Enter'){
          e.preventDefault()
          if(editing&&!conflict)commit(editing.previous)
        }else if(e.key==='Escape'&&!busy)discard()
      }}/>
  }
  const message=unavailable?'This choice is no longer available. Select another option or keep the saved value.':error
  const savedLabel=value===null?'(empty)':typeof value==='boolean'?(value?'Checked':'Unchecked'):String(value)
  return <>{editor}{feedback&&<div data-part="field-conflict">
    <small id={feedbackId} role="status">{message}{message&&(conflict||unavailable)&&' '}{(conflict||unavailable)&&'Saved value: '+savedLabel}</small>
    <Button variant="ghost" size="icon-sm" title="Keep saved value" aria-label="Keep saved value" onClick={()=>{discard();control.current?.focus()}}><X/></Button>
    <Button variant="ghost" size="icon-sm" title="Save my value" aria-label="Save my value" disabled={unavailable} onClick={()=>{control.current?.focus();commit(value)}}><Check/></Button>
  </div>}</>
}

/** Render the active field definitions with stable row identity for page and block cells. */
export function TagFieldTable({offline,ws,tag,write,report,open}:TableProps){
  const [{data,columnFilters,sorting},setView]=useState(empty)
  const latest=useRef(0),viewport=useRef<HTMLDivElement>(null)
  const focusedBeforeRefresh=useRef<Element|null>(null)
  const base='tags/'+tag.id,suffix='?workspace='+ws
  const load=useCallback(async(signal?:AbortSignal)=>{
    const ticket=++latest.current
    const result:TagTable=offline?await deviceTagTable(offline,ws,tag.id,signal??new AbortController().signal):await json(base+'/table'+suffix)
    if(ticket!==latest.current)return
    const active=document.activeElement
    focusedBeforeRefresh.current=viewport.current?.contains(active)?active:null
    setView(current=>refreshView(current,result))
    return result
  },[base,suffix,offline,ws,tag.id])
  useLayoutEffect(()=>{
    // A filter or schema refresh can remove the focused cell. Resume navigation inside this table.
    const previous=focusedBeforeRefresh.current
    if(previous&&!previous.isConnected&&document.activeElement===document.body)viewport.current?.focus({preventScroll:true})
    focusedBeforeRefresh.current=null
  },[data])
  useEffect(()=>{
    const controller=new AbortController()
    void load(controller.signal).catch(err=>{if(!controller.signal.aborted)report(err.message)})
    return ()=>{controller.abort();latest.current++}
  },[tag,load,report])
  async function mutate(route:string,method:string,body?:object,onError=report,confirmed?:(latest:TagTable)=>boolean){
    try{await json(base+route+suffix,method,body);await load()}
    catch(err){
      const latest=await load().catch(()=>undefined)
      const status=(err as {status?:number}).status
      if(latest&&(status===undefined||status>=500)&&confirmed?.(latest))return
      onError((err as Error).message)
      throw err
    }
  }
  const attached=useMemo(()=>data.fields.filter(f=>f.attached),[data.fields])
  const columns=useMemo<ColumnDef<TaggedRow>[]>(()=>[
    {id:'source',header:'Source',sortingFn:sortText,filterFn:'includesString',accessorFn:r=>r.title+(r.block?' · '+r.excerpt:'')},
    ...attached.map<ColumnDef<TaggedRow>>(field=>({
      id:String(field.id),header:field.name,accessorFn:row=>row.values[field.id]??undefined,
      filterFn:fieldFilters[field.kind],
      sortingFn:field.kind==='text'||field.kind==='choice'?sortText:'basic',sortUndefined:'last'
    }))
  ],[attached])
  const table=useReactTable({columns,data:data.rows,state:{columnFilters,sorting},
    onColumnFiltersChange:update=>setView(current=>({...current,columnFilters:functionalUpdate(update,current.columnFilters)})),
    onSortingChange:update=>setView(current=>({...current,sorting:functionalUpdate(update,current.sorting)})),
    getRowId:r=>r.id+'/'+(r.block??''),getCoreRowModel:getCoreRowModel(),getFilteredRowModel:getFilteredRowModel(),getSortedRowModel:getSortedRowModel(),enableMultiSort:false,sortDescFirst:false})
  return <div data-part="tag-table">{write&&<FieldSettings fields={data.fields} mutate={mutate}/>}
    <ScrollArea horizontal ref={viewport} data-part="table-scroll" tabIndex={0} role="region" aria-label={'Fields for #'+tag.name}><table><caption>#{tag.name} fields</caption>
      <thead><tr>{table.getFlatHeaders().map(h=>{
        const order=h.column.getIsSorted(),Icon=order==='asc'?ArrowUp:order==='desc'?ArrowDown:ArrowUpDown
        const title=String(h.column.columnDef.header)
        return <th key={h.id} scope="col" aria-sort={order==='asc'?'ascending':order==='desc'?'descending':undefined}>
          <Button size="sm" variant="ghost" type="button" onClick={h.column.getToggleSortingHandler()} aria-label={'Sort by '+title}>{title}<Icon aria-hidden="true" size={14}/></Button>
          <FieldFilter column={h.column} field={attached.find(field=>String(field.id)===h.column.id)}/>
        </th>
      })}</tr></thead><tbody>{table.getRowModel().rows.map(row=><tr key={row.id}><th scope="row"><a href={suffix+'&page='+row.original.id+(row.original.block?'&block='+encodeURIComponent(row.original.block):'')} onClick={e=>{
        if(e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return
        e.preventDefault();void open(row.original).catch(err=>report(err.message))
      }}>{row.getValue<string>('source')}</a></th>
      {attached.map(field=><td key={field.id}><ValueCell key={field.kind} field={field} row={row.original} write={write} mutate={mutate}/></td>)}</tr>)}</tbody></table></ScrollArea>
    {!table.getRowModel().rows.length&&<div data-part="tag-table-empty">
      <p>{data.rows.length?'No matching tagged pages or blocks.':'No tagged pages or blocks.'}</p>
      {!!table.getState().columnFilters.length&&<Button variant="ghost" size="sm" onClick={()=>{
        table.resetColumnFilters();viewport.current?.focus({preventScroll:true})
      }}>Clear filters</Button>}
    </div>}
  </div>
}
