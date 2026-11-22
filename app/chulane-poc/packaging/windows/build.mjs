/** Assemble the Windows x64 release with Electron's pinned runtime and Chulane's deployed production modules. */
import {execFileSync} from 'node:child_process'
import {mkdir,mkdtemp,rename,rm} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {join,resolve} from 'node:path'
import {stageDesktopApp} from '../desktop-app.mjs'
import {downloadArtifact} from '@electron/get'

const require=createRequire(import.meta.url)
const version=require('electron/package.json').version
const zip=await downloadArtifact({version,artifactName:'electron',platform:'win32',arch:'x64'})
const stage=await mkdtemp(resolve('dist-host/windows-build-'))
try{
  const runtime=join(stage,'runtime'),app=join(runtime,'resources/app')
  await mkdir(runtime)
  execFileSync('unzip',['-q',zip,'-d',runtime])
  await rename(join(runtime,'electron.exe'),join(runtime,'Chulane.exe'))
  await rm(join(runtime,'resources/default_app.asar'))
  await stageDesktopApp(stage,app,runtime)
  const output='chulane-setup-x64.exe'
  execFileSync('makensis',['-V2','-DRUNTIME='+runtime,'-DOUTPUT='+join(stage,output),'packaging/windows/installer.nsi'],{stdio:'inherit'})
  await rename(join(stage,output),resolve('dist-host',output))
  console.log('dist-host/'+output)
}finally{await rm(stage,{recursive:true,force:true})}
