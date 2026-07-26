// register — mint a strategy subname + write its ENSIP-25/26 records on the Sepolia
// Public Resolver. "No hard-coded values": the resolver is resolved dynamically
// (getEnsResolver), the router + registry come from env. The records ARE the ENS artifact:
//   v0.programhash        — compiler keccak (tamper-check root, the Most-Creative-ENS angle)
//   description           — the literal compiler input ("the post is the prompt")
//   agent-context         — ENSIP-26 Markdown (pair, risk params)
//   agent-endpoint[mcp]   — ENSIP-26 (the wave MCP server URL)
//   agent-registration[<erc7930 router>][<strategyId>] — ENSIP-25 presence attestation ("1")
// Spec: docs/strategy/ENS-PATH.md §6 (record set) + §8 (register flow).
import { ens } from "../clients/ens.js";
import { ENS_CHAIN_ID, ensConfig, ensWalletConfig } from "./config.js";
import { ensip25Key, erc7930 } from "./erc7930.js";

export interface RegisterInput {
  label: string; // subname label, e.g. "eth-usdc-guarded"
  strategyId: string; // bytes32 hex — the ENSIP-25 <agentId>
  programHash: `0x${string}`; // compiler keccak → v0.programhash (tamper-check root)
  description: string; // the literal compiler input; round-trips byte-for-byte into /api/compile
  agentContext?: string; // ENSIP-26 Markdown (defaults to description)
}

export interface WrittenRecord {
  key: string;
  value: string;
  txHash?: `0x${string}`;
}

export interface RegisterResult {
  subname: string;
  records: WrittenRecord[];
  registerTxHash?: `0x${string}`; // setSubnodeRecord (subname mint)
  registerError?: string; // set if mint failed (e.g. subname already exists) — records still written
}

/** Assemble the ENSIP-25/26 + tamper-check record set for a strategy subname. Pure. */
export function strategyRecords(
  input: RegisterInput,
  cfg: ReturnType<typeof ensConfig>,
): { key: string; value: string }[] {
  const router7930 = erc7930(ENS_CHAIN_ID, cfg.strategyRouter);
  return [
    { key: "v0.programhash", value: input.programHash },
    { key: "description", value: input.description },
    { key: "agent-context", value: input.agentContext ?? input.description }, // ENSIP-26
    { key: "agent-endpoint[mcp]", value: cfg.agentEndpointMcp }, // ENSIP-26
    { key: ensip25Key(router7930, input.strategyId), value: "1" }, // ENSIP-25 attestation
  ];
}

/**
 * Register a strategy: (mint the subname if ENS_REGISTRY is set) → setText every record.
 * Returns the subname + tx hashes (the evidence). Record writes always run even if the
 * mint fails (the subname may already exist + be owned by the wallet).
 */
export async function registerStrategy(input: RegisterInput): Promise<RegisterResult> {
  const cfg = ensConfig();
  const { privateKey } = await ensWalletConfig();
  const subname = `${input.label}.${cfg.parentName}`;
  const records = strategyRecords(input, cfg);
  const result: RegisterResult = { subname, records: [] };

  if (cfg.registry) {
    try {
      const { txHash } = await ens.registerSubname({
        parent: cfg.parentName,
        label: input.label,
        privateKey,
      });
      result.registerTxHash = txHash;
    } catch (e) {
      result.registerError = (e as Error).message.slice(0, 160);
    }
  }

  for (const r of records) {
    const txHash = await ens.setText({ name: subname, key: r.key, value: r.value, privateKey });
    result.records.push({ ...r, txHash });
  }
  return result;
}
