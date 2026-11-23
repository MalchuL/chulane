/** Bounded document reads shared by the workspace agent and authenticated external tools. */
import {z} from 'zod'
export const textRange=z.object({id:z.number().int().positive(),block:z.string().min(1).max(1024).nullable(),offset:z.number().int().nonnegative(),field:z.literal('description').nullable().optional()})
export const textRangeInstructions='Read a passage of document text. Supply the page ID and block ID, or null for canvas labels. For a search hit with readFrom, pass its block, offset and field to read the matching passage directly. To continue a preview, use its nextOffset for a block or canvasNextOffset for canvas labels. For a task description use field "description" with its block ID and descriptionNextOffset. Omit field or pass null for ordinary writing. To read the full text, start at offset 0 and follow nextOffset until it is null.'
export type TextRange=z.infer<typeof textRange>
export type TextPassage={text:string;nextOffset:number|null}
