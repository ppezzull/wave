# Deploy to live Sepolia (testnet) — runbook + compatibility audit

State: **device E2E COMPLETE on the fork** (12 Sep 2026) — two hardware ships
through the full announce → attribute → approve → ship path, on-chain hash ==
recomputed-from-post hash, idempotent re-ship handling live. All suites green:
forge **755/755**, compiler **54/54**, agent **114/114**, UI **47/47**. The
create surface is now the **chat widget** (right-docked movable window;
`/chat` is the conversation selector; `/compose` redirects).

Live Sepolia today serves the Lisboa-era router `0x698d…0c68` (old surface),
Aqua `0xdc8C…D1E`, Studio subgraph v0.0.5 (no author field). This doc is what
stands between us and the live redeploy.

## Compatibility audit — verified 11 Sep 2026, re-confirmed 12 Sep

What is PROVEN compatible (on a fork of live Sepolia, same Aqua address, same
contract bytecode the deploy scripts produce):

- **New router + existing live Aqua** — no Aqua redeploy needed. The whole
  announce → attribute → approve → ship → dock flow ran against the
  live-Aqua fork state, **with the Ledger device gate in the loop**.
- **One-id encoding** — `strategyId = keccak(wrapped abi.encode(order))` =
  `SwapVM.hash` = Aqua dock hash = subgraph row id. Fork-proven byte-exact;
  live router is the same source, so the same semantics hold.
- **Idempotent ship** — the agent reads Aqua `rawBalances` before shipping;
  an already-docked strategy returns `alreadyDeployed` instead of reverting
  `StrategiesMustBeImmutable` (0x879f237b). Survives agent restarts (the
  chain is the authority, not process memory).
- **Subgraph v0.0.6 vs old rows** — author is a non-null field: Studio will
  re-index from startBlock (automatic). Pre-existing strategies keep the
  `0x00…0` sentinel; both frontend clients carry the old-deploy field-retry so
  they keep working against v0.0.5 *and* v0.0.6.
- **Deploy scripts exist** — `DeployEnsStrategyRouter.s.sol`,
  `DeployStrategyFactory.s.sol` (+ `DeployAqua` if ever needed) in
  `swap-vm/script/`.
- **Ledger env plumbing** — `srcs/docker-compose.yml` passes
  `LEDGER_GATE/LEDGER_APPROVER_ADDRESS` to BOTH containers (runtime env via
  the `approvalGateConfig` server action — no NEXT_PUBLIC rebuild coupling).
  The agent service **defaults to `LEDGER_GATE=device`** (fail closed).
- **RPC requirement** — the live RPC must support `eth_getLogs` (lesson G1:
  silent subgraph starvation otherwise). Use a real provider, not a restricted
  gateway.

## ⚠️ Two blockers (user-side)

1. **FUNDING** — ~0.1 Sepolia ETH → `0x5F86EB2879e4fDc38D84f10135be7BB97fa93eE2`
   (checked 12 Sep: **0 ETH**). Covers router + factory deploys plus several
   ships (5 txs/ship: announce, attribute, approve ×2, ship).
2. **The live announcer key is EMPTY in `.env`** — the live block's
   `ANNOUNCER_PRIVATE_KEY=` is blank; only the bottom LOCAL-ANVIL-FORK
   override carries a key (the fork throwaway `0x829F…24C7`, unsuitable for
   live). Whoever funds `0x5F86…3eE2` must put THAT wallet's key in the live
   block and set `EXPECTED_ANNOUNCER_OWNER=0x5F86…3eE2`. The deployer of the
   new router/factory becomes their `owner`; announce + attribute are
   onlyOwner, so deployer == announcer == funded wallet, always.

Also: `graph auth --studio <deploy-key>` (Studio account 1756983) if
`subgraph/.studio-auth` is missing on the machine running the deploy.

Also decide: the strategy pair's live liquidity needs REAL tokens (WETH is a
plain ETH deposit; **LINK needs the Chainlink faucet** — we fabricated it on
the fork). First live ship can use small amounts.

## Runbook (order matters)

1. [you] Fund `0x5F86…3eE2` (faucet). Fill the live `.env` announcer key +
   `EXPECTED_ANNOUNCER_OWNER`. Comment out the fork-override block.
2. [you] `graph auth --studio <key>` inside `srcs/requirements/subgraph/`.
3. [deploy] Router + factory, from `srcs/requirements/swap-vm/`:
   `forge script script/DeployStrategyFactory.s.sol:DeployStrategyFactory
   --rpc-url $SEPOLIA_RPC_URL --private-key <funded-key> --broadcast`
   (same shape for the router; Aqua comes from `config/constants.json`).
   Capture addresses + blocks.
