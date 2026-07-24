# The Pitch — Storytelling for Judges (and Teammates)

_The narrative asset. Rehearse from this. The pitch sentence and the code's mechanism are the same thing — every line here is backed by something we demo._

## The one-liner

> **"1inch built a virtual machine for market-making strategies — but no compiler. We built the compiler."**

Variant with the AI hook: *"Tell it your strategy in a sentence; it ships a custom AMM in 30 seconds — simulated, safety-checked, and live on-chain."*

## The three-act narrative (maps to the 4-min demo)

### Act 1 — The locked door (~45s)
- **Fact:** on 90% of days in 2025, **94% of Uniswap v2 liquidity never traded once** (85% on v3 — 1inch's own Dune dashboard). LP capital sits idle — and LPs have had no way to express anything smarter. *(Phrasing deliberate: don't claim idleness is CAUSED by curve homogeneity — a knowledgeable judge can contest that; "no way to express smarter" is unattackable.)*
- 1inch's answer is Aqua + SwapVM: liquidity stays in your wallet, and your strategy is a *program* — custom fees, custom curves, custom protection, no contract deployment.
- **The problem:** who can write VM bytecode with security-critical instruction ordering? Approximately nobody. 1inch's whitepaper says the future belongs to "strategy builders" — but gave them an assembler, not a compiler. *(Beat: this is the door; we built the key.)*

### Act 2 — The magic (demo core, ~2min)
Live, on a mainnet fork, no mocked screens — with two disclosed exceptions: the mock oracle that drives the judge-triggered revert (Beat B), and the canned latency fallback if the live compile stalls. Never claim "everything live" without those clauses. Three strong beats (full timeline + canned fallbacks in [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md)):

- **Beat A — ship (0–60s).** Type intent → the compiler emits the SwapVM program, **split-screen: sentence beside the bytecode** ("this sentence IS this program"). The **green safety card** renders from the `quote()` battery — monotonicity ✓, symmetry ✓, oracle-guard triggers ✓. Then the **WOW moment**: type a malicious intent (oracle-guard placed *after* skew) → the compiler visibly **REJECTS** it with a side-by-side diff and emits the corrected, canonicalized program. *(Beat: "the compiler refuses to ship anything unsafe — and shows you why.")* `ship()` puts the corrected strategy live on the fork — **the one live on-chain token flow** (satisfies 1inch).

- **Beat B — ENS-discover + live revert (60–150s).** The strategy gets its ENS subname (`eth-usdc-guarded.strategist.eth`). **A second agent DISCOVERS it via ENS** — resolves the registry, reads the `v0.programhash` from the text record (say "draft standard" — ENSIP-25/26 are Drafts), **verifies it matches the on-chain program**, and swaps against it. *(Beat: "the taker found this strategy through ENS, not our database — and checked it wasn't tampered with." This is what makes ENS load-bearing.)* Then **the judge triggers a revert**: they pick a deviated market state → `MockAggregatorV3` pushes it → `_oracleGuard2D` **HALTS quoting on screen**. *(Beat: "the protection lives in the VM — nothing the AI did could have disabled it.")*

- **Beat C — autonomous retune (150–220s).** A real entity delta from our **first-party subgraph** (indexing `Swapped`) crosses threshold → the agent notices → `dock()` + recompile + `ship()` in seconds, **autonomously, no click**. *(Beat: "your LP position just adapted itself. No pool migration, no locked capital, custody never left the wallet.")* → compliance card (220–240s).

**Stage discipline:** three beats, each with a canned replay twin (`DEMO_LIVE=0` downgrades any live call to its recording). **The two un-cannable moments: the live `swap()` and the judge-triggered halt** — those are the rubric-killers; everything else can fall back to recording. Backup anvil on laptop B for fork-RPC death. LLM stall → 1500ms watchdog swaps to cached-but-real response (disclosed). **Cut plan if timing slips:** drop Beat C to a narrated screenshot first; **never** cut the live `swap()`, the reject-and-rewrite WOW beat, or the ENS discovery panel (those clear 1inch, WOW, and ENS respectively).

> **Safety-narrative note:** build the safety story on the **oracle clamp** (`_oracleGuard2D`, empirically fires 47% of the time), not on a "watch the strategy discount the side that heals it" heal-side beat — that reward is ~0 in the tested regime.

### Act 3 — The depth + the real user (~45s)
- "We didn't just use the VM — **we extended it**: two new instructions, `_inventorySkew2D` and `_oracleGuard2D`, each proven against SwapVM's seven documented invariants. Could you bolt these on with an `_extruction` external call? Yes — and 1inch's own code warns takers MUST validate such external targets because they can silently break quote/swap consistency. We made these mechanics first-class, trust-free instructions instead. **That's what an instruction set is for.**" *(Show the opcode diff for 5 seconds — engineers in the room will get it. NEVER say "couldn't be expressed" — extruction CAN express them; the argument is trust surface, not possibility.)*

## Killer-facts arsenal (drop into Q&A as needed)

- 94% idle (v2) / 85% (v3) / 84% (v4) — 1inch's own data: https://dune.com/1inch/idle
- Aqua whitepaper §4.2 *names our outputs as the intended use cases*: "dynamic fees responding to volatility… concentrated liquidity with inventory-based pricing"
- Aqua thesis quote: strategy competition means "a breakthrough strategy can go from zero to significant liquidity in minutes" — for whoever can write one. We make that everyone.
- `quote()` is 100%-accurate off-chain simulation by VM design — our safety gate is native, not bolted on.
- Strategies are bytecode identified by hash: reusable, auditable, ENS-discoverable.

## Q&A armor (rehearsed answers)

