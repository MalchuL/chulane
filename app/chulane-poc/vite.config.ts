/** Compile the exact Rivto sources in the pinned submodule, including its Tailwind styles. */
import {defineConfig} from 'vite'
import tailwind from '@tailwindcss/vite'
import {resolve} from 'node:path'
import {readdirSync,readFileSync} from 'node:fs'
const packages=resolve('vendor/rivto/packages')
const aliases=readdirSync(packages).map(dir=>({find:new RegExp('^'+JSON.parse(readFileSync(resolve(packages,dir,'package.json'),'utf8')).name+'$'),replacement:resolve(packages,dir,'src/index.ts')}))
export default defineConfig({plugins:[tailwind(),{
  name:'desktop-offline-shell',
  generateBundle(_options,bundle){
    const assets=Object.keys(bundle).filter(path=>path.startsWith('assets/')).sort().map(path=>'/'+path)
    const worker=readFileSync(resolve('src/renderer/offline-shell.js'),'utf8')
    this.emitFile({type:'asset',fileName:'offline-shell.js',source:worker.replace('__CHULANE_ASSETS__',JSON.stringify(assets))})
  }
}],esbuild:{jsx:'automatic'},resolve:{dedupe:['react','react-dom','yjs'],alias:[
  ...["react","browser"].map(key=>({find:"@chulane/rivto-edgeless/"+key,replacement:resolve(packages,"rivto-edgeless/src/"+key+".ts")})),
  {find:'@chulane/rivto-react/styles.css',replacement:resolve(packages,'react-rivto-editor/src/styles/index.css')},
  {find:'@chulane/rivto-page/styles.css',replacement:resolve(packages,'rivto-page/dist/esm/styles.css')},
  {find:'@chulane/rivto-react/list-numbers',replacement:resolve(packages,'react-rivto-editor/src/extensions/built-ins/page/list/utils.ts')},
  {find:'@chulane/rivto-react/extensions',replacement:resolve(packages,'react-rivto-editor/src/extensions.ts')},
  {find:'@chulane/rivto-react/block-factories',replacement:resolve(packages,'react-rivto-editor/src/block-factories.ts')},...aliases]}})
