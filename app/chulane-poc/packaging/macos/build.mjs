/** Build an architecture-specific Chulane.app and archive its executable modes and framework links. */
import {execFileSync} from 'node:child_process'
import {cp,mkdtemp,rename,rm} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {join,resolve} from 'node:path'
import {packager} from '@electron/packager'
import {stageDesktopApp} from '../desktop-app.mjs'

const arch=process.argv[2]??process.arch
if(!['arm64','x64'].includes(arch))throw Error('Choose arm64 or x64 for the macOS package.')
const native=process.platform==='darwin'
const stage=await mkdtemp(resolve('dist-host/macos-build-'))
try{
  const app=join(stage,'app')
  await stageDesktopApp(stage,app,app)
  const [output]=await packager({
    dir:app,out:join(stage,'bundle'),name:'Chulane',appBundleId:'org.chulane.desktop',
    platform:'darwin',arch,electronVersion:createRequire(import.meta.url)('electron/package.json').version,
    asar:false,prune:false,
    afterExtract:[async({buildPath})=>{
      const resources=join(buildPath,'Electron.app/Contents/Resources')
      await cp(join(buildPath,'LICENSE'),join(resources,'Electron-LICENSE'))
      await cp(join(buildPath,'LICENSES.chromium.html'),join(resources,'LICENSES.chromium.html'))
    }],
    osxSign:native?{identity:'-',timestamp:'none',identityValidation:false,preAutoEntitlements:false,continueOnError:false}:undefined
  })
  const bundle=join(output,'Chulane.app')
  const filename='chulane-macos-'+arch+(native?'':'-unsigned')+'.zip'
  const archive=join(stage,filename)
  if(native){
    execFileSync('codesign',['--verify','--deep','--strict',bundle],{stdio:'inherit'})
    execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',bundle,archive])
  }else{
    // Cross-builds are inspectable artifacts. Only a Mac build verifies the local signature.
    execFileSync('zip',['-qry',archive,'Chulane.app'],{cwd:output})
  }
  await rename(archive,resolve('dist-host',filename))
  console.log('dist-host/'+filename)
}finally{await rm(stage,{recursive:true,force:true})}
