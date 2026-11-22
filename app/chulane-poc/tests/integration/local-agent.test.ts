/** Verify desktop executable discovery using an isolated home and an empty launch PATH. */
import assert from 'node:assert/strict'
import {copyFile,mkdir,mkdtemp,rm,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {checkLocalAgent} from '../../src/server/local-agent.ts'

test('a desktop launcher can reach user-installed Codex with a minimal PATH', {skip:process.platform==='win32'},async t=>{
  const home=await mkdtemp(join(tmpdir(),'chulane-cli-home-'))
  t.after(()=>rm(home,{recursive:true,force:true}))
  const bin=join(home,'.local','bin')
  await mkdir(bin,{recursive:true})
  await writeFile(join(bin,'codex'),'#!/bin/sh\n[ "$1" = login ] && [ "$2" = status ]\n',{mode:0o700})
  for(const [key,value] of Object.entries({HOME:home,PATH:home,CHULANE_CODEX_PATH:''})){
    const previous=process.env[key]
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous})
    process.env[key]=value
  }
  await checkLocalAgent('codex')
  await writeFile(join(bin,'codex'),'#!/bin/sh\nexit 1\n')
  await assert.rejects(checkLocalAgent('codex'),/run codex login/i)
  process.env.CHULANE_CODEX_PATH=join(home,'missing')
  await assert.rejects(checkLocalAgent('codex'),{code:'ENOENT',message:/CHULANE_CODEX_PATH/})
})

test('a GUI launch can run a Homebrew CLI and its adjacent Node runtime', {skip:process.platform==='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'chulane GUI launcher '))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const prefix=join(root,'brew tools'),bin=join(prefix,'bin')
  await mkdir(bin,{recursive:true})
  await symlink(process.execPath,join(bin,'node'))
  const program=join(bin,'claude')
  await writeFile(program,'#!/usr/bin/env node\n'+
    'if(process.argv.includes("--version"))process.exit(0)\n'+
    'process.exit(process.argv.slice(-2).join(" ")==="auth status"&&require("node:fs").existsSync(__dirname+"/session")?0:1)\n',{mode:0o700})
  for(const [key,value] of Object.entries({HOME:root,PATH:root,HOMEBREW_PREFIX:prefix,CHULANE_CLAUDE_PATH:''})){
    const previous=process.env[key]
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous})
    process.env[key]=value
  }
  await assert.rejects(checkLocalAgent('claude'),/claude auth login/i)
  await writeFile(join(bin,'session'),'signed in')
  await checkLocalAgent('claude')
  process.env.CHULANE_CLAUDE_PATH=program
  delete process.env.HOMEBREW_PREFIX
  await checkLocalAgent('claude')
  assert.equal(process.env.PATH,root)
})

test('Hermes selection requires the chat options used by the adapter', {skip:process.platform==='win32'},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chulane-hermes-cli-'))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const executable=join(dir,'hermes')
  const previous=process.env.CHULANE_HERMES_PATH
  t.after(()=>{if(previous===undefined)delete process.env.CHULANE_HERMES_PATH;else process.env.CHULANE_HERMES_PATH=previous})
  process.env.CHULANE_HERMES_PATH=executable
  const cli=(help:string)=>writeFile(executable,'#!/bin/sh\nif [ "$1" = --version ]; then exit 0; fi\n[ "$1 $2" = "chat --help" ] || exit 1\necho "'+help+'"\n',{mode:0o700})
  const options='--oneshot --query-file --toolsets --source --format {text,stream-json}'
  await cli(options+' --safe-mode-preview')
  await assert.rejects(checkLocalAgent('hermes'),/--safe-mode/)
  await cli(options.replace('stream-json','json')+' --safe-mode')
  await assert.rejects(checkLocalAgent('hermes'),/stream-json/)
  await cli(options+' --safe-mode')
  await checkLocalAgent('hermes')
})

test('Windows npm Codex discovery follows the selected prefix and CPU architecture',async t=>{
  const {findWindowsNpmCodex}=await import('../../src/server/windows-codex.ts')
  const root=await mkdtemp(join(tmpdir(),'chulane windows npm '))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const prefix=join(root,'npm tools'),modules=join(prefix,'node_modules')
  await mkdir(prefix)
  await writeFile(join(prefix,'codex.cmd'),'unused npm launcher')
  for(const [arch,triple,base] of [
    ['x64','x86_64',modules],
    ['arm64','aarch64',join(modules,'@openai','codex','node_modules')],
  ] as const){
    const folder=join(base,'@openai','codex-win32-'+arch,'vendor',triple+'-pc-windows-msvc','bin')
    await mkdir(folder,{recursive:true})
    const binary=join(folder,'codex.exe')
    await writeFile(binary,'fixture')
    assert.equal(await findWindowsNpmCodex([join(root,'absent'),prefix],arch),binary)
  }
  assert.equal(await findWindowsNpmCodex([join(root,'absent')],'x64'),undefined)
})

test('Windows desktop connection checks run the executable behind an npm shim',{skip:process.platform!=='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'chulane npm connection '))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const cpu=process.arch==='arm64'?'aarch64':'x86_64'
  const bin=join(root,'node_modules','@openai','codex-win32-'+process.arch,'vendor',cpu+'-pc-windows-msvc','bin')
  await mkdir(bin,{recursive:true})
  const shim=join(root,'codex.cmd')
  await writeFile(shim,'@exit /b 7')
  await copyFile(process.execPath,join(bin,'codex.exe'))
  const probe=join(root,'login-probe.cjs')
  await writeFile(probe,"process.exit(require('node:path').basename(process.argv[1])==='login'&&process.argv[2]==='status'?0:1)")
  for(const [key,value] of Object.entries({CHULANE_CODEX_PATH:shim,NODE_OPTIONS:'--require='+JSON.stringify(probe.replaceAll('\\','/'))})){
    const previous=process.env[key]
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous})
    process.env[key]=value
  }
  await checkLocalAgent('codex')
})
