// ENS client — the viem-backed operations under resolveVerify/register/MCP writes.
// Replaces the throw-stub. Reads use the chain preset (no hard-coded resolver); writes
// target the resolver (setText) returned by getEnsResolver, or the ENS Registry
// (setSubnodeRecord, env-driven address) for subname minting.
// Spec: docs/strategy/ENS-PATH.md §4 (viem API) + §9 (clients/ens.ts replaces the stub).
import { parseAbi, type Address, type Hash } from "viem";
import { labelhash, namehash, normalize } from "../ens/namehash.js";
import { publicClient, walletClient } from "../ens/clients.js";
import { ensConfig } from "../ens/config.js";

// Public Resolver (setText) + ENS Registry (setSubnodeRecord) — minimal human-readable ABIs.
const RESOLVER_ABI = parseAbi(["function setText(bytes32 node, string key, string value) external"]);
const REGISTRY_ABI = parseAbi([
  "function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external",
]);

/** The payload Pietro's EnsDiscovery chip renders (two hash columns + match flag). */
export interface EnsDiscovery {
  subname: string;
  recordedProgramHash: string | null; // the ENS v0.programhash record
  onChainProgramHash: string | null; // the live source of truth
  description: string | null;
  match: boolean; // recorded == onChain (false ⇒ TAMPERED chip goes red)
}

const lc = (s: string | null) => (s ?? "").trim().toLowerCase();

export const ens = {
  /** Resolve an ENS name to its address (Universal Resolver, chain preset). */
  async resolve(name: string): Promise<Address | null> {
    return publicClient().getEnsAddress({ name: normalize(name) });
  },
  /** Resolver address for a name (the setText target). */
  async getResolver(name: string): Promise<Address> {
    return publicClient().getEnsResolver({ name: normalize(name) });
  },
  /** Read a text record (e.g. v0.programhash, agent-context). */
  async getTextRecord(name: string, key: string): Promise<string | null> {
    return publicClient().getEnsText({ name: normalize(name), key });
  },
  /** Write a text record on the name's resolver. Caller holds the ENS-owner key. */
  async setText(opts: {
    name: string;
    key: string;
    value: string;
    privateKey: `0x${string}`;
  }): Promise<Hash> {
    const node = namehash(opts.name);
    const resolver = await this.getResolver(opts.name);
    const wc = walletClient(opts.privateKey);
    const account = wc.account;
    if (!account) throw new Error("[ens] walletClient has no account");
    return wc.writeContract({
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: "setText",
      args: [node, opts.key, opts.value],
      account,
    });
  },
  /** Mint a subname under `parent` via the ENS Registry (setSubnodeRecord). */
  async registerSubname(opts: {
    parent: string;
    label: string;
    privateKey: `0x${string}`;
    resolver?: Address;
  }): Promise<{ subname: string; txHash: Hash }> {
    const cfg = ensConfig();
    if (!cfg.registry) {
      throw new Error("[ens] ENS_REGISTRY not set — required to mint subnames (registerSubname).");
    }
    const label = normalize(opts.label);
    const parentNode = namehash(opts.parent);
    const resolver = opts.resolver ?? (await this.getResolver(opts.parent));
    const wc = walletClient(opts.privateKey);
    const account = wc.account;
    if (!account) throw new Error("[ens] walletClient has no account");
    const txHash = await wc.writeContract({
      address: cfg.registry,
      abi: REGISTRY_ABI,
      functionName: "setSubnodeRecord",
      args: [parentNode, labelhash(label), account.address, resolver, 0n],
      account,
    });
    return { subname: `${label}.${opts.parent}`, txHash };
  },
  /** Assemble the EnsDiscovery payload (the chip's two hash columns + match). */
  async discover(subname: string, onChainProgramHash: string | null): Promise<EnsDiscovery> {
    const [recordedProgramHash, description] = await Promise.all([
      this.getTextRecord(subname, "v0.programhash"),
      this.getTextRecord(subname, "description"),
    ]);
    const match =
      !!recordedProgramHash && !!onChainProgramHash && lc(recordedProgramHash) === lc(onChainProgramHash);
    return { subname, recordedProgramHash, onChainProgramHash, description, match };
  },
};
