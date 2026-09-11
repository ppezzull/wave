// The x402 challenge — what an anonymous MCP caller receives instead of a
// bare 403. This is the handshake that makes the OFFICIAL AgentKit client
// work: it only signs after a 402 whose body carries the agentkit extension
// (found by reading the SDK; the integrate page never states the ordering).
//
// The extension record comes from the SDK's own declareAgentkitExtension —
// never hand-rolled — and the body validates against the same zod schema
// (@x402/core PaymentRequiredV2) the client parses with. Human-backed agents
// retry with a signature and pass free (free-trial uses); the `accepts` entry
// advertises the per-call payment tier for everyone else.
//
// NB: payment SETTLEMENT is not wired yet (no verifyFailureHook/on-chain
// verification of x402 payments) — the accepts entry is the advertised tier;
// a paying caller is still refused with an honest error today. TODO: verify
// payments via the x402 facilitator flow (World Chain / Base, USDC).
import { AGENTKIT, declareAgentkitExtension } from "@worldcoin/agentkit";

export interface ChallengeOptions {
  /** Full endpoint URL the agent is calling (signed into the message). */
  resourceUri: string;
  /** Bare hostname (SIWS rule — validateAgentkitMessage compares hostname). */
  hostname: string;
  /** Advertised per-call payment (settlement not wired — see header comment). */
  payTo: string;
  network: string; // CAIP-2, e.g. "eip155:8453"
  asset: string; // e.g. USDC on Base
  amount: string; // base units
  trialUses: number;
  /** Networks whose signatures we accept on this surface. */
  supportedNetworks: string[];
}

export function buildAgentkitChallenge(opts: ChallengeOptions): Response {
  const extensions = declareAgentkitExtension({
    domain: opts.hostname,
    resourceUri: opts.resourceUri,
    statement: "Prove a human-backed agent to call wave's MCP surface",
    version: "1",
    network: opts.supportedNetworks,
    mode: { type: "free-trial", uses: opts.trialUses },
  });

  // SDK gap (feedback-doc'd): the client's isAgentkitExtension() rejects any
  // declaration whose info lacks `nonce` + `issuedAt`, yet the SDK's own
  // declareAgentkitExtension() never sets them. We issue a fresh server nonce
  // (alphanumeric — the SIWE rule) and timestamp so the extension is accepted;
  // the nonce then flows into the signed message and our gate's anti-replay
  // ledger covers it too.
  const declaration = extensions[AGENTKIT];
  if (!declaration) throw new Error("declareAgentkitExtension returned no agentkit record");
  // Intentional cast: the SDK's AgentkitExtensionInfo type predates the
  // nonce/issuedAt requirement its own client enforces (see comment above).
  const info = declaration.info as unknown as { nonce?: string; issuedAt?: string };
  info.nonce = crypto.randomUUID().replace(/-/g, "");
  info.issuedAt = new Date().toISOString();

  const body = {
    x402Version: 2 as const,
    error:
      "AgentKit verification required — human-backed agents proceed free; anonymous agents pay per call",
    resource: {
      url: opts.resourceUri,
      mimeType: "application/json",
      serviceName: "wave-mcp",
      description: "wave agent MCP surface (feed/quote reads, ship/retune writes)",
      tags: ["mcp", "agentkit"],
    },
    accepts: [
      {
        scheme: "exact",
        network: opts.network,
        amount: opts.amount,
        asset: opts.asset,
        payTo: opts.payTo,
        maxTimeoutSeconds: 60,
        extra: {},
      },
    ],
    extensions,
  };

  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "x-agentkit-error": "agentkit-required",
    },
  });
}
