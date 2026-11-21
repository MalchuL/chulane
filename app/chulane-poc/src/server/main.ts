/** Web entry point. The database is private to this installation. */
import {Context} from '../../../../vendor/cordis/src/index.ts'
import { serve } from './service.ts'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const dir=resolve(process.env.CHULANE_DATA || 'data')
await mkdir(dir,{recursive:true})
const composition=new Context()
const app=await serve({context:composition,file:resolve(dir,'workspace.sqlite'),assets:fileURLToPath(new URL('../../dist',import.meta.url)),host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||4173),editorKey:process.env.CHULANE_EDITOR_KEY,viewerKey:process.env.CHULANE_VIEWER_KEY})
console.log(app.url)
for(const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>void app.close().then(()=>composition.fiber.dispose()))
