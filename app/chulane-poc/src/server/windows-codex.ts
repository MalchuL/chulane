/** Locate the native executable behind a Windows npm Codex launcher without passing agent arguments through a command shell. */
import {stat} from 'node:fs/promises'
import {isAbsolute,join} from 'node:path'

/** Check a candidate and preserve filesystem errors other than a missing installation. */
async function isFile(path:string){
  try{return (await stat(path)).isFile()}
  catch(error){
    const code=(error as NodeJS.ErrnoException).code
    if(code==='ENOENT'||code==='ENOTDIR')return false
    throw error
  }
}

/** Search npm global prefixes in order, supporting both nested and hoisted platform packages. */
export async function findWindowsNpmCodex(prefixes:readonly string[],arch:string){
  const cpu=arch==='x64'?'x86_64':arch==='arm64'?'aarch64':undefined
  if(!cpu)return
  for(const prefix of prefixes){
    if(!isAbsolute(prefix)||!await isFile(join(prefix,'codex.cmd')))continue
    const modules=join(prefix,'node_modules')
    for(const base of [join(modules,'@openai','codex','node_modules'),modules]){
      const binary=join(base,'@openai','codex-win32-'+arch,'vendor',cpu+'-pc-windows-msvc','bin','codex.exe')
      if(await isFile(binary))return binary
    }
  }
}
