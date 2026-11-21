/** Sample trusted plugin. Cordis removes the native command when its fiber is disabled. */
import type {Context} from '../../../../vendor/cordis/src/index.ts'

type Commands = {command(label:string, action:()=>void):()=>void}
export default function readingBreak(ctx:Context,{command}:Commands){
  ctx.effect(()=>command('Reading break…',async()=>{
    const {dialog}=await import('electron')
    await dialog.showMessageBox({message:'Reading break',detail:'Look away from the screen for a moment.'})
  }))
}
