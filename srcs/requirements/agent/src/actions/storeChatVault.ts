// storeChatVault — relay a user's ENCRYPTED chat archive on-chain.
//
// The plaintext NEVER reaches the agent: the UI derives an AES-256-GCM key from the
// owner's wallet signature (domain-separated message, client-side only) and sends just
// the base64 ciphertext {iv, ct} JSON. This action decodes it to bytes and appends it
// via the ChatVault contract — the subgraph indexes Stored(user, nonce, ciphertext);
// restore reads the user's highest nonce and decrypts locally.
//
// Authz posture: like faucetDrip, the tool route is unauthenticated and the announcer
// EOA pays gas — the caps are the mitigation (empty/size rejects, per-user cooldown,
// ciphertext-only payload that moves no funds and keys nothing). A forged `user` only
// spams that user's restore with an undecryptable row (AES-GCM auth fails client-side).
//
// Injectable deps (faucet.ts pattern) so guards are unit-testable OFFLINE. Never throws.
import type { Address, Hash, Hex } from "viem";
import { announcerConfig } from "../config/env.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
/** Raw decoded cap: 96 KB — the contract rejects 98_304; base64 inflates ×4/3. */
const MAX_CIPHERTEXT_BYTES = 96 * 1024;
/** Per-user write cooldown — the relay costs the announcer real gas. */
const COOLDOWN_MS = 10_000;

/** Injectable execution surface. Defaults use the real client + env; tests pass stubs. */
export interface StoreChatVaultDeps {
  /** Resolves the relayer key (announcerConfig by default). */
  resolveRelayer?: () => Promise<{ address: Address; privateKey: `0x${string}` }>;
  /** The on-chain append. Default: chatVaultWriteClient.store. */
  store?: (user: Address, ciphertext: Hex) => Promise<Hash>;
  now?: () => number;
}

export interface StoreChatVaultResult {
  ok: boolean;
  txHash?: Hash;
  error?: string;
}

// Process-lifetime per-user cooldown (restart clears — fine: gas is the real cap).
const lastStoreAt = new Map<string, number>();

/** Decode base64 → 0x-hex bytes; returns null when not valid base64. */
function base64ToHex(b64: string): Hex | null {
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0) return null;
    // Re-encode must round-trip (padding-insensitive) — rejects the junk
    // Node's base64 decoder silently tolerates mid-string.
    const round = buf.toString("base64").replace(/=+$/, "");
    if (round !== b64.replace(/=+$/, "")) return null;
    return `0x${buf.toString("hex")}` as Hex;
  } catch {
    return null;
  }
}

/**
 * Append the encrypted archive for `user`. Guard order is load-bearing (tests pin it):
 * address → ciphertext shape → size → cooldown → relay. Never throws.
 */
export async function storeChatVault(
  input: { user: string; ciphertext: string },
  deps: StoreChatVaultDeps = {},
): Promise<StoreChatVaultResult> {
  try {
    const user = input?.user;
    if (!user || !ADDRESS_RE.test(user)) {
      return { ok: false, error: "chat vault: user must be a 0x…40-hex address" };
    }
    const b64 = input?.ciphertext;
    if (!b64 || typeof b64 !== "string" || b64.length < 8 || b64.length > 200_000 || !BASE64_RE.test(b64)) {
      return { ok: false, error: "chat vault: ciphertext must be a base64 blob" };
    }
    const ciphertextHex = base64ToHex(b64);
    if (!ciphertextHex || ciphertextHex === "0x") {
      return { ok: false, error: "chat vault: ciphertext is not valid base64" };
    }
    const bytes = (ciphertextHex.length - 2) / 2;
    if (bytes > MAX_CIPHERTEXT_BYTES) {
      return {
        ok: false,
        error: `chat vault: ciphertext ${bytes} B exceeds the ${MAX_CIPHERTEXT_BYTES} B cap — trim the archive`,
      };
    }

    const now = deps.now ?? Date.now;
    const last = lastStoreAt.get(user.toLowerCase());
    if (last !== undefined && now() - last < COOLDOWN_MS) {
      return { ok: false, error: "chat vault: one backup per 10s per wallet" };
    }

    // Lazy client — with `store` injected (tests), env is never touched.
    const store =
      deps.store ??
      (async (u: Address, ct: Hex) => {
        const { chatVaultWriteClient } = await import("../clients/chatVaultWrite.js");
        const vault = process.env.CHAT_VAULT_ADDRESS as Address | undefined;
        const rpcUrl = process.env.SEPOLIA_RPC_URL;
        if (!vault) throw new Error("[chat vault] CHAT_VAULT_ADDRESS missing in agent/.env");
        if (!rpcUrl) throw new Error("[chat vault] SEPOLIA_RPC_URL missing in agent/.env");
        const relayer = await (deps.resolveRelayer ?? announcerConfig)();
        return chatVaultWriteClient({ vault, relayerKey: relayer.privateKey, rpcUrl }).store(u, ct);
      });

    const txHash = await store(user as Address, ciphertextHex);
    lastStoreAt.set(user.toLowerCase(), now());
    return { ok: true, txHash };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}
