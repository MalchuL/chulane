/** Stdio MCP entry point for DeepSeek Harness or another MCP client. No model credentials enter Chulane. */
import {propertyInstructions,propertyQuery} from '../shared/tag-fields.ts'
import {pageLinksInstructions,pageLinksQuery} from '../shared/page-links.ts'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'
import {textRange,textRangeInstructions} from '../shared/text-range.ts'
import {attachmentQuery,attachmentInstructions} from '../shared/attachment-read.ts'
import {journalListInstructions,journalListQuery,journalDayInstructions,journalReadQuery,journalCreation,pageCreation} from '../shared/page-draft.ts'
import {connectTools} from './operations.ts'
import {projectLookup,projectLookupInstructions} from '../shared/project-lookup.ts'
import {selectProfile} from './profile.ts'
const {profile,args}=selectProfile(process.argv.slice(2))
if(args.length)throw Error('Expected only an optional --profile NAME')
const operation=connectTools(profile)
const server=new McpServer({name:'chulane',version:'0.1.0'},{instructions:'Connected to '+profile.origin+', workspace '+profile.workspace+(profile.name?', profile '+profile.name:'')+'. Changes require review in Chulane.'})
type ToolSchema = Record<string,z.ZodType>
function register<S extends ToolSchema>(name:string,description:string,inputSchema:S,argument:(p:z.output<z.ZodObject<S>>)=>Parameters<typeof operation>[1]){
  const schema=z.object(inputSchema)
  server.registerTool(name,{description,inputSchema:schema},async input=>({
    content:[{type:'text',text:JSON.stringify(await operation(name,argument(schema.parse(input))))}]
  }))
}
register('workspaces','List available workspaces',{},()=>'')
register('projects','List projects in the configured workspace',{},()=>'')
register('find_projects',projectLookupInstructions+' Each result includes a workspace link to the project.',projectLookup.shape,p=>p)
register('browse','List the immediate folders and pages in a project. Omit project to start at the root. Use name for an exact title match within this folder. Pass nextOffset and the same name to continue.',{
  project:z.number().int().positive().nullable().optional(),offset:z.number().int().nonnegative().optional(),name:z.string().min(1).max(250).optional(),
},p=>({project:p.project??null,offset:p.offset??0,name:p.name}))
register('search','Search titles, writing, canvas labels, attachment filenames and extracted text. Use #Name for exact page or block tag assignments, or tag:#123 for a numeric tag. A page can have several matching block links. Files include an authenticated download URL. Content matches include an excerpt. Filename-only matches set matchedFilename.',{query:z.string()},p=>p.query)
register('read_properties',propertyInstructions,propertyQuery.shape,p=>p)
register('list_page_links',pageLinksInstructions,pageLinksQuery.shape,p=>p)
register('list_journal',journalListInstructions,journalListQuery.shape,p=>p.before??'')
register('read_journal',journalDayInstructions,journalReadQuery.shape,p=>p.day)
register('read_text',textRangeInstructions,textRange.shape,p=>p)
register('read_attachment',attachmentInstructions,attachmentQuery.shape,p=>p)
register('read','Read document text, canvas labels and ordered writing blocks. For a bounded preview start at offset 0 and follow nextBlockOffset. Use read_text for truncated block or canvas previews. Omitting offset returns the full document.',{id:z.number().int().positive(),offset:z.number().int().nonnegative().optional()},p=>p.offset===undefined?p.id:{id:p.id,offset:p.offset})
register('propose_journal','Draft a new dated journal entry for review. Supply a workspace calendar day, title and literal writing. Retry with the same optional operationId to recover the request ID. For an existing entry, use propose_edit.',journalCreation.shape,p=>p)
register('propose_create','Draft a page for review. Optionally supply Markdown and a destination project ID. Omit the project for the workspace root.',pageCreation.partial({project:true,markdown:true}).shape,p=>p)
register('propose_rename','Ask a workspace editor to approve renaming a page. Pass the exact title you read as baseTitle. If it changed, read the page again before retrying.',{id:z.number().int().positive(),title:z.string().min(1).max(250),baseTitle:z.string().min(1).max(250).optional()},p=>p)
register('propose_edit','Request review of a writing block replacement. Copy block and before from read. For an appended paragraph, use empty block and before.',{
  id:z.number().int().positive(),block:z.string().max(1024),before:z.string().max(12000),after:z.string().max(32000),
},p=>p)
register('proposal_status','Check an existing request ID after review or reconnection. Returns its recorded status and target link. For new approved renames, titleAtApproval is the effective title and title is the requested title.',{id:z.number().int().positive()},p=>p.id)
await server.connect(new StdioServerTransport())
