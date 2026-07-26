// viem clients for ENS on Sepolia. The chain preset (`sepolia`) supplies every address
// the ENS actions need (Universal Resolver, Registry) — so there are NO hard-coded
// addresses here, satisfying both ENS prizes' "no hard-coded values" rule.
// Spec: docs/strategy/ENS-PATH.md §4 (viem ENS API) — grounded via context7 /wevm/viem.
import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { ensConfig } from "./config.js";

/** Read-only ENS client (getEnsText / getEnsAddress / getEnsResolver + getLogs). */
export const publicClient = () =>
  createPublicClient({ chain: sepolia, transport: http(ensConfig().rpcUrl) });

/** Write client (setText / setSubnodeRecord). Caller passes the ENS-owner private key. */
export const walletClient = (privateKey: `0x${string}`, rpcUrl: string = ensConfig().rpcUrl) =>
  createWalletClient({
    chain: sepolia,
    account: privateKeyToAccount(privateKey),
    transport: http(rpcUrl),
  });
