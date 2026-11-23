/** Track a form submission from its first event until its asynchronous save settles. */
import {useRef,useState} from 'react'

/** The ref covers a second submit before React commits the disabled controls. Errors belong to the calling form. */
export function usePendingSubmit(){
  const active=useRef(false)
  const [pending,setPending]=useState(false)
  async function run(save:()=>Promise<void>){
    if(active.current)return
    active.current=true
    setPending(true)
    try{await save()}finally{active.current=false;setPending(false)}
  }
  return {pending,run}
}
