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
import { strategyWorkflow } from "./workflows/strategy.workflow.js";
import { waveMcpServer } from "../mcp/server.js";
import { storageConfig } from "../config/env.js";

export const mastra = new Mastra({
  agents: { composeAgent },
  // Durable storage — REQUIRED for workflow suspend/resume (HITL) across restarts.
  storage: new LibSQLStore({ id: "wave-agent", url: storageConfig().url }),
  workflows: { strategyWorkflow },
  // mcp__wave__* tool surface (reads only so far). Registered so Studio + the
  // HTTP server expose it; agents reach the tools via the registry.
  mcpServers: { wave: waveMcpServer },
});

export { composeAgent, compose } from "./compose.agent.js";
