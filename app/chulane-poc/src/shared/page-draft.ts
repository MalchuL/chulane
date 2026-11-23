/** Page draft and journal lookup contracts shared by agent providers and external tools. */
import {z} from 'zod'

export const pageCreation=z.object({title:z.string().max(250).trim().min(1),project:z.number().int().positive().nullable(),markdown:z.string().max(32000)})
export type PageCreation=z.infer<typeof pageCreation>
export type ReviewedPageDraft=Omit<PageCreation,'title'> & {projectName:string|null;reviewedPath?:string}

export const journalDayQuery=z.object({day:z.iso.date()})
export const journalReadQuery=z.object({day:z.union([journalDayQuery.shape.day,z.literal('today')])})
export const journalListQuery=z.object({before:journalDayQuery.shape.day.nullable().default(null)})
export const journalListInstructions='List existing journal entries in the workspace, newest calendar day first. Start with before null. To continue, pass nextBefore as the exclusive calendar date. Read a returned page ID for content and citations.'
export type JournalList={entries:{id:number;day:string;title:string}[];nextBefore:string|null}

export const journalDayInstructions='Read the active journal entry for a workspace calendar date (YYYY-MM-DD) or today. The workspace time zone determines today. Returns null if no active entry exists. For longer entries continue by page ID with nextBlockOffset.'

/** A dated draft has literal writing and a workspace calendar destination. Its key identifies a submission retry. */
export const journalCreation=z.strictObject({
  title:pageCreation.shape.title,...journalDayQuery.shape,content:z.string().max(32000),
  operationId:z.string().regex(/^[0-9a-f]{32}$/).optional(),
})
export type JournalCreation=z.infer<typeof journalCreation>
