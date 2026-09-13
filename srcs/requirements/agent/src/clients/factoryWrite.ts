// StrategyFactory write client — on-chain authorship (task #31).
//
// The shipped order carries the ANNOUNCER as maker (Order.maker, tx.from, Aqua maker all
// resolve to the agent's EOA), so the social layer has no author without an explicit record.
// The factory's onlyOwner attribute(strategyId, author) emits StrategyAttributed right after
// announce — with `author` being the UI session wallet the agent received on ship — and the
// subgraph lands it on Strategy.author (profiles/threads key on it).
//
// The OWNER key signs attribute (attribute is onlyOwner; the owner is the deployer — the
// same announcer EOA in this deployment). Append-only on-chain: a second call for the same
// strategyId reverts AlreadyAttributed; the caller treats that as best-effort (warn, move on).
import { createPublicClient, createWalletClient, http, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";

/// WAVE_CHAIN_ID=1 flips every write client to mainnet (mainnet-fork testing); the
/// default stays Sepolia (the live demo chain). viem serializes txs with the chain
/// object's id, so a chain-1 fork with a sepolia client would fail EIP-155 validation.
const chain = Number(process.env.WAVE_CHAIN_ID ?? "11155111") === 1 ? mainnet : sepolia;

/// Single-entry ABI (the aquaWrite.ts discipline): viem's simulateContract can't infer
/// args across overloaded functionNames, and each arm stays readable on its own.
const FACTORY_ABI = [
  {
    name: "attribute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "strategyId", type: "bytes32" },
      { name: "author", type: "address" },
    ],
    outputs: [],
  },
] as const;

export interface FactoryWriteConfig {
  factory: `0x${string}`;
  ownerKey: `0x${string}`; // the factory deployer (the announcer EOA in this deployment)
  rpcUrl: string;
}

export function factoryWriteClient(cfg: FactoryWriteConfig) {
  const pub = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const owner = privateKeyToAccount(cfg.ownerKey);
  const ownerWallet = createWalletClient({ account: owner, chain, transport: http(cfg.rpcUrl) });

  const send = async (request: Parameters<typeof ownerWallet.writeContract>[0]) => {
    const hash = await ownerWallet.writeContract(request);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
    return hash as Hash;
  };

  return {
    ownerAddress: owner.address,

    /** Record who authored a strategy — emits StrategyAttributed (the subgraph's
     * Strategy.author source). Reverts AlreadyAttributed on a second call for the
     * same id; the deploy pipeline calls this best-effort and warns, never fails the ship. */
    async attribute(strategyId: Hex, author: `0x${string}`): Promise<Hash> {
      const { request } = await pub.simulateContract({
        account: owner,
        address: cfg.factory,
        abi: FACTORY_ABI,
        functionName: "attribute",
        args: [strategyId, author],
      });
      return send(request);
    },
  };
}
