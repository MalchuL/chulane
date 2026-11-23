/** Device theme values accepted by both the appearance form and the local desktop settings store. */
import {z} from 'zod'

const color=z.string().regex(/^#[0-9a-f]{6}$/i)
export const fontNames={system:'System',serif:'Serif',mono:'Monospace',epilogue:'Epilogue',martian:'Martian Mono'} as const
const typography=z.object({background:color,text:color,font:z.enum(['system','serif','mono','epilogue','martian']),size:z.number().int().min(12).max(32)})
const tokens=z.object({
  application:typography,editor:typography,accent:color,
  radius:z.number().int().min(0).max(24).default(12),
  headingWeight:z.number().int().min(400).max(800).default(650),
  leading:z.number().min(1.2).max(2).default(1.5),
  elevation:z.enum(['flat','raised']).default('raised'),
  surface:color.optional(),border:color.optional(),muted:color.optional(),selection:color.optional(),
})
export const themeNames={chulane:'Chulane',ink:'Ink',terminal:'Terminal',custom:'Custom'} as const
// Older records contain just the manual palette. Keep those values as the device's custom theme.
export const themeSchema=tokens.extend({
  preset:z.enum(['chulane','ink','terminal','custom']).default('custom'),
  material:z.enum(['auto','glass','solid']).default('auto'),
})
export type DeviceTheme=z.infer<typeof themeSchema>
export type ThemeTokens=z.infer<typeof tokens>
export const defaultTheme:DeviceTheme=themeSchema.parse({preset:'chulane',
  application:{background:'#ffffff',text:'#151522',font:'system',size:16},
  editor:{background:'#ffffff',text:'#172033',font:'system',size:16},accent:'#5038b3',
})
// Hallmark's Ink (paper) and Terminal palettes, converted from OKLCH to sRGB for native color inputs.
export const hallmarkThemes={
  ink:{application:{background:'#fefdfb',text:'#0d0d0d',font:'epilogue',size:16},
    editor:{background:'#fefdfb',text:'#292929',font:'epilogue',size:17},
    accent:'#00746d',surface:'#f6f5f2',border:'#dbdbd8',muted:'#525252',selection:'#c3f3ef',
    radius:12,headingWeight:700,leading:1.55,elevation:'raised'},
  terminal:{application:{background:'#040805',text:'#e1f1de',font:'martian',size:15},
    editor:{background:'#040805',text:'#e1f1de',font:'martian',size:16},
    accent:'#7ef473',surface:'#080f0a',border:'#334934',muted:'#769676',selection:'#062409',
    radius:0,headingWeight:500,leading:1.65,elevation:'flat'},
} satisfies Record<'ink'|'terminal',ThemeTokens>

/** Resolve a preset independently of the manual token values retained on the same device. */
export function activeTheme(theme:DeviceTheme|null):ThemeTokens|null{
  if(!theme||theme.preset==='chulane')return null
  return theme.preset==='custom'?theme:hallmarkThemes[theme.preset]
}
export interface DesktopAppearance{
  read():Promise<DeviceTheme|null>
  save(value:DeviceTheme|null):Promise<void>
}
declare global {interface Window{chulaneAppearance?:DesktopAppearance}}
