// The Graph subgraph client (strategy + swap data). WIRED to the live Studio
// endpoint (docs/spikes/GRAPH-NODE-SPIKE.md — path A confirmed; subgraph `wave`).
//
// v0.0.3 is the target subgraph: THREE data sources (EnsStrategyRouter + ENS
// resolver + Aqua). ⚠️ MUST BE DEPLOYED TO STUDIO — see the note at SUBGRAPH_URL.
// v0.0.2 (two data sources) is the previous production deploy (EnsStrategyRouter
// + ENS resolver) → Strategy/Swap/Follow/Follower entities exist and are
// queryable. With no swaps/announces fired yet these return real empty arrays —
// the true "no data yet" state — so policy.decide() and the feed see real
// emptiness, not a swallowed error. (v0.0.1 was the single-source ENS spike and
// is historical.)
//
// NEVER return fabricated data. The empty/not-found paths are the truth.
import { GraphQLClient, ClientError } from "graphql-request";

export type StrategyStatus = "active" | "stopped" | "removed";

// Ranking + retune inputs (Pietro.md 🔢 + AGENT.md policy R1). All BigInt fields arrive as
// decimal strings from the subgraph (Bytes/BigInt serialize to string in GraphQL JSON).
// `committedCapital` is the returnPct denominator — sourced from Aqua's Pushed/Pulled (C2).
// Optional because the deployed v0.0.1 spike returns none of these; coerceStrategy fills
// zeroes so downstream math never sees `undefined`.
export type Strategy = {
  id: string;
  programHash: string;
  ensNode: string;
  status: StrategyStatus;
  cumulativeVolumeIn: string; // wei string
  cumulativeVolumeOut: string; // wei string
  committedCapital: string; // wei string (Aqua Pushed − Pulled)
  swapCount: number;
  lastSwapTimestamp: number; // unix secs
  followerCount: number;
};

export type Swap = {
  id: string;
  strategyId: string;
  amountIn: string;
  amountOut: string;
  timestamp: number; // unix secs
};

// Studio endpoint (path A).
//
// ⚠️ PINNED TO v0.0.3, WHICH MUST BE DEPLOYED BEFORE THE AGENT RUNS.
// STRATEGY_FIELDS queries `committedCapital` unconditionally (added with the Aqua
// data source, PR #41). v0.0.2 does NOT have that field, and isEntityNotDeployed()
// only swallows a missing ENTITY — a missing FIELD reads "Type `Strategy` has no
// field …" and PROPAGATES. So pointing at v0.0.2 would throw on every read.
// Deploy v0.0.3 from subgraph/ (`pnpm deploy:studio`), then this just works.
//
// (historical: v0.0.2 was two data
// sources: EnsStrategyRouter + ENS resolver → Strategy/Swap/Follow/Follower
// entities). v0.0.1 was the single-source ENS spike (historical only). Override
// per-env for self-hosted graph-node (path B) or to pin an older version.
const SUBGRAPH_URL =
  process.env.WAVE_SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1756983/wave/v0.0.3";

const client = new GraphQLClient(SUBGRAPH_URL);

// v0.0.2 is live and the production entities exist, so this guard rarely fires
// against the default URL. It stays as a safety net for the cases where it
// still matters: an env pinning an older version (e.g. the v0.0.1 spike), or
// Studio briefly lagging mid-deploy. When it does fire we swallow ONLY those
// "entity not deployed yet" errors and return empty / not-found, so
// policy.decide() sees real "no data yet" instead of a crash.
//
// IMPORTANT — narrow detection. A production subgraph with a real bug (handler
// crash, renamed field, malformed query) ALSO returns errors[], and those MUST
// propagate — swallowing them as "no data" would silently mask a broken
// subgraph as an empty one, violating the "never fabricate" rule. So we match
// the two specific not-deployed signatures, not "any error":
//   • "Type `Query` has no field `strategies`" — top-level entity absent.
//     (A field-level bug reads "Type `Strategy` has no field …" — different type → propagates.)
//   • "Variable `where` must have an input type" — the entity's *_filter type is absent.
function isEntityNotDeployed(error: unknown): boolean {
  if (!(error instanceof ClientError)) return false;
  const messages = (error.response?.errors ?? []).map((e) => e.message ?? "");
  return messages.some(
    (m) => /Type `Query` has no field/i.test(m) || /must have an input type/i.test(m),
  );
}

function coerceStatus(raw: string | null | undefined): StrategyStatus {
  // The on-chain enum may grow; anything unknown reads as "active" (the only
  // status the production contract emits at announce). Conservative, not silent.
  return raw === "stopped" || raw === "removed" ? raw : "active";
}

