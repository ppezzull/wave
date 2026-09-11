// wave agent — Mastra registry (the entry Studio / the server boots).
//
// Per docs/strategy/AGENT.md: the agent is its OWN container
// (srcs/docker-compose.yml), exposing HTTP/SSE at AGENT_URL=http://agent:<PORT>;
// LLM + wallet keys never live in the UI process.
//
// `storage` (LibSQL) is REQUIRED for durable workflow suspend/resume (HITL) —
// without it, workflow runs are in-memory and lost on restart.
import "dotenv/config";
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { composeAgent, compose, composeStream } from "./compose.agent.js";
import { monitorAgent, retuneAgent, gateAgent } from "./agents.js";
import { strategyWorkflow } from "./workflows/strategy.workflow.js";
import { monitorWorkflow } from "./workflows/monitor.workflow.js";
import { waveMcpServer } from "../mcp/server.js";
import { storageConfig } from "../config/env.js";
import { retuneStreamRoute } from "./routes/retune-stream.js";

export const mastra = new Mastra({
  agents: { composeAgent, monitorAgent, retuneAgent, gateAgent },
  // Durable storage — REQUIRED for workflow suspend/resume (HITL) across restarts.
  storage: new LibSQLStore({ id: "wave-agent", url: storageConfig().url }),
  workflows: { strategyWorkflow, monitorWorkflow },
  // mcp__wave__* tool surface (reads only so far). Registered so Studio + the
  // HTTP server expose it; agents reach the tools via the registry.
  mcpServers: { wave: waveMcpServer },
  // The HTTP server (Hono) — `mastra build` extracts this statically into
  // .mastra/output/. Serves /health, /api/agents/*, /api/workflows/*, and
  // auto-mounts the MCP HTTP/SSE routes. Direct (not a factory) per the build.
  //
  // apiRoutes add the SSE feed the UI's /api/stream proxies (task #31) — auto-prefixed
  // /api, open (the UI proxies server-side; events carry no secrets).
  //
  // Trust layer (Ledger Continuity): the MCP surface stays open — the hardware
  // gate sits on the HITL approve step (strategy.workflow, LEDGER_GATE), the
  // destructive surface, not on reads.
  server: {
    port: Number(process.env.PORT ?? 3002),
    apiRoutes: [retuneStreamRoute],
  },
});

export { composeAgent, compose } from "./compose.agent.js";
