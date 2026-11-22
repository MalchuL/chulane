/** Bounded document reads shared by the workspace agent and authenticated external tools. */
import {z} from 'zod'
export const textRange=z.object({id:z.number().int().positive(),block:z.string().min(1).max(1024).nullable(),offset:z.number().int().nonnegative()})
export const textRangeInstructions='Read a passage of document text. Supply the page ID and block ID, or null for canvas labels. For a search hit with readFrom, pass its block and offset to read the matching passage directly. To continue a preview, use its nextOffset for a block or canvasNextOffset for canvas labels. To read the full text, start at offset 0 and follow nextOffset until it is null.'
export type TextRange=z.infer<typeof textRange>
export type TextPassage={text:string;nextOffset:number|null}
