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
- **World env plumbing** — `srcs/docker-compose.yml` passes
  `WORLD_SIGNING_KEY/APP_ID/RP_ID` to the frontend container (no
  NEXT_PUBLIC needed).
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
   also blocks the World app review re-submission) and set the World env on
   the container + `WORLD_IDKIT_ENV=staging` for Sandbox verification.
7. [E2E] One real ship: compose → World verify (phone) → on-chain → Studio
   row with author + capital + description → profile renders it. Record it.

Owner rule recap: new router/factory owner = funded deployer EOA; the agent's
announcer key must derive to the SAME address or every onlyOwner call fails
(the agent validates this at boot via `EXPECTED_ANNOUNCER_OWNER`).

## World — remaining work (Flavio's handoff, as of 11 Sep)

The code is merged and local-verified (gate 403s anonymous callers, publish
gate passes via dev fixture, trust panel renders honest states). What is left
is the phone-gated, non-local leg — in order:

1. **AgentBook registration** of the two agent wallets — publisher
   `0xf4AF4E8f4F49032257D9C1e3F1d9c5324a040620`, retuner
   `0x92b4747d624253f1B7598A996bb44855d8008017` (keys already in `.env`,
   perms 600): `npx @worldcoin/agentkit-cli register <address>` + World App
   verify on a phone, once per wallet. Then `agentkit-cli status` + the
   real-client e2e smoke the Step-2 notes deferred until registration.
2. **One real Sandbox App verification** through the compose→ship publish
   gate (World App on the phone, `WORLD_IDKIT_ENV=staging`) — this closes
   the dev-fixture gap; until then local passes don't prove the real path.
3. **`FEEDBACK-WORLD.md` §3** — fill in the CLI `register`/`status` and
   Portal flow findings from that run (the bounty's mandatory feedback doc;
   §1/§2/§4 already carry real findings).
4. **Developer Portal re-submission** — the app review was withdrawn when
   the hosted URL returned 522; re-submit once the deploy is revived
   (app `app_d088…13e` / `rp_6d0…4de`, action `proofofhuman` — all live).
5. *Above the bounty floor, if time:* reads/writes tiering + x402 fallback
   on the MCP gate (remaining Step-2 scope) and the Selfie Check fast-follow
   (Phase 1bis, separate pool).

Kill-switches while testing: `WORLD_MCP_GATE=off` (agent) and
`WORLD_PUBLISH_GATE=off` / `WORLD_ID_DEV_ALLOW=on` (frontend).
