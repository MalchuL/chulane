/** Print one operation result as JSON using the profile selected for this invocation. */
import {textRange} from '../shared/text-range.ts'
import {attachmentQuery} from '../shared/attachment-read.ts'
import {connectTools} from './operations.ts'
import {selectProfile} from './profile.ts'

try{
  const {profile,args:[cmd,...args]}=selectProfile(process.argv.slice(2))
  const operation=connectTools(profile)
  const result=await run()
  console.log(JSON.stringify(result,null,2))

  /** Keep literal title/text arguments intact while checking the numeric operands used for browsing and drafts. */
  async function run(){
    if(cmd==='read_text'){
      const [page,position='0',block=null]=args
      const query=textRange.safeParse({id:Number(page),block,offset:Number(position)})
      if(!query.success||args.length>3||!/^\d+$/.test(position))throw Error('Use read_text PAGE OFFSET [BLOCK]. Omit BLOCK for canvas labels.')
      return operation(cmd,query.data)
    }
    if(cmd==='read_attachment'){
      const [page,file='list',position='0']=args
      const parsed=attachmentQuery.safeParse({id:Number(page),file:file==='list'?null:Number(file),offset:Number(position)})
      if(!parsed.success||args.length>3||!/^\d+$/.test(position))throw Error('Use read_attachment PAGE [FILE_OR_list] [OFFSET]')
      return operation(cmd,parsed.data)
    }
    if(cmd==='browse'||cmd==='propose_draft'){
      const draft=cmd==='propose_draft'
      const usage=draft?'Use propose_draft PROJECT_ID_OR_root TITLE MARKDOWN':'Use browse [PROJECT_ID_OR_root] [OFFSET]'
      if(draft?args.length!==3:args.length>2)throw Error(usage)
      const folder=args[0]??'root',project=folder==='root'?null:Number(folder)
      if(project!==null&&(!/^[1-9]\d*$/.test(folder)||!Number.isSafeInteger(project)))throw Error(usage)
      if(draft)return operation('propose_create',{title:args[1],project,markdown:args[2]})
      const position=args[1]??'0',offset=Number(position)
      if(!/^\d+$/.test(position)||!Number.isSafeInteger(offset))throw Error(usage)
      return operation(cmd,{project,offset})
    }
    if(cmd==='propose_edit'){
      if(args.length!==4)throw Error('Use propose_edit ID BLOCK BEFORE AFTER. For an append, pass empty BLOCK and BEFORE arguments.')
      return operation(cmd,{id:Number(args[0]),block:args[1],before:args[2],after:args[3]})
    }
    if(cmd==='propose_rename')return operation(cmd,{id:Number(args[0]),title:args.slice(1).join(' ')})
    return operation(cmd,args.join(' '))
  }
}catch(error){console.error((error as Error).message);process.exitCode=1}
