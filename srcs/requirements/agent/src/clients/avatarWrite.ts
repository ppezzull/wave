// AvatarRegistry write client — publish an IPFS CID as the user's avatar.
//
// Same disciplines as chatVaultWrite.ts: WAVE_CHAIN_ID chain flip, single-entry
// ABI, simulate → send → wait receipt → Hash. The announcer EOA relays and pays
// gas; `user` is a parameter the registry trusts (a forged user can overwrite
// that address's public CID, not a secret).
import { createPublicClient, createWalletClient, http, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";

const chain = Number(process.env.WAVE_CHAIN_ID ?? "11155111") === 1 ? mainnet : sepolia;

const AVATAR_REGISTRY_ABI = [
  {
    name: "setAvatar",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "cid", type: "string" },
    ],
    outputs: [],
  },
] as const;

export interface AvatarWriteConfig {
  registry: `0x${string}`;
  relayerKey: `0x${string}`;
  rpcUrl: string;
}

export function avatarWriteClient(cfg: AvatarWriteConfig) {
  const pub = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const relayer = privateKeyToAccount(cfg.relayerKey);
  const relayerWallet = createWalletClient({ account: relayer, chain, transport: http(cfg.rpcUrl) });

  const send = async (request: Parameters<typeof relayerWallet.writeContract>[0]) => {
    const hash = await relayerWallet.writeContract(request);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
    return hash as Hash;
  };

  return {
    relayerAddress: relayer.address,

    async setAvatar(user: `0x${string}`, cid: string): Promise<Hash> {
      const { request } = await pub.simulateContract({
        account: relayer,
        address: cfg.registry,
        abi: AVATAR_REGISTRY_ABI,
        functionName: "setAvatar",
        args: [user, cid],
      });
      return send(request);
    },
  };
}
