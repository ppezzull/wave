// Gate tests — storage atomicity, the verification pipeline (with stubbed
// signature/AgentBook — no World Chain, no RPC), and the pure decideGate
// policy. The Hono adapter is a thin shell over decideGate and is exercised
// by the smoke scripts against a live server.
import { afterEach, describe, expect, it } from "vitest";
import { parseAgentkitHeader, type AgentkitPayload } from "@worldcoin/agentkit";
import { validatePaymentRequired } from "@x402/core/schemas";
import { buildAgentkitChallenge } from "../../world/challenge.js";
import { decideGate, isMcpSurface, type GateOptions } from "../../world/gate.js";
import { LibSqlAgentKitStorage } from "../../world/storage.js";
import { verifyAgentkit } from "../../world/verify.js";

const RESOURCE = "http://agent:3002/mcp";

function makePayload(overrides: Partial<AgentkitPayload> = {}): AgentkitPayload {
  return {
    uri: RESOURCE,
    // SIWS-style: `domain` is the bare hostname (validateAgentkitMessage compares
    // it to new URL(expected).hostname), `uri` is the full endpoint URL.
    domain: "agent",
    address: "0xf4AF4E8f4F49032257D9C1e3F1d9c5324a040620",
    version: "1",
    chainId: "eip155:480",
    type: "eip191",
    nonce: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
    signature: "0xstubsig",
    ...overrides,
  } as AgentkitPayload;
}

/** The wire format is base64(JSON(payload)) — same encoding as the SDK client. */
function encode(payload: AgentkitPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

const storages: LibSqlAgentKitStorage[] = [];
function freshStorage(): LibSqlAgentKitStorage {
  const s = new LibSqlAgentKitStorage(":memory:");
  storages.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(storages.splice(0).map((s) => s.close()));
});

function gateOpts(over: Partial<GateOptions> = {}): GateOptions {
  return {
    enabled: true,
    callLimit: 1000,
    verifier: (header) =>
      verifyAgentkit(header, RESOURCE, {
        lookupHuman: async (a) =>
          a.toLowerCase() === "0xf4af4e8f4f49032257d9c1e3f1d9c5324a040620"
            ? "human_0xabc"
            : null,
        verifySignature: async () => ({ valid: true }),
        hasUsedNonce: async () => false,
        recordNonce: async () => {},
      }),
    tryIncrementUsage: async () => true,
    ...over,
  };
}

describe("LibSqlAgentKitStorage", () => {
  it("enforces the limit atomically per (endpoint, human)", async () => {
    const s = freshStorage();
    expect(await s.tryIncrementUsage("/mcp", "h1", 2)).toBe(true);
    expect(await s.tryIncrementUsage("/mcp", "h1", 2)).toBe(true);
    expect(await s.tryIncrementUsage("/mcp", "h1", 2)).toBe(false); // limit hit
    expect(await s.tryIncrementUsage("/mcp", "h2", 2)).toBe(true); // other human unaffected
    expect(await s.tryIncrementUsage("/mcp/list", "h1", 2)).toBe(true); // other endpoint unaffected
  });

  it("records and detects nonces (anti-replay)", async () => {
    const s = freshStorage();
    expect(await s.hasUsedNonce("n1")).toBe(false);
    await s.recordNonce("n1");
    expect(await s.hasUsedNonce("n1")).toBe(true);
    await s.recordNonce("n1"); // idempotent
    expect(await s.hasUsedNonce("n1")).toBe(true);
  });
});

describe("verifyAgentkit (stubbed deps)", () => {
  it("rejects a missing header", async () => {
    const out = await verifyAgentkit(undefined, RESOURCE, {
      lookupHuman: async () => "h",
      verifySignature: async () => ({ valid: true }),
    });
    expect(out.ok).toBe(false);
    expect(out.errorKind).toBe("missing-header");
  });

  it("rejects garbage that is not a valid agentkit header", async () => {
    const out = await verifyAgentkit("!!!not-base64-json!!!", RESOURCE, {
      lookupHuman: async () => "h",
      verifySignature: async () => ({ valid: true }),
    });
    expect(out.ok).toBe(false);
    expect(out.errorKind).toBe("malformed");
  });

  it("round-trips a well-formed payload through parse", () => {
    const payload = makePayload();
    expect(parseAgentkitHeader(encode(payload)).address).toBe(payload.address);
  });

  it("allows a registered, well-signed agent and returns the humanId", async () => {
    const out = await verifyAgentkit(encode(makePayload()), RESOURCE, {
      lookupHuman: async () => "human_0xabc",
      verifySignature: async () => ({ valid: true }),
    });
    expect(out).toMatchObject({ ok: true, humanId: "human_0xabc" });
  });

  it("refuses an unregistered wallet (not in AgentBook)", async () => {
    const out = await verifyAgentkit(
      encode(makePayload({ address: "0x92b4747d624253f1B7598A996bb44855d8008017" })),
      RESOURCE,
      {
        lookupHuman: async () => null,
        verifySignature: async () => ({ valid: true }),
      },
    );
    expect(out.ok).toBe(false);
    expect(out.errorKind).toBe("not-in-agentbook");
  });

  it("refuses a bad signature", async () => {
    const out = await verifyAgentkit(encode(makePayload()), RESOURCE, {
      lookupHuman: async () => "h",
      verifySignature: async () => ({ valid: false, error: "recovered mismatch" }),
    });
    expect(out.ok).toBe(false);
    expect(out.errorKind).toBe("bad-signature");
  });

  it("refuses a replayed nonce", async () => {
    const storage = freshStorage();
    const deps = {
      lookupHuman: async () => "h",
      verifySignature: async () => ({ valid: true }),
      hasUsedNonce: (n: string) => storage.hasUsedNonce(n),
      recordNonce: (n: string) => storage.recordNonce(n),
    };
    const header = encode(makePayload());
    const first = await verifyAgentkit(header, RESOURCE, deps);
    expect(first.ok).toBe(true);
    const second = await verifyAgentkit(header, RESOURCE, deps); // same nonce
    expect(second.ok).toBe(false);
    expect(second.errorKind).toBe("nonce-replayed");
  });
});

