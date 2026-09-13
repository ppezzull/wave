// The feed's change-signature — server-only. One compact string that moves
// whenever any LIVE surface the explore page shows moves: a new strategy
// ships (new id), a strategy fills (swapCount), or the rail's "What's new"
// keywords shift. The explore banner polls it (app/actions/feed.ts) and
// offers a refresh when it differs from the sig the page rendered with.
//
// NEVER rendered — compared. '' means "no signal" (subgraph unreachable or
// genuinely empty): the poll treats it as nothing-new rather than nagging,
// because a transient Studio/graph-node hiccup must not read as fresh data.
import 'server-only'
import { subgraphFor } from './clients/subgraph'
import { currentNetwork } from './networks'

export async function feedPulseSig(): Promise<string> {
  try {
    const net = await currentNetwork()
    const rows = await subgraphFor(net.subgraphUrl).listStrategies(30)
    if (rows.length === 0) return ''
    // id-prefix + fills per strategy — enough to detect ships and fills
    // without shipping the whole row over the poll wire. Keywords stream
    // in the rail; they are not part of this signature.
    return rows.map((s) => `${s.id.slice(2, 10)}:${s.swapCount}`).join(',')
  } catch {
    return ''
  }
}
