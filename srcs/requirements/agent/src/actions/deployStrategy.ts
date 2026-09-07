// deployStrategy — the FIRST-DEPLOY EXECUTE arm: compile → register ENS → announce →
// approve → ship → verify. The agent-owned equivalent of recompileAndShip.ts but for the
// initial ship from the compose drawer's "Ship on-chain" button.
//
// EVERY on-chain step runs in the agent process via its own clients (aquaWrite.ts,
// ens/register.ts) — the UI is transport only, forwarding the finalized StrategySpec.
// This is the "agent with all his suite of tools" posture: no business logic, no keys,
// no compiler invocation in the Next.js process.
//
// ⚠️ ORDER IS LOAD-BEARING (aquaWrite.ts:7-14, LiveSwapStock.s.sol:121-135):
//   register ENS → announce → approve → ship.
// The subgraph's handlePushed/handleSwapped do `Strategy.load(); if null return`, so a ship
// that lands before its announce is silently dropped and committedCapital sticks at 0
// forever. announceStrategy (onlyOwner) MUST precede aqua.ship.
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
// Spec: docs/strategy/AGENT.md + README "7-layer pipeline" + docs/strategy/ENS-PATH.md.
import { spawn } from "node:child_process";
import path from "node:path";
import {
  encodeAbiParameters,
  keccak256,
  namehash,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { aquaWriteClient, type AquaWriteConfig, type MakerOrder } from "../clients/aquaWrite.js";
import { registerStrategy, type RegisterInput } from "../ens/register.js";
import { ensConfig } from "../ens/config.js";
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
  /** Compile spec → { programHex, programHash }. Default spawns the wave-compiler CLI. */
  compile?: (spec: StrategySpecInput) => Promise<{ programHex: Hex; programHash: Hex }>;
  /** Mint subname + write ENSIP-25/26 records. Default: ens/register.registerStrategy. */
  register?: (input: RegisterInput) => Promise<{ subname: string; registerTxHash?: Hash }>;
  /** Announce the order on the router (onlyOwner). MUST precede ship. */
  announce?: (order: MakerOrder, ensNode: Hex) => Promise<Hash>;
  /** Approve both tokens to Aqua (max). Default uses the maker wallet. */
  approve?: (tokens: Address[]) => Promise<void>;
  /** Ship the strategy to Aqua. */
  ship?: (strategy: Hex, tokens: Address[], amounts: bigint[]) => Promise<Hash>;
  /** Read on-chain programHash for strategyId to verify + detect duplicates. */
  getOnchainProgramHash?: (strategyId: Hex) => Promise<Hex | null>;
  /** Resolve the ENS parent name (e.g. "wave.eth"). Default: ens/config.ensConfig. Injectable
   * so tests don't need SEPOLIA_RPC_URL/ENS_STRATEGY_ROUTER set. */
  parentName?: () => string;
  /**
   * Resolve the announcer/maker EOA. Default: config/env.announcerConfig (validates the key
   * derives to the router owner). Injectable so tests run offline with a fixed address/key
   * and no .env. The resolved address becomes Order.maker.
   */
  announcer?: () => Promise<{ address: Address; privateKey: `0x${string}` }>;
}

export interface DeployInput {
  spec: StrategySpecInput;
  /** Subname label, e.g. "eth-usdc-guarded". Defaults to a keccak of the programHash. */
  label?: string;
  /** Token decimals for amount scaling (mock TokenMock = 18). Default 18. */
  decimals?: number;
}

export interface DeployResult {
  strategyId: Hex;
  programHash: Hex;
  subname: string;
  announceTxHash?: Hash;
  shipTxHash?: Hash;
  registerTxHash?: Hash;
  approved: boolean;
  shipped: boolean;
  /** Present when this strategyId was already shipped with the same programHash (idempotent). */
  alreadyDeployed?: boolean;
  /** Present when a step failed; the partial state is still returned. */
  error?: string;
}

