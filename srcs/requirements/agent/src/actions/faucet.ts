// faucetDrip — the in-app testnet faucet (PROD-TESTNET §4/§7): judge/demo wallets get
// Sepolia ETH self-serve from the agent's buffer wallet instead of fighting captcha'd
// public faucets mid-demo. The Settings "Get test ETH" button is the only caller.
//
// Authz posture: like shipStrategy, this moves server-wallet funds and the tool route is
// unauthenticated — the CAPS are the mitigation (0.05/drip, empty-wallet gate, 6h
// per-address cooldown, 2 ETH per-process budget, underfunded guard). The wallet only
// ever holds buffer funds.
//
// Unlike deployStrategy (whose announcerConfig() throws OUTSIDE its try → HTTP 500 at
// the tool route), EVERY expected failure — including config resolution — returns
// {ok:false, error} so the UI always gets a clean reason line. Deliberate divergence;
// not backported here (one idea per PR).
//
// Injectable deps (deployStrategy.ts:52-70 pattern) so guards/caps/ordering are
// unit-testable OFFLINE — no network, no funded key, deterministic clock.
import { formatEther, type Hash } from "viem";
import { faucetClient } from "../clients/faucet.js";
import { faucetConfig, faucetTunables, type FaucetConfig } from "../config/env.js";

/** Cooldown + budget state. In-memory (restart clears — fine: the balance gate still prevents stacking). */
export interface FaucetStore {
  /** Epoch ms of the recipient's last successful drip, else undefined. Keys lowercased. */
  lastDripAt(address: string): number | undefined;
  /** Called ONLY after a successful send. */
  record(address: string, wei: bigint, at: number): void;
  /** Lifetime total dripped (this process). */
  totalDripped(): bigint;
}

export function memoryFaucetStore(): FaucetStore {
  const last = new Map<string, number>();
  let total = 0n;
  return {
    lastDripAt: (address) => last.get(address.toLowerCase()),
    record: (address, wei, at) => {
      last.set(address.toLowerCase(), at);
      total += wei;
    },
    totalDripped: () => total,
  };
}

/** Injectable execution surface. Defaults use the real client + env; tests pass stubs. */
export interface FaucetDeps {
  resolveFaucet?: () => Promise<FaucetConfig>;
  tunables?: () => { dripWei: bigint; cooldownMs: number; maxTotalWei: bigint };
  balanceOf?: (addr: `0x${string}`) => Promise<bigint>;
  sendEth?: (to: `0x${string}`, value: bigint) => Promise<Hash>;
  store?: FaucetStore;
  now?: () => number;
}

export interface FaucetResult {
  ok: boolean;
  txHash?: Hash;
  /** Human drip size, e.g. "0.05". */
  dripped?: string;
  /** The buffer wallet's address (shown on underfunded so the operator knows where to send). */
  faucetAddress?: `0x${string}`;
  /** Present on cooldown — seconds until the address may drip again. */
  retryInSec?: number;
  error?: string;
}

/** Humanize a cooldown remainder as "~6h" / "~5h 59m" / "~42m" / "~30s". */
export function humanCooldown(sec: number): string {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    if (m === 60) return `~${h + 1}h`; // 5h59.8m rounds to 60m → carry
    return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
  }
  if (sec >= 60) return `~${Math.ceil(sec / 60)}m`;
  return `~${Math.ceil(sec)}s`;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Drip Sepolia ETH to `address`. Guard order is load-bearing (tests pin it):
 * address → cooldown (local) → budget (local) → recipient balance → faucet funds →
 * send → record. Never throws.
 */
export async function faucetDrip(input: { address: string }, deps: FaucetDeps = {}): Promise<FaucetResult> {
  try {
    const raw = input?.address;
    if (!raw || !ADDRESS_RE.test(raw)) {
      return { ok: false, error: "faucet: address must be a 0x…40-hex address" };
    }
    const recipient = raw.toLowerCase() as `0x${string}`;

    const tunables = deps.tunables ?? faucetTunables;
    const { dripWei, cooldownMs, maxTotalWei } = tunables();

    // The on-chain client is built lazily — only when a real (non-injected) dep needs it.
    // With all deps injected (tests), faucetConfig/faucetClient never run, so no env.
    let cachedClient: ReturnType<typeof faucetClient> | null = null;
    const client = async () => {
      if (!cachedClient) {
        const cfg = await (deps.resolveFaucet ?? faucetConfig)();
        const rpcUrl = process.env.SEPOLIA_RPC_URL;
        if (!rpcUrl) throw new Error("[faucet] SEPOLIA_RPC_URL missing in agent/.env");
        cachedClient = faucetClient({ faucetKey: cfg.privateKey, rpcUrl });
      }
      return cachedClient;
    };

    const store = deps.store ?? defaultStore;
    const now = deps.now ?? Date.now;
    const balanceOf = deps.balanceOf ?? (async (addr: `0x${string}`) => (await client()).balanceOf(addr));
    const sendEth = deps.sendEth ?? (async (to: `0x${string}`, value: bigint) => (await client()).sendEth(to, value));
    const resolveAddress = async (): Promise<`0x${string}`> =>
      deps.resolveFaucet ? (await deps.resolveFaucet()).address : (await client()).faucetAddress;

    // 1. Cooldown (local, no RPC — cheapest rejection first).
    const last = store.lastDripAt(recipient);
    if (last !== undefined) {
      const elapsed = now() - last;
      if (elapsed < cooldownMs) {
        const retryInSec = Math.ceil((cooldownMs - elapsed) / 1000);
        return {
          ok: false,
          retryInSec,
          error: `cooldown — one drip per ${humanCooldown(cooldownMs / 1000)} per wallet; retry in ${humanCooldown(retryInSec)}`,
        };
      }
    }

    // 2. Per-process budget.
    if (store.totalDripped() >= maxTotalWei) {
      return {
        ok: false,
        error:
          `faucet budget exhausted for this process (${formatEther(store.totalDripped())} ETH dripped) — ` +
          `restart the agent or raise FAUCET_MAX_TOTAL_ETH`,
      };
    }

    // 3. Empty-wallet gate: top up only wallets that hold less than one drip.
    const recipientBalance = await balanceOf(recipient);
    if (recipientBalance >= dripWei) {
      return {
        ok: false,
        error: `wallet already holds ≥ ${formatEther(dripWei)} ETH — the faucet tops up empty wallets only`,
      };
    }

    // 4. Faucet funds: keep a drip + gas in reserve (gate at < 2× drip).
    const faucetAddress = await resolveAddress();
    const faucetBalance = await balanceOf(faucetAddress);
    if (faucetBalance < dripWei * 2n) {
      return {
        ok: false,
        faucetAddress,
        error: `faucet wallet underfunded (${formatEther(faucetBalance)} ETH left) — top up ${faucetAddress}`,
      };
    }

    // 5. Send, then (and only then) record.
    const txHash = await sendEth(recipient, dripWei);
    store.record(recipient, dripWei, now());
    return { ok: true, txHash, dripped: formatEther(dripWei), faucetAddress };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}

/** Process-wide cooldown/budget state (module-level so UI drips share it). */
const defaultStore = memoryFaucetStore();
