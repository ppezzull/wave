// The Graph subgraph client (strategy + swap data). WIRED to the live Studio
// endpoint (docs/spikes/GRAPH-NODE-SPIKE.md — path A confirmed; subgraph `wave`).
//
// The deployed subgraph is currently the SPIKE (single ENS-resolver data source),
// so the production `strategies`/`swaps` entities don't exist on it yet — they
// land when the StrategyRouter data source is added (PR #20 + re-deploy, see
// docs/tasks/Pietro.md L62). Until then these methods return empty/not-found
// rather than throwing or faking, so policy.decide() sees real "no data yet".
//
// NEVER return fabricated data. The empty/not-found paths are the truth.
import { GraphQLClient, ClientError } from "graphql-request";

export type StrategyStatus = "active" | "stopped" | "removed";

export type Strategy = {
  id: string;
  programHash: string;
  ensNode: string;
  status: StrategyStatus;
};

export type Swap = {
  id: string;
  strategyId: string;
  amountIn: string;
  amountOut: string;
  timestamp: number; // unix secs
};

// Live Studio endpoint (path A). Override per-env for self-hosted graph-node (path B).
const SUBGRAPH_URL =
  process.env.WAVE_SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1756983/wave/v0.0.1";

const client = new GraphQLClient(SUBGRAPH_URL);

// The deployed subgraph is currently the SPIKE — querying a production entity
// (`strategies`/`swaps`) that doesn't exist on it yet returns a GraphQL error.
// We swallow ONLY those "entity not deployed yet" errors and return empty /
// not-found, so policy.decide() sees real "no data yet" instead of a crash.
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
        strategy?: { id: string; programHash: string; ensNode: string; status?: string };
      }>(`query($id: ID!) { strategy(id: $id) { id programHash ensNode status } }`, { id: normalizedId });
      if (!data.strategy) throw new Error(`strategy not found: ${id}`);
      const s = data.strategy;
      return {
        id: s.id,
        programHash: s.programHash,
        ensNode: s.ensNode,
        status: coerceStatus(s.status),
      };
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
           strategies(first: $first, where: $where) { id programHash ensNode status }
         }`
      : `query($first: Int) {
           strategies(first: $first) { id programHash ensNode status }
         }`;
    try {
      const data = await client.request<{
        strategies?: Array<{ id: string; programHash: string; ensNode: string; status?: string }>;
      }>(query, { ...(status ? { where: { status } } : {}), first: 1000 });
      return (data.strategies ?? []).map((s) => ({
        id: s.id,
        programHash: s.programHash,
        ensNode: s.ensNode,
        status: coerceStatus(s.status),
      }));
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
