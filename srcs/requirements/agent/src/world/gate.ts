// The MCP gate decision — pure, framework-free, unit-testable. The Hono
// adapter (middleware.ts) is a thin shell over decideGate(); everything that
// can go wrong has a typed error kind so the trust panel / demo can show WHY
// a caller was refused.
import { verifyAgentkit, type VerifyOutcome } from "./verify.js";

export type GateErrorCode =
  | "agentkit-required"
  | "call-limit-reached"
  | Exclude<VerifyOutcome["errorKind"], undefined>;

export type GateDecision =
  | { action: "pass" } // not our surface — hand through untouched
  | { action: "allow"; humanId: string }
  | { action: "deny"; status: 403 | 429; code: GateErrorCode; message: string; address?: string };

export interface GateRequest {
  method: string;
  path: string;
  url: string;
  agentkitHeader?: string;
}

export interface GateOptions {
  /** Kill switch (WORLD_MCP_GATE=off) — demo safety above all. */
  enabled: boolean;
  /** Per-human call cap on the MCP surface (usage counters feed the trust panel). */
  callLimit: number;
  verifier: (headerValue: string | undefined, resourceUri: string) => Promise<VerifyOutcome>;
  tryIncrementUsage: (endpoint: string, humanId: string, limit: number) => Promise<boolean>;
}

/** The agent-facing programmatic surface is the MCP mount; everything else
 *  (UI routes, /health, Studio) passes through untouched. */
export function isMcpSurface(path: string): boolean {
  return path === "/mcp" || path.startsWith("/mcp/");
}

export async function decideGate(req: GateRequest, opts: GateOptions): Promise<GateDecision> {
  if (!isMcpSurface(req.path)) return { action: "pass" };
  if (!opts.enabled) return { action: "allow", humanId: "gate:disabled" };
  // GET is the SSE stream channel; tool calls arrive as POSTs — the stateful
  // session can only exist after a gated POST initialize succeeded.
  if (req.method === "GET" || req.method === "OPTIONS") return { action: "pass" };

  const resourceUri = resourceUriOf(req.url, req.path);
  const outcome = await opts.verifier(req.agentkitHeader, resourceUri);
  if (!outcome.ok) {
    if (outcome.errorKind === "missing-header") {
      return {
        action: "deny",
        status: 403,
        code: "agentkit-required",
        message: "wave's MCP surface requires AgentKit: register your agent wallet in AgentBook and sign with an agentkit header",
      };
    }
    return { action: "deny", status: 403, code: outcome.errorKind ?? "malformed", message: outcome.error ?? "verification failed", address: outcome.address };
  }

  const withinLimit = await opts.tryIncrementUsage(req.path, outcome.humanId!, opts.callLimit);
  if (!withinLimit) {
    return { action: "deny", status: 429, code: "call-limit-reached", message: `per-human call limit (${opts.callLimit}) reached on ${req.path}`, address: outcome.address };
  }

  return { action: "allow", humanId: outcome.humanId! };
}

/** The signed resource URI is the endpoint URL the agent believes it is
 *  calling (origin + path) — validateAgentkitMessage enforces the match. */
function resourceUriOf(url: string, path: string): string {
  try {
    return new URL(url).origin + path;
  } catch {
    return path;
  }
}
