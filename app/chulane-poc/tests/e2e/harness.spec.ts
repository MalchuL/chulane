/** Run a published Harness CLI in a disposable profile against a real Chulane HTTP service. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { serve } from '../../src/server/service.ts'

const dir = await mkdtemp(join(tmpdir(), 'chulane-harness-'))
const key = randomBytes(24).toString('hex')
const host = await serve({ file: ':memory:', assets: resolve('dist'), editorKey: key })
const resultFile = join(dir, 'result.json')
let child: ReturnType<typeof spawn> | undefined
try {
  const login = await fetch(host.url + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')!.split(';')[0]
  const page = await fetch(host.url + '/api/pages', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Sandpiper notebook' }),
  })
  assert.equal(page.status, 200)
  await copyFile(new URL('./harness-probe.mjs', import.meta.url), join(dir, 'probe.mjs'))
  await writeFile(join(dir, 'probe.yml'), '- insert:\n    - id: search-proof\n      name: ./probe.mjs\n')
  child = spawn('dsh', ['web', '--patch', resolve('examples/chulane.cordis.yml'), '--patch',
    join(dir, 'probe.yml'), '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: dir, stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      PATH: process.env.PATH, HOME: dir, DSH_HOME: join(dir, 'profile'),
      CHULANE_MCP_ENTRY: resolve('src/tools/mcp.ts'), CHULANE_URL: host.url,
      CHULANE_PROBE_RESULT: resultFile, CHULANE_ACCESS_KEY: key,
    },
  })
  let failure: Error | undefined
  child.on('error', error => { failure = error })
  const deadline = Date.now() + 60000
  let result = ''
  while (!result) {
    if (failure) throw failure
    assert.equal(child.exitCode, null, 'Harness exited before the search completed')
    assert.ok(Date.now() < deadline, 'Harness search timed out')
    await delay(100)
    try { result = await readFile(resultFile, 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  const [{ result: search }] = JSON.parse(result).results
  assert.equal(search.isError, false)
  assert.deepEqual(JSON.parse(search.content[0].text), [
    { id: 1, title: 'Sandpiper notebook', url: host.url + '/?workspace=1&page=1' },
  ])
  console.log('Published Harness discovered and executed Chulane search over MCP.')
} finally {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise<void>(done => child!.once('close', () => done()))
    child.kill()
    const timeout = setTimeout(() => child!.kill('SIGKILL'), 5000)
    await stopped
    clearTimeout(timeout)
  }
  await host.close()
  await rm(dir, { recursive: true, force: true })
}
