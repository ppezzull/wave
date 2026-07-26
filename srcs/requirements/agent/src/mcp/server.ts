// The wave MCP server — exposes mcp__wave__* tools to the agents and (over
// HTTP/SSE) to the Next.js UI. READ tools only for now; the writes
// (retune/shipStrategy/stopStrategy/removeStrategy/changeOracleBand/askHuman)
// land with the action arms (recompileAndShip) + gateAgent.
//
// Registered into the Mastra registry (index.ts) so Studio + the HTTP server
// expose the surface; agents reach the tools via the registry.
//
// Spec: docs/strategy/AGENT.md §"The MCP tool surface".
import { MCPServer } from "@mastra/mcp";
import * as reads from "./reads.js";
import * as writes from "./writes.js";

export const waveMcpServer = new MCPServer({
  id: "wave",
  name: "wave tools",
  version: "0.0.0",
  tools: {
    getStrategy: reads.getStrategy,
    listStrategies: reads.listStrategies,
    getSwapHistory: reads.getSwapHistory,
    getOracleState: reads.getOracleState,
    getStrategyStatus: reads.getStrategyStatus,
    getProgramHash: reads.getProgramHash,
    quote: reads.quote,
    resolveENS: reads.resolveENS,
    getTextRecord: reads.getTextRecord,
    // Writes — autonomous ENS (ensAgent), never HITL-gated. Per AGENT.md authz matrix.
    setText: writes.setText,
    registerSubname: writes.registerSubname,
  },
});
