// Hono adapter for the MCP gate — the thinnest possible shell over
// decideGate(). Structurally typed against the Hono context (no direct hono
// dependency) so it drops into Mastra's `server.middleware` and stays
// unit-testable with plain objects.
import { buildAgentkitChallenge, type ChallengeOptions } from "./challenge.js";
import { decideGate, type GateOptions, type GateRequest } from "./gate.js";

export interface GateContext {
  req: GateRequest & {
    header(name: string): string | undefined;
  };
  /** Annotated on allow for tracing / the trust panel. */
  res: { headers: { set(name: string, value: string): void } };
}

export type AgentkitMiddleware = (
  c: GateContext,
  next: () => Promise<void>,
) => Promise<Response | void>;

export function agentkitMcpGate(
  opts: GateOptions & { challenge: Omit<ChallengeOptions, "resourceUri" | "hostname"> },
): AgentkitMiddleware {
  return async (c, next) => {
    const decision = await decideGate(
      {
        method: c.req.method,
        path: c.req.path,
        url: c.req.url,
        agentkitHeader: c.req.header("agentkit"),
      },
      opts,
    );

    if (decision.action === "pass") return next();
    if (decision.action === "challenge") {
      return buildAgentkitChallenge({
        ...opts.challenge,
        resourceUri: decision.resourceUri,
        hostname: decision.hostname,
      });
    }
    if (decision.action === "allow") {
      c.res.headers.set("x-agentkit-human", decision.humanId);
      return next();
    }

    // JSON-RPC-shaped error so MCP clients surface a meaningful failure
    // instead of a bare 403. `x-agentkit-error` carries the typed kind for
    // the trust panel's refusal column.
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: decision.status === 429 ? -32000 : -32600,
        message: decision.message,
        data: { kind: decision.code, address: decision.address },
      },
    });
    return new Response(body, {
      status: decision.status,
      headers: {
        "content-type": "application/json",
        "x-agentkit-error": decision.code,
        ...(decision.address ? { "x-agentkit-address": decision.address } : {}),
      },
    });
  };
}
