/** Exercise the installed launcher from an unrelated directory when a package test supplies one. */
import {dirname} from 'node:path'

/** Select the app entry point and preserve this test's profile across Electron restarts. */
export function desktopLaunch(profile:string){
  const executablePath=process.env.CHULANE_TEST_INSTALLED_DESKTOP
  return {executablePath,cwd:executablePath?dirname(profile):process.cwd(),chromiumSandbox:!!executablePath,
    args:[...(executablePath?[]:['.']),'--user-data-dir='+profile]}
}