- **"What stops the LLM from deploying something that drains the LP?"** → "It can't write code. It fills a bounded, schema-validated form; a deterministic compiler assembles pre-verified blocks; every candidate passes a quote()-simulation battery; and the circuit breaker lives *in the VM* — `_oracleGuard2D` halts quoting on oracle deviation or staleness regardless of what any AI does."
- **"What was genuinely hard?"** → the two custom opcodes under the VM's seven invariants (show the subadditivity test), and compiling intent to *canonically ordered* instructions — ordering is security-critical in SwapVM.
- **"Isn't there already an oracle instruction?"** → "Yes — `OraclePriceAdjuster`, in the repo but wired into no opcode table (and untested). It moves price toward the oracle in the *taker's* favor. Ours is the opposite: maker protection. We studied theirs first." *(Knowing their unshipped code better than most = instant credibility.)*
- **"Why an opcode and not an extruction target?"** → "Extruction would work — your own `Extruction.sol` header says takers MUST validate the external target, keep it non-upgradeable, and trust it not to break quote/swap consistency. Our instructions eliminate that trust surface: no external call, invariant-tested in the VM itself, reusable by any strategy. We turned a per-strategy trust decision into a protocol-level guarantee." *(The argument is trust surface, not possibility — extruction can express the mechanics, but it pushes a trust decision onto every taker.)*
- **"What breaks if The Graph goes down?"** → "The retune loop dies — the agent's decisions consume live subgraph deltas, so without The Graph the position stops adapting. It's load-bearing, not decoration." *(Must be true in the build.)*
- **"Is that really a *compiler* — isn't it an LLM filling a form for a template assembler?"** → "The LLM is only the front-end parser. The compiler is the deterministic layer behind it: it enforces canonical instruction ordering — which is security-critical in SwapVM, wrong order changes settlement math — performs invariant-gated composition, and emits real VM bytecode. A template assembler has N pre-compiled templates, one per combination; we have K typed blocks and a builder that composes any *valid* permutation — **K blocks generate K!/constraints programs, not N fixed templates.** And it visibly *rejects* an unsafe program and rewrites it — show the diff. Front-end flexibility, back-end rigor: that's what a compiler is." *(Rehearse this one out loud — the whole narrative hangs on the word. The reject-and-rewrite demo beat IS the proof; see [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md) Move #1.)*
- **"Is this real or a demo trick?"** → deterministic fork fixtures; on-chain numbers come from live chain calls; the oracle that *triggers* the circuit breaker in the demo is a mock we control — disclosed on the slide — because you cannot move a real Chainlink feed on demand, and demonstrating the breaker requires moving the market. Repo history shows the whole build.
- **"What's the business?"** → "LP infrastructure: strategy authoring for the Aqua era. And we already have user #1 — see Act 3."

## One-liners for teammates (internal rallying)

- "We're not building an agent that trades. We're building the **compiler for the strategy-builder era** — agents are the front-end."
- "Everyone else's demo: a bot pays for an API. Our demo: a sentence becomes a market maker."
- "The judges' question is always *'where's the hard part?'* Ours is on-chain, diffable, and invariant-tested."

## Judging-criteria map (why each beat exists)

| Criterion | Covered by |
|---|---|
| Technicality | custom opcodes + invariant tests + compiler (Act 3) |
| Originality | "compiler for a swap VM" — no one else's shape (Act 1) |
| Usability | sentence → live strategy in 30s; gas/complexity invisible (Act 2) |
| WOW | self-retuning position + safety report moment (Act 2, steps 4 & 6) |

## Sponsor judge lenses (prep for booth + Q&A)

_What each sponsor judge will probe, and the answer that wins. Prize picks: 1inch ($2.5k 1st) + Graph AI Use Case ($2k 1st) + ENS AI Agents ($1.5k)._

- **1inch — 🟢 safest prize.** They invited teams to "modify SwapVM opcodes and define your own instructions" — we do exactly that. We know their unshipped `OraclePriceAdjuster` (wired into no table, taker-favorable) better than most entrants — instant credibility. *Probe to expect:* "you modified the VM — show me the diff and the invariant tests." Answer with the opcode diff + the mutation-killing fuzz (RED on bug, GREEN real).
- **Graph AI Use Case — 🟡 conditional (the swing-risk).** 35% of the score is "effective use of The Graph." Live data + reasoning clears the gate, but the load-bearing claim ("retune dies without Graph") must be wired (Move #5 first-party subgraph). *The deciding question:* **"Unplug The Graph mid-demo — what happens to the on-chain position?"** Winning answer: "it stops adapting — suboptimal but safe, because the on-chain circuit breaker is independent of the agent." Losing answer: "nothing changes."
- **ENS AI Agents — 🟢 good fit, two gates.** *Gate 1:* the demo must READ and act on ENS records on-screen (resolve subname → verify program-hash → swap), not just write them — otherwise a judge calls it cosmetic. *Gate 2:* **physical presence at the ENS booth Sunday morning is mandatory** (no-show = ineligible). Terminology: always say "draft standard" for ENSIP-25/26 — both are Drafts, and the authors may be in the room.
- **World (not picked) — why we left it.** AgentKit's "Will not qualify" list targets "human-backed benefits for AI agents (API calls/discounts)" and "agent reputation." Our `ship()`-gate risks reading as a perk unless framed as a *trust-model* change (human backing changes authorization to deploy capital), and it competes for the same hours as the opcode work that *is* the finalist argument. Only revisit if ahead of schedule and the framing survives the exclusion list.

**The one question that decides the finalist session:** *"Is this really a compiler, or an LLM filling a template?"* — answered fluently (deterministic ordering + invariant-gated composition + real bytecode emission + the visible reject-and-rewrite), it wins Technicality.
