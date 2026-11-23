/** Exercise first launch and migration from a WAL-backed local workspace on an isolated filesystem. */
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,rm,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DatabaseSync} from 'node:sqlite'
import {localWorkspaceFile} from '../../src/desktop/workspace-location.ts'

test('a new default location preserves the legacy workspace and respects explicit profiles',async()=>{
  const home=await mkdtemp(join(tmpdir(),'chulane-location-'))
  try{
    const profile=join(home,'legacy')
    await mkdir(profile)
    const old=join(profile,'workspace.sqlite'),next=join(home,'.local','chulane_poc','workspace.sqlite')
    assert.equal(await localWorkspaceFile(profile,home,true),old)
    assert.equal(await localWorkspaceFile(profile,home,false),next)
    const live=new DatabaseSync(old)
    try{
      live.exec("PRAGMA journal_mode=WAL; CREATE TABLE workspaces(name TEXT); CREATE TABLE projects(id); CREATE TABLE pages(id); INSERT INTO workspaces VALUES('original')")
      await assert.rejects(localWorkspaceFile(profile,home,false),/close.*Chulane/i)
      await assert.rejects(stat(next),{code:'ENOENT'})
    }finally{live.close()}
    // Kill a writer before SQLite closes its last connection. The latest committed name lives in the WAL.
    execFileSync(process.execPath,['--input-type=module','-e',`
      import {DatabaseSync} from 'node:sqlite'
      const db=new DatabaseSync(process.argv[1])
      db.exec("UPDATE workspaces SET name='latest'")
      process.exit(0)
    `,old])
    assert.ok((await stat(old+'-wal')).size>0)
    assert.equal(await localWorkspaceFile(profile,home,false),next)
    const migrated=new DatabaseSync(next)
    try{
      assert.equal(migrated.prepare('SELECT name FROM workspaces').get()?.name,'latest')
      migrated.exec("UPDATE workspaces SET name='edited'")
      assert.equal(await localWorkspaceFile(profile,home,false),next)
      assert.equal(migrated.prepare('SELECT name FROM workspaces').get()?.name,'edited')
    }finally{migrated.close()}
    assert.ok((await stat(old)).isFile())
  }finally{await rm(home,{recursive:true,force:true})}
})
