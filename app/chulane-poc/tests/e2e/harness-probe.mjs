/** Test-only Cordis plugin. Exercise a registered Chulane MCP tool through Harness's own executor. */
import { writeFile } from 'node:fs/promises'

export const inject = ['tools']

/** Wait for discovery, then write the executor result to the smoke runner's private directory. */
export function apply(ctx) {
  const timer = setInterval(async () => {
    const name = 'mcp__chulane__search'
    if (!ctx.tools.get(name)) return
    clearInterval(timer)
    try {
      const batch = await ctx.tools.execute({
        calls: [{ type: 'tool-call', id: 'search-proof', name, arguments: '{"query":"sandpiper"}' }],
        signal: AbortSignal.timeout(10000),
      })
      await writeFile(process.env.CHULANE_PROBE_RESULT, JSON.stringify(batch))
    } catch (error) {
      await writeFile(process.env.CHULANE_PROBE_RESULT, String(error))
    }
  }, 250)
  ctx.effect(() => () => clearInterval(timer))
}
