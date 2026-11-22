/** Device theme values accepted by both the appearance form and the local desktop settings store. */
import {z} from 'zod'

const color=z.string().regex(/^#[0-9a-f]{6}$/i)
const typography=z.object({background:color,text:color,font:z.enum(['system','serif','mono']),size:z.number().int().min(12).max(32)})
export const themeSchema=z.object({application:typography,editor:typography,accent:color})
export type DeviceTheme=z.infer<typeof themeSchema>
export const defaultTheme:DeviceTheme={
  application:{background:'#ffffff',text:'#151522',font:'system',size:16},
  editor:{background:'#ffffff',text:'#172033',font:'system',size:16},accent:'#5038b3'
}
export interface DesktopAppearance{
  read():Promise<DeviceTheme|null>
  save(value:DeviceTheme|null):Promise<void>
}
declare global {interface Window{chulaneAppearance?:DesktopAppearance}}
