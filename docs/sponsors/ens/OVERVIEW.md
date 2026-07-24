# ENS 🔴 P0

## Prizes (from-scratch eligible)

- **Most Creative Use of ENS — $1,500**: beyond name→address; credentials/zk proofs in text records, subnames as access tokens, etc.
- **Best ENS Integration for AI Agents — $1,500** ← our target: name agents, subname registries for fleets, agent metadata in text records, onchain agent discovery.
- Both: ENS must clearly improve product, functional demo, **no hard-coded values**, video/live link, **present at ENS booth Sunday morning (mandatory)**.

## Ground truth

### ENSIP-25 — AI Agent Registry ENS Name Verification
- Standardizes verifying an ENS name ↔ agent identity in an onchain registry, via a **parameterized text record**: `agent-registration[<registry>][<agentId>]` where `<registry>` is an ERC-7930 interoperable address.
- ENS owner sets any non-empty value (typically `"1"`) = attestation of the association.
- Verification: read registry entry (claimed name + agentId + registry addr) → construct key → resolve text record on the name → non-empty = verified. No resolver upgrades needed.
- To comply: ERC-7930 encoding, parameterized text-record lookups, treat any non-empty value as positive.

### ENSIP-26 — Agent Text Records
- Two standardized keys, resolved via plain ENSIP-5 `text()`:
  - **`agent-context`** — free-form (text/Markdown/YAML/JSON) description of the agent and how to interact with it; may reference registries/endpoints.
  - **`agent-endpoint[<protocol>]`** — URL per protocol; defined protocols: **`mcp`**, **`a2a`**, **`web`**. (HTTP/HTTPS or IPFS URIs.)
- Discovery flow: resolve `agent-context` → parse → optionally fetch `agent-endpoint[mcp]` etc. One ENS name = multichain agent identity.
- Our use: compiler agent publishes `agent-context` + `agent-endpoint[mcp]`; each strategy subname carries params/stats in records + ENSIP-25 registration.

### ens-cli
- **Experimental preview** — not on npm, breaking changes expected; run via `npx "https://pkg.pr.new/ensdomains/cli/@ensdomains/cli@main"` (pin a commit for the hackathon!).
- Reads: address/reverse resolution, text records, availability, pricing. Writes output **unsigned calldata**: two-step commit/reveal registration, renewals, resolver mgmt, **subname creation**, record setting, **batch records via multicall**.
- Agent-native: `--llms` manifest flag, **MCP server mode (stdio)**, skill-file generation.
- **Testnet: yes** — `--chain` flag with explicit Sepolia examples (registration, resolver deploy, subregistry). ← answers the subname-on-testnet question; also mentions ENSv2 per-account resolver proxies.

## Our plan

- Each deployed strategy (and the compiler agent itself) gets an ENS subname; text records hold strategy params, performance stats, and ENSIP-25 registration → strategies are discoverable/verifiable onchain. Load-bearing: the UI/agent resolves strategies via ENS, not a local DB.

## Open questions

- [ ] Dry-run ens-cli on Sepolia: register parent name, mint one subname, set `agent-context` + a parameterized ENSIP-25 record, resolve it back (proves the full loop, no hard-coded values)
- [ ] ERC-7930 interoperable-address encoding: find a library or implement (needed for ENSIP-25 key construction)
- [ ] Decide: viem/ensjs direct integration vs shelling out to ens-cli (experimental risk vs speed)

## Links

- ENSIP-25: https://docs.ens.domains/ensip/25/ · ENSIP-26: https://docs.ens.domains/ensip/26/
- ens-cli: https://github.com/ensdomains/ens-cli · Docs: https://docs.ens.domains/ · AI guide: https://docs.ens.domains/building-with-ai/
