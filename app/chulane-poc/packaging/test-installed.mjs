/** Exercise the installed Electron executable with temporary profiles and disposable server fixtures. */
import {execFileSync} from 'node:child_process'
import {stat} from 'node:fs/promises'
import {resolve} from 'node:path'

const executable=process.argv[2]??process.env.CHULANE_TEST_INSTALLED_DESKTOP
if(!executable||process.argv.length>3)throw Error('Use pnpm smoke:installed PATH_TO_CHULANE_EXECUTABLE')
const path=resolve(executable)
if(!(await stat(path)).isFile())throw Error('Choose the installed Chulane executable: '+path)
const env={...process.env,CHULANE_TEST_INSTALLED_DESKTOP:path}

const suites=[['hosts','desktop'],['title-bar'],['desktop-backup'],['plugin-blocks'],['server-profiles']]
if(env.CHULANE_TEST_LIVE_AGENT)suites.push(['installed-live-agent'])
for(const [suite,...args] of suites){
  console.log('Testing installed Chulane: '+suite)
  execFileSync(process.execPath,['--import','tsx','tests/e2e/'+suite+'.spec.ts',...args],{stdio:'inherit',env})
}
