# wave — slide deck 90–120s (ETHOnline 2026)

Schema per un mazzo da **1:30–2:00** (9 slide, tempi indicati). Il testo
**on-slide** è in inglese (judges); le **note** in italiano sono la traccia
per parlare. Va bene sia per il video principale sia come scheletro del
walkthrough Ledger (≤5 min). Stato del repo al 12 set (Ledger-only, post
`e0787d6`).

---

## Slide 1 — Title *(5s)*

**On-slide:**
> **wave** — a social market for natural-language on-chain strategies
> *A sentence becomes a market maker.*
> ETHOnline 2026 · Continuity track · github.com/ppezzull/wave

**Nota (IT):** "wave, costruito a ETHGlobal Lisboa e esteso qui: un social
network dove pubblichi strategie di trading scritte in linguaggio naturale —
e dove l'unico like che conta è capitale vero."

**Visual:** logo + screenshot feed.

## Slide 2 — Problem *(10s)*

**On-slide:**
> 1inch built SwapVM — a virtual machine for market-making strategies.
> But it shipped an **assembler, not a compiler**: authoring bytecode is for engineers.
> Regular users are locked out of their own liquidity.

**Nota:** "1inch ha la macchina ma non il compilatore: chi non scrive bytecode
non può partecipare."

**Visual:** "NL → ??? → bytecode" con il punto interrogativo rosso.

## Slide 3 — What wave does *(15s)*

**On-slide:**
> Describe your intent → deterministic compiler → SwapVM program → safety battery → **live on-chain**
> - No database: the feed, the follows, the profile — everything is on-chain / subgraph
> - **A like is liquidity**: strategies rise in the feed by real volume

**Nota:** "Scrivi la frase, il compilatore deterministico produce il programma,
la batteria di sicurezza lo verifica, e va live su Sepolia via Aqua. Il feed è
ordinato dal capitale vero, non dagli algoritmi di un social."

**Visual:** pipeline in 5 step + screenshot della compose.

## Slide 4 — The compiler refuses *(15s)*

**On-slide:**
> The LLM only fills a bounded, validated form. Everything after it is deterministic.
> **Reject-and-rewrite**: a malicious intent gets a red REJECTED card — citing the rule — and a corrected program.
> 2 custom opcodes (oracle guard, inventory skew) proven against SwapVM's invariant battery.

**Nota:** "Il momento wow: scrivi un intento pericoloso e il compilatore
rifiuta — spiegando la regola violata — e propone il programma corretto. La
sicurezza non è un filtro posticcio: è nel VM."

**Visual:** screenshot split frase | bytecode | safety card rossa→verde.

## Slide 5 — Autonomy has a hardware brake *(20s — la slide Ledger)*

**On-slide:**
> An autonomous agent retunes live strategies from subgraph deltas — zero clicks.
> But the riskiest actions pass a **hardware gate**:
> approving = an EIP-191 signature **made on the Ledger** (Clear Signing),
> bound to the action's hash — one approval unlocks one action, once.
> A stolen session can't approve anything. A click is never consent.

**Nota:** "L'agente lavora da solo sui dati; quando l'azione è rischiosa,
l'ultimo sì non è un click: è una firma sul dispositivo fisico, legata
all'hash di quell'azione. Rubare la sessione non serve a niente."

**Visual:** due pannelli — sinistra: retune zero-click (dati→azione); destra:
il Ledger con il messaggio Clear-Signed `[actionHash]`.

## Slide 6 — The Graph makes it honest *(10s)*

**On-slide:**
> A first-party subgraph indexes every strategy, swap and attribution.
> Every autonomous retune is **caused by live data** — the evidence log cites the entity ID.

**Nota:** "Nessun database: è il subgraph. E l'autonomia è causata dai dati,
non da un timer — ogni retune cita l'entità che l'ha scatenato."

**Visual:** query GraphQL + evidence log con entity ID.

## Slide 7 — Real, not mocked *(10s)*

**On-slide:**
> Live Sepolia deployment · `quote() == swap()` · retunes executed on-chain
> This event: **StrategyFactory** (on-chain authorship) · the trust ladder (session/device) · ship-on-chain flow · idempotent re-ship

**Nota:** "Tutto reale: swap live, retune live, e in questo evento abbiamo
aggiunto authorship on-chain e la scala di fiducia con il device."

**Visual:** tx su Etherscan + indirizzi.

## Slide 8 — Before / after Ledger *(10s)*

**On-slide:**
> Before: the riskiest approval was a button click.
> After: a hardware signature, bound to the action, verified on-chain-independent.
> Trust ladder: `off` → `session` (author wallet signs) → `device` (Ledger only).

**Nota:** "Questa è la differenza che chiede il track Ledger: prima un click,
adesso una firma hardware."

**Visual:** confronto due colonne.

## Slide 9 — Close *(5s)*

**On-slide:**
> **A sentence becomes a market maker.**
> **The last yes is hardware-backed.**
> github.com/ppezzull/wave · wave.craftale.it

**Nota:** chiusura, 5 secondi, silenzio dopo la seconda riga.

---

### Timing totale: 5+10+15+15+20+10+10+10+5 = **100s** ✓

**Regole di registrazione:** inglese, 150-170 parole al minuto, uno screenshot
reale per slide (niente mock), la slide 5 con il Ledger INQUADRATO mentre
firmi. Per il walkthrough Ledger (≤5 min) riusa 2-3-5-8 allargate con il flusso
completo live.
