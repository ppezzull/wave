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
import { storageConfig, worldConfig } from "../config/env.js";
import { retuneStreamRoute } from "./routes/retune-stream.js";
import { buildWorldGate } from "../world/index.js";

// World AgentKit gate on the MCP surface (undefined when WORLD_MCP_GATE=off).
const worldGate = buildWorldGate(worldConfig());

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
  // World AgentKit gate: POSTs on /mcp* must prove a human-backed agent
  // (signature + AgentBook). Internal agents reach tools via the registry —
  // in-process, never through this gate; the UI routes are the human surface
  // (Step 5 adds World ID there). WORLD_MCP_GATE=off removes it entirely.
  server: {
    port: Number(process.env.PORT ?? 3002),
    apiRoutes: [retuneStreamRoute],
    ...(worldGate ? { middleware: [worldGate] } : {}),
    // Mastra's CORS defaults + the agentkit header the gate reads, and the
    // typed error headers it sets (trust panel reads x-agentkit-error).
    cors: {
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "A2A-Version",
        "x-mastra-client-type",
        "x-mastra-dev-playground",
        "agentkit",
      ],
      exposeHeaders: ["X-Requested-With", "x-agentkit-error", "x-agentkit-address", "x-agentkit-human"],
    },
  },
});

export { composeAgent, compose } from "./compose.agent.js";
