# Deploy to live Sepolia (testnet) — runbook + compatibility audit

State: local fork E2E fully green (merged `main`, 948 tests). Live Sepolia today
serves the Lisboa-era router `0x698d…0c68` (old surface), Aqua `0xdc8C…D1E`,
Studio subgraph v0.0.5 (no author field). This doc is what stands between us
and the live redeploy.

## Compatibility audit — verified 11 Sep 2026

What is PROVEN compatible (on a fork of live Sepolia, same Aqua address, same
contract bytecode the deploy scripts produce):

- **New router + existing live Aqua** — no Aqua redeploy needed. The whole
  announce → attribute → approve → ship → dock flow ran against the
  live-Aqua fork state.
- **One-id encoding** — `strategyId = keccak(wrapped abi.encode(order))` =
  `SwapVM.hash` = Aqua dock hash = subgraph row id. Fork-proven byte-exact;
  live router is the same source, so the same semantics hold.
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
- **RPC requirement** — the live RPC must support `eth_getLogs` (lesson G1:
  silent subgraph starvation otherwise). Use a real provider, not a restricted
  gateway.

## ⚠️ Three blockers (all fixable in minutes)

1. **FUNDING** — ~0.1 Sepolia ETH → `0x5F86EB2879e4fDc38D84f10135be7BB97fa93eE2`.
   Covers router + factory deploys plus several ships (5 txs/ship:
   announce, attribute, approve ×2, ship).
2. **The live announcer key is EMPTY in `.env`** — the live block's
   `ANNOUNCER_PRIVATE_KEY=` is blank; only the bottom LOCAL-ANVIL-FORK
   override carries a key (the fork throwaway `0x829F…24C7`, unsuitable for
   live). Whoever funds `0x5F86…3eE2` must put THAT wallet's key in the live
   block and set `EXPECTED_ANNOUNCER_OWNER=0x5F86…3eE2`. The deployer of the
   new router/factory becomes their `owner`; announce + attribute are
   onlyOwner, so deployer == announcer == funded wallet, always.
3. **Studio deploy key missing** — `subgraph/.studio-auth` does not exist on
   this machine. Re-run `graph auth --studio <deploy-key>` (key from the
   Studio dashboard, account 1756983) before `pnpm deploy:studio`.

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
6. [host] Frontend + agent: either run locally against live RPC + Studio
   (zero hosting work), or revive the Dokploy deploy (portal URL was 522 —
   also blocks the Privy app review re-submission) and set
   `LEDGER_GATE=device` + `LEDGER_APPROVER_ADDRESS` on both containers.
   WebHID requires HTTPS — the Ledger browser transport dies on plain HTTP.
7. [E2E] One real ship: compose → Ledger approval (device) → on-chain → Studio
   row with author + capital + description → profile renders it. Record it.

Owner rule recap: new router/factory owner = funded deployer EOA; the agent's
announcer key must derive to the SAME address or every onlyOwner call fails
(the agent validates this at boot via `EXPECTED_ANNOUNCER_OWNER`).

## Ledger — pairing + remaining work (device in hand)

The approval gate is built and session-mode-verified on the fork (refuses
without a signature, ships with the author's). What's left is the device leg:

1. **Pair** — `npm i -g @ledgerhq/wallet-cli` → `wallet-cli account discover
   ethereum` (or the Settings → "Pair device" button) → copy the device's ETH
   address into `LEDGER_APPROVER_ADDRESS` → set `LEDGER_GATE=device`.
2. **E2E** — ship from /compose: the panel walks connect → app-open → sign;
   the device screen shows `wave HITL approval [<hash>] — <description>`.
3. **Key Ring custody** — `wallet-cli ring init` → `ring encrypt` the
   announcer key; agent boot seam via `LEDGER_RING_KEY` (device must be
   present to decrypt).
4. **≤5-min walkthrough video** (bounty requirement, deadline **Sep 13**):
   bare click refused → device approves the exact strategy → session-mode
   fallback → Key Ring decrypt at boot.

Kill-switch while testing: `LEDGER_GATE=off` on both services (ships behave
exactly as pre-gate).
