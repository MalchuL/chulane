/** Device-local sidebar sizes shared by the resize controls and the desktop settings store. */
export const sidebarLimits={
  library:{minimum:180,maximum:480},
  agent:{minimum:280,maximum:680}
} as const

export type SidebarSide=keyof typeof sidebarLimits
export type SidebarWidths=Partial<Record<SidebarSide,number>>

/** Accept only sizes the application could produce for this sidebar. */
export function validSidebarWidth(side:SidebarSide,width:unknown):width is number{
  const {minimum,maximum}=sidebarLimits[side]
  return typeof width==='number'&&Number.isInteger(width)&&width>=minimum&&width<=maximum
}

export interface DesktopSidebarWidths{
  read():Promise<SidebarWidths>
  save(side:SidebarSide,width:number):Promise<void>
}

declare global {interface Window{chulaneSidebarWidths?:DesktopSidebarWidths}}
