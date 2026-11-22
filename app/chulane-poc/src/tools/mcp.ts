/** Stdio MCP entry point for DeepSeek Harness or another MCP client. No model credentials enter Chulane. */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'
import {textRange,textRangeInstructions} from '../shared/text-range.ts'
import {attachmentQuery,attachmentInstructions} from '../shared/attachment-read.ts'
import {pageCreation} from '../shared/page-draft.ts'
import {connectTools} from './operations.ts'
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
register('browse','List the immediate folders and pages in a project. Omit project to start at the root. Pass nextOffset as offset to continue.',{
  project:z.number().int().positive().nullable().optional(),offset:z.number().int().nonnegative().optional(),
},p=>({project:p.project??null,offset:p.offset??0}))
register('search','Search titles, writing, canvas labels and text attachments. A page can have several matching block links. A matching file includes its excerpt and authenticated download URL alongside the page link.',{query:z.string()},p=>p.query)
register('read_text',textRangeInstructions,textRange.shape,p=>p)
register('read_attachment',attachmentInstructions,attachmentQuery.shape,p=>p)
register('read','Read document text, canvas labels when present, its source link and ordered writing blocks with IDs for edit proposals',{id:z.number().int().positive()},p=>p.id)
register('propose_create','Draft a page for review. Optionally supply Markdown and a destination project ID. Omit the project for the workspace root.',pageCreation.partial({project:true,markdown:true}).shape,p=>p)
register('propose_rename','Ask a workspace editor to approve renaming a page',{id:z.number().int().positive(),title:z.string().min(1).max(250)},p=>p)
register('propose_edit','Request review of a writing block replacement. Copy block and before from read. For an appended paragraph, use empty block and before.',{
  id:z.number().int().positive(),block:z.string().max(1024),before:z.string().max(12000),after:z.string().max(32000),
},p=>p)
register('proposal_status','Check an existing request ID after review or reconnection. Returns its recorded status and target link.',{id:z.number().int().positive()},p=>p.id)
await server.connect(new StdioServerTransport())
