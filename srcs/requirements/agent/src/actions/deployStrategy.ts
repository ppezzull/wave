// deployStrategy — the FIRST-DEPLOY EXECUTE arm: compile → announce → approve → ship →
// verify. The agent-owned equivalent of recompileAndShip.ts but for the initial ship from
// the compose drawer's "Ship on-chain" button.
//
// EVERY on-chain step runs in the agent process via its own clients (aquaWrite.ts) — the
// UI is transport only, forwarding the finalized StrategySpec. This is the "agent with
// all his suite of tools" posture: no business logic, no keys, no compiler invocation in
// the Next.js process.
//
// ⚠️ ORDER IS LOAD-BEARING (aquaWrite.ts:7-14, LiveSwapStock.s.sol:121-135):
//   announce → (attribute, best-effort) → approve → ship.
// The subgraph's handlePushed/handleSwapped do `Strategy.load(); if null return`, so a ship
// that lands before its announce is silently dropped and committedCapital sticks at 0
// forever. announceStrategy (onlyOwner) MUST precede aqua.ship.
//
// The router's announceStrategy(Order, bytes32) second arg was born as an ENS namehash;
// ENS is gone (World AgentKit owns identity now) and we pass the strategyId itself as the
// opaque bytes32 id. The deployed contract is untouched — bytes32 is bytes32.
//
// ⚠️ SIGNING MODEL (event demo): the agent signs with server-side .env keys
// (MAKER_PRIVATE_KEY / ANNOUNCER_PRIVATE_KEY — same EOA in this deployment). This is the
// path LiveSwapStock.s.sol already proved on Sepolia. Destructive ops are gated by an
// EXPLICIT HITL approval in the UI (the Ship confirm), not a silent boolean. User-wallet
// (Privy) signing is the post-event security hardening — out of scope here.
//
// Injectable deps (same pattern as recompileAndShip.ts:30-45) so the ordering, idempotency,
// and verify logic are unit-testable OFFLINE (no Solidity, no network, no Sepolia ETH).
//
// Spec: docs/strategy/AGENT.md + README "7-layer pipeline".
import { spawn } from "node:child_process";
import path from "node:path";
import {
  encodeAbiParameters,
  keccak256,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { aquaWriteClient, type AquaWriteConfig, type MakerOrder } from "../clients/aquaWrite.js";
import { factoryWriteClient } from "../clients/factoryWrite.js";
import { announcerConfig } from "../config/env.js";

/** The StrategySpec the compose agent produced — forwarded verbatim by the UI. */
export interface StrategySpecInput {
  specVersion?: number;
  pair?: { token0?: string; token1?: string };
  size?: { amount0?: string; amount1?: string };
  blocks?: Array<{ type: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

/** Injectable execution surface. Defaults use the real on-chain clients; tests pass stubs. */
export interface DeployDeps {
  /** Compile spec → { programHex, programHash }. Default spawns the wave-compiler CLI.
   * `pairDecimals` (on-chain decimals() reads) lets the compiler fold the pair's decimal
   * gap into the oracleGuard byte — required when the spec carries an oracleGuard block. */
  compile?: (
    spec: StrategySpecInput,
    pairDecimals?: { token0Decimals: number; token1Decimals: number },
  ) => Promise<{ programHex: Hex; programHash: Hex }>;
  /** Announce the order on the router (onlyOwner). MUST precede ship. With a description,
   * uses the described overload so StrategyDescribed lands in the same tx. */
  announce?: (order: MakerOrder, strategyId: Hex, description?: string) => Promise<Hash>;
  /** Approve both tokens to Aqua (max). Default uses the maker wallet. */
  approve?: (tokens: Address[]) => Promise<void>;
  /** Attribute the strategy's author on the StrategyFactory (task #31) — emits
   * StrategyAttributed for the subgraph's Strategy.author. Default: factoryWriteClient
   * (FACTORY_ADDRESS env). Only called when input.author is present; failures are
   * caught by the pipeline (best-effort — a failed attribution never fails the ship). */
  attribute?: (strategyId: Hex, author: Address) => Promise<Hash>;
  /** Per-token decimals reader (default: on-chain decimals() via the write client). */
  tokenDecimals?: (token: Address) => Promise<number>;
  /** Ship the strategy to Aqua. */
  ship?: (strategy: Hex, tokens: Address[], amounts: bigint[]) => Promise<Hash>;
  /** Read on-chain programHash for strategyId to verify + detect duplicates. */
  getOnchainProgramHash?: (strategyId: Hex) => Promise<Hex | null>;
  /**
   * Resolve the announcer/maker EOA. Default: config/env.announcerConfig (validates the key
   * derives to the router owner). Injectable so tests run offline with a fixed address/key
   * and no .env. The resolved address becomes Order.maker.
   */
  announcer?: () => Promise<{ address: Address; privateKey: `0x${string}` }>;
}

export interface DeployInput {
  spec: StrategySpecInput;
  /** Display handle label, e.g. "eth-usdc-guarded". Defaults to a hash of the programHash. */
  label?: string;
  /** Token decimals for amount scaling — an OVERRIDE applied to both tokens (offline
   * tests, uniform-decimal mocks). Default: read each token's decimals() on-chain. */
  decimals?: number;
  /**
   * The strategy's public description — the post. Forwarded verbatim (byte-for-byte: it is
   * also the compiler input) to the router's described announce, which emits StrategyDescribed
   * for the subgraph. Omitted → the plain 2-arg announce (strategy rows default description "").
   */
  description?: string;
  /**
   * The author's wallet — the UI session user who shipped the post (Order.maker is always
   * the announcer EOA, so without this record every strategy would "belong" to one profile).
   * When present, the pipeline calls StrategyFactory.attribute(strategyId, author) right
   * after announce; the subgraph lands it on Strategy.author (profiles/threads key on it).
   * Pre-flight validated (bad hex fails before any write). Omitted → no attribution call
   * (the strategy records as unattributed — never fabricated).
   */
  author?: Address;
}

export interface DeployResult {
  /** Absent when a pre-flight step (pair validation, decimals read) failed before compile —
   * check `error`. Once compile succeeds every return path carries all three. */
  strategyId?: Hex;
  programHash?: Hex;
  /** Display handle derived from the program hash (e.g. "s-fab534ee"). Identity-agnostic:
   * the World AgentKit seam can later map this to a human-readable name. */
  handle?: string;
  announceTxHash?: Hash;
  /** StrategyFactory.attribute tx — present only when an author was given AND attribution
   * succeeded. Absent on failure (best-effort) or when no author was passed. */
  attributeTxHash?: Hash;
  shipTxHash?: Hash;
  approved: boolean;
  shipped: boolean;
  /** Present when this strategyId was already shipped with the same programHash (idempotent). */
  alreadyDeployed?: boolean;
  /** Present when a step failed; the partial state is still returned. */
  error?: string;
}

// Correct from BOTH runtime layouts: src/actions and the bundled .mastra/output —
// each sits two levels inside agent/, so three ups land on requirements/compiler.
const COMPILER_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../compiler",
);

/** Spawn wave-compiler's cli-emit.ts over stdin/stdout (same shape as ui/app/api/emit/route.ts).
 * `pairDecimals` rides the child env (WAVE_TOKEN{0,1}_DECIMALS) so the compiler can fold
 * the pair's decimal gap into the oracleGuard byte — see compiler/src/ir.ts. */
function compileViaCli(
  spec: StrategySpecInput,
  pairDecimals?: { token0Decimals: number; token1Decimals: number },
): Promise<{ programHex: Hex; programHash: Hex }> {
  return new Promise((resolve, reject) => {
    const tsxBin = path.join(COMPILER_ROOT, "node_modules", ".bin", "tsx");
    const child = spawn(tsxBin, ["src/cli-emit.ts"], {
      cwd: COMPILER_ROOT,
      env: pairDecimals
        ? {
            ...process.env,
            WAVE_TOKEN0_DECIMALS: String(pairDecimals.token0Decimals),
            WAVE_TOKEN1_DECIMALS: String(pairDecimals.token1Decimals),
          }
        : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", (err) => reject(new Error(`compiler spawn failed: ${String(err)}`)));
    child.on("close", (code) => {
      let parsed: { programHex?: string; programHash?: string; error?: string; detail?: unknown };
      try {
        parsed = JSON.parse(stdout) as typeof parsed;
      } catch {
        return reject(
          new Error(`compiler returned non-JSON (exit ${code}): ${stderr.slice(0, 200) || stdout.slice(0, 200)}`),
        );
      }
      if (code !== 0 || parsed.error) {
        return reject(new Error(`compile failed: ${parsed.error ?? stderr.slice(0, 200)}`));
      }
      if (!parsed.programHex || !parsed.programHash) {
        return reject(new Error("compile succeeded but programHex/programHash missing"));
      }
      resolve({ programHex: parsed.programHex as Hex, programHash: parsed.programHash as Hex });
    });
    child.stdin.write(JSON.stringify(spec));
    child.stdin.end();
  });
}

/**
 * The Aqua-mode maker Order, per LiveSwapStock.s.sol:
 *   traits = 1n << 254n  (USE_AQUA_INSTEAD_OF_SIGNATURE; no hooks, no receiver)
 *   data   = the SwapVM program bytes (no hooks → data IS the program)
 * strategyId = keccak256(abi.encode(order)) = SwapVM.hash(order) — see strategyIdOf below.
 */
const TRAITS_USE_AQUA = 1n << 254n;
const ORDER_ABI = [
  {
    type: "tuple",
    components: [
      { name: "maker", type: "address" },
      { name: "traits", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
  },
] as const;

function buildOrder(maker: Address, programHex: Hex): MakerOrder {
  return { maker, traits: TRAITS_USE_AQUA, data: programHex };
}

/** Solidity's `abi.encode(order)` — the struct as a single dynamic argument: a 0x20
 * offset word, then the tuple body (maker ‖ traits ‖ data head+tail). Verified against
 * the fork router: `cast call router hash(...)` and `cast abi-encode "f((address,uint256,bytes))"`
 * produce byte-identical bytes, and this viem form matches both. This ONE encoding is
 * the join key of the whole stack — see strategyIdOf below. */
function encodeOrderWrapped(order: MakerOrder): Hex {
  return encodeAbiParameters(ORDER_ABI, [order]) as Hex;
}

/** strategyId = keccak(wrapped order) = SwapVM.hash(order) (SwapVM.sol:99 — Aqua mode
 * hashes abi.encode(order), the wrapped form). ONE id everywhere:
 *   - the announce's StrategyDeployed event id (the router emits hash(order), NOT the
 *     bytes32 param it was passed) → the subgraph's Strategy.id
 *   - Swapped.orderHash → handleSwapped joins the same row
 *   - Aqua's dock hash — but ONLY if ship() is handed the SAME wrapped bytes (Aqua keys
 *     on keccak of the bytes as passed), which is also how the router's swap execution
 *     looks up the docked liquidity.
 * Fork-proven both ways: docking under a differently-encoded copy of the order (e.g. the
 * raw 160-byte tuple body) strands the liquidity — capital indexes to a hash no row has,
 * and swaps can never spend it. */
function strategyIdOf(order: MakerOrder): Hex {
  return keccak256(encodeOrderWrapped(order));
}

function handleFrom(programHash: Hex): string {
  // Stable, URL-safe display handle derived from the program hash (8 hex chars).
  return `s-${programHash.slice(2, 10)}`;
}

function requirePair(
  spec: StrategySpecInput,
): { token0: Address; token1: Address; amount0: string; amount1: string } {
  const t0 = spec.pair?.token0;
  const t1 = spec.pair?.token1;
  const a0 = spec.size?.amount0;
  const a1 = spec.size?.amount1;
  if (!t0 || !t1 || !/^0x[a-fA-F0-9]{40}$/.test(t0) || !/^0x[a-fA-F0-9]{40}$/.test(t1)) {
    throw new Error("deploy: spec.pair.token0/token1 must be 0x…40-hex addresses");
  }
  if (!a0 || !a1) throw new Error("deploy: spec.size.amount0/amount1 required");
  return { token0: t0 as Address, token1: t1 as Address, amount0: a0, amount1: a1 };
}

/**
 * Resolve the write config from env (lazy + throwing, mirroring announcerConfig).
 * Reused across the announce/approve/ship defaults so one EOA handles all three in this
 * deployment (maker == owner == announcer).
 */
async function writeConfig(ann: { privateKey: `0x${string}` }): Promise<{ aqua: AquaWriteConfig }> {
  const aqua = process.env.AQUA_ADDRESS;
  const router = process.env.ROUTER_ADDRESS ?? process.env.ENS_STRATEGY_ROUTER;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!aqua || !/^0x[a-fA-F0-9]{40}$/.test(aqua)) throw new Error("[deploy] AQUA_ADDRESS missing/invalid in agent/.env");
  if (!router || !/^0x[a-fA-F0-9]{40}$/.test(router)) throw new Error("[deploy] ROUTER_ADDRESS missing/invalid in agent/.env");
  if (!rpcUrl) throw new Error("[deploy] SEPOLIA_RPC_URL missing in agent/.env");
  return {
    aqua: { aqua: aqua as Address, router: router as Address, makerKey: ann.privateKey, ownerKey: ann.privateKey, rpcUrl },
  };
}

/**
 * Execute the first-deploy: compile → announce → approve → ship → verify.
 * Idempotent: if strategyId is already on-chain with the same programHash, returns the
 * existing state WITHOUT re-shipping (a duplicate aqua.ship reverts). On any failure,
 * returns the partial state with `error` set rather than throwing mid-pipeline.
 */
export async function deployStrategy(input: DeployInput, deps: DeployDeps = {}): Promise<DeployResult> {
  const compile = deps.compile ?? compileViaCli;
  const resolveAnnouncer = deps.announcer ?? announcerConfig;
  const ann = await resolveAnnouncer();

  // The on-chain client is built lazily — only when a real (non-injected) write dep needs
  // it. With all deps injected (tests), writeConfig/aquaWriteClient never run, so no env.
  let cachedClient: ReturnType<typeof aquaWriteClient> | null = null;
  const client = async () => {
    if (!cachedClient) cachedClient = aquaWriteClient((await writeConfig(ann)).aqua);
    return cachedClient;
  };

  // Same lazy discipline for the factory (attribution). FACTORY_ADDRESS is validated HERE,
  // not at boot: a missing address is only fatal for ships that carry an author — every
  // other path (and every offline test) never builds this client.
  let cachedFactory: ReturnType<typeof factoryWriteClient> | null = null;
  const factory = async () => {
    if (!cachedFactory) {
      const factoryAddr = process.env.FACTORY_ADDRESS;
      const rpcUrl = process.env.SEPOLIA_RPC_URL;
      if (!factoryAddr || !/^0x[a-fA-F0-9]{40}$/.test(factoryAddr)) throw new Error("[deploy] FACTORY_ADDRESS missing/invalid in agent/.env");
      if (!rpcUrl) throw new Error("[deploy] SEPOLIA_RPC_URL missing in agent/.env");
      cachedFactory = factoryWriteClient({
        factory: factoryAddr as Address,
        ownerKey: ann.privateKey, // attribute is onlyOwner; the owner is the factory deployer (the announcer EOA in this deployment)
        rpcUrl,
      });
    }
    return cachedFactory;
  };
  const tokenDecimals = deps.tokenDecimals ?? (async (token: Address) => (await client()).decimalsOf(token));

  // Resolve the pair and read each token's decimals on-chain BEFORE compiling — the
  // amounts AND the program bytes both depend on them (the compiler folds the pair's
  // decimal gap into the oracleGuard byte; real pairs mix scales: WETH 18 / USDC 6 —
  // unfolded, a $10 fill clamps to 4042 WEI). input.decimals stays as an explicit
  // both-tokens override for offline tests and uniform-decimal mocks. A failure here
  // is pre-flight: nothing was written, so return the partial (no strategyId yet).
  let token0: Address, token1: Address, a0: string, a1: string, decimals0: number, decimals1: number;
  try {
    ({ token0, token1, amount0: a0, amount1: a1 } = requirePair(input.spec));
    // Author is validated pre-flight too: a malformed address would burn announce/approve
    // gas on a strategy that can never be attributed. Fails before ANY write (like requirePair).
    if (input.author !== undefined && !/^0x[a-fA-F0-9]{40}$/.test(input.author)) {
      throw new Error("deploy: author must be a 0x…40-hex address");
    }
    decimals0 = input.decimals ?? (await tokenDecimals(token0));
    decimals1 = input.decimals ?? (await tokenDecimals(token1));
  } catch (e) {
    return { approved: false, shipped: false, error: (e as Error).message.slice(0, 300) };
  }

  // 1. Compile → program bytes + keccak (byte-exact; matches the on-chain program hash).
  const { programHex, programHash } = await compile(input.spec, {
    token0Decimals: decimals0,
    token1Decimals: decimals1,
  });

  // 2/3. Build the order + pre-compute strategyId for idempotency.
  const order = buildOrder(ann.address, programHex);
  const strategyId = strategyIdOf(order);

  // 4. Idempotency: already shipped with the same program hash → short-circuit.
  if (deps.getOnchainProgramHash) {
    const existing = await deps.getOnchainProgramHash(strategyId);
    if (existing && existing.toLowerCase() === programHash.toLowerCase()) {
      return {
        strategyId,
        programHash,
        handle: input.label ?? handleFrom(programHash),
        approved: true,
        shipped: true,
        alreadyDeployed: true,
      };
    }
  }

  let announceTxHash: Hash | undefined;
  let attributeTxHash: Hash | undefined;
  let shipTxHash: Hash | undefined;
  let approved = false;
  let shipped = false;
  const handle = input.label ?? handleFrom(programHash);
  let error: string | undefined;

  try {
    const announce = deps.announce ?? (async (o: MakerOrder, id: Hex, description?: string) => (await client()).announce(o, id, description));
    const approve = deps.approve ?? (async (tokens: Address[]) => (await client()).approve(tokens));
    const ship = deps.ship ?? (async (s: Hex, tokens: Address[], amounts: bigint[]) => (await client()).ship(s, tokens, amounts));

    // Amounts parse with the decimals already read above (each token's own scale).
    const amount0 = parseUnits(a0, decimals0);
    const amount1 = parseUnits(a1, decimals1);

    // 5. announce (onlyOwner) — MUST precede ship. The bytes32 id is the strategyId itself
    // (opaque to the router; born as an ENS namehash, identity now lives in World AgentKit).
    // With a description, the described overload carries the post (StrategyDescribed) in the
    // same tx — the subgraph upserts it onto the row this call just created.
    announceTxHash = await announce(order, strategyId, input.description);
    approved = true;

    // 5.5. Attribute the author (best-effort, task #31) — StrategyFactory.attribute emits
    // StrategyAttributed right after the announce that created the row, so the subgraph
    // lands it atomically in indexing order. A failure here (FACTORY_ADDRESS missing,
    // AlreadyAttributed on a re-announce, revert) NEVER fails the ship: the on-chain
    // strategy is the product; provenance is display-layer. AlreadyDeployed short-circuits
    // above without re-attributing (append-only on-chain — second call would revert anyway).
    if (input.author) {
      const attribute = deps.attribute ?? (async (id: Hex, a: Address) => (await factory()).attribute(id, a));
      try {
        attributeTxHash = await attribute(strategyId, input.author);
      } catch (e) {
        console.warn(`[deploy] attribute(${strategyId.slice(0, 12)}…, ${input.author}) failed — ship stands:`, (e as Error).message);
      }
    }

    // 6. approve both tokens to Aqua (max) — maker key (mirror LiveSwapStock.s.sol:138-139).
    await approve([token0, token1]);

    // 7. ship — strategy arg is the SAME wrapped encoding strategyId hashes: Aqua docks
    // under keccak of the bytes as passed, so the dock hash == Strategy.id == the hash
    // the router's swap execution looks up. Any other encoding of the same order (e.g.
    // the bare 160-byte tuple body) docks under a different hash — the capital indexes
    // to a row that doesn't exist and no swap can ever spend it (fork-proven).
    // Reverts 0x879f237b(app, hash) when this dock already exists: the program bytes,
    // not the amounts, are the strategy's identity — same program + different sizes is
    // the same dock (re-ship → idempotency path, not a new strategy).
    shipTxHash = await ship(encodeOrderWrapped(order), [token0, token1], [amount0, amount1]);
    shipped = true;
  } catch (e) {
    error = (e as Error).message.slice(0, 300);
  }

  return {
    strategyId,
    programHash,
    handle,
    ...(announceTxHash ? { announceTxHash } : {}),
    ...(attributeTxHash ? { attributeTxHash } : {}),
    ...(shipTxHash ? { shipTxHash } : {}),
    approved,
    shipped,
    ...(error ? { error } : {}),
  };
}
