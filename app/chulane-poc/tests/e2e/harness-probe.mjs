/** Test-only Cordis plugin. Exercise a registered Chulane MCP tool through Harness's own executor. */
import { writeFile } from 'node:fs/promises'

export const inject = ['tools']

/** Wait for discovery, then write the executor result to the smoke runner's private directory. */
export function apply(ctx) {
  const timer = setInterval(async () => {
    const name = 'mcp__chulane__search'
    const browse = 'mcp__chulane__browse'
    if (!ctx.tools.get(name) || !ctx.tools.get(browse)) return
    clearInterval(timer)
    try {
      const batch = await ctx.tools.execute({
        calls: [
          { type: 'tool-call', id: 'search-proof', name, arguments: '{"query":"sandpiper"}' },
          { type: 'tool-call', id: 'browse-proof', name: browse, arguments: '{}' },
        ],
        signal: AbortSignal.timeout(10000),
      })
      await writeFile(process.env.CHULANE_PROBE_RESULT, JSON.stringify(batch))
    } catch (error) {
      await writeFile(process.env.CHULANE_PROBE_RESULT, String(error))
    }
  }, 250)
  ctx.effect(() => () => clearInterval(timer))
}
