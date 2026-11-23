/** Inspect Rivto canvas elements and apply observed, conflict-checked visual edits inside the document transaction. */
import {createHash} from 'node:crypto'
import type {DocumentModelImpl,ElementFrame,ElementNode} from '@chulane/document-model'
import {canvasValue} from '../shared/agent-canvas.ts'
import {textPrefix} from '../shared/document-text.ts'

export type CanvasElementPreview=ElementFrame & {
  id:string;type:string;text:string;truncated:boolean;version:string;startBlockId?:string;endBlockId?:string
}

/** The version guards removal as well as updates when a collaborator changes styling or membership. */
function elementVersion(node:ElementNode){
  return createHash('sha256').update(JSON.stringify(node)).digest('hex')
}

/** Expose a bounded page of canvas geometry, including the writing range of native block cards. */
export function inspectCanvas(model:DocumentModelImpl,offset:number){
  const nodes=model.elements.getElementNodes()
  const elements:CanvasElementPreview[]=[]
  let budget=32000
  for(const node of nodes.slice(offset,offset+24)){
    const label=String((node.type==='group'?node.props.title:node.props.text)??'')
    if(elements.length&&label.length>budget)break
    const text=textPrefix(label,budget)
    budget-=text.length
    elements.push({id:node.id,type:node.type,...node.frame,text,truncated:text!==label,version:elementVersion(node),
      ...(node.type==='block'&&typeof node.props.startBlockId==='string'&&{startBlockId:node.props.startBlockId}),
      ...(node.type==='block'&&typeof node.props.endBlockId==='string'&&{endBlockId:node.props.endBlockId})})
  }
  return {elements,nextOffset:offset+elements.length<nodes.length?offset+elements.length:null}
}

/** Empty IDs insert only. Existing IDs require the same element version the agent originally read. */
export function applyCanvas(model:DocumentModelImpl,id:string,before:string,after:string){
  const node=id?model.elements.getElementNode(id):undefined
  if(id&&(!node||elementVersion(node)!==JSON.parse(before).version||node.childIds.length))
    throw Object.assign(Error('The canvas element changed. Read the canvas and request a fresh edit.'),{status:409})
  if(!after){
    if(!node)throw Error('Missing canvas element')
    model.elements.removeElement(id)
    return id
  }
  const {type,text,...frame}=canvasValue.parse(JSON.parse(after))
  if(node){
    if(node.type!==type)throw Object.assign(Error('Canvas element type changed'),{status:409})
    if(type==='block'&&text)throw Object.assign(Error('Edit the writing block by ID to change its text.'),{status:400})
    model.elements.updateElement(id,type==='block'?{frame}:{frame,props:{...node.props,text}})
    return id
  }
  const zIndex=model.elements.getElementNodes().reduce((max,item)=>Math.max(max,item.zIndex),-1)+1
  if(type==='block'){
    const block=model.blocks.insertBlock({type:'paragraph',content:text})
    return model.elements.insertElement({type,props:{startBlockId:block.id,endBlockId:block.id},frame,zIndex}).id
  }
  return model.elements.insertElement({type,props:{text},frame,zIndex}).id
}
