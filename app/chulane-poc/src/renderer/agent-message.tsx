/** Render a saved or streaming assistant turn in delivery order with expandable provider activity. */
import {memo,type ReactNode} from 'react'
import Markdown,{type Components} from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remend from 'remend'
import {Brain, ListTree, Wrench} from 'lucide-react'
import type {ChatActivity,Message} from '../shared/agent'
import {ScrollArea} from './ui/scroll-area'
import {Trace,TraceLine,TraceIcon,TraceTitle,TraceDescription,TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent} from './ui/trace'

const markdownPlugins=[remarkGfm]
/** Stable component identities preserve focus on a link as later tokens arrive. */
const markdownComponents:Components={
  a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img:({alt})=><span>{alt}</span>
}

/** Repair incomplete Markdown only for the current streaming fragment. Preserve the saved source. */
const Answer=memo(function Answer({text,streaming}:{text:string;streaming:boolean}){
  return <div data-part="agent-markdown"><Markdown skipHtml remarkPlugins={markdownPlugins} components={markdownComponents}>{streaming?remend(text,{linkMode:'text-only'}):text}</Markdown></div>
})

/** Display one provider step and keep its expandable details mounted across stream updates. */
function ActivityLine({part,running}:{part:ChatActivity;running:boolean}){
  const tool=part.kind==='tool'
  const Icon=tool?Wrench:part.kind==='progress'?ListTree:Brain
  const name=part.name.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase()
  const title=tool?name.charAt(0).toUpperCase()+name.slice(1):part.name
  const state=part.state==='running'?(running?'In progress':'Interrupted'):part.state==='failed'?'Failed':'Done'
  const status=part.state==='failed'?'error':part.state==='running'&&running?'running':undefined
  const line=<TraceLine status={status}><TraceIcon><Icon/></TraceIcon><TraceTitle>{title}</TraceTitle>
    <TraceDescription>{state}</TraceDescription></TraceLine>
  if(!part.detail&&!part.input)return line
  return <TraceCollapsible><TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
    <TraceCollapsibleContent><ScrollArea role="region" aria-label={title} tabIndex={0}>
      {tool?<div data-part="tool-details"><strong>Input</strong><pre>{part.input}</pre>
        {part.detail&&<><strong>Result</strong><pre>{part.detail}</pre></>}</div>
        :part.kind==='progress'?<Answer text={part.detail} streaming={status==='running'}/>
        :<p data-part="thinking-summary">{part.detail}</p>}
    </ScrollArea></TraceCollapsibleContent>
  </TraceCollapsible>
}

/** Group adjacent steps at their recorded offset, preserving interleaved answer fragments. */
export function AgentMessage({message}:{message:Message}){
  const parts:ReactNode[]=[]
  const running=message.status==='running'
  let end=0
  let steps:ChatActivity[]=[]
  function flushSteps(){
    if(!steps.length)return
    parts.push(<Trace role="group" aria-label="Agent activity" key={'trace/'+steps[0]!.id}>
      {steps.map(part=><ActivityLine key={part.id} part={part} running={running}/>)}
    </Trace>)
    steps=[]
  }
  for(const part of message.activity??[]){
    if(part.offset>end){
      flushSteps()
      parts.push(<Answer key={'text/'+end} text={message.text.slice(end,part.offset)} streaming={false}/>)
    }
    end=part.offset
    // Older transcripts also store partial answers as commentary. Keep those messages visible.
    if(part.kind==='commentary'){
      flushSteps()
      parts.push(<Answer key={'activity/'+part.id} text={part.detail} streaming={running&&part.state==='running'}/>)
    }else steps.push(part)
  }
  flushSteps()
  if(end<message.text.length)parts.push(<Answer key={'text/'+end} text={message.text.slice(end)} streaming={running}/>)
  return <div data-part="message" data-agent-transcript="">{parts}</div>
}
