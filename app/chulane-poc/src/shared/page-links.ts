/** Read contract for the incoming and outgoing references of a workspace page, shared by all agent providers. */
import {z} from 'zod'

export const linkDirection=z.enum(['outgoing','incoming'])
export type LinkDirection=z.infer<typeof linkDirection>
export const pageLinksQuery=z.object({id:z.number().int().positive(),after:z.number().int().nonnegative().default(0),direction:linkDirection.default('outgoing')})
export type PageLinksQuery=z.output<typeof pageLinksQuery>
export type LinkedPages={entries:{id:number;title:string;day?:string}[];nextAfter:number|null}
export const pageLinksInstructions='Use outgoing to list active pages linked from a page ID. Use incoming for backlinks: which active pages reference this page, its blocks or its canvas? Each matching page appears once. Start with after 0 and pass nextAfter for the next batch. Read a returned ID to follow that link, including when pages have identical titles.'
