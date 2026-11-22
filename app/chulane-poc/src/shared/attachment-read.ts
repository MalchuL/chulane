/** Shared listing and passage contracts for the sidebar, HTTP service and authenticated tool clients. */
import {z} from 'zod'

export const attachmentQuery=z.object({id:z.number().int().positive(),file:z.number().int().positive().nullable(),offset:z.number().int().nonnegative()})
export const attachmentInstructions='Use a page ID and file null to list its readable text attachments, or supply the file ID from the list or a search result to read its contents. Use the attachment matchOffset from search to start at a matching passage, or start at offset 0. Follow nextOffset for more.'
export type AttachmentQuery=z.infer<typeof attachmentQuery>

export type AttachmentRead=
  | {files:{id:number;name:string}[];nextOffset:number|null}
  | {title:string;name:string;text:string;nextOffset:number|null}
