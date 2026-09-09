// agentkit-gate.smoke.ts — e2e rehearsal of the MCP gate against a RUNNING
// agent (`./node_modules/.bin/mastra dev`, WORLD_MCP_GATE=on).
//
// Three probes, matching the demo's three-way contrast:
//   1. anonymous POST (no agentkit header)      → expect 403 agentkit-required
//   2. signed POST (SIWE-style, SDK exports)    → expect the gate to PASS
//      (needs the wallet in WORLD_AGENTBOOK_DEV_ALLOW until the real
//      AgentBook registration lands)
//   3. same header replayed (nonce reuse)       → expect 403 nonce-replayed
//
// NB on probe 2: createAgentkitClient only signs when the SERVER first answers
// 402 with the x402 challenge declaring the agentkit extension — a plain 403
// is ignored (found by reading the SDK; the integrate page doesn't say it).
// Official-client interop lands with the 402 advertisement; until then this
// smoke builds the header manually with the SDK's own formatSIWEMessage +
// base64(JSON) wire format, which is byte-equivalent.
//
// Usage (agent dir): AGENT_URL=http://localhost:3002 npx tsx agentkit-gate.smoke.ts
import "dotenv/config";
import { formatSIWEMessage } from "@worldcoin/agentkit";
import { privateKeyToAccount } from "viem/accounts";

const BASE = process.env.AGENT_URL ?? process.env.AGENT_ENDPOINT_MCP ?? "http://localhost:3002";
const KEY = process.env.WORLD_AGENT_PUBLISHER_KEY;

if (!KEY || KEY.startsWith("0xYOUR")) {
  console.error("✗ WORLD_AGENT_PUBLISHER_KEY missing — set it in the root .env");
  process.exit(1);
}

const origin = new URL(BASE).origin;
const TOOLS_LIST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

async function post(url: string, headers: Record<string, string>) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: TOOLS_LIST,
  });
}

function verdict(ok: boolean) {
  return ok ? "✓" : "✗";
}

/** Build a valid `agentkit` header exactly like the SDK client would:
 *  payload (SIWE fields + type/chainId) → SIWE message → EIP-191 signature →
 *  base64(JSON(payload)). */
async function buildHeader(
  account: ReturnType<typeof privateKeyToAccount>,
  endpoint: string,
): Promise<string> {
  const url = new URL(endpoint);
  const info = {
    domain: url.hostname, // SIWS rule: bare hostname (the gate enforces the same)
    uri: endpoint,
    version: "1",
    chainId: "eip155:11155111",
    type: "eip191" as const,
    // SIWE nonce rule (viem): alphanumeric, ≥8 chars — a UUID's dashes fail it.
    nonce: crypto.randomUUID().replace(/-/g, ""),
    issuedAt: new Date().toISOString(),
  };
  const message = formatSIWEMessage(info, account.address);
  const signature = await account.signMessage({ message });
  const payload = { ...info, address: account.address, signature };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

async function main() {
  const account = privateKeyToAccount(KEY as `0x${string}`);
  console.log(`agent wallet: ${account.address}`);
  console.log(`target:       ${origin}\n`);

  let failures = 0;
  const check = (name: string, ok: boolean, detail: string) => {
    if (!ok) failures++;
    console.log(`${verdict(ok)} ${name} — ${detail}`);
  };

  // Discover the MCP mount (Mastra auto-mounts; /mcp is the expected path).
  let mcpPath = "/mcp";
  for (const candidate of ["/mcp", "/mcp/wave"]) {
    const probe = await post(origin + candidate, {});
    if (probe.status !== 404) {
      mcpPath = candidate;
      break;
    }
  }
  const endpoint = origin + mcpPath;
  console.log(`mcp mount:    ${mcpPath}\n`);

  // 1 — anonymous
  const anon = await post(endpoint, {});
  check(
    "anonymous POST refused",
    anon.status === 403 && anon.headers.get("x-agentkit-error") === "agentkit-required",
    `status=${anon.status} x-agentkit-error=${anon.headers.get("x-agentkit-error") ?? "—"}`,
  );

  // 2 — signed by the publisher wallet
  const header = await buildHeader(account, endpoint);
  const signed = await post(endpoint, { agentkit: header });
  const signedErr = signed.headers.get("x-agentkit-error");
  check(
    "signed POST passes the gate",
    signed.status !== 403 && signed.status !== 429,
    `status=${signed.status} x-agentkit-error=${signedErr ?? "—"} x-agentkit-human=${signed.headers.get("x-agentkit-human") ?? "—"}`,
  );

  // 3 — replay the exact same header (nonce already burned)
  const replay = await post(endpoint, { agentkit: header });
  check(
    "replayed header refused",
    replay.status === 403 && replay.headers.get("x-agentkit-error") === "nonce-replayed",
    `status=${replay.status} x-agentkit-error=${replay.headers.get("x-agentkit-error") ?? "—"}`,
  );

  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
