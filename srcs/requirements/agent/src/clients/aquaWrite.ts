// Aqua write client — the retune EXECUTE arm's on-chain surface.
//
// dock() and ship() are AQUA functions, not router ones (Aqua.sol:40,54). They take the
// router as the `app` argument, exactly as swap-vm/script/LiveSwapStock.s.sol does. Nothing
// in Solidity was ever needed here; the earlier "blocked on P1" note in #42/#49 was wrong.
//
// ⚠️ ORDER MATTERS — announceStrategy MUST precede ship().
// The subgraph's handlePushed/handleSwapped both do `Strategy.load(); if null return` (F2,
// no phantom rows). A retune that ships before announcing leaves the Pushed dropped and the
// new strategy stuck at committedCapital = 0 — unrankable, and R1 can never fire for it
// again. Not recoverable by re-announcing: chronologically the ship still came first.
//
// The maker key signs dock/ship (it owns the Aqua balances); the OWNER key signs announce
// (announceStrategy is onlyOwner). In this deployment they are the same EOA.
import { createPublicClient, createWalletClient, http, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const AQUA_ABI = [
  {
    name: "ship",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategy", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ name: "strategyHash", type: "bytes32" }],
  },
  {
    name: "dock",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "tokens", type: "address[]" },
    ],
    outputs: [],
  },
] as const;

/// The frozen router surface this arm needs. `order` is the ABI-encoded maker Order;
/// both event payloads are derived on-chain (C1a, #40) so nothing here can misreport them.
const ROUTER_ABI = [
  {
    name: "announceStrategy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "traits", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
      { name: "ensNode", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export interface AquaWriteConfig {
  aqua: `0x${string}`;
  router: `0x${string}`;
  makerKey: `0x${string}`;
  ownerKey?: `0x${string}`; // defaults to makerKey (same EOA in this deployment)
  rpcUrl: string;
}

export interface MakerOrder {
  maker: `0x${string}`;
  traits: bigint;
  data: Hex;
}

export function aquaWriteClient(cfg: AquaWriteConfig) {
  const pub = createPublicClient({ chain: sepolia, transport: http(cfg.rpcUrl) });
  const maker = privateKeyToAccount(cfg.makerKey);
  const owner = privateKeyToAccount(cfg.ownerKey ?? cfg.makerKey);
  const makerWallet = createWalletClient({ account: maker, chain: sepolia, transport: http(cfg.rpcUrl) });
  const ownerWallet = createWalletClient({ account: owner, chain: sepolia, transport: http(cfg.rpcUrl) });

  const send = async (wallet: typeof makerWallet, request: Parameters<typeof wallet.writeContract>[0]) => {
    const hash = await wallet.writeContract(request);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
    return hash as Hash;
  };

  return {
    makerAddress: maker.address,
    ownerAddress: owner.address,

    /** Withdraw a strategy from Aqua. Emits Docked → subgraph sets status = stopped. */
    async dock(strategyHash: Hex, tokens: `0x${string}`[]): Promise<Hash> {
      const { request } = await pub.simulateContract({
        account: maker,
        address: cfg.aqua,
        abi: AQUA_ABI,
        functionName: "dock",
        args: [cfg.router, strategyHash, tokens],
      });
      return send(makerWallet, request);
    },

    /** Announce a (re)compiled order. MUST run BEFORE ship — see the header note. */
    async announce(order: MakerOrder, ensNode: Hex): Promise<Hash> {
      const { request } = await pub.simulateContract({
        account: owner,
        address: cfg.router,
        abi: ROUTER_ABI,
        functionName: "announceStrategy",
        args: [order, ensNode],
      });
      return send(ownerWallet, request);
    },

    /** Ship the strategy to Aqua. `strategy` is abi.encode(order) — its keccak is the strategyHash. */
    async ship(strategy: Hex, tokens: `0x${string}`[], amounts: bigint[]): Promise<Hash> {
      const { request } = await pub.simulateContract({
        account: maker,
        address: cfg.aqua,
        abi: AQUA_ABI,
        functionName: "ship",
        args: [cfg.router, strategy, tokens, amounts],
      });
      return send(makerWallet, request);
    },
  };
}
