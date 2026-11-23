/** Offer native text selection for a viewer of a Rivto surface whose editing controls are inert. */
import {useId,useRef,useState} from 'react'
import {Check,Copy,TextSelect} from 'lucide-react'
import {resolveBlockListNumbers} from '@chulane/rivto-react/list-numbers'
import type {Block,DocumentModelImpl} from '@chulane/document-model'
import {canvasLabels,listMarker,taskDescription} from '../shared/document-text'
import {Button,Label,Popover,PopoverContent,PopoverTrigger,Textarea} from './ui'

/** Copy the outline in display order, with list numbers scoped to each group of siblings. */
function outlineText(model:DocumentModelImpl){
  /** Keep tabs and multiline outlines inside the cell that owns them when pasted into a sheet. */
  function cellText(cell:Block){
    const parts:string[]=[]
    visit([cell],'',parts)
    const value=parts.join('\n')
    return /["\t\r\n]/.test(value)?'"'+value.replaceAll('"','""')+'"':value
  }
  /** Append ordinary blocks in outline order and native table rows in column order. */
  function visit(siblings:Block[],indent:string,lines:string[]){
    const numbers=resolveBlockListNumbers(siblings)
    for(const block of siblings){
      if(block.type==='table-row'&&!block.content&&!block.listProps.type&&block.children.every(cell=>cell.type==='table-cell')){
        lines.push(block.children.map(cellText).join('\t'))
        continue
      }
      const number=numbers.get(block.id)
      const marker=block.type==='todo-item'&&block.props.status==='doing'
        ?'- [in progress] ':listMarker(block,number===undefined?'':number+'. ')
      const description=taskDescription(block)
      const content=description?block.content+'\n'+description:block.content
      const continuation=indent+' '.repeat(marker.length)
      if(block.type!=='table'||content||marker)lines.push(indent+marker+content.replace(/\n(?=[^\n])/g,'\n'+continuation))
      if(block.children.length)visit(block.children,indent+'  ',lines)
    }
  }
  const lines:string[]=[]
  visit(model.blocks.getBlocks(),'',lines)
  const canvas=model.elements.getElementNodes().flatMap(canvasLabels)
  return [lines.join('\n'),...canvas].filter(Boolean).join('\n')
}

/** Read the mounted replica on open. Concurrent edits must not disturb an active text selection. */
export function DocumentTextSelection({model}:{model:DocumentModelImpl}){
  const [snapshot,setSnapshot]=useState<string|null>(null)
  const [feedback,setFeedback]=useState('')
  const input=useRef<HTMLTextAreaElement>(null)
  const id=useId()
  function show(open:boolean){
    setFeedback('')
    if(!open){setSnapshot(null);return}
    setSnapshot(outlineText(model))
  }
  /** Copy the visible snapshot. A denied write leaves it selected for the native Copy command. */
  async function copyAll(){
    const field=input.current
    if(!field)return
    try{
      await navigator.clipboard.writeText(field.value)
      if(input.current===field)setFeedback('Copied')
    }catch{
      if(input.current!==field)return
      field.focus({preventScroll:true})
      field.select()
      setFeedback('Use the system Copy command')
    }
  }
  return <Popover open={snapshot!==null} onOpenChange={show}>
    <PopoverTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Select document text" title="Select document text"><TextSelect/></Button></PopoverTrigger>
    <PopoverContent data-part="document-selection" aria-label="Select document text" align="end" collisionPadding={8}
      onOpenAutoFocus={event=>{event.preventDefault();input.current?.focus({preventScroll:true});input.current?.select()}}>
      <header><Label htmlFor={id}>Document text</Label><small role="status">{feedback}</small>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Copy all text" title="Copy all text" onClick={copyAll}>
          {feedback==='Copied'?<Check aria-hidden="true"/>:<Copy aria-hidden="true"/>}
        </Button>
      </header>
      <Textarea id={id} ref={input} readOnly value={snapshot??''}/>
    </PopoverContent>
  </Popover>
}
