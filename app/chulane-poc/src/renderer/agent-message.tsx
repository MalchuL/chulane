/** Render a saved or streaming assistant turn in delivery order with expandable provider activity. */
import {memo,type ReactNode} from 'react'
import Markdown,{type Components} from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remend from 'remend'
import type {Message} from '../shared/agent'
import {Disclosure} from './ui/disclosure'

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

/** Keep each disclosure mounted as more tokens arrive so a reader controls its expanded state. */
export function AgentMessage({message}:{message:Message}){
  const parts:ReactNode[]=[]
  const running=message.status==='running'
  let end=0
  for(const part of message.activity??[]){
    if(part.offset>end)parts.push(<Answer key={'text/'+end} text={message.text.slice(end,part.offset)} streaming={false}/>)
    end=part.offset
    if(part.kind==='commentary'){
      parts.push(<Answer key={'activity/'+part.id} text={part.detail} streaming={running&&part.state==='running'}/>)
      continue
    }
    const state=part.state==='running'?(running?'In progress':'Interrupted'):part.state==='done'?'Done':'Failed'
    const tool=part.name.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase()
    const title=part.kind==='tool'?tool.charAt(0).toUpperCase()+tool.slice(1)+' · '+state:'Thinking'
    parts.push(<Disclosure key={'activity/'+part.id} label={title}>
      {part.kind==='tool'?<div data-part="tool-details"><strong>Input</strong><pre>{part.input}</pre>
        {part.detail&&<><strong>Result</strong><pre>{part.detail}</pre></>}</div>:<p data-part="thinking-summary">{part.detail}</p>}
    </Disclosure>)
  }
  if(end<message.text.length)parts.push(<Answer key={'text/'+end} text={message.text.slice(end)} streaming={running}/>)
  return <div data-part="message" data-agent-transcript="">{parts}</div>
}
