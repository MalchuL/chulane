/** Shared listing and passage contracts for the sidebar, HTTP service and authenticated tool clients. */
import {z} from 'zod'

export const attachmentQuery=z.object({id:z.number().int().positive(),file:z.union([z.number().int().positive(),z.literal('all')]).nullable(),offset:z.number().int().nonnegative()})
export const attachmentInstructions='Use a page ID with file "all" to list every attachment and whether its text is readable. Use file null to list only readable attachments. Supply a readable file ID from the list or a search result to read its contents. A filename-only match can be downloaded even when no readable text exists. To revisit the last cited passage of a file, use its readOffset when available. Use the attachment matchOffset from search to start at a matching passage, or start at offset 0. Follow nextOffset for more.'
export type AttachmentQuery=z.infer<typeof attachmentQuery>

export type AttachmentRead=
  | {files:{id:number;name:string;readable?:boolean}[];nextOffset:number|null}
  | {title:string;name:string;text:string;nextOffset:number|null}