const COMPILER_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../../compiler",
);

/** Spawn wave-compiler's cli-emit.ts over stdin/stdout (same shape as ui/app/api/emit/route.ts). */
function compileViaCli(spec: StrategySpecInput): Promise<{ programHex: Hex; programHash: Hex }> {
  return new Promise((resolve, reject) => {
    const tsxBin = path.join(COMPILER_ROOT, "node_modules", ".bin", "tsx");
    const child = spawn(tsxBin, ["src/cli-emit.ts"], {
      cwd: COMPILER_ROOT,
      env: process.env,
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
 * strategyId (== the subgraph key == aqua.ship's strategyHash) = keccak256(abi.encode(order)).
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

/** strategyId = keccak256(abi.encode(Order)) — SwapVM.hash() in Aqua mode (SwapVM.sol:97). */
function strategyIdOf(order: MakerOrder): Hex {
  return keccak256(encodeAbiParameters(ORDER_ABI, [order]));
}

function labelFrom(programHash: Hex): string {
  // Stable, URL-safe subname label derived from the program hash (8 hex chars).
  return `s-${programHash.slice(2, 10)}`;
}

function requirePair(
  spec: StrategySpecInput,
  decimals: number,
): { token0: Address; token1: Address; amount0: bigint; amount1: bigint } {
  const t0 = spec.pair?.token0;
  const t1 = spec.pair?.token1;
  const a0 = spec.size?.amount0;
  const a1 = spec.size?.amount1;
  if (!t0 || !t1 || !/^0x[a-fA-F0-9]{40}$/.test(t0) || !/^0x[a-fA-F0-9]{40}$/.test(t1)) {
    throw new Error("deploy: spec.pair.token0/token1 must be 0x…40-hex addresses");
  }
  if (!a0 || !a1) throw new Error("deploy: spec.size.amount0/amount1 required");
  return {
    token0: t0 as Address,
    token1: t1 as Address,
    amount0: parseUnits(a0, decimals),
    amount1: parseUnits(a1, decimals),
  };
}

/**
 * Resolve the write config from env (lazy + throwing, mirroring announcerConfig/ensConfig).
 * Reused across the announce/approve/ship defaults so one EOA handles all three in this
 * deployment (maker == owner == announcer).
 */
async function writeConfig(ann: { privateKey: `0x${string}` }): Promise<{ aqua: AquaWriteConfig; ensNodeBase: string }> {
  const aqua = process.env.AQUA_ADDRESS;
  const router = process.env.ROUTER_ADDRESS ?? process.env.ENS_STRATEGY_ROUTER;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!aqua || !/^0x[a-fA-F0-9]{40}$/.test(aqua)) throw new Error("[deploy] AQUA_ADDRESS missing/invalid in agent/.env");
  if (!router || !/^0x[a-fA-F0-9]{40}$/.test(router)) throw new Error("[deploy] ROUTER_ADDRESS missing/invalid in agent/.env");
  if (!rpcUrl) throw new Error("[deploy] SEPOLIA_RPC_URL missing in agent/.env");
  return {
    aqua: { aqua: aqua as Address, router: router as Address, makerKey: ann.privateKey, ownerKey: ann.privateKey, rpcUrl },
    ensNodeBase: ensConfig().parentName,
  };
}

/**
 * Execute the first-deploy: compile → register → announce → approve → ship → verify.
 * Idempotent: if strategyId is already on-chain with the same programHash, returns the
 * existing state WITHOUT re-shipping (a duplicate aqua.ship reverts). On any failure,
 * returns the partial state with `error` set rather than throwing mid-pipeline.
 */
export async function deployStrategy(input: DeployInput, deps: DeployDeps = {}): Promise<DeployResult> {
  const compile = deps.compile ?? compileViaCli;
  const register = deps.register ?? registerStrategy;
  const resolveAnnouncer = deps.announcer ?? announcerConfig;
  const resolveParentName = deps.parentName ?? (() => ensConfig().parentName);
  const ann = await resolveAnnouncer();

  // 1. Compile → program bytes + keccak (byte-exact; matches on-chain + ENS v0.programhash).
  const { programHex, programHash } = await compile(input.spec);

  // 2/3. Build the order + pre-compute strategyId for idempotency + the ENSIP-25 <agentId>.
  const order = buildOrder(ann.address, programHex);
  const strategyId = strategyIdOf(order);

  // 4. Idempotency: already shipped with the same program hash → short-circuit.
  if (deps.getOnchainProgramHash) {
    const existing = await deps.getOnchainProgramHash(strategyId);
    if (existing && existing.toLowerCase() === programHash.toLowerCase()) {
      return {
        strategyId,
        programHash,
        subname: `${input.label ?? labelFrom(programHash)}.${resolveParentName()}`,
        approved: true,
        shipped: true,
        alreadyDeployed: true,
      };
    }
  }

  // Description = the literal compiler input (README "the post is the prompt"). Approximate
  // for the demo: JSON.stringify. v0.programhash (the tamper-check root) is byte-exact from
  // the compiler, so only the human-readable description is approximate. Post-event: a
  // per-block serializeBlock serializer in CANONICAL_ORDER (canonical.ts:38-39 caveat).
  const description = JSON.stringify(input.spec);
  const label = input.label ?? labelFrom(programHash);

  let registerTxHash: Hash | undefined;
  let announceTxHash: Hash | undefined;
  let shipTxHash: Hash | undefined;
  let approved = false;
  let shipped = false;
  let subname = `${label}.${resolveParentName()}`;
  let error: string | undefined;

  try {
    // The on-chain client is built lazily — only when a real (non-injected) write dep needs
    // it. With all deps injected (tests), writeConfig/aquaWriteClient never run, so no env.
    let cachedClient: ReturnType<typeof aquaWriteClient> | null = null;
    const client = async () => {
      if (!cachedClient) cachedClient = aquaWriteClient((await writeConfig(ann)).aqua);
      return cachedClient;
    };
    const announce = deps.announce ?? (async (o: MakerOrder, node: Hex) => (await client()).announce(o, node));
    const approve = deps.approve ?? (async (tokens: Address[]) => (await client()).approve(tokens));
    const ship = deps.ship ?? (async (s: Hex, tokens: Address[], amounts: bigint[]) => (await client()).ship(s, tokens, amounts));

    const { token0, token1, amount0, amount1 } = requirePair(input.spec, input.decimals ?? 18);

    // 5. ENS register (mint subname + v0.programhash + description + ENSIP-25/26 records).
    const reg = await register({
      label,
      strategyId,
      programHash,
      description,
    });
    subname = reg.subname;
    registerTxHash = reg.registerTxHash;

    // 6. announce (onlyOwner) — MUST precede ship. ensNode = namehash of the subname.
    const ensNode = namehash(subname);
    announceTxHash = await announce(order, ensNode);
    approved = true;

    // 7. approve both tokens to Aqua (max) — maker key (mirror LiveSwapStock.s.sol:138-139).
    await approve([token0, token1]);

    // 8. ship — strategy arg is abi.encode(order) (its keccak is the strategyHash).
    shipTxHash = await ship(encodeAbiParameters(ORDER_ABI, [order]) as Hex, [token0, token1], [amount0, amount1]);
    shipped = true;
  } catch (e) {
    error = (e as Error).message.slice(0, 300);
  }

  return {
    strategyId,
    programHash,
    subname,
    ...(registerTxHash ? { registerTxHash } : {}),
    ...(announceTxHash ? { announceTxHash } : {}),
    ...(shipTxHash ? { shipTxHash } : {}),
    approved,
    shipped,
    ...(error ? { error } : {}),
  };
}
