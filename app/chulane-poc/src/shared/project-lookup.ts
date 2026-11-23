/** Workspace-wide project lookup shared by the external tools and the sidebar's agent adapters. */
import {z} from 'zod'

export const projectLookup=z.object({
  name:z.string().min(1).max(250).refine(value=>!!value.trim(),'Supply a project name or path fragment.'),
  match:z.enum(['exact','path']).default('exact'),
  offset:z.number().int().nonnegative().default(0),
})
export type ProjectLookup=z.output<typeof projectLookup>
export const projectLookupInstructions='Find active projects anywhere in the workspace. Use match "exact" for a case-sensitive folder name or "path" for a case-insensitive fragment of a displayed path, such as "Survey / Field". Compare the returned paths and IDs before choosing a folder. Pass nextOffset with the same name and match mode to continue.'
