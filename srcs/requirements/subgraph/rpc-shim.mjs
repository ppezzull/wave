// RPC shim for the local graph-node ↔ anvil stack (dev only).
//
// WHY: anvil's EIP-1898 support is broken in the one place graph-node leans on it —
// `eth_getBlockByNumber([{"blockNumber":"0x…"}, false])` returns a block WITHOUT a
// hash, which makes graph-node's ingestor choke ("Block N does not contain hash")
// and stalls indexing. graph-node v0.45 has no working provider flag to avoid the
// object form (its own probe merely logs "Provider does not support EIP 1898").
//
// WHAT: a dumb JSON-RPC reverse proxy on :8547 → 127.0.0.1:8546 that flattens any
// EIP-1898 object param ({"blockNumber"} / {"blockHash"}) to the bare value before
// forwarding. Handles single requests and batches. Logs each rewrite (method + old
// param) so the graph-node request shapes are observable.
//
// Run:  node rpc-shim.mjs          (then point graph-node at :8547)
//
// ALSO: a CORS-enabled /sign endpoint for the injected dev wallet (fake
// window.ethereum in the UI browser session — see docs in rpc-shim usage):
//   POST /sign {"message":"0x…hex","address":"0x…"} → {"signature":"0x…"}
// The key below is a THROWAWAY generated with `cast wallet new` for local dev —
// it funds nothing and exists only to answer Privy's SIWE personal_sign.
import http from "node:http";
import { spawnSync } from "node:child_process";

const UPSTREAM = process.env.SHIM_UPSTREAM ?? "http://127.0.0.1:8546";
const PORT = Number(process.env.SHIM_PORT ?? 8547);
const upstream = new URL(UPSTREAM);

// Dev wallet for the fake injected provider (empty address on the fork).
const DEV_ADDRESS = "0xAB459eB72e55d8BCACf762165d96281e0996Cb95";
const DEV_KEY = "0x6bf104fb6c8f1ce251e42f2c2b741f03d3b539c2f37605431f0aa4f967c3745e";

/** EIP-191 personal_sign of a hex message via `cast wallet sign`. */
function signPersonal(hexMessage) {
  let msg = hexMessage;
  if (typeof msg === "string" && msg.startsWith("0x")) {
    // hex → UTF-8 (SIWE messages are text); keep raw if not decodable.
    try {
      msg = Buffer.from(msg.slice(2), "hex").toString("utf8");
    } catch { /* keep raw */ }
  }
  const r = spawnSync("cast", ["wallet", "sign", "--private-key", DEV_KEY, msg], {
    encoding: "utf8", timeout: 15_000,
  });
  const sig = (r.stdout || "").trim();
  if (r.status !== 0 || !sig.startsWith("0x")) {
    throw new Error(`cast sign failed: ${(r.stderr || r.error?.message || "").slice(0, 200)}`);
  }
  return sig;
}

/** Flatten EIP-1898 object params to bare values. Returns [newParams, rewrites]. */
function flatten(params) {
  const rewrites = [];
  const out = Array.isArray(params) ? [...params] : params;
  if (Array.isArray(out)) {
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      if (p && typeof p === "object" && !Array.isArray(p)) {
        if ("blockNumber" in p && typeof p.blockNumber === "string") {
          out[i] = p.blockNumber;
          rewrites.push(`#${i}={blockNumber:${p.blockNumber}}`);
        } else if ("blockHash" in p && typeof p.blockHash === "string") {
          out[i] = p.blockHash;
          rewrites.push(`#${i}={blockHash:${p.blockHash}}`);
        }
      }
    }
  }
  return [out, rewrites];
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    // CORS so the injected browser provider (page origin :3000) may call us.
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end();
      return;
    }
    const body = Buffer.concat(chunks).toString("utf8") || "";

    // Sign endpoint for the fake injected wallet.
    if (req.url === "/sign") {
      try {
        const { message, address } = JSON.parse(body || "{}");
        if (address && address.toLowerCase() !== DEV_ADDRESS.toLowerCase()) {
          res.writeHead(400, cors).end(JSON.stringify({ error: "unknown dev address" }));
          return;
        }
        res.writeHead(200, { ...cors, "content-type": "application/json" })
          .end(JSON.stringify({ signature: signPersonal(message) }));
      } catch (e) {
        res.writeHead(500, cors).end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, cors).end("bad json");
      return;
    }

    const isBatch = Array.isArray(payload);
    const calls = isBatch ? payload : [payload];
    let total = 0;
    for (const call of calls) {
      if (call && typeof call === "object" && Array.isArray(call.params)) {
        const [params, rewrites] = flatten(call.params);
        call.params = params;
        if (rewrites.length) {
          total++;
          console.log(`[shim] ${call.method ?? "?"} ${rewrites.join(" ")}`);
        }
      }
    }
    if (total) console.log(`[shim] flattened ${total} EIP-1898 param(s) in this ${isBatch ? "batch" : "call"}`);

    try {
      const up = await fetch(upstream, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isBatch ? calls : calls[0]),
      });
      const text = await up.text();
      res.writeHead(up.status, { ...cors, "content-type": up.headers.get("content-type") ?? "application/json" });
      res.end(text);
    } catch (e) {
      console.error(`[shim] upstream error: ${e.message}`);
      res.writeHead(502, cors).end(JSON.stringify({ error: { message: `shim upstream: ${e.message}` } }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`[shim] :${PORT} → ${UPSTREAM} (EIP-1898 flattening ON)`));
