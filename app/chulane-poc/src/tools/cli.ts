/** Print one operation result as JSON using the profile selected for this invocation. */
import {propertyQuery} from '../shared/tag-fields.ts'
import {pageLinksQuery} from '../shared/page-links.ts'
import {journalCreation,journalDayQuery,journalReadQuery} from '../shared/page-draft.ts'
import {textRange} from '../shared/text-range.ts'
import {attachmentQuery} from '../shared/attachment-read.ts'
import {projectLookup} from '../shared/project-lookup.ts'
import {connectTools} from './operations.ts'
import {selectProfile} from './profile.ts'

try{
  const {profile,args:[cmd,...args]}=selectProfile(process.argv.slice(2))
  const operation=connectTools(profile)
  const result=await run()
  console.log(JSON.stringify(result,null,2))

  /** Keep literal title/text arguments intact while checking the numeric operands used for browsing and drafts. */
  async function run(){
    if(cmd==='read'&&args.length>1){
      const [page,position]=args,id=Number(page),offset=Number(position)
      if(args.length!==2||!/^\d+$/.test(page)||id<1||!Number.isSafeInteger(id)||!/^\d+$/.test(position)||!Number.isSafeInteger(offset))
        throw Error('Use read ID [BLOCK_OFFSET]')
      return operation(cmd,{id,offset})
    }
    if(cmd==='find_projects'){
      const [name,position='0',match]=args
      const query=projectLookup.safeParse({name,match,offset:Number(position)})
      if(!query.success||args.length>3||!/^\d+$/.test(position))throw Error('Use find_projects NAME [OFFSET] [exact|path]')
      return operation(cmd,query.data)
    }
    if(cmd==='read_properties'){
      const [id,position='0',block=null]=args
      const query=propertyQuery.safeParse({id:Number(id),block,offset:Number(position)})
      if(!query.success||args.length>3||!/^\d+$/.test(id)||!/^\d+$/.test(position))throw Error('Use read_properties PAGE_ID [OFFSET [BLOCK_ID]]')
      return operation(cmd,query.data)
    }
    if(cmd==='list_page_links'){
      const [id,...options]=args
      const after=options[0]&&/^\d+$/.test(options[0])?options.shift()!:'0'
      const query=pageLinksQuery.safeParse({id:Number(id),after:Number(after),direction:options[0]})
      if(!query.success||options.length>1||!/^\d+$/.test(id))throw Error('Use list_page_links PAGE_ID [AFTER_ID] [incoming|outgoing]')
      return operation(cmd,query.data)
    }
    if(cmd==='list_journal'){
      if(args.length>1||args[0]!==undefined&&!journalDayQuery.shape.day.safeParse(args[0]).success)throw Error('Use list_journal [BEFORE_DATE]')
      return operation(cmd,args[0])
    }
    if(cmd==='read_journal'){
      const date=journalReadQuery.shape.day.safeParse(args[0])
      if(args.length!==1||!date.success)throw Error('Use read_journal YYYY-MM-DD|today')
      return operation(cmd,date.data)
    }
    if(cmd==='read_text'){
      const [page,position='0',block=null,field]=args
      const query=textRange.safeParse({id:Number(page),block,offset:Number(position),field})
      if(!query.success||args.length>4||!/^\d+$/.test(position))throw Error('Use read_text PAGE OFFSET [BLOCK [description]]. Omit BLOCK for canvas labels.')
      return operation(cmd,query.data)
    }
    if(cmd==='read_attachment'){
      const [page,file='list',position='0']=args
      const parsed=attachmentQuery.safeParse({id:Number(page),file:file==='all'?file:file==='list'?null:Number(file),offset:Number(position)})
      if(!parsed.success||args.length>3||!/^\d+$/.test(position))throw Error('Use read_attachment PAGE [FILE_ID|list|all] [OFFSET]')
      return operation(cmd,parsed.data)
    }
    if(cmd==='browse'||cmd==='propose_draft'){
      const draft=cmd==='propose_draft'
      const usage=draft?'Use propose_draft PROJECT_ID_OR_root TITLE MARKDOWN':'Use browse [PROJECT_ID_OR_root] [OFFSET] [EXACT_NAME]'
      if(draft?args.length!==3:args.length>3)throw Error(usage)
      const folder=args[0]??'root',project=folder==='root'?null:Number(folder)
      if(project!==null&&(!/^[1-9]\d*$/.test(folder)||!Number.isSafeInteger(project)))throw Error(usage)
      if(draft)return operation('propose_create',{title:args[1],project,markdown:args[2]})
      const position=args[1]??'0',offset=Number(position)
      if(!/^\d+$/.test(position)||!Number.isSafeInteger(offset))throw Error(usage)
      return operation(cmd,{project,offset,name:args[2]})
    }
    if(cmd==='propose_journal'){
      const keyed=args[0]==='--operation-id'
      const operands=keyed?args.slice(2):args
      const [day,title,content]=operands
      const parsed=journalCreation.safeParse({day,title,content,operationId:keyed?args[1]:undefined})
      if(!parsed.success||operands.length!==3)throw Error('Use propose_journal [--operation-id 32_LOWERCASE_HEX_DIGITS] YYYY-MM-DD TITLE TEXT (up to 32000 characters)')
      return operation(cmd,parsed.data)
    }
    if(cmd==='propose_edit'){
      if(args.length!==4)throw Error('Use propose_edit ID BLOCK BEFORE AFTER. For an append, pass empty BLOCK and BEFORE arguments.')
      return operation(cmd,{id:args[0],block:args[1],before:args[2],after:args[3]})
    }
    if(cmd==='propose_rename'){
      const guarded=args[0]==='--from'
      if(guarded&&args.length<4)throw Error('Use propose_rename --from OBSERVED_TITLE ID NEW_TITLE')
      const [id,...title]=guarded?args.slice(2):args
      return operation(cmd,{id,title:title.join(' '),baseTitle:guarded?args[1]:undefined})
    }
    return operation(cmd,args.join(' '))
  }
}catch(error){console.error((error as Error).message);process.exitCode=1}
