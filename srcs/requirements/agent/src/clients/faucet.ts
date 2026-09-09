// Faucet client — the buffer wallet's on-chain surface (PROD-TESTNET §4/§7).
//
// A plain native-ETH value transfer, so this is the one place in the repo using viem's
// `sendTransaction` (everything else writes contracts via aquaWrite). Same shape as
// aquaWriteClient: hardcoded sepolia, http transport on SEPOLIA_RPC_URL, and the
// write → waitForTransactionReceipt → status-check idiom (aquaWrite.ts:104-109).
import { createPublicClient, createWalletClient, http, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";

const chain = Number(process.env.WAVE_CHAIN_ID ?? "11155111") === 1 ? mainnet : sepolia;

export interface FaucetClientConfig {
  faucetKey: `0x${string}`;
  rpcUrl: string;
}

export function faucetClient(cfg: FaucetClientConfig) {
  const pub = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const account = privateKeyToAccount(cfg.faucetKey);
  const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });

  return {
    faucetAddress: account.address,

    async balanceOf(addr: `0x${string}`): Promise<bigint> {
      return pub.getBalance({ address: addr });
    },

    /**
     * Native ETH transfer. Nothing to simulate (no contract call) — send → wait for the
     * receipt, and fail on revert exactly like aquaWrite.send.
     */
    async sendEth(to: `0x${string}`, value: bigint): Promise<Hash> {
      const hash = await wallet.sendTransaction({ to, value });
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`faucet tx reverted: ${hash}`);
      return hash as Hash;
    },
  };
}
