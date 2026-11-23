/** Record bounded user-visible provider events at their position in the answer. Never persist provider envelopes. */
import type {DatabaseSync} from 'node:sqlite'
import type {ChatActivity} from '../shared/agent.ts'

export type ActivityEvent=
  | {type:'reasoning'|'commentary'|'progress';key:string;text:string}
  | {type:'reasoning-end'|'commentary-end'|'progress-end';key:string}
  | {type:'tool-start';key:string;name:string;input:unknown}
  | {type:'tool-end';key:string;result?:unknown;failed?:boolean}

/** Keep large tool returns readable without copying entire documents into the transcript. */
function preview(value:unknown){
  const text=typeof value==='string'?value:JSON.stringify(value,null,2)??''
  return text.length>4096?text.slice(0,4096)+'…':text
}

/** Assign turn-local IDs so parallel calls and repeated tool names update their own disclosures. */
export function chatActivity(db:DatabaseSync,message:number,notify:(part:ChatActivity,detailOffset?:number)=>void){
  const open=new Map<string,ChatActivity>()
  let count=0
  const save=db.prepare('UPDATE chat_messages SET activity=json_set(activity,?,json(?)) WHERE id=?')
  return (event:ActivityEvent,offset:number)=>{
    // Start, delta and end records for the same activity share a kind and provider key.
    const key=event.type.split('-')[0]+'/'+event.key
    let part=open.get(key)
    if(!part){
      if(count>=128||(!('text' in event)&&event.type!=='tool-start'))return
      const kind=event.type==='tool-start'?'tool':event.type
      part={id:count++,offset,revision:0,kind,state:'running',detail:'',
        name:event.type==='tool-start'?event.name:kind==='reasoning'?'Thinking':'Agent update',input:event.type==='tool-start'?preview(event.input):''}
      open.set(key,part)
    }
    let detailOffset:number|undefined
    if('text' in event){
      if(part.detail.length>=16000)return
      detailOffset=part.detail.length
      part.detail+=event.text.slice(0,16000-part.detail.length)
    }else if(event.type!=='tool-start'){
      if(event.type==='tool-end')part.detail=event.failed?'Tool call failed.':preview(event.result)
      part.state=event.type==='tool-end'&&event.failed?'failed':'done'
      open.delete(key)
    }
    part.revision++
    save.run('$['+part.id+']',JSON.stringify(part),message)
    // Stream just the new summary text. The closing event and history reads carry the complete part.
    if(detailOffset!==undefined)notify({...part,detail:part.detail.slice(detailOffset)},detailOffset)
    else notify(part)
  }
}
