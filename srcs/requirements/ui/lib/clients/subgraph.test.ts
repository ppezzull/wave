// subgraph client tests — the old-deploy retry contract: a pinned Studio deploy
// that predates `description`/`author` (v0.0.4/v0.0.5) must not break the UI.
// The client retries dropping ONLY the offending optional field (max 2) and
// fills the documented legacy value; every other error propagates.
//
// graphql-request rides global fetch, so a scripted fetch stub stands in for
// the deploy under test.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ZERO = '0x0000000000000000000000000000000000000000'

interface Scripted {
  status: number
  body: unknown
}

let script: Scripted[] = []
let queries: string[] = []

const fetchStub = vi.fn(async (_url: unknown, init?: RequestInit) => {
  queries.push(String(init?.body ?? ''))
  const next = script.shift() ?? { status: 200, body: { data: {} } }
  return new Response(JSON.stringify(next.body), {
    status: next.status,
    headers: { 'content-type': 'application/json' },
  })
})

async function loadClient() {
  // The URL is read at module load — pin it before import, then re-import a
  // fresh module instance per test group so script state can't leak.
  process.env.WAVE_SUBGRAPH_URL = 'http://stub.test/wave'
  vi.resetModules()
  return await import('./subgraph')
}

beforeEach(() => {
  script = []
  queries = []
  vi.stubGlobal('fetch', fetchStub)
  return () => vi.unstubAllGlobals()
})

const gqlError = (message: string) => ({
  status: 200,
  body: { errors: [{ message }] },
})

const ROW = {
  id: '0x33ad28fee1d9ae07e5a2f37aaa57e9d5ef3db2c559b04337d201e89a4432f18b',
  programHash: '0xe52db45573fd84a1352bcbaae9210562b08fa4f60a310aba1b571673bee0f787',
  status: 'active',
  description: 'post body',
  author: '0xab459eb72e55d8bcacf762165d96281e0996cb95',
  cumulativeVolumeIn: '0',
  cumulativeVolumeOut: '0',
  committedCapital: '201000000000000000000',
  swapCount: '0',
  lastSwapTimestamp: '0',
}

describe('subgraph.listStrategies — old-deploy field retry', () => {
  it('selects description+author against a current deploy', async () => {
    script = [{ status: 200, body: { data: { strategies: [ROW] } } }]
    const { subgraph } = await loadClient()
    const rows = await subgraph.listStrategies()
    expect(rows).toHaveLength(1)
    expect(rows[0].author).toBe(ROW.author)
    expect(rows[0].description).toBe('post body')
    expect(queries[0]).toContain('description')
    expect(queries[0]).toContain('author')
  })

  it("drops ONLY author when the deploy errors on it, then fills the ZERO sentinel", async () => {
    script = [
      gqlError('Cannot query field "author" on type "Strategy". Did you mean "maker"?'),
      { status: 200, body: { data: { strategies: [{ ...ROW, author: undefined }] } } },
    ]
    const { subgraph } = await loadClient()
    const rows = await subgraph.listStrategies()
    expect(rows).toHaveLength(1)
    expect(rows[0].author).toBe(ZERO)
    expect(rows[0].description).toBe('post body') // kept — only the offender dropped
    expect(queries[1]).not.toContain('author')
    expect(queries[1]).toContain('description')
  })

  it('drops both optional fields when the deploy predates both (v0.0.4)', async () => {
    script = [
      gqlError('Cannot query field "author" on type "Strategy"'),
      gqlError('Cannot query field "description" on type "Strategy"'),
      { status: 200, body: { data: { strategies: [{ ...ROW, author: undefined, description: undefined }] } } },
    ]
    const { subgraph } = await loadClient()
    const rows = await subgraph.listStrategies()
    expect(rows).toHaveLength(1)
    expect(rows[0].author).toBe(ZERO)
    expect(rows[0].description).toBe('')
    expect(queries[2]).not.toContain('author')
    expect(queries[2]).not.toContain('description')
  })

  it('does not re-drop an already-dropped field — the same error throws on the next attempt', async () => {
    const err = gqlError('Cannot query field "author" on type "Strategy"')
    script = [err, err] // second failure: 'author' no longer selected → propagate → [] via warn
    const { subgraph } = await loadClient()
    const rows = await subgraph.listStrategies()
    expect(rows).toEqual([])
    expect(fetchStub).toHaveBeenCalledTimes(2)
  })

  it('propagates real bugs — an author error on a NON-Strategy type is not retried', async () => {
    script = [gqlError('Cannot query field "author" on type "Swap"')]
    const { subgraph } = await loadClient()
    await expect(subgraph.listStrategies()).resolves.toEqual([]) // warn-and-empty path
    expect(fetchStub).toHaveBeenCalledTimes(1) // no retry — not the known signature
  })
})

describe('subgraph.listStrategiesByAuthor — the profile key', () => {
  it('queries where author = $author (lowercased)', async () => {
    script = [{ status: 200, body: { data: { strategies: [ROW] } } }]
    const { subgraph } = await loadClient()
    const rows = await subgraph.listStrategiesByAuthor('0xAB459eB72e55d8BCACf762165d96281e0996Cb95')
    expect(rows).toHaveLength(1)
    expect(queries[0]).toContain('where: { author: $author }')
  })

  it('rejects malformed addresses before any network call', async () => {
    const { subgraph } = await loadClient()
    await expect(subgraph.listStrategiesByAuthor('0x1234')).resolves.toEqual([])
    expect(fetchStub).not.toHaveBeenCalled()
  })
})

describe('subgraph.getStrategy — id hygiene', () => {
  it('returns null for a handle-shaped id without querying', async () => {
    const { subgraph } = await loadClient()
    expect(await subgraph.getStrategy('s-e52db455')).toBeNull()
    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('normalizes uppercase hex bodies and returns the mapped row', async () => {
    script = [{ status: 200, body: { data: { strategy: ROW } } }]
    const { subgraph } = await loadClient()
    const s = await subgraph.getStrategy('0x' + ROW.id.slice(2).toUpperCase())
    expect(s?.id).toBe(ROW.id)
    expect(s?.committedCapital).toBe(ROW.committedCapital)
  })

  it('treats an uppercase 0X-prefixed id as not addressable (no query)', async () => {
    const { subgraph } = await loadClient()
    expect(await subgraph.getStrategy(ROW.id.toUpperCase())).toBeNull()
    expect(fetchStub).not.toHaveBeenCalled()
  })
})