describe("decideGate (policy)", () => {
  const base = { method: "POST", path: "/mcp", url: RESOURCE };

  it("passes through non-MCP routes untouched", async () => {
    expect(await decideGate({ ...base, path: "/health" }, gateOpts())).toEqual({ action: "pass" });
    expect(await decideGate({ ...base, path: "/api/agents/x" }, gateOpts())).toEqual({ action: "pass" });
  });

  it("recognizes the whole MCP mount", () => {
    expect(isMcpSurface("/mcp")).toBe(true);
    expect(isMcpSurface("/mcp/")).toBe(true);
    expect(isMcpSurface("/mcpz")).toBe(false);
    expect(isMcpSurface("/api/mcp")).toBe(false);
  });

  it("answers a POST without an agentkit header with the x402 challenge", async () => {
    const d = await decideGate(base, gateOpts());
    expect(d).toMatchObject({ action: "challenge", resourceUri: RESOURCE });
  });

  it("allows a verified human-backed agent and returns the humanId", async () => {
    const d = await decideGate(
      { ...base, agentkitHeader: encode(makePayload()) },
      gateOpts(),
    );
    expect(d).toEqual({ action: "allow", humanId: "human_0xabc" });
  });

  it("passes GET (SSE channel) — tool calls are the gated POSTs", async () => {
    const d = await decideGate({ ...base, method: "GET" }, gateOpts());
    expect(d).toEqual({ action: "pass" });
  });

  it("denies with 429 when the per-human call limit is exhausted", async () => {
    const d = await decideGate(
      { ...base, agentkitHeader: encode(makePayload()) },
      gateOpts({ callLimit: 0, tryIncrementUsage: async () => false }),
    );
    expect(d).toMatchObject({ action: "deny", status: 429, code: "call-limit-reached" });
  });

  it("is a no-op allow when the gate is disabled (kill switch)", async () => {
    const d = await decideGate(base, gateOpts({ enabled: false }));
    expect(d).toEqual({ action: "allow", humanId: "gate:disabled" });
  });
});

describe("x402 challenge (the 402 the official client signs against)", () => {
  const challenge = () =>
    buildAgentkitChallenge({
      resourceUri: RESOURCE,
      hostname: "agent",
      payTo: "0xpayTo",
      network: "eip155:8453",
      asset: "0xusdc",
      amount: "1000",
      trialUses: 5,
      supportedNetworks: ["eip155:11155111", "eip155:8453"],
    });

  it("is a 402 whose body validates against the client's own PaymentRequired schema", async () => {
    const res = challenge();
    expect(res.status).toBe(402);
    const body = JSON.parse(await res.text());
    const parsed = validatePaymentRequired(body); // same zod schema the client parses with
    expect(parsed.x402Version).toBe(2);
    expect(body.accepts[0]).toMatchObject({ payTo: "0xpayTo", network: "eip155:8453" });
  });

  it("declares the agentkit extension bound to this endpoint", async () => {
    const body = JSON.parse(await challenge().text());
    const ext = body.extensions.agentkit;
    expect(ext.info.uri).toBe(RESOURCE);
    expect(ext.info.domain).toBe("agent"); // bare hostname — the SIWS rule
    // nonce + issuedAt are what the official client's isAgentkitExtension
    // requires (and the SDK's own declare helper never sets — see challenge.ts)
    expect(ext.info.nonce).toMatch(/^[a-zA-Z0-9]{8,}$/);
    expect(typeof ext.info.issuedAt).toBe("string");
    expect(ext.supportedChains).toContainEqual({ chainId: "eip155:11155111", type: "eip191" });
    expect(ext._options.mode).toEqual({ type: "free-trial", uses: 5 });
  });
});
