/** Canvas tool arguments and the editable properties shared by local agents, Mastra and review cards. */
import {z} from 'zod'

export const canvasRead=z.object({id:z.number().int().positive(),offset:z.number().int().nonnegative()})
export const canvasValue=z.object({
  type:z.enum(['text','sticker','rectangle','ellipse','block']),text:z.string().max(32000),
  x:z.number().min(-1e7).max(1e7),y:z.number().min(-1e7).max(1e7),
  width:z.number().positive().max(1e6),height:z.number().positive().max(1e6),
})
export const canvasEdit=z.object({id:z.number().int().positive(),element:z.string().min(1).max(1024).nullable(),value:canvasValue.nullable()})
export type CanvasEdit=z.infer<typeof canvasEdit>
export type CanvasValue=z.infer<typeof canvasValue>
export const canvasInstructions='Use readCanvas to inspect element IDs, types, text and frames. Start at offset 0 and follow nextOffset. For canvas tasks use editCanvas with a null element to add text, a sticker, a rectangle, an ellipse, or a block card. For a new editable paragraph on the canvas use type block; its text initializes a new writing block. For an existing block card, preserve its empty element text and use the writing tools for its block IDs. Removing a card keeps its writing. To edit an observed element supply its ID and complete new text and frame with the same type. A null value removes the observed element.'
