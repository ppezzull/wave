# Come funziona — caso d'uso, pipeline e come lo costruiamo

_Documento di riferimento per chi non ha ancora chiaro **cosa** stiamo costruendo e **come** lo costruiamo tecnicamente. Autoportante: si legge senza gli altri doc. Per la versione in parole semplici (analogia della cucina + come rispondere a 1inch al booth): vedi **[PITCH-SEMPICE_ITA.md](./PITCH-SEMPICE_ITA.md)**. Per il piano di build: `10-10-PLAYBOOK.md`; per il pitch/demo: `PITCH.md`._
_Aggiornato: 24 luglio 2026._

---

## 1. Il caso d'uso in una frase

> **Un market maker vuole una strategia di prezzo personalizzata su 1inch Aqua, ma non sa scrivere il bytecode della VM a mano. Noi gliela compiliamo a partire da una frase in linguaggio naturale.**

### Lo scenario concreto

Un treasury (o un pro market maker) vuole fare market-making su **ETH/USDC**. La sua strategia, detta a parole:

> *"Fai market-making ETH/USDC. Tieni il mio inventario bilanciato 50/50. Non far muovere il prezzo più dello 0,5% rispetto a Chainlink. Prendi 5 bps di fee."*

Questa frase deve diventare un programma eseguibile dalla VM di 1inch. **La pipeline è "come ci arriva".**

---

## 2. Perché serve (il problema reale)

Su **Aqua** (il protocollo 1inch) un ordine di un maker non è un semplice "vendo 1 ETH a 3000 USDC". È un **programma bytecode**: una sequenza di istruzioni che la **SwapVM** esegue al momento dello swap per calcolare prezzo e quantità.

