/** Stdio MCP entry point for DeepSeek Harness or another MCP client. No model credentials enter Chulane. */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'
import {operation} from './operations.ts'
const server=new McpServer({name:'chulane',version:'0.1.0'})
type ToolSchema = Record<string,z.ZodType>
function register<S extends ToolSchema>(name:string,description:string,inputSchema:S,argument:(p:z.output<z.ZodObject<S>>)=>Parameters<typeof operation>[1]){
  const schema=z.object(inputSchema)
  server.registerTool(name,{description,inputSchema:schema},async input=>({
    content:[{type:'text',text:JSON.stringify(await operation(name,argument(schema.parse(input))))}]
  }))
}
register('workspaces','List available workspaces',{},()=>'')
register('projects','List projects in the configured workspace',{},()=>'')
register('search','Search document titles and writing text, returning source links',{query:z.string()},p=>p.query)
register('read','Read the text and source link for a document',{id:z.number().int().positive()},p=>p.id)
register('propose_create','Ask a workspace editor to approve creation of a page',{title:z.string().min(1).max(250)},p=>p.title)
register('propose_rename','Ask a workspace editor to approve renaming a page',{id:z.number().int().positive(),title:z.string().min(1).max(250)},p=>p)
await server.connect(new StdioServerTransport())
