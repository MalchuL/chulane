/** Decode each CLI's public JSONL records, keeping structured workspace actions separate from visible text. */
import type {LocalAgent} from '../shared/agent.ts'
import type {ActivityEvent} from './chat-activity.ts'

/** Read a partial leading message string, stopping before an incomplete escape or surrogate pair. */
function messagePrefix(source:string){
  if(!source.trimStart().startsWith('{'))return ''
  // A structured-output provider can emit actions first. Skip strings and nested action objects.
  let depth=0,offset=-1
  for(const token of source.matchAll(/"(?:[^"\\]|\\.)*(?:"|$)|[{}\[\]]/gs)){
    if(depth===1&&token[0]==='"message"'){
      const start=/^\s*:\s*"/.exec(source.slice(token.index+token[0].length))
      if(start){offset=token.index+token[0].length+start[0].length;break}
    }
    if(token[0]==='{'||token[0]==='[')depth++
    else if(token[0]==='}'||token[0]===']')depth--
  }
  if(offset<0)return ''
  const literal=/^(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*/.exec(source.slice(offset))![0]
  const value:string=JSON.parse('"'+literal+'"')
  return value.replace(/[\uD800-\uDBFF]$/,'')
}

/** One model step produces a single validated reply. Only its message field can stream into the answer. */
export function localReplyStream(agent:LocalAgent,step:number,publish:(delta:string)=>void,activity?:(event:ActivityEvent)=>void){
  let source='',shown='',answer:string|undefined,structuredIndex:number|undefined
  let answerItem:string|undefined
  let progress:{id:string;phase:string;source:string;shown:number}|undefined
  const summaries=new Map<string,string>()
  function update(text:string){
    if(!text.startsWith(shown)||text===shown||!text.trim())return
    if(text.length>64000)throw Error('Local agent reply exceeded its message limit')
    publish(text.slice(shown.length));shown=text
  }
  /** A partial answer can be prose or structured output. Only its user-facing text belongs in the transcript. */
  function publishProgress(item:NonNullable<typeof progress>){
    const value=item.phase==='partial_answer'&&item.source.trimStart().startsWith('{')?messagePrefix(item.source):item.source
    if(!value.trim()||value.length<=item.shown)return
    activity?.({type:item.phase==='commentary'?'progress':'commentary',key:step+'/'+item.id,text:value.slice(item.shown)})
    item.shown=value.length
  }
  function consume(line:string){
    if(!line.trim())return
    const record=JSON.parse(line)
    if(agent==='codex'){
      const params=record.params
      if(!params)return
      const item=params.item
      const isProgress=item?.phase==='commentary'||item?.phase==='partial_answer'
      if(record.method==='item/started'&&item?.type==='agentMessage'){
        if(isProgress)progress={id:item.id,phase:item.phase,source:'',shown:0}
        else{answerItem=item.id;source=''}
      }else if(record.method==='item/agentMessage/delta'&&progress&&params.itemId===progress.id&&typeof params.delta==='string'){
        progress.source+=params.delta
        publishProgress(progress)
      }else if(record.method==='item/completed'&&item?.type==='agentMessage'&&isProgress){
        publishProgress({id:item.id,phase:item.phase,source:item.text,shown:progress&&progress.id===item.id?progress.shown:0})
        activity?.({type:item.phase==='commentary'?'progress-end':'commentary-end',key:step+'/'+item.id});progress=undefined
      }else if(record.method==='item/agentMessage/delta'&&params.itemId===answerItem&&typeof params.delta==='string'){
        source+=params.delta;update(messagePrefix(source))
      }else if(record.method==='item/completed'&&item?.type==='agentMessage'){
        answer=item.text;update(messagePrefix(item.text))
      }else if(record.method==='item/reasoning/summaryTextDelta'&&typeof params.delta==='string'){
        const key=step+'/'+params.itemId+'/'+params.summaryIndex
        summaries.set(key,(summaries.get(key)??'')+params.delta)
        activity?.({type:'reasoning',key,text:params.delta})
      }else if(record.method==='item/completed'&&item?.type==='reasoning'){
        for(const [index,summary] of (item.summary??[]).entries()){
          const key=step+'/'+item.id+'/'+index,previous=summaries.get(key)??''
          if(typeof summary==='string'&&summary.startsWith(previous)&&summary.length>previous.length){
            activity?.({type:'reasoning',key,text:summary.slice(previous.length)})
          }
          activity?.({type:'reasoning-end',key})
        }
      }
    }else if(agent==='claude'){
      const event=record.stream_event??record.event
      if(record.type==='stream_event'&&event){
        const key=step+'/'+event.index
        if(event.type==='content_block_start'&&event.content_block?.name==='StructuredOutput'){
          structuredIndex=event.index;source=''
        }
        if(event.type==='content_block_delta'){
          if(event.delta?.type==='thinking_delta'&&typeof event.delta.thinking==='string')activity?.({type:'reasoning',key,text:event.delta.thinking})
          if(event.index===structuredIndex&&typeof event.delta?.partial_json==='string'){
            source+=event.delta.partial_json;update(messagePrefix(source))
          }
        }
        if(event.type==='content_block_stop'){
          activity?.({type:'reasoning-end',key})
          if(event.index===structuredIndex)structuredIndex=undefined
        }
      }
      if(record.type==='result'){
        if(record.is_error)throw Error('Claude Code request failed')
        answer=JSON.stringify(record.structured_output)
      }
    }else if((record.type==='tool_use'||record.type==='tool_result')&&typeof record.name==='string'){
      const key=step+'/hermes/'+(record.tool_call_id??record.name)
      if(record.type==='tool_use')activity?.({type:'tool-start',key,name:record.name,input:record.input})
      else activity?.({type:'tool-end',key,result:record.output,failed:record.is_error})
    }else if(record.type==='text'&&typeof record.text==='string'){
      source+=record.text;update(messagePrefix(source))
    }else if(record.type==='result'&&record.exit_code===0){
      answer=record.text
    }
  }
  return {consume,output:()=>{
    if(typeof answer!=='string')throw Error('Local agent did not return a structured reply')
    return answer
  },finish(text:string){
    if(!text.startsWith(shown))throw Error('Local agent changed its streamed reply')
    update(text)
  }}
}
