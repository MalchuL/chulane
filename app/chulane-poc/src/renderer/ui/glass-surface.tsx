/** Supply the device material preference to app portals and paint one inert Liqui surface behind each control group. */
import {LiquiGlass} from '@liqui-design/glass'
import {createContext,useContext} from 'react'

export const GlassEnabled=createContext(false)

type GlassSurfaceProps={kind:'toolbar'|'overlay'|'header'}

/** Use live optics on compact toolbars and inexpensive frost behind floating text and menus. */
export function GlassSurface({kind}:GlassSurfaceProps){
  const enabled=useContext(GlassEnabled)
  if(!enabled)return null
  if(kind==='header')return <LiquiGlass data-part="liqui-surface" aria-hidden="true" material="auto"
    finish="prism" corner="round" radius={18} blur={3} frost={.42} refraction={36} bezel={11}
    specular={.48} edgeShade={.04} hairline={0} dispersion={0}/>
  const toolbar=kind==='toolbar'
  return <LiquiGlass data-part="liqui-surface" aria-hidden="true" material={toolbar?'auto':'frost'}
    corner="round" radius={toolbar?10:12} blur={toolbar ? 0.5 : 4} refraction={20} bezel={7}
    dispersion={0} frost={toolbar ? 0.14 : 0.68} specular={.28} edgeShade={.08} hairline={.1}/>
}
