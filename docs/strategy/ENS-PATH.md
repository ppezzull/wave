# ENS Path — Implementation Reference (Flavio / P2)

> Authoritative implementation reference for Flavio's ENS agent tasks. Grounds the
> ENSIP specs (24/25/26), ERC-7930, the viem ENS API, on-chain Sepolia facts, the
> `resolveVerify` / `register` flows, the architecture, open decisions, and a
> sequenced plan. **Implement from this doc**, not from memory.
>
> Status: **GO** — every repo prerequisite is on `main`. Single on-chain blocker:
> the Sepolia parent `.eth` name is not registered yet.
> Decisions locked this session: **viem direct** (no `ens-cli`), **full scope**
> (core G1 + ENSIP-25/ERC-7930 + ENSIP-24 stretch), **parent name to register now**.
>
> Sources cited inline; consolidated list at the end.

## 0. Scope & posture

- **Who:** Flavio (P2) — identity + agentic. The compiler/VM spine is P1 (Flaviano);
  the subgraph + UI is P3 (Pietro). See [`docs/tasks/Flavio.md`](../tasks/Flavio.md).
- **What this doc covers:** the ENS *agent-side* — `resolveVerify`, `register`,
  program-hash verification, ENSIP-25/26 records, the ERC-7930 key, ENSIP-24 stretch.
