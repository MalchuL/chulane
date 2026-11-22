/** Input and review contracts for creating a Markdown page through an authenticated agent. */
import {z} from 'zod'

export const pageCreation=z.object({title:z.string().max(250).trim().min(1),project:z.number().int().positive().nullable(),markdown:z.string().max(32000)})
export type PageCreation=z.infer<typeof pageCreation>
export type ReviewedPageDraft=Omit<PageCreation,'title'> & {projectName:string|null;reviewedPath?:string}
