/** Workspace field identities, their typed values, and the editable projection of a tag. */
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
