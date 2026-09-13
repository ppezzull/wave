#!/usr/bin/env node
// local-invariants — real assertions against the RUNNING local graph-node
// (the same stack the fork E2E uses). Not a unit test of the mapping: it pins
// the invariants the mapping promises on real indexed blocks.
//
//   pnpm test:local                       # structural invariants (any state)
//   WAVE_TEST_AUTHOR=0x… pnpm test:local  # + author-keyed strict checks
//
// Exit 0 = all green; any violation prints and exits 1.

const GATEWAY = process.env.WAVE_SUBGRAPH_URL ?? 'http://127.0.0.1:8000/subgraphs/name/wave'
const ZERO = '0x0000000000000000000000000000000000000000'
const ADDR = /^0x[0-9a-f]{40}$/
const ID = /^0x[0-9a-f]{64}$/

let failures = 0
const ok = (name) => console.log(`  ✓ ${name}`)
const bad = (name, detail) => {
  failures++
  console.error(`  ✗ ${name} — ${detail}`)
}

async function query(q, variables = {}) {
  const res = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, variables }),
  })
  if (!res.ok) throw new Error(`gateway HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(`graphql: ${json.errors[0]?.message}`)
  return json.data
}

console.log(`local subgraph invariants — ${GATEWAY}`)

// 1. every strategy row carries a well-formed author (ZERO sentinel or address)
const { strategies } = await query(
  '{ strategies(first: 1000, orderBy: committedCapital, orderDirection: desc)' +
    ' { id author committedCapital swapCount } }',
)
strategies.every((s) => ID.test(s.id))
  ? ok(`all ${strategies.length} strategy ids are 32-byte hex`)
  : bad('strategy ids', 'at least one id is not 0x + 64 hex')
strategies.every((s) => s.author === ZERO || ADDR.test(s.author))
  ? ok('every author is the ZERO sentinel or a 40-hex address')
  : bad('author shape', `offenders: ${strategies.filter((s) => s.author !== ZERO && !ADDR.test(s.author)).map((s) => s.id).slice(0, 3).join(', ')}`)

// 2. committedCapital is a non-negative integer across every row
strategies.every((s) => /^\d+$/.test(s.committedCapital))
  ? ok('committedCapital is a non-negative integer on every row')
  : bad('capital shape', `offenders: ${strategies.filter((s) => !/^\d+$/.test(s.committedCapital)).map((s) => s.id).slice(0, 3).join(', ')}`)

// 3. swaps join existing strategies (handleSwapped's no-phantom-rows promise)
const { swaps } = await query('{ swaps(first: 100) { strategy { id } } }')
const ids = new Set(strategies.map((s) => s.id))
swaps.every((w) => ids.has(w.strategy.id))
  ? ok(`all ${swaps.length} sampled swaps join an existing strategy row`)
  : bad('swap join', 'a swap references a strategy with no row')

// 4. strict: the author-keyed path the profile/chat pages depend on
const author = process.env.WAVE_TEST_AUTHOR?.toLowerCase()
if (author) {
  if (!ADDR.test(author)) {
    bad('WAVE_TEST_AUTHOR', 'not a 0x…40-hex address')
  } else {
    const byAuthor = await query(
      'query($a: Bytes!) { strategies(first: 1000, where: { author: $a }) { id author committedCapital } }',
      { a: author },
    ).then((d) => d.strategies)
    byAuthor.every((s) => s.author === author)
      ? ok(`author filter: all ${byAuthor.length} rows key exactly to ${author.slice(0, 10)}…`)
      : bad('author filter', 'a row in the result set carries a different author')
    const capitalized = byAuthor.filter((s) => s.author !== s.author.toLowerCase())
    capitalized.length === 0
      ? ok('author values are lowercase (graph-node Bytes serialization)')
      : bad('author case', `${capitalized.length} rows not lowercase`)
    console.log(`    (${byAuthor.length} strategies authored; capital sum ${byAuthor.reduce((n, s) => n + BigInt(s.committedCapital), 0n)})`)
  }
} else {
  console.log('  (set WAVE_TEST_AUTHOR=0x… for the author-keyed strict checks)')
}

if (failures > 0) {
  console.error(`\nFAILED: ${failures} invariant(s) violated`)
  process.exit(1)
}
console.log('\nall invariants hold')
