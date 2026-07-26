// ENS config for Sepolia — kept OUT of config/env.ts (the core env contract) so the ENS
// path is isolated. NO hard-coded addresses in the product: viem's `sepolia` chain preset
// supplies the Universal Resolver used by getEnsText/getEnsAddress/getEnsResolver. The RPC
// URL, parent name, and the router + registry addresses (deploy artifacts) come from env.
// Spec: docs/strategy/ENS-PATH.md §4-§5.
//
// Lazy + throwing: only ENS code calls these, so a missing RPC/key never breaks compose or
// policy (the non-ENS paths). The ENS_REGISTRY is REQUIRED for registerSubname (minting);
// text-record writes (setText) need only the resolver, which getEnsResolver supplies.

export const ENS_CHAIN_ID = 11155111; // Sepolia

export interface EnsConfig {
  rpcUrl: string;
  parentName: string; // e.g. "wave.eth" — the parent 2LD subnames mint under
  strategyRouter: `0x${string}`; // EnsStrategyRouter — the ENSIP-25 <registry> (ERC-7930-encoded) + StrategyDeployed emitter
  registry: `0x${string}` | null; // ENS Registry — setSubnodeRecord target (env-driven; no hard-coded default)
  agentEndpointMcp: string; // value written to the ENSIP-26 agent-endpoint[mcp] record
}

export function ensConfig(): EnsConfig {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl || rpcUrl.length === 0) {
    throw new Error("[ens/config] SEPOLIA_RPC_URL missing — set it in agent/.env.");
  }
  const strategyRouter = (process.env.ENS_STRATEGY_ROUTER ?? "") as `0x${string}`;
  if (!/^0x[a-fA-F0-9]{40}$/.test(strategyRouter)) {
    throw new Error(
      "[ens/config] ENS_STRATEGY_ROUTER missing/invalid — the deployed EnsStrategyRouter " +
        "address (Sepolia). It is the ENSIP-25 <registry> and the StrategyDeployed emitter.",
    );
  }
  const registryRaw = process.env.ENS_REGISTRY ?? "";
  return {
    rpcUrl,
    parentName: process.env.ENS_PARENT_NAME ?? "wave.eth",
    strategyRouter,
    registry: /^0x[a-fA-F0-9]{40}$/.test(registryRaw) ? (registryRaw as `0x${string}`) : null,
    agentEndpointMcp: process.env.AGENT_ENDPOINT_MCP ?? "http://agent:3002",
  };
}

/**
 * ENS writer key — the wallet that owns the parent name (mints subnames + setText). Valid
 * format only (NOT the router-owner check — that's announcerConfig; the ENS owner may be a
 * different EOA). Falls back to the shared Sepolia/Maker key. Spec: ENS-PATH.md §10 #2.
 */
export interface EnsWalletConfig {
  privateKey: `0x${string}`;
  address: `0x${string}`; // derived EOA (the ENS writer)
}

export async function ensWalletConfig(): Promise<EnsWalletConfig> {
  const raw =
    process.env.ENS_WALLET_PRIVATE_KEY ??
    process.env.SEPOLIA_PRIVATE_KEY ??
    process.env.MAKER_PRIVATE_KEY;
  if (!raw || raw.length === 0) {
    throw new Error("[ens/config] ENS_WALLET_PRIVATE_KEY missing — set it (or SEPOLIA_PRIVATE_KEY) in agent/.env.");
  }
  const { privateKeyToAccount } = await import("viem/accounts");
  try {
    const address = privateKeyToAccount(raw as `0x${string}`).address;
    return { privateKey: raw as `0x${string}`, address };
  } catch {
    throw new Error("[ens/config] ENS_WALLET_PRIVATE_KEY is not a valid 0x-prefixed secp256k1 private key.");
  }
}
