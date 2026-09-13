// ChatVault write client — on-chain encrypted chat backups.
//
// The vault stores AES-256-GCM CIPHERTEXT only (the key is derived from the owner's
// wallet signature client-side and never uploaded), appended per user; the subgraph
// indexes Stored(user, nonce, ciphertext) so restore = the user's highest nonce.
// The announcer EOA relays and pays gas — `user` is a parameter the vault trusts;
// acceptable because nothing here is secret beyond the encryption (a forged user only
// spams that user's restore with an undecryptable row — AES-GCM auth fails client-side).
//
// Same disciplines as factoryWrite.ts: WAVE_CHAIN_ID chain flip, single-entry ABI,
// simulate → send → wait receipt → Hash.
import { createPublicClient, createWalletClient, http, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";

/// WAVE_CHAIN_ID=1 flips every write client to mainnet; default Sepolia (live chain).
const chain = Number(process.env.WAVE_CHAIN_ID ?? "11155111") === 1 ? mainnet : sepolia;

/// Single-entry ABI: store(address user, bytes ciphertext) — appends + emits Stored.
const CHAT_VAULT_ABI = [
  {
    name: "store",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "ciphertext", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export interface ChatVaultWriteConfig {
  vault: `0x${string}`;
  relayerKey: `0x${string}`; // the announcer EOA (pays gas; this deployment's only writer)
  rpcUrl: string;
}

export function chatVaultWriteClient(cfg: ChatVaultWriteConfig) {
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

    /** Append an encrypted backup for `user` — emits Stored(user, nonce, ciphertext).
     *  Ciphertext must be raw bytes (hex): the UI sends the {iv, ct} JSON as base64,
     *  decoded to bytes before relaying so the subgraph stores a lossless blob. */
    async store(user: `0x${string}`, ciphertext: `0x${string}`): Promise<Hash> {
      const { request } = await pub.simulateContract({
        account: relayer,
        address: cfg.vault,
        abi: CHAT_VAULT_ABI,
        functionName: "store",
        args: [user, ciphertext],
      });
      return send(request);
    },
  };
}
