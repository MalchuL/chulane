/** Apply account-scoped device preferences to the shell and editor without writing workspace content. */
import {SettingsPanel} from './ui/settings-panel'
import {useEffect,useLayoutEffect,useState} from 'react'
import {Palette,RotateCcw} from 'lucide-react'
import {activeTheme,defaultTheme,fontNames,themeNames,themeSchema,type DeviceTheme,type ThemeTokens} from '../shared/theme'
import {ScrollArea} from './ui/scroll-area'
import {Button,Input,NativeSelect,NativeSelectOption} from './ui'

const fonts={system:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',serif:'Georgia, serif',mono:'ui-monospace, monospace',epilogue:'Epilogue, sans-serif',martian:'"Martian Mono", ui-monospace, monospace'}
/** Mix two validated sRGB colors so derived tokens can also be edited in a native color input. */
function mix(background:string,ink:string,amount:number){
  return '#'+[1,3,5].map(i=>{
    const from=parseInt(background.slice(i,i+2),16),to=parseInt(ink.slice(i,i+2),16)
    return Math.round(from+(to-from)*amount).toString(16).padStart(2,'0')
  }).join('')
}
/** Supply editable semantic colors from the active palette or its explicit overrides. */
function palette(theme:ThemeTokens){
  const {background,text}=theme.application
  return {surface:theme.surface??mix(background,text,.05),border:theme.border??mix(background,text,.3),
    muted:theme.muted??mix(background,text,.74),selection:theme.selection??mix(background,theme.accent,.16)}
}
/** The WCAG luminance crossover chooses the higher contrast of black and white. */
function darkGround(hex:string){
  const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
  return .2126*r+.7152*g+.0722*b<.179
}
type SavedTheme={key:string;theme:DeviceTheme|null}

/** Hydrate device preferences and remove their CSS variables when the active account changes. */
export function useDeviceTheme(profile:string){
  const key='chulane.appearance.'+profile
  const [saved,setSaved]=useState<SavedTheme>(),[error,setError]=useState('')
  const [preview,setPreview]=useState<SavedTheme>()
  useEffect(()=>{
    setPreview(undefined)
    let active=true
    async function read(){
      try{
        const raw=window.chulaneAppearance?await window.chulaneAppearance.read():JSON.parse(localStorage.getItem(key)??'null')
        const theme=raw===null?null:themeSchema.parse(raw)
        if(active){setSaved({key,theme});setError('')}
      }catch{if(active){setSaved({key,theme:null});setError('Could not read the saved theme on this device.')}}
    }
    function updated(event:StorageEvent){if(event.key===key||event.key===null)void read()}
    void read();window.addEventListener('storage',updated)
    return ()=>{active=false;window.removeEventListener('storage',updated)}
  },[key])
  const theme=saved?.key===key?saved.theme:null
  const draft=preview?.key===key?preview.theme:null
  const current=draft&&themeSchema.safeParse(draft).success?draft:theme
  const applied=activeTheme(current)
  const [opaquePreference]=useState(()=>matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)'))
  const [opaque,setOpaque]=useState(opaquePreference.matches)
  useEffect(()=>{
    const update=()=>setOpaque(opaquePreference.matches)
    opaquePreference.addEventListener('change',update)
    update()
    return ()=>opaquePreference.removeEventListener('change',update)
  },[opaquePreference])
  const material=current?.material??'auto'
  const glass=saved?.key===key&&!opaque&&(material==='glass'||material==='still-glass'||(material==='auto'&&(current?.preset??'chulane')==='chulane'))
  useLayoutEffect(()=>{
    if(glass)document.documentElement.setAttribute('data-glass',material==='still-glass'?'still':'')
    else document.documentElement.removeAttribute('data-glass')
    return ()=>document.documentElement.removeAttribute('data-glass')
  },[glass,material])
  useLayoutEffect(()=>{
    if(!applied)return
    const root=document.documentElement,{application,editor,accent}=applied
    const colors=palette(applied)
    const variables={'--rivto-background':application.background,'--rivto-foreground':application.text,'--rivto-accent':accent,
      '--ui':fonts[application.font],'--app-size':application.size+'px','--editor-paper':editor.background,
      '--editor-ink':editor.text,'--editor-font':fonts[editor.font],'--editor-size':editor.size+'px',
      '--rail':colors.surface,'--rivto-border':colors.border,'--rivto-muted-foreground':colors.muted,'--selected':colors.selection,
      '--rivto-primary-foreground':darkGround(accent)?'#ffffff':'#000000','--app-scheme':darkGround(application.background)?'dark':'light',
      '--rivto-radius':applied.radius+'px','--heading-weight':String(applied.headingWeight),'--reading-leading':String(applied.leading),
      '--panel-shadow':applied.elevation==='flat'?'none':'0 12px 32px rgb(0 0 0 / 16%)'}
    root.dataset.customTheme=''
    for(const [name,value] of Object.entries(variables))root.style.setProperty(name,value)
    return ()=>{delete root.dataset.customTheme;for(const name of Object.keys(variables))root.style.removeProperty(name)}
  },[applied])
  async function save(theme:DeviceTheme|null){
    if(theme)themeSchema.parse(theme)
    if(window.chulaneAppearance)await window.chulaneAppearance.save(theme)
    else if(theme)localStorage.setItem(key,JSON.stringify(theme))
    else localStorage.removeItem(key)
    setSaved({key,theme});setError('')
  }
  return {theme,draft,save,glass,edit:(value:DeviceTheme|null)=>setPreview(value?{key,theme:value}:undefined),ready:saved?.key===key,error}
}

type AppearanceProps=ReturnType<typeof useDeviceTheme>
/** Edit the two palettes independently. Cancelling discards the form and restoring defaults clears the preference. */
export function Appearance({theme,draft,edit,save,ready,error}:AppearanceProps){
  const [failure,setFailure]=useState(''),[busy,setBusy]=useState(false)
  const values=activeTheme(draft)??defaultTheme
  const preset=draft?.preset??'chulane'
  const manual=preset==='custom'||preset==='chulane'
  /** Fork the displayed tokens on explicit customization. Simply selecting a preset preserves the personal copy. */
  function customize(patch:Partial<ThemeTokens>){
    edit({...values,...patch,preset:'custom',material:draft?.material??'auto'})
  }
  async function commit(value:DeviceTheme|null){
    setBusy(true)
    try{await save(value);edit(null)}catch{setFailure('Could not save the theme on this device.')}
    finally{setBusy(false)}
  }
  return <SettingsPanel title="Appearance" open={!!draft} onOpenChange={next=>{
    if(!busy){setFailure('');edit(next?theme??defaultTheme:null)}
  }} trigger={<Button size="icon-sm" variant="ghost" disabled={!ready} aria-label="Appearance" title="Appearance"><Palette/></Button>}>
    {draft&&<form data-part="appearance" onSubmit={event=>{event.preventDefault();void commit(draft)}}>
      <ScrollArea role="region" aria-label="Appearance settings"><div data-part="appearance-fields">
        <label>Theme<NativeSelect aria-label="Theme" value={preset} onChange={e=>{
          const personal=themeSchema.safeParse(draft).success?draft:theme??defaultTheme
          edit({...personal,preset:e.target.value as DeviceTheme['preset']})
        }}>
          <NativeSelectOption value="chulane">{themeNames.chulane}</NativeSelectOption>
          <optgroup label="Hallmark"><NativeSelectOption value="ink">{themeNames.ink}</NativeSelectOption><NativeSelectOption value="terminal">{themeNames.terminal}</NativeSelectOption></optgroup>
          <NativeSelectOption value="custom">{themeNames.custom}</NativeSelectOption>
        </NativeSelect></label>
        <label>Surface style<NativeSelect value={draft.material} onChange={e=>edit({...draft,material:e.target.value as DeviceTheme['material']})}>
          <NativeSelectOption value="auto">Theme default</NativeSelectOption>
          <NativeSelectOption value="glass">Liquid glass</NativeSelectOption>
          <NativeSelectOption value="still-glass">Still glass</NativeSelectOption>
          <NativeSelectOption value="solid">Solid</NativeSelectOption>
        </NativeSelect></label>
        {manual?<>
          {(['application','editor'] as const).map(scope=>{
            const group=scope==='application'?'Application':'Editor',type=values[scope]
            function change(patch:Partial<typeof type>){customize({[scope]:{...type,...patch}})}
            return <fieldset key={scope}><legend>{group}</legend>
              {(['background','text'] as const).map(field=><label key={field}>{field==='text'?'Text':'Background'}
                <Input type="color" aria-label={group+' '+field} value={type[field]} onChange={e=>change({[field]:e.target.value})}/></label>)}
              {scope==='application'&&<label>Accent<Input type="color" value={values.accent} onChange={e=>customize({accent:e.target.value})}/></label>}
              <label>Font<NativeSelect aria-label={group+' font'} value={type.font} onChange={e=>change({font:e.target.value as typeof type.font})}>
                {Object.entries(fontNames).map(([id,name])=><NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}
              </NativeSelect></label>
              <label>Size (px)<Input type="number" aria-label={group+' font size'} min={12} max={32} required value={type.size||''} onChange={e=>change({size:Number(e.target.value)})}/></label>
            </fieldset>
          })}
          <fieldset><legend>Surfaces and type</legend>
            {Object.entries(palette(values)).map(([name,color])=><label key={name}>{name[0].toUpperCase()+name.slice(1)}
              <Input type="color" value={color} onChange={e=>customize({[name]:e.target.value})}/></label>)}
            <label>Corner radius<Input type="number" min={0} max={24} required value={values.radius} onChange={e=>customize({radius:Number(e.target.value)})}/></label>
            <label>Heading weight<Input type="number" min={400} max={800} required value={values.headingWeight||''} onChange={e=>customize({headingWeight:Number(e.target.value)})}/></label>
            <label>Line spacing<Input type="number" min={1.2} max={2} step={0.01} required value={values.leading||''} onChange={e=>customize({leading:Number(e.target.value)})}/></label>
            <label>Panels<NativeSelect value={values.elevation} onChange={e=>customize({elevation:e.target.value as ThemeTokens['elevation']})}>
              <NativeSelectOption value="flat">Flat</NativeSelectOption><NativeSelectOption value="raised">Raised</NativeSelectOption>
            </NativeSelect></label>
          </fieldset>
        </>:<Button type="button" variant="outline" onClick={()=>customize({})}>Customize {themeNames[preset]}</Button>}
      </div></ScrollArea>
      {(failure||error)&&<p role="alert">{failure||error}</p>}
      <footer><Button type="button" variant="ghost" size="icon-sm" aria-label="Restore defaults" title="Restore defaults" disabled={(!theme&&!error)||busy} onClick={()=>void commit(null)}><RotateCcw/></Button><Button type="button" variant="outline" disabled={busy} onClick={()=>edit(null)}>Cancel</Button><Button type="submit" disabled={busy}>Save theme</Button></footer>
    </form>}
  </SettingsPanel>
}