// Raw GraphQL row — the ranking/aggregation fields are optional because the deployed v0.0.1
// spike entity doesn't carry them (the v0.0.2 production subgraph does). Missing → zeroed so
// policy.decide() and the rank math never see `undefined`.
type StrategyRow = {
  id: string;
  programHash: string;
  ensNode: string;
  status?: string;
  cumulativeVolumeIn?: string;
  cumulativeVolumeOut?: string;
  committedCapital?: string;
  swapCount?: number;
  lastSwapTimestamp?: string;
  followerCount?: number;
};

function coerceStrategy(s: StrategyRow): Strategy {
  return {
    id: s.id,
    programHash: s.programHash,
    ensNode: s.ensNode,
    status: coerceStatus(s.status),
    cumulativeVolumeIn: s.cumulativeVolumeIn ?? "0",
    cumulativeVolumeOut: s.cumulativeVolumeOut ?? "0",
    committedCapital: s.committedCapital ?? "0",
    swapCount: s.swapCount ?? 0,
    lastSwapTimestamp: Number(s.lastSwapTimestamp ?? "0"),
    followerCount: s.followerCount ?? 0,
  };
}

// Field list shared by getStrategy/listStrategies. v0.0.2-only fields (committedCapital etc.)
// are queried unconditionally; on the v0.0.1 spike the whole `strategies` entity is absent and
// isEntityNotDeployed catches it before these field names matter.
const STRATEGY_FIELDS =
  "id programHash ensNode status cumulativeVolumeIn cumulativeVolumeOut committedCapital swapCount lastSwapTimestamp followerCount";

// The subgraph stores Strategy.id as Bytes! (a bytes32), which serializes to
// lowercase 0x-hex. A caller passing UPPERCASE hex (0xABC…) or a no-0x prefix
// id (ABC…) gets null/empty back silently — NOT a ClientError — so the
// isEntityNotDeployed guard never fires and the id reads as "not found"
// despite existing. Normalize before it hits the request variables.
// Normalization only (lowercase + 0x prefix); the subgraph still returns null
// for genuinely malformed ids, which is the existing correct behavior.
function normalizeId(id: string): string {
  return id.startsWith("0x") ? id.toLowerCase() : `0x${id}`.toLowerCase();
}

export const subgraph = {
  async getStrategy(id: string): Promise<Strategy> {
    const normalizedId = normalizeId(id);
    try {
      const data = await client.request<{
        strategy?: StrategyRow;
      }>(`query($id: ID!) { strategy(id: $id) { ${STRATEGY_FIELDS} } }`, { id: normalizedId });
      if (!data.strategy) throw new Error(`strategy not found: ${id}`);
      return coerceStrategy(data.strategy);
    } catch (error) {
      if (isEntityNotDeployed(error)) throw new Error(`strategy not found: ${id}`);
      throw error;
    }
  },

  async listStrategies(status?: StrategyStatus): Promise<Strategy[]> {
    // Only send the typed $where variable when filtering — an unfiltered list
    // with where:null triggers a separate "Variable must have an input type"
    // error on a not-yet-deployed entity. Two query shapes, same result.
    const query = status
      ? `query($where: Strategy_filter, $first: Int) {
           strategies(first: $first, where: $where) { ${STRATEGY_FIELDS} }
         }`
      : `query($first: Int) {
           strategies(first: $first) { ${STRATEGY_FIELDS} }
         }`;
    try {
      const data = await client.request<{
        strategies?: Array<StrategyRow>;
      }>(query, { ...(status ? { where: { status } } : {}), first: 1000 });
      return (data.strategies ?? []).map(coerceStrategy);
    } catch (error) {
      if (isEntityNotDeployed(error)) return []; // entity not deployed yet → no strategies
      throw error;
    }
  },

  async getSwapHistory(strategyId: string, limit = 50): Promise<Swap[]> {
    const normalizedId = normalizeId(strategyId);
    try {
      const data = await client.request<{
        swaps?: Array<{
          id: string;
          strategy: string;
          amountIn: string;
          amountOut: string;
          timestamp: string;
        }>;
      }>(
        `query($strategyId: ID!, $first: Int) {
           swaps(first: $first, where: { strategy: $strategyId }, orderBy: timestamp, orderDirection: desc) {
             id strategy amountIn amountOut timestamp
           }
         }`,
        { strategyId: normalizedId, first: Math.min(limit, 1000) },
      );
      return (data.swaps ?? []).map((s) => ({
        id: s.id,
        strategyId: s.strategy,
        amountIn: s.amountIn,
        amountOut: s.amountOut,
        timestamp: Number(s.timestamp),
      }));
    } catch (error) {
      if (isEntityNotDeployed(error)) return []; // entity not deployed yet → no swaps
      throw error;
    }
  },
};
