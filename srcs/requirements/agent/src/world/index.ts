// Production wiring for the World MCP gate: canonical AgentBook verifier
// (World Chain), signature verification over the signed chain's RPC, and the
// libsql storage for counters/nonces. Returns undefined when the gate is
// disabled (WORLD_MCP_GATE=off) so mastra/index.ts can omit it entirely.
import { createAgentBookVerifier, verifyAgentkitSignature } from "@worldcoin/agentkit";
import { agentkitMcpGate, type AgentkitMiddleware } from "./middleware.js";
import { LibSqlAgentKitStorage } from "./storage.js";
import { verifyAgentkit } from "./verify.js";

export interface WorldGateEnv {
  enabled: boolean;
  callLimit: number;
  maxAgeSeconds: number;
  storageUrl: string;
}

export function buildWorldGate(env: WorldGateEnv): AgentkitMiddleware | undefined {
  if (!env.enabled) return undefined;

  const storage = new LibSqlAgentKitStorage(env.storageUrl);
  // Always resolves against the canonical World Chain deployment, regardless
  // of which chain the signature was produced on (per the SDK docs).
  const agentBook = createAgentBookVerifier();

  // DEMO FIXTURE — until the agent wallets are actually registered via
  // `npx @worldcoin/agentkit-cli register` (sandbox access pending), addresses
  // listed in WORLD_AGENTBOOK_DEV_ALLOW resolve as human-backed so the whole
  // flow (sign → verify → "registered" → allow) is demonstrable end-to-end.
  // Same var the UI resolver reads; empty by default, off in production.
  const devAllow = new Set(
    (process.env.WORLD_AGENTBOOK_DEV_ALLOW ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  const verifier = (headerValue: string | undefined, resourceUri: string) =>
    verifyAgentkit(headerValue, resourceUri, {
      lookupHuman: async (address) => {
        const key = address.toLowerCase();
        return devAllow.has(key) ? `dev:${key}` : agentBook.lookupHuman(address);
      },
      verifySignature: (payload) => verifyAgentkitSignature(payload),
      hasUsedNonce: (nonce) => storage.hasUsedNonce(nonce),
      recordNonce: (nonce) => storage.recordNonce(nonce),
      maxAgeSeconds: env.maxAgeSeconds,
    });

  return agentkitMcpGate({
    enabled: env.enabled,
    callLimit: env.callLimit,
    verifier,
    tryIncrementUsage: (endpoint, humanId, limit) =>
      storage.tryIncrementUsage(endpoint, humanId, limit),
  });
}