4. [subgraph] `subgraph.yaml`: new router/factory addresses + startBlocks →
   `pnpm codegen && pnpm build && pnpm deploy:studio` (v0.0.6; re-indexes).
5. [env] Bump new addresses + `v0.0.6` Studio URL in: root `.env`,
   both subgraph client defaults (agent + frontend), `.env.example`,
   `agent/.env.example`, `docs/submission/ETHGLOBAL.md`.
6. [host] Frontend + agent: Dokploy (or any HTTPS host) with
   `LEDGER_GATE=device` + `LEDGER_APPROVER_ADDRESS=0x725DbDe0C66e76538724bbfDe432bc86bE5b79F9`
   on both containers; re-add the prod URL to Privy authorized domains.
   **WebHID requires HTTPS — the Ledger browser transport dies on plain HTTP.**
7. [E2E] One real ship from the **chat widget**: description → agent compile →
   two-click ship → Ledger device approval → on-chain → Studio row with
   author + capital + description → profile renders it. Record it (bounty
   video material).

Owner rule recap: new router/factory owner = funded deployer EOA; the agent's
announcer key must derive to the SAME address or every onlyOwner call fails
(the agent validates this at boot via `EXPECTED_ANNOUNCER_OWNER`).

## Ledger — status (12 Sep 2026)

DONE and fork-proven:

- Device pairing (Nano S Plus, derivation `44'/60'/0'/0/0`, approver
  `0x725D…79F9` pinned in root `.env`).
- **Hardware E2E through the full ship path** (twice). The signed message is
  STRICTLY ASCII on both sides — the DMK signer kit frames APDU length from
  JS string length but encodes UTF-8; one em-dash desyncs the frame (device
  shows the prompt, then aborts with 6980 / "no signature returned"). Both
  packages pin the ASCII message + byte-parity tests.
- Honest failure classification (every DMK tag + status word), timeouts,
  stale-session drop, `[wave:ledger]` evidence trail.
- Session-mode fallback (Privy wallet signs the same hash-bound message).

Remaining (post-funding, pre-Sep-13 for the bounty):

1. **Key Ring custody** — `wallet-cli ring init` → `ring encrypt` the
   announcer key; agent boot seam via `LEDGER_RING_KEY` (device must be
   present to decrypt).
2. **≤5-min walkthrough video** (bounty requirement, deadline **Sep 13**):
   bare click refused → device approves the exact strategy → session-mode
   fallback → Key Ring decrypt at boot.
3. (Optional hardening) freshness/nonce in the approval message — today the
   hash binds the spec; replay is defanged by the idempotent-ship guard.

Kill-switch while testing: `LEDGER_GATE=off` on both services (ships behave
exactly as pre-gate).

## Mainnet — what changes (post-event, second deploy)

The stack is one env flip away from mainnet — with three caveats to clear:

1. **Chain flip** — `WAVE_CHAIN_ID=1` flips every agent write client to
   mainnet (`agent/src/clients/aquaWrite.ts` reads it; viem signs with the
   chain id, so a mismatch fails EIP-155 validation). The UI needs no change.
   Subgraph: Studio indexes Ethereum mainnet — same `pnpm deploy:studio`
   flow with a mainnet `subgraph.yaml` network + new startBlocks.
2. **Oracle feeds** — the compiler's feed registry has mainnet `ETH/USD`,
   `BTC/USD`, `DAI/USD` verified ON-CHAIN (description/decimals/fresh round
   read during the earlier mainnet-fork E2E); `LINK/USD` and `USDC/USD` are
   zero + unverified — resolveFeed refuses them. **Guarded strategies on
   mainnet must reference verified feeds only** (or verify the two remaining
   aggregators against docs.chain.link and flip the flags in
   `compiler/src/registry.ts`).
3. **Fresh compatibility pass on a MAINNET fork** — this runbook's audit is
   Sepolia-fork-proven; mainnet needs the same one-shot fork E2E (deploy
   scripts → announce/attribute/approve/ship with the device gate) before
   real funds. Mainnet ETH for the announcer + ship liquidity, same
   owner == deployer == announcer rule, same HTTPS/WebHID hosting requirement.

No code changes are expected for mainnet — env, subgraph network, and the
feed-registry flags are the whole delta.
