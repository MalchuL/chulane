/** Apply account-scoped device preferences to the shell and editor without writing workspace content. */
import {useEffect,useLayoutEffect,useState} from 'react'
import {Palette} from 'lucide-react'
import {defaultTheme,themeSchema,type DeviceTheme} from '../shared/theme'
import {Button,Dialog,DialogClose,DialogContent,DialogFooter,DialogTitle,DialogTrigger,Input,NativeSelect,NativeSelectOption} from './ui'

const fonts={system:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',serif:'Georgia, serif',mono:'ui-monospace, monospace'}
type SavedTheme={key:string;theme:DeviceTheme|null}

/** Hydrate device preferences and remove their CSS variables when the active account changes. */
export function useDeviceTheme(profile:string){
  const key='chulane.appearance.'+profile
  const [saved,setSaved]=useState<SavedTheme>(),[error,setError]=useState('')
  useEffect(()=>{
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
  useLayoutEffect(()=>{
    if(!theme)return
    const root=document.documentElement,{application,editor,accent}=theme
    const variables={'--rivto-background':application.background,'--rivto-foreground':application.text,'--rivto-accent':accent,
      '--ui':fonts[application.font],'--app-size':application.size+'px','--editor-paper':editor.background,
      '--editor-ink':editor.text,'--editor-font':fonts[editor.font],'--editor-size':editor.size+'px'}
    root.dataset.customTheme=''
    for(const [name,value] of Object.entries(variables))root.style.setProperty(name,value)
    return ()=>{delete root.dataset.customTheme;for(const name of Object.keys(variables))root.style.removeProperty(name)}
  },[theme])
  async function save(theme:DeviceTheme|null){
    if(theme)themeSchema.parse(theme)
    if(window.chulaneAppearance)await window.chulaneAppearance.save(theme)
    else if(theme)localStorage.setItem(key,JSON.stringify(theme))
    else localStorage.removeItem(key)
    setSaved({key,theme});setError('')
  }
  return {theme,save,ready:saved?.key===key,error}
}

type AppearanceProps=ReturnType<typeof useDeviceTheme>
/** Edit the two palettes independently. Cancelling discards the form and restoring defaults clears the preference. */
export function Appearance({theme,save,ready,error}:AppearanceProps){
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(defaultTheme),[failure,setFailure]=useState(''),[busy,setBusy]=useState(false)
  async function commit(value:DeviceTheme|null){
    setBusy(true)
    try{await save(value);setOpen(false)}catch{setFailure('Could not save the theme on this device.')}
    finally{setBusy(false)}
  }
  return <Dialog open={open} onOpenChange={next=>{if(next){setDraft(theme??defaultTheme);setFailure('')}setOpen(next)}}>
    <DialogTrigger asChild><Button size="icon-sm" variant="ghost" disabled={!ready} aria-label="Appearance" title="Appearance"><Palette/></Button></DialogTrigger>
    <DialogContent aria-describedby={undefined}><DialogTitle>Appearance</DialogTitle>
      <form data-part="appearance" onSubmit={event=>{event.preventDefault();void commit(draft)}}>
        {(['application','editor'] as const).map(scope=>{
          const group=scope==='application'?'Application':'Editor',values=draft[scope]
          function change(patch:Partial<typeof values>){setDraft(current=>({...current,[scope]:{...current[scope],...patch}}))}
          return <fieldset key={scope}><legend>{group}</legend>
            {(['background','text'] as const).map(field=><label key={field}>{field==='text'?'Text':'Background'}
              <input type="color" aria-label={group+' '+field} value={values[field]} onChange={e=>change({[field]:e.target.value})}/></label>)}
            {scope==='application'&&<label>Accent<input type="color" value={draft.accent} onChange={e=>setDraft({...draft,accent:e.target.value})}/></label>}
            <label>Font<NativeSelect aria-label={group+' font'} value={values.font} onChange={e=>change({font:e.target.value as typeof values.font})}>
              <NativeSelectOption value="system">System</NativeSelectOption><NativeSelectOption value="serif">Serif</NativeSelectOption><NativeSelectOption value="mono">Monospace</NativeSelectOption>
            </NativeSelect></label>
            <label>Size (px)<Input type="number" aria-label={group+' font size'} min={12} max={32} required value={values.size||''} onChange={e=>change({size:Number(e.target.value)})}/></label>
          </fieldset>
        })}
        {(failure||error)&&<p role="alert">{failure||error}</p>}
        <DialogFooter><Button type="button" variant="ghost" disabled={(!theme&&!error)||busy} onClick={()=>void commit(null)}>Restore defaults</Button><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit" disabled={busy}>Save theme</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
