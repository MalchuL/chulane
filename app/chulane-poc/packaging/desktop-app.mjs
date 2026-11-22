/** Stage the built desktop host, renderer, runtime dependencies and notices for redistribution. */
import {execFileSync} from 'node:child_process'
import {cp,mkdir,readdir,rename,writeFile} from 'node:fs/promises'
import {join} from 'node:path'

/** Populate an empty Electron application directory using the lockfile's production provider graph. */
export async function stageDesktopApp(stage,app,notices){
  await mkdir(join(app,'dist-host'),{recursive:true})
  await cp('dist',join(app,'dist'),{recursive:true})
  for(const file of ['desktop.cjs','preload.cjs'])await cp('dist-host/'+file,join(app,'dist-host',file))
  // Mastra uses native ESM imports. Install its production graph as ordinary files in the installed app.
  const modules=join(stage,'providers')
  execFileSync('pnpm',['--config.node-linker=hoisted','--config.inject-workspace-packages=true','--filter','@chulane/web-runtime','deploy','--prod',modules],{stdio:'inherit'})
  const dependencies=join(modules,'node_modules')
  await mkdir(join(app,'node_modules'))
  for(const name of await readdir(dependencies)){
    if(name.startsWith('.'))continue // Exclude pnpm's local metadata and build-host command shims.
    await rename(join(dependencies,name),join(app,'node_modules',name))
  }
  await writeFile(join(app,'package.json'),JSON.stringify({name:'chulane-poc',productName:'Chulane POC',version:'0.0.0',main:'dist-host/desktop.cjs'}))
  await cp('../../vendor/cordis/LICENSE',join(notices,'Cordis-LICENSE'))
  await cp('src/renderer/ui/LICENSE.md',join(notices,'shadcn-ui-LICENSE.md'))
}
