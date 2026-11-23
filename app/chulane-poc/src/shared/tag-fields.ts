/** Workspace field identities, their typed values, and the editable projection of a tag. */
import {z} from 'zod'
import type {Source} from './agent.ts'

export const fieldKinds=['text','number','date','checkbox','choice'] as const
export type FieldKind=typeof fieldKinds[number]
export type FieldValue=string|number|boolean|null
export type TagField={id:number;name:string;kind:FieldKind;options:string[];attached:boolean}
export type WorkspaceTagFields={
  columns:(TagField & {tag:number})[]
  cells:{tag:number;page:number;block:string;field:number;value:FieldValue}[]
}
export type TaggedRow=Source & {values:Record<number,FieldValue>}
export type TagTable={fields:TagField[];rows:TaggedRow[]}

export const propertyQuery=z.object({id:z.number().int().positive(),block:z.string().min(1).max(1024).nullable().default(null),offset:z.number().int().nonnegative().default(0)})
export type PropertyQuery=z.output<typeof propertyQuery>
export type TaggedProperty={tag:{id:number;name:string};field:(Pick<TagField,'id'|'name'|'kind'>&{value:FieldValue})|null}
export type PropertyBatch=Pick<Source,'id'|'title'|'day'|'block'> & {entries:TaggedProperty[];nextOffset:number|null}
export const propertyInstructions='Read the active tags and typed property values of a page (block null) or one specific block. Use the page ID and optional block ID from a search result or source link. A null field means the tag has no fields. A null value means the field is unset. Follow nextOffset with the same target until null.'
