# Licensing — SwapVM / Aqua (Degensoft)

## The tier structure

| Use | Status |
|---|---|
| **Hackathons, prototyping, research, community pilots** | ✅ Explicitly free (§4 names hackathons verbatim) |
| **Pure Caller Use** (call deployed contracts via ABI, no fees charged) | ✅ Free (§2.2) |
| **Any fee-charging product built on it** | ⚠️ = "Commercial Use" (§5.1, §2.2) → requires negotiated Commercial License… |
| …**except** market-making/routing/arb "Volume Activities" | ⚠️ Currently covered by a **blanket enforcement waiver (§5.3) — revocable at Degensoft's sole discretion with 10 days notice** |
| **Hard triggers** (either one) | 🔴 Charged Fees attributable > **$100k/rolling year**, or Liquidity Under Control > **$10M** at any time → must contact license@degensoft.com within 15 days; terms confidential |

## Copyleft (§3) — aggressive scope

- "Modify" includes **"instruction programs that run in the same program/runtime"** (SwapVM §1.7b) and "instruction sets executing in the same virtual machine/address space" (Aqua §1.7). Read literally: **our custom opcodes are unambiguously Modifications, and even compiled strategy programs arguably are.**
- Consequence: Modifications must be published, complete source, free, under the same Degensoft license, with "Powered by SwapVM — © Degensoft Ltd 2025" attribution in README and UI, changes marked and dated, reproducible build instructions.
- §3.3 carve-out: independent code that merely *calls* the Licensed Work is NOT covered — so the Strategy Compiler's agent/UI/off-chain layers stay ours; only the on-chain opcode extensions (and possibly emitted programs) are copyleft.

## Other terms that matter

- Annual audit right (revenue/LUC, under NDA) + "for cause" attestation (§6). Anti-avoidance: affiliates aggregated, no white-labeling around triggers (§5.2).
- No patenting anything that incorporates or depends on the Licensed Work (§7.1). No trademark use beyond truthful compatibility statements (§7.2).
- Degensoft can relicense future releases (§12) — current terms are frozen per release, not forever.
- **No audit reports found in either repo.** SDK lists deployments on 13+ networks. Audit status = unknown/undisclosed → independent risk item for any production adoption.

## Implications

### For the hackathon (Lisboa)
✅ Fully clear. Free use, explicitly. Comply with copyleft mechanically: custom opcodes published under `LicenseRef-Degensoft-SwapVM-1.1`, "Powered by SwapVM — © Degensoft Ltd 2025" in README + UI, changes marked/dated.
