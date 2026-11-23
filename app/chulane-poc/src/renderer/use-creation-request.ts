/** Bind retries from a naming form to the same creation request while its draft is open. */
import {useRef} from 'react'
import {json} from './api'
import {metadataOperationId} from './document-outbox'

/** A fresh draft or changed submission gets a new key, even if the user deliberately reuses a title. */
export function useCreationRequest(){
  const last=useRef<{signature:string;operationId:string}|null>(null)
  function reset(){last.current=null}
  function post(path:string,values:Record<string,unknown>){
    const signature=JSON.stringify([path,values])
    if(last.current?.signature!==signature)last.current={signature,operationId:metadataOperationId()}
    return json(path,'POST',{...values,operationId:last.current.operationId})
  }
  return {post,reset}
}