- **What it does NOT cover:** the on-chain `StrategyFactory` (P1, post-G2 stretch),
  `programHash()` (P1, in-flight PR #26), `dock()`/`ship()` (P1), the subgraph (P3).
- **Hard rules (both ENS prizes):** functional demo, **no hard-coded values**,
  video/live link, **present at the ENS booth Sunday morning (mandatory)**.

---

## 1. The two ENS prizes and how wave wins them

| Prize | $ | Wave's angle | Decisive evidence |
|---|---|---|---|
| **Best ENS Integration for AI Agents** | $1.5k | ENSIP-25 registry attestation + ENSIP-26 `agent-context`/`agent-endpoint[mcp]` + on-chain `resolveVerify`. Agents are **named, discoverable, and verifiable** onchain — not cosmetic. | resolveVerify **aborts on hash mismatch** in front of the judge (the red path). |
| **Most Creative Use of ENS** | $1.5k | Program-hash tamper-check root; follow-graph in subnames (`wave.following/<strategy>`); **stretch:** ENSIP-24 arbitrary `bytes` metadata (programHash as raw `bytes32`). | The `v0.programhash` record == recomputed on-chain hash; tampered fixture → red. |

**Disqualifiers to avoid:** cosmetic name→address only; hard-coded resolver/owner/name;
no live demo; no-show at the booth.

---

## 2. The ENSIP specs (precise)

### ENSIP-25 — AI Agent Registry, ENS Name Verification

- **Key:** `agent-registration[<registry>][<agentId>]`
- `<registry>` = the **ERC-7930 interoperable address** of the registry contract
  (hex, `0x`-prefixed). `<agentId>` = registry-defined identifier string, **MUST NOT
  contain `[` or `]`**.
- **Verification algorithm (registry → ENS):**
  1. From the registry entry, obtain claimed ENS name, agentId, registry address.
  2. Build the key with the **ERC-7930-encoded** registry address.
  3. Resolve that key on the claimed ENS name via `text(node, key)`.
  4. **Non-empty ⇒ verified.** Absent/empty ⇒ verification MUST fail.
  - Value SHOULD be `"1"`; clients MUST NOT depend on the specific value.
- **wave mapping:** `registry` = `EnsStrategyRouter`; `agentId` = the `strategyId`
  (`bytes32`, hex string — contains no brackets, so valid). The strategy's own subname
  carries the attestation that it is registered to the wave router.
- **No endpoint fields** are defined by this ENSIP — it is purely a presence-based
  attestation.

### ENSIP-26 — Agent Text Records

- **Keys:** `agent-context` (single, free-form: text/Markdown/YAML/JSON — "analogous
  to `index.html`") and `agent-endpoint[<protocol>]` (parameterized). Defined
  protocols: `agent-endpoint[mcp]`, `agent-endpoint[a2a]`, `agent-endpoint[web]`.
  - `agent-endpoint[*]` value MUST be a valid URL (http/https/ipfs).
- Uses the **standard ENSIP-5** mechanism: resolver `setText(bytes32 node, string
  key, string value)` / `text(bytes32 node, string key)`.
- **wave mapping:** `agent-endpoint[mcp]` = the wave MCP server URL
  (`http://agent:3002` from `docker-compose`) — this is the **direct hook into the
  existing MCP server**. `agent-context` = a Markdown description of the strategy
  (pair, risk params, how to interact). May reference the ENSIP-25 record.

### ENSIP-24 — Arbitrary Data Resolution (**Draft** — stretch)

- A **new resolver profile** `IDataResolver` (selector `0xecbfada3`) with
  `data(bytes32 node, string key) returns bytes`, a `DataChanged` event (indexed node,
  hashed key, raw key, indexed data), and an optional `ISupportedDataKeys`
  (`0x29fb1892`) for key discovery.
- Purpose: store unstructured `bytes` (hashes, interoperable addresses, context)
  more gas-efficiently than text records.
- **wave use:** store `programHash` as raw `bytes32` under e.g. key `v0.programhash`.
- ⚠️ **Gating risk:** the standard Sepolia Public Resolver almost certainly does
  **not** implement `IDataResolver` yet (it's a Draft). Plan A = text record
  (`v0.programhash` as hex string); Plan B (creative) = detect `IDataResolver`
  support on the resolver at runtime, fall back to text. Disclose as "draft standard."

---

## 3. ERC-7930 — the one unknown-cost item

ERC-7930 binds a **(chain, address)** pair into a compact binary blob. It is required
**only** for the ENSIP-25 key's `<registry>` field — i.e. it gates the "AI Agents"
attestation, **not** the core `resolveVerify` / `register` path. (Source: EIP-7930.)

### Byte layout (6 fields, no trailing fields)

| Offset | Field | Size | Value / meaning |
|---|---|---|---|
| 0 | Version | 2 | big-endian; for v1 **`0x0001`** |
| 2 | ChainType | 2 | CASA namespace; EVM = **`0x0000`** |
| 4 | ChainReferenceLength | 1 | length of the next field |
| 5 | ChainReference | N | per CAIP-350 profile (EVM: minimal big-endian chainId) |
| 5+N | AddressLength | 1 | length of address in bytes |
| 6+N | Address | M | address bytes |

Encoding: `uint16BE(version) | uint16BE(chainType) | uint8(len) | chainRef | uint8(len) | address`.

### Worked examples

**Mainnet (chain 1), `0x8004A169…432`** (spec Example 1):
```
0x 0001 0000 01 01 14 8004a169fb4a3325136eb29fa0ceb6d2e539a432
   Ver  CTyp │L│CR│L│ Address (20 bytes)
            chainRef=0x01 (=1)
```

**Sepolia (chain 11155111 = `0xAA36A7`, 3 bytes), `EnsStrategyRouter` `0xeb513fd…52c4`:**
```
0x 0001 0000 03 aa36a7 14 eb513fd18c391fae1513ff12c1f97bf659d052c4
   Ver  CTyp │L│ chainRef │L│ Address (20 bytes)
            len=3
```
⇒ **29 bytes**: `0x0001000003aa36a714eb513fd18c391fae1513ff12c1f97bf659d052c4`.

So the ENSIP-25 key for a wave strategy is:
```
agent-registration[0x0001000003aa36a714eb513fd18c391fae1513ff12c1f97bf659d052c4][<strategyId>]
```

> ⚠️ The EVM CAIP-350 profile encodes chainId as **minimal big-endian** (confirmed for
> chainId 1 → `0x01`; multi-byte values like Sepolia's `aa36a7` follow the same rule).
> If a chosen library emits a different width, match it to what the verifier expects.

### Encoder options

- **Library:** `@wonderland/interop-addresses` (TS, convert between interop formats) —
  verify its exact encode API before depending on it. (`ethlimo/ens-hooks` also wraps
  ERC-7930 for ENS cross-chain.)
- **Hand-roll (~15 lines):** trivial given the layout above. Zero new dep, zero
  version risk — **recommended for the hackathon.** Sketch:

```ts
// sketch only — not implemented
function erc7930(chainId: number, address: `0x${string}`): `0x${string}` {
  const ref = toBeHex(chainId).slice(2).replace(/^0+/, "") || "0"; // minimal BE
  const refBytes = hexToBytes(`0x${ref}`);
  const addrBytes = hexToBytes(address);
  const out = concat([uint16BE(1), uint16BE(0), uint8(refBytes.length),
                      refBytes, uint8(addrBytes.length), addrBytes]);
  return toHex(out);
}
```

---

## 4. viem ENS API (current — grounded via context7, `/wevm/viem`)

`viem ^2.55.8` is already a dependency. **Reads** are first-class; **writes** are not —
use `walletClient.writeContract` on the resolver/registry.

### Reads — `publicClient` on `sepolia`

| Action | Signature | Returns |
|---|---|---|
| `getEnsAddress` | `({ name })` | `Address \| null` |
| `getEnsText` | `({ name, key })` | `string \| null` |
| `getEnsResolver` | `({ name })` | resolver `Address` |

- Always normalize names: `import { normalize } from "viem/ens"`.
- These default the Universal Resolver to `client.chain.contracts.ensUniversalResolver.address`,
  so create the client on `sepolia` (which ships the preset) — **no hard-coded address.**

### Writes — `walletClient` + `writeContract` (no high-level ENS write actions)

- **Set a text record** → call the **Public Resolver** `setText(bytes32 node, string key, string value)`.
- **Mint a subname** → call the **ENS Registry** `setSubnodeRecord(bytes32 parentNode, string label, address owner, address resolver, uint64 ttl)` (sets owner + resolver + ttl atomically).
- Compute `node` with `namehash` (viem: `import { namehash } from "viem"`; verify exact
  path) and `label` with the labelhash of the normalized label.

> The `bytes32 ensNode` carried by `StrategyDeployed(strategyId, programHash, ensNode)`
> **must equal** the namehash of the strategy subname — compute it identically here and
> in the router's emitter (P1) so resolveVerify compares like with like.

---

## 5. On-chain facts — Sepolia (chainId `11155111`)

> ⚠️ **Address correction (2026-07-26, verified on-chain):** `PROD-TESTNET.md` §3's ENS
> addresses (`ENS Registry 0x0000…2e1e`, `Public Resolver 0xE99638b4…49b5`) are
> **MAINNET**, not Sepolia — reading them on Sepolia gave false negatives. **Resolve
> dynamically** via viem ENS actions (`getEnsResolver`/`getEnsAddress`) + chain presets;
> never hard-code. `wave.eth` IS registered on Sepolia (resolves to the wallet; resolver
> supports `setText`).

| Item | Value | Source |
|---|---|---|
| `EnsStrategyRouter` | `0xeb513fd18c391fae1513ff12c1f97bf659d052c4` | `swap-vm/deployments/sepolia/EnsStrategyRouter.json`; ABI `swap-vm/abi/EnsStrategyRouter.abi.json` (on `main`, PR #20) |
| Aqua | `0xdc8C2b141CF705F12f6BB45af3830341daBB1D1E` | `swap-vm/config/constants.json` |
| WETH | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | `swap-vm/config/constants.json` |
| Router **owner EOA** | `0x2058C253029bB0Cf1E1aD43DfAEF63D658A8dddf` | `swap-vm/config/constants.json` |
| ENS Registry | ⚠️ resolve at build time via viem preset / `baseRegistrar.ens()` — **`0x0000…2e1e` is MAINNET** | verified 2026-07-26 |
| **Public Resolver (wave.eth)** | `0x896156aDE70DC61319BD1ACFa2563cB443eDb233` | **verified on-chain 2026-07-26** — set by the ENS app; supports `setText` (text iface `0x59d1d43c`) ✅ |
| Universal Resolver | viem `sepolia.contracts.ensUniversalResolver.address` | viem chain preset (works — used by `getEnsAddress`) |
| ETH Registrar Controller | `0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968` | `PROD-TESTNET.md` §3 (used only for parent registration — **done**) |
| Base Registrar | `0x57f1887a8BF19b14fc0dF6Fd9B2acc9Af147eA85` | `PROD-TESTNET.md` §3 |
| Parent `.eth` 2LD | **`wave.eth`** — registered on Sepolia, owned by `0x2058…ddf`, resolves to the wallet | verified 2026-07-26 |
| Live swap (1inch qualified) | tx `0xd8056fde…9601`, block 11350065 | `docs/tasks/Flaviano.md` |
| `programHash()` | **REAL** — wired via `dd35dc9` ("Wire real programHash into StrategyDeployed + TS disassembler") | commit `dd35dc9` (unblocks G1 real-hash + G3 CI) |
| `StrategyDeployed` event | `(bytes32 indexed strategyId, bytes32 programHash, bytes32 indexed ensNode)` | frozen |

**Subname scheme:** `<pair>-<variant>.<parent>` (e.g. `eth-usdc-guarded.wave.eth`).

> ⚠️ `announceStrategy()` is **`onlyOwner`** (owner = the EOA above). If the agent
> announces from any other key it **reverts on stage**. Resolve before the demo:
> (a) give the agent that key, or (b) `router.transferOwnership(<agent key>)`.
> *(Runbook item, not code — but it silently breaks Beat B.)*

---

## 6. Record set — who writes what

| Key | Standard | Writer | Carries |
|---|---|---|---|
| `v0.programhash` | custom (text) | `register.ts` (P2) | keccak256 of compiled bytecode — **tamper-check root** |
| `description` | ENSIP-5 | strategist (P2) | the literal compiler input ("post is the prompt"); round-trips byte-for-byte into `/api/compile` |
| `avatar` | ENSIP-5 | strategist (P2) | URL/data-URI for the card |
| `agent-context` | **ENSIP-26** | `register.ts` (P2) | Markdown: pair, risk params, how to interact |
| `agent-endpoint[mcp]` | **ENSIP-26** | `register.ts` (P2) | `http://agent:3002` (the MCP server) |
| `agent-registration[<erc7930 router>][<strategyId>]` | **ENSIP-25** | `register.ts` (P2) | `"1"` — registry attestation |
| `wave.following/<strategy>` | ENSIP-5 | the **follower**, on the follower's own name | a follow = one such record; indexed by the subgraph (P3), not resolved directly |

Sources: `TECH-STACK.md`, `PROD-TESTNET.md` §3, `docs/sponsors/ens/OVERVIEW.md`,
`frontend.md`.

---

## 7. `resolveVerify` flow + the negative path (G1 gate)

From `10-10-PLAYBOOK.md` L138, `Flavio.md` L15, `frontend.md` §3/§6:

1. **Resolve** the strategy subname (e.g. `eth-usdc-guarded.wave.eth`).
2. **Read** `v0.programhash` via `getEnsText`.
3. **Recompute** the hash from the live on-chain program —
   `router.getProgramHash(strategyId)` (wrapped by the `getProgramHash` MCP tool;
   backed by the `StrategyDeployed` event).
4. **Compare; abort on mismatch.**

**Negative path (the ENS proof):** a tampered-record fixture (recorded hash ≠ on-chain
hash) → the verify throws/returns `mismatch`. The UI `EnsDiscovery` chip renders both
hash columns; on match both `ok`, on mismatch both flip `danger` with a `TAMPERED` tag.
**G1 bar:** resolveVerify aborts on the tampered fixture → merge to `main`.

> The negative path does **not** require the real `programHash()` — it needs the ABI
> (on `main`) + a fixture hash. It is buildable now.

---

## 8. `register` flow

From `Flavio.md` L10–L14:

1. **Dry-run first (no wiring):** register parent 2LD → mint one subname → set
   `agent-context` (ENSIP-26) + a parameterized ENSIP-25 record → resolve all back.
   Proves the loop end-to-end and "no hard-coded values."
2. **`register.ts` skeleton:** subname on the Sepolia Public Resolver; write ENSIP-25
   records.
3. **Complete `register.ts`:** also write `v0.programhash` from P1's `programHash()`
   (placeholder `bytes32` until it lands).

Records written per subname: `v0.programhash`, `description`, `agent-context`,
`agent-endpoint[mcp]`, `agent-registration[<erc7930 router>][<strategyId>]`.

> **Tension to resolve:** `PROD-TESTNET.md` §3 says the on-chain **`StrategyFactory`
> mints subnames**; `Flavio.md` says `register.ts` does. `StrategyFactory` is a
> post-G2 stretch (not built). **Recommended:** `register.ts` writes ENS directly via
> viem now; when/if the factory lands, delegate to it. Decide in §10.

---

## 9. Architecture & files

> Note: `AGENT.md`'s target tree (`src/agents/`, `src/ens/`) does **not** match the
> real tree (agents live in `src/mastra/*.agent.ts`; clients in `src/clients/`).
> Put new ENS logic in `src/ens/`; put the agent in `src/mastra/ens.agent.ts`.

| Path | Purpose |
|---|---|
| `agent/src/config/env.ts` | add `ensConfig()` — RPC URL, parent name, key holder; chain presets from viem `sepolia` (no hard-code) |
| `agent/src/ens/clients.ts` | viem `publicClient` (sepolia) + `walletClient` (from `SEPOLIA_PRIVATE_KEY`) |
| `agent/src/ens/namehash.ts` | re-export `namehash`/`normalize`; ensure `ensNode` parity with the router emitter |
| `agent/src/ens/erc7930.ts` | `erc7930(chainId, address)` encoder (§3) |
| `agent/src/ens/register.ts` | parent→subname→records (§6, §8) |
| `agent/src/ens/resolveVerify.ts` | resolve→read→recompute→abort (§7) |
| `agent/src/ens/ensip24.ts` | `IDataResolver` setData/data + `DataChanged` (stretch, §2) |
| `agent/src/clients/ens.ts` | **replace the stub**: `resolve`, `getTextRecord`, **+`setText`**, **+`registerSubname`**, **+`getResolver`** |
| `agent/src/mcp/writes.ts` (new) | `setText` + `registerSubname` MCP write tools (autonomous, never HITL-gated) |
| `agent/src/mcp/server.ts` | register the write tools on `waveMcpServer` |
| `agent/src/mastra/ens.agent.ts` | `ensAgent` subagent owning resolve/verify/register |
| `agent/src/mastra/index.ts` | register `ensAgent` on the Mastra instance |
| `agent/src/test/ens.resolveverify.test.ts` | tampered-fixture negative path + (later) round-trip hash-chain CI (G3) |
| `agent/src/ens/sepolia-dryrun.smoke.ts` | live loop (gated on parent name + key) |
| `swap-vm/config/constants.json` | add ENS entries (parent name, owner) — currently has none |

---

## 10. Open decisions (recommended answers)

1. **ERC-7930 approach** → **hand-roll** (~15 lines, §3); fall back to
   `@wonderland/interop-addresses` only if a verifier needs its exact output.
2. **Parent 2LD + owner** → register a fresh name (user to register now) with a funded
   wallet; owner key via `SEPOLIA_PRIVATE_KEY`. Decide whether that key is the same as
   the router-owner EOA (`0x2058…ddf`) — reuse is the fewest moving parts for the demo.
3. **`<registry>` / `<agentId>`** → registry = `EnsStrategyRouter`; agentId = `strategyId`.
4. **`register.ts` architecture** → write ENS directly via viem now (factory is a
   stretch); delegate later.
5. **`EnsDiscovery` payload** (for Pietro) → `{ subname, recordedProgramHash,
   onChainProgramHash, description, avatar, match: boolean }` (composed helper on the
   ens client). `agent-endpoint[mcp]` value = `http://agent:3002`.
6. **Client lib** → **viem direct** (decided; `ens-cli` experimental risk on the ENS
   dealbreaker).

---

## 11. Sequenced plan

1. **Config + clients** — `ensConfig()` in `env.ts`; `src/ens/clients.ts`
   (publicClient/walletClient on `sepolia`, viem presets).
2. **Wire `clients/ens.ts`** — replace stub (`resolve`/`getTextRecord`) + add
   `setText`/`registerSubname`/`getResolver`.
3. **ERC-7930 encoder** — `src/ens/erc7930.ts`; unit-check vs the ENSIP-25 mainnet
   example and the Sepolia value in §3.
4. **`register.ts`** — parent→subname→records (incl. ENSIP-25/26).
5. **`resolveVerify.ts` + negpath test** — the G1 proof (no real `programHash()` needed).
6. **ENSIP-24 stretch** — detect `IDataResolver`; fall back to text.
7. **MCP write tools + `ensAgent`** — register on the Mastra instance.
8. **`sepolia-dryrun.smoke.ts`** — gated on parent name + key.
9. **typecheck + tests** — `npm run typecheck` + `npm run test` (vitest); keep the
   existing 28 green.

---

## 12. Blockers & coordination

| Need | Status | Owner | Action |
|---|---|---|---|
| Parent `.eth` on Sepolia | 🔴 not registered | Flavio | register now (funded key) |
| `programHash()` real | `bytes32(0)` | Flaviano | PR #26 (`feat/compiler-emit`: `ir.ts`+`emit.ts`) imminent — unblocks real hash-verify + G3 CI |
| `dock()`/`ship()` | absent (by design) | Flaviano | confirm signature (gates `recompileAndShip`, G2) |
| `announceStrategy` owner key | EOA `0x2058…ddf` | Flavio+Flaviano | key-share or `transferOwnership` (runbook) |
| Subgraph endpoint | not authored | Pietro | author schema first (gates `graphDelta` real source, G2) |
| Custom opcodes | PR #24 open | Flaviano | review #26 first (unblocks both) |

---

## 13. Testing & verification

- **Negpath unit test:** tampered fixture → `resolveVerify` aborts (the ENS evidence).
- **Round-trip hash-chain CI (G3):** `emit keccak == ENS record == on-chain hash` —
  needs real `programHash()` (post PR #26).
- **Sepolia dry-run smoke:** parent → subname → records → resolve back; proves
  "no hard-coded values."
- **Gate:** `npm run typecheck` clean + `npm run test` green (no regression to the
  existing 28).

---

## 14. Sources

- ENSIP-25 (AI Agent Registry Verification): https://docs.ens.domains/ensip/25
- ENSIP-26 (Agent Text Records): https://docs.ens.domains/ensip/26
- ENSIP-24 (Arbitrary Data Resolution): https://docs.ens.domains/ensip/24
- EIP-7930 (Interoperable Addresses): https://eips.ethereum.org/EIPS/eip-7930
- ERC-7930 TS lib: `@wonderland/interop-addresses`; `ethlimo/ens-hooks`
- Interop addresses overview: https://interopaddress.com/
- viem ENS actions (context7 `/wevm/viem`): `getEnsAddress`, `getEnsText`,
  `getEnsResolver`; writes via `writeContract`.
- Repo: `docs/strategy/{TECH-STACK,AGENT,frontend,PROD-TESTNET}.md`,
  `docs/tasks/Flavio.md`, `docs/sponsors/ens/OVERVIEW.md`,
  `srcs/requirements/swap-vm/{abi,deployments,config}/…`,
  `srcs/requirements/agent/src/{clients/ens.ts,mcp/{reads,server}.ts,config/env.ts,mastra/index.ts}`.
