/** Application-owned retrieval boundary. The host supplies the active pages visible to the caller. */
export type SearchablePage = { id: number; title: string; plain: string }

/** Rank eligible source IDs. A future semantic retriever can use the workspace's derived index. */
export interface PageRetriever {
  search(workspace: number, query: string, pages: readonly SearchablePage[]): Promise<readonly number[]>
}

/** Match literal writing text and titles, including non-ASCII case pairs. */
export const textRetriever: PageRetriever = {
  async search(_workspace, query, pages) {
    const term = query.toLowerCase()
    return pages.filter(page => (page.title + ' ' + page.plain).toLowerCase().includes(term)).map(page => page.id)
  },
}
