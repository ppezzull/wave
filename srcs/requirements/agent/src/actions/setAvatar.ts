// setAvatar — relay a user's IPFS avatar CID on-chain.
//
// The image NEVER reaches the agent: the UI pins to IPFS (or the user pastes a
// CID) and this action writes only the CID via AvatarRegistry. The subgraph
// indexes AvatarSet → Author.avatarCid; profiles read that pointer.
//
// Authz posture matches storeChatVault: unauthenticated tool route, announcer
// pays gas, per-user cooldown. A forged `user` can overwrite that wallet's
// public avatar CID (not a secret). Never throws.
import type { Address, Hash } from "viem";
import { announcerConfig } from "../config/env.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
/** CIDv0 (Qm + 44 base58) or CIDv1 (bafy/bafk/…). */
const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z0-9]{20,})$/;
const COOLDOWN_MS = 10_000;

export interface SetAvatarDeps {
  resolveRelayer?: () => Promise<{ address: Address; privateKey: `0x${string}` }>;
  setAvatar?: (user: Address, cid: string) => Promise<Hash>;
  now?: () => number;
}

export interface SetAvatarResult {
  ok: boolean;
  txHash?: Hash;
  error?: string;
}

const lastSetAt = new Map<string, number>();

export function normalizeCid(raw: string): string | null {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^ipfs:\/\//i, "")
    .replace(/^https?:\/\/[^/]+\/ipfs\//i, "")
    .split(/[/?#]/)[0] ?? "";
  return CID_RE.test(stripped) ? stripped : null;
}

export async function setAvatar(
  input: { user: string; cid: string },
  deps: SetAvatarDeps = {},
): Promise<SetAvatarResult> {
  try {
    const user = input?.user;
    if (!user || !ADDRESS_RE.test(user)) {
      return { ok: false, error: "avatar: user must be a 0x…40-hex address" };
    }
    const cid = normalizeCid(input?.cid ?? "");
    if (!cid) {
      return { ok: false, error: "avatar: cid must be an IPFS CID (Qm… or bafy…)" };
    }

    const now = deps.now ?? Date.now;
    const last = lastSetAt.get(user.toLowerCase());
    if (last !== undefined && now() - last < COOLDOWN_MS) {
      return { ok: false, error: "avatar: one publish per 10s per wallet" };
    }

    const write =
      deps.setAvatar ??
      (async (u: Address, c: string) => {
        const { avatarWriteClient } = await import("../clients/avatarWrite.js");
        const registry = process.env.AVATAR_REGISTRY_ADDRESS as Address | undefined;
        const rpcUrl = process.env.SEPOLIA_RPC_URL;
        if (!registry) throw new Error("[avatar] AVATAR_REGISTRY_ADDRESS missing in agent/.env");
        if (!rpcUrl) throw new Error("[avatar] SEPOLIA_RPC_URL missing in agent/.env");
        const relayer = await (deps.resolveRelayer ?? announcerConfig)();
        return avatarWriteClient({ registry, relayerKey: relayer.privateKey, rpcUrl }).setAvatar(u, c);
      });

    const txHash = await write(user as Address, cid);
    lastSetAt.set(user.toLowerCase(), now());
    return { ok: true, txHash };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}