Esempio di programma (ogni parentesi è un'istruzione):
```
[concentrate attorno a 3000] → [applica decay nel tempo] → [controlla oracle]
→ [applica inventory skew] → [xyk swap] → [salt]
```

Ogni istruzione trasforma i "registri" dello swap (`balanceIn`, `balanceOut`, `amountIn`, `amountOut`, `amountNetPulled`). **L'ordine è security-critical**: mettere la fee *prima* o *dopo* il controllo di prezzo minimo cambia il risultato; mettere l'oracle guard *dopo* lo skew lascia un buco di manipolazione.

👉 1inch ha dato agli LP un **assembler** (scrivi bytecode a mano), non un **compiler**. Quasi nessuno sa scriverlo in modo sicuro → nel 2025 il **94% della liquidità Uniswap v2 è rimasta idle nel 90% dei giorni** (fonte: dashboard Dune di 1inch). **Noi costruiamo il compiler.**

---

## 3. La pipeline, con l'esempio ETH/USDC che ci scorre dentro

```
①  NL intent            "MM ETH/USDC, inventario 50/50, oracle guard 0.5%, fee 5bps"
        │
②  LLM → JSON (Zod)     l'LLM *parsa* la frase in un JSON tipizzato e con bound fissi.
        │                 NON scrive bytecode. Può solo scegliere da un menu di "blocchi".
        ▼
   { pair: "ETH/USDC",
     inventorySkew: { targetRatioE18: "500000000000000000", maxSkewBps: 50, maxImproveBps: 10 },
     oracleGuard:   { feed: "ETH/USD", maxStaleness: 7200, maxDeviationBps: 50, mode: "revert" },
     makerFee: 5 }
        │
③  Compilatore          programma DETERMINISTICO (non l'LLM!) che converte il JSON in un
   deterministico        programma SwapVM, mettendo i blocchi in un ORDINE CANONICO fisso:
        │                 deadline → concentration → decay → oracleGuard → inventorySkew
        │                 → makerFee → protocolFee → curve → salt
        │                 Se l'intent produrrebbe un ordine UNSAFE → RIFIUTA + riscrive
        │                 (reject-and-rewrite) mostrando il diff.
        ▼
④  ProgramFactory.      codice Solidity (ProgramBuilder) che assembla il bytecode vero,
   buildProgram()        appendendo blocchi tipizzati e verificati. Mai bytecode raw.
        │
⑤  Simulation battery   PRIMA di deployare: grillia ~12 size × 2 direzioni × exactIn/Out
        │                 via router.quote() su Sepolia. PROVA che il programma è sano:
        │                 prezzi monotoni, niente arbitraggio da split, oracle scatta quando
        │                 manipoli il feed, skew penalizza come deve. Risultato = "safety card"
        │                 verde (artifact da mostrare ai giudici).
        ▼
⑥  aqua.ship()          la strategia va live su Sepolia. Avviene uno swap() reale,
   su Sepolia            i token si muovono. (Questo è il momento "live" della demo.)
        │
⑦  ENS subname          la strategia viene "pubblicata" con un nome leggibile:
   + text record          eth-usdc-guarded.strategist.eth
        │                 I text record (ENSIP-25/26) portano i parametri + l'hash del bytecode
        │                 (program-hash). Così la strategia è scopribile e verificabile.
        │
⑧  Monitor + retune     un SECONDO agente guarda una subgraph (The Graph) che indicizza gli
        │                 eventi Swapped di questa strategia. Man mano che i fill avvengono,
        │                 l'inventario si sbilancia da 50/50. Quando supera una soglia →
        ▼                 l'agente autonomamente: dock() (ritira la vecchia) → ricompila
                          una aggiustata → ship() (ri-deploya). Zero click umano.
                          = "self-retuning", il WOW della demo.
```

---

## 4. Cosa chiede DAVVERO il bounty 1inch

Testo esatto (bounty 1inch — traccia _"Build an Aqua App"_):

> *"Create a custom Aqua app that implements a **sophisticated DeFi position**. If you use SwapVM, you may **modify SwapVM opcodes and define your own instructions**. The final positions must be demonstrated through tests scripts or UI. **Projects that utilize SwapVM will be scored higher.**"*
> Requisiti: contratti ufficiali Aqua/SwapVM, **token transfer onchain nel demo finale** (su **Sepolia testnet** — superiamo il "fork OK" della regola con una chain pubblica e verificabile), git history propria.

⚠️ **Precisazione onesta (importante per la Q&A):** 1inch NON chiede esplicitamente "un compiler". Chiede "una posizione DeFi sophisticated che modifica/definisce istruzioni SwapVM". Il compiler è **il nostro angolo** per vincere quella traccia — giustificato dalla **tesi del whitepaper Aqua stesso** (che l'OVERVIEW chiama "pitch alignment discovered"): la competizione passa "da TVL a formula optimization", ma solo i pro sanno scrivere strategie → liquidità idle. Noi democratizziamo la scrittura.

**Mappatura ai 5 requisiti del bounty:**

| Requisito 1inch | Come lo battiamo |
|---|---|
| "sophisticated DeFi position" | 2 opcode custom (`_inventorySkew2D` + `_oracleGuard2D`) + compiler |
| "modify opcodes / define your own instructions" | proprio i 2 opcode sopra (esplicitamente *invitato*) |
| "SwapVM scored higher" | SwapVM è il core, non un'aggiunta |
| "onchain token transfers in demo" | `swap()` reale su Sepolia testnet |
| "proper git history" | commit continui dall'hour 0 (no single-commit) |

**Se un giudice dice "ma il bounty non chiedeva un compiler":** *"Il whitepaper dice che la liquidità resta idle perché le strategie sono hard-to-write. La nostra sophisticated Aqua App È il compiler + 2 nuove istruzioni che risolvono quello."*

---

## 5. Come lo costruiamo: il compiler NON è una cosa sola, sono **3 strati**

L'errore mentale comune è pensare "l'AI scrive il bytecode". **Non è così.** Il bytecode non lo tocca né l'LLM né mano umana. Si compone da 3 strati, ognuno in un linguaggio/contratto diverso:

```
┌─────────────────────────────────────────────────────────────────┐
│ STRATO 1 — PARSER LLM        (TypeScript, P2, servizio compiler) │
│   frase IT → JSON (schema Zod, numeri con bound fissi)           │
│   L'LLM è un selettore vincolato, NON un autore. Sceglie da un   │
│   menu di ~9 "blocchi" tipizzati. Non può inventare bytecode.    │
├─────────────────────────────────────────────────────────────────┤
│ STRATO 2 — COMPILATORE        (TypeScript, P2 — puro codice, 0 AI)│
│   JSON → lista ordinata di (blocco, args) in ORDINE CANONICO     │
│   fisso. Se l'intent è unsafe → REJECT + riscrittura + diff.     │
│   Deterministico: stesso input → stesso output, sempre.          │
├─────────────────────────────────────────────────────────────────┤
│ STRATO 3 — PROGRAM BUILDER    (Solidity ON-CHAIN, P1)            │
│   lista ordinata → bytecode. Usa il ProgramBuilder di 1inch      │
│   (test/utils/ProgramBuilder.sol) che risolve l'indice dell'     │
│   opcode DAL FUNCTION POINTER → nessuno conta gli opcode a mano. │
│   program.build(_inventorySkew2D, args) → [op:1][len:1][args:N]  │
└─────────────────────────────────────────────────────────────────┘
```

**L'insight chiave:** l'unica parte "intelligente" è lo Strato 1 (parsare la frase). Dallo Strato 2 in giù è tutto deterministico e index-safe. È per questo che un'allucinazione dell'LLM non può deployare robaccia.

> ⚠️ **Da evitare:** il `ProgramBuilder` TypeScript del template `swap-vm-template` è solo un hex-concatenator con opcode numerici grezzi — non usarlo per opcode custom. Usare il **ProgramBuilder Solidity** (`test/utils/ProgramBuilder.sol`) che risolve l'indice dal function pointer (index-safe). È questo che rende impossibile sbagliare il numero dell'opcode.

---

## 6. Trace concreto: la frase ETH/USDC che diventa bytecode

**Strato 1 — LLM → JSON:**
```json
{
  "curve": "xyc",
  "inventorySkew": { "targetRatioE18": "500000000000000000", "maxSkewBps": 50, "maxImproveBps": 10 },
  "oracleGuard":   { "feed": "ETH/USD", "maxStaleness": 7200, "maxDeviationBps": 50, "mode": "revert" },
  "makerFee": 5
}
```

**Strato 2 — compilatore → ordine canonico:**
```
deadline → concentration → decay → oracleGuard → inventorySkew → makerFee → protocolFee → curve(xyc) → salt
```
Se l'utente avesse chiesto "oracle dopo skew" → il compilatore **rifiuta** e riscrive a quest'ordine mostrando il diff.

**Strato 3 — Solidity ProgramBuilder (`ProgramFactory.buildProgram`) → bytecode:**
```
per ogni blocco:  program.build(<istruzione>, <args-packed>)
   ↳ risolve l'indice opcode dal function pointer (index-safe)
   ↳ emette [opcode:1][len:1][args:N], concatena
→ MakerTraitsLib.build(..., useAquaInsteadOfSignature: true)
→ ISwapVM.Order  (un blob bytecode ≤ 65535 byte)
```

**Safety loop (prima di ship):** `router.quote(order)` esegue il programma in **read-only** — e `quote()` è *"100% accurate off-chain simulation"* (whitepaper SwapVM). Qui gira la simulation battery → **safety card verde**.

**Deploy:** l'agente (Strato P2, via `@1inch/aqua-sdk`) chiama:
```ts
aqua.ship(routerAddress, order, [WETH, USDC], amounts)   // strategia live su Sepolia
```

**Taker:** un EOA qualunque chiama `router.swap(...)`. La SwapVM `runLoop` legge `[opcode][len][args]` e dispatcha nella jump-table interna (nessuna external call) → Aqua `pull()`/`push()` muovono i token → **transfer onchain** ✅ (requisito bounty).

**Retune:** la subgraph (The Graph) indicizza `Swapped` → inventario si sbilancia → agente `dock()` + ricompila + `ship()` autonomo.

---

## 7. I 2 opcode custom = l'unica vera ingegneria Solidity (P1)

Tutto il resto "esiste già" in 1inch. Il vero lavoro on-chain è definire 2 istruzioni nuove, e la ricetta è **subclass-and-append** (non un fork), stimata in *ore non giorni* (`docs/sponsors/1inch/SWAPVM-INTERNALS.md`):

1. **Instruction contract** + `ArgsBuilder` lib: `InventorySkew.sol`, `OracleGuard.sol`. Modello = `MinRate._requireMinRate1D` (parse packed args → pre-condizione → `ctx.runLoop()` esegue l'inner program → post-condizione). Ogni istruzione esce con un `ArgsBuilder` (build/parse packed con `abi.encodePacked` + offset-sliced + errori tipizzati).
2. **Tabella estesa**: `contract StrategyOpcodes is AquaOpcodes, InventorySkew, OracleGuard { _opcodes() { /* copia l'array di AquaOpcodes, APPENDI le nostre in fondo */ } }` — append-only per backward compat (gli indici = posizione nell'array).
3. **Router (16 righe!)**: `contract StrategyRouter is Simulator, SwapVM, StrategyOpcodes { _instructions() internal pure override returns (…) { return _opcodes(); } }` con constructor `(aqua, weth, owner, name, version)`.
4. **Program building**: `ProgramBuilder.init(_opcodes())` poi `program.build(Instruction.funcPtr, args)`; `findOpcode` risolve l'indice dal function pointer.
5. **E2E flow**: maker `aqua.ship(routerAddress, strategy, tokens, amounts)` → taker approve + `router.swap(...)` (funziona con EOA plain) → assert transfer. `quote()` per la simulazione pre-ship.
6. **Test invariant** (Move #2): stale-halt + clamp-never-crosses-band che *falliscono su mutazione*.

### I due opcode

- **`_inventorySkew2D`** — pricing two-sided dell'inventario. Il flusso che *aumenta* lo scostamento dal target ratio paga una penalità crescente (cap `maxSkewBps`); il flusso che lo *riduce* riceve price improvement capped `maxImproveBps` **mai oltre la banda oracle**. È l'_"inventory-based pricing"_ che il whitepaper Aqua nomina come use case desiderato (§4.2).
- **`_oracleGuard2D`** — circuit breaker **maker-protection**: revert/clamp quando il prezzo implied devia da Chainlink oltre `maxDeviationBps` **sul lato sfavorevole al maker** (banda a un lato: un prezzo favorevole al maker non fa mai scattare il guard — così non confligge con la penalità di skew, che sposta il prezzo in direzione favorevole al maker); halt totale se oracle stale. **Parte da `OraclePriceAdjuster.sol`** (già in repo, **non cablato in nessuna tabella**) ma ribaltato: quello è *taker-favored* (muove il prezzo verso l'oracle a favore del taker), il nostro è *maker-protection* (rifiuta/clampa i fill maker-unfavorable).

### ⚠️ Formulazioni vietate in pitch/Q&A
1. **Mai** dire "non si può fare con `_extruction`" — **si può**. Il nostro argomento è la **superficie di fiducia**: l'header di `Extruction.sol` avverte che i taker *"MUST validate"* i target esterni. Noi rendiamo la meccanica first-class trust-free. *È a questo che serve un instruction set.*
2. **Non** citare "710/710 test passing" — non è un run reale, è la matrice-target 7×10 (7 invarianti × 10 programmi). Claim-trappola.

---

## 8. Perché ogni sponsor c'entra (pipeline → premio)

| Sponsor | Dove nella pipeline | Ruolo |
|---|---|---|
| **1inch SwapVM/Aqua** | ④⑤⑥ (il substrato) | È la VM che estendiamo + su cui compiliamo. **Core / P0.** |
| **The Graph** | ⑧ (monitor) | La subgraph che indicizza `Swapped` e fa partire il retune autonomo. Senza = niente self-tuning. |
| **ENS** | ⑦ (pubblicazione) | Come la strategia è *nominata, scoperta e verificata* dagli agent. L'agente risolve `…strategist.eth`, legge il program-hash dal text record, verifica che matchi il bytecode on-chain, e solo allora swap. Load-bearing, non cosmetico. |

---

## 9. Chi costruisce cosa

| Ruolo | Cosa costruisce per "la cosa 1inch" |
|---|---|
| **P1 (Solidity)** | `InventorySkew.sol`, `OracleGuard.sol` + ArgsBuilders, `StrategyOpcodes`, `StrategyRouter`, `ProgramFactory.buildProgram()`, test invariant. = "define your own instructions" + "sophisticated position" |
| **P2 (TS)** | schema Zod + prompt LLM (Strato 1), compilatore deterministico + reject-and-rewrite (Strato 2), sim harness, agente ship/dock/monitor via `@1inch/aqua-sdk`, ENS resolve |
| **P3 (UI)** | split-screen frase↔bytecode + safety card + demo dello swap live |

---

## 10. Riassunto in due frasi

**"Compiliamo da una frase"** = l'LLM riempie un form vincolato (TS) → un compilatore deterministico ordina i blocchi in modo sicuro (TS) → un ProgramBuilder Solidity già esistente in 1inch assembla il bytecode index-safe → `aqua.ship()` → `swap()` onchain.

La parte che scriviamo noi davvero, in Solidity, sono i **2 opcode custom** (`_inventorySkew2D`, `_oracleGuard2D`). Tutto il resto è composizione di primitive che 1inch fornisce già.
