/** Drive one ephemeral Codex App Server turn over the child process's private stdio connection. */
type Frame={method?:string;id?:number;params?:Record<string,unknown>}

/** The launcher owns framing, cancellation, output limits and process cleanup. */
export type StdioExchange={
  completed:()=>boolean
  initial:Frame
  receive:(line:string,send:(frame:Frame)=>void,end:()=>void)=>void
}

/** Start the model only after initialization. Only events for this thread may reach the chat. */
export function codexTurn(cwd:string,prompt:string,outputSchema:object,consume:(line:string)=>void,registerSteer?:import('./agent-environment.ts').RegisterSteer):StdioExchange{
  let thread:string|undefined,done=false
  let sequence=4
  const replies=new Map<number,(value:unknown)=>void>()
  return {
    completed:()=>done,
    initial:{id:1,method:'initialize',params:{clientInfo:{name:'chulane',version:'1'},capabilities:{experimentalApi:true}}},
    receive(line,send,end){
      if(done||!line.trim())return
      const event=JSON.parse(line)
      const reply=replies.get(event.id)
      if(reply){replies.delete(event.id);reply(event.error?false:event.result?.turnId);return}
      if(event.error)throw Error('Codex rejected its document turn')
      if(event.method&&event.id!==undefined)throw Error('Codex requested an unsupported host operation')
      if(event.id===1){
        send({method:'initialized'})
        send({id:2,method:'config/read',params:{cwd,includeLayers:false}})
      }else if(event.id===2){
        // Empty tables merge with user configuration. Disable each inherited MCP server before opening the thread.
        const config=event.result?.config
        if(!config||typeof config!=='object')throw Error('Codex could not verify its tool configuration')
        const servers=Object.fromEntries(Object.keys(config.mcp_servers??{}).map(name=>[name,{enabled:false}]))
        send({id:3,method:'thread/start',params:{cwd,approvalPolicy:'never',sandbox:'read-only',ephemeral:true,config:{mcp_servers:servers},
          environments:[],selectedCapabilityRoots:[],dynamicTools:[],modelProvider:'openai'}})
      }else if(event.id===3){
        thread=event.result?.thread?.id
        if(typeof thread!=='string'||!thread)throw Error('Codex did not open a thread')
        send({id:4,method:'turn/start',params:{threadId:thread,input:[{type:'text',text:prompt,text_elements:[]}],summary:'auto',outputSchema}})
      }else if(event.id===4&&thread&&typeof event.result?.turn?.id==='string'){
        const expectedTurnId=event.result.turn.id
        registerSteer?.(instruction=>new Promise((resolve,reject)=>{
          const id=++sequence
          const timeout=setTimeout(()=>{replies.delete(id);reject(Error('Codex did not acknowledge steering.'))},5000)
          replies.set(id,value=>{clearTimeout(timeout);if(value===false)resolve(false);else if(value===expectedTurnId)resolve(true);else reject(Error('Unexpected steering acknowledgement.'))})
          send({id,method:'turn/steer',params:{threadId:thread,expectedTurnId,input:[{type:'text',text:instruction,text_elements:[]}]}})
        }))
      }else if(thread&&event.params?.threadId===thread){
        if(event.method==='turn/completed'){
          registerSteer?.(undefined)
          if(event.params.turn?.status!=='completed')throw Error('Codex did not complete its request')
          done=true;end()
        }else consume(line)
      }
    },
  }
}
