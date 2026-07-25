# Come funziona davvero — onboarding tecnico P1 (1inch / Solidity)

_Per Flaviano. Non è strategia: è "cosa sto costruendo, come, in che ordine". Prosa al minimo, skeleton al massimo._

---

## §0 — Step zero: fallo girare (≈90 min, prima di qualsiasi altra cosa)

Leggere SwapVM non funziona. Eseguirlo sì. Il repo Wave **non contiene** ancora il sorgente upstream, e tutti i path in `Flaviano.md` lo assumono.

```bash
mkdir -p srcs/requirements
git clone -b release/1.1 https://github.com/1inch/swap-vm srcs/requirements/swap-vm
cd srcs/requirements/swap-vm
forge build && forge test        # deve essere VERDE su upstream intatto. Niente altro conta finché non lo è.
```

Poi, in ordine:

1. **Un trace vero.** `forge test --match-path test/*XYC* -vvvv` → leggi la sequenza `runLoop` → istruzioni → registri. Qui capisci il 70% della VM.
2. **`src/instructions/MinRate.sol`** — è il template letterale del tuo `_oracleGuard2D`: parse args packed → `ctx.runLoop()` → assert post-condizione. Copiane la struttura *e* la sua `ArgsBuilder` library.
3. **`test/invariants/CoreInvariants.t.sol`** — non reinventare gli invariant test: **si eredita**. Ti dà `assertAllInvariantsWithConfig(...)` che copre simmetria/monotonicità/additività/quote==swap gratis. I tuoi test custom coprono solo ciò che è *tuo* (stale-halt, clamp, liveness).
4. **`test/utils/ProgramBuilder.sol`** — come si compone un programma.

Dopo questi quattro, il resto del documento ti sarà ovvio.

---

## §0.5 — Aqua ha TRE livelli (leggi questo prima di SwapVM)

Fonte: workshop 1inch, 06:26–07:53 e 12:01–13:04. È il pezzo che manca in tutti gli altri doc.

| Livello | Cos'è | Chi lo scrive |
|---|---|---|
| **Aqua Router** | ~80 righe. **Non tiene token.** Segna chi ha impegnato cosa e sposta i token dal/al wallet del maker (`push`/`pull`). Uno solo, condiviso, già on-chain | 1inch |
| **Aqua App** | Il contratto con la logica di scambio. Constant product era un'app, concentrated liquidity un'altra, stable swap un'altra — **un contratto ciascuno** | ⬅️ **TU** |
| **Strategy** | L'impegno di un singolo LP verso un'app: *"constant product WETH/USDC, 1 ETH + 1500 USDC"* | il compiler di Flavio |

1inch si è accorta che ogni app riscriveva lo stesso codice, e ha costruito **SwapVM: un'unica Aqua App generica** dove la logica non è cablata in Solidity ma è bytecode.

> **Quindi `EnsStrategyRouter` non è un contorno attorno alla bounty "Build an Aqua App" — è esattamente il deliverable.**

`ship()` **non muove token**: registra un saldo virtuale ed emette un evento. Due conseguenze: il retune costa quasi niente (`dock()` → ricompila → `ship()` non sposta capitale), e **quell'evento è l'unico modo per scoprire che la strategia esiste** — vedi §0.6.

## §0.6 — Il ponte con The Graph (perché due sponsor, un prodotto)

1. In un AMM tradizionale **la pool è anche il posto dove trovi la liquidità**: sai dove guardare, leggi le riserve.
2. Aqua **cancella la pool**. La liquidità resta nei wallet dei maker.
3. Cancellando la pool cancelli anche **il posto dove i trader trovano la liquidità**. Il router può solo emettere eventi.
4. Il percorso del taker diventa obbligatoriamente: **indexer → trova le strategie → quote → swap**.
5. Workshop 1inch, Q&A 16:44, domanda diretta: *"**non abbiamo un indexer che offriamo come prodotto. Dovrete usare un prodotto esistente. Per esempio The Graph.**"*

> **The Graph non è un'aggiunta a un'Aqua app: è il componente che Aqua ha rimosso e non ha rimpiazzato.**

Da cui la tesi di Wave — 1inch ha dato agli strategy builder un motore **senza strumento di scrittura** (→ il compiler) e **senza layer di scoperta** (→ index + nomi ENS + feed). **Wave è la metà mancante dello stack Aqua.**

## §1 — Il modello mentale in 5 fatti

1. **SwapVM non è un servizio che chiami. È un contratto che erediti e ridispieghi.** Tu deployi **il tuo router**. È letteralmente ~16 righe.
2. **Una "strategia" non è un contratto. È `bytes`.** Un programma = sequenza di `[opcode:1B][len:1B][args:N B]`, identificato dal suo hash. Zero deploy per strategia. Questo è il motivo per cui un *compiler* ha senso: l'output del compiler è un `bytes memory`.
3. **Un "opcode" è una funzione Solidity `internal`.** La VM tiene un array di function pointer e fa `ctx.vm.opcodes[i](ctx, args)`. Nessuna external call. Aggiungere un'istruzione = **subclass + append all'array**, non un fork.
4. **Aqua è dove stanno i soldi.** I token restano nel wallet del maker; Aqua tiene un saldo virtuale (`Maker → App → StrategyHash → Token → Balance`) con esposizione via allowance ERC-20. `ship()` = pubblica la strategia, `dock()` = ritirala. Sono pure config: **nessun token si muove**. Ecco perché il retune è economico: `dock()` → ricompila → `ship()`.
5. **`quote()` e `swap()` sono lo stesso codice.** `quote()` gira in static context (`ctx.vm.isStaticContext == true`). Per questo la "simulation battery" è una garanzia vera e non una stima: simulare *è* eseguire.

---

## §2 — Il concetto che spiega tutto: le istruzioni *wrapping*

Un'istruzione può chiamare `ctx.runLoop()` **a metà del proprio corpo**. `runLoop()` esegue *tutte le istruzioni successive* e poi torna. Quindi:

> **Più un'istruzione sta all'inizio del bytecode, più è ESTERNA.**

È il pattern decorator. Il programma è una matrioska, non una lista.

```
bytecode:  [ oracleGuard ][ inventorySkew ][ xycSwap ]
                 │                │              │
esecuzione:  guard: parse args
                 └─► runLoop() ──► skew: parse args
                                       └─► runLoop() ──► xycSwap: calcola amountOut  ← il CUORE
                                   skew: amountOut *= (BPS - penalty)/BPS            ← poi torna qui
             guard: implied = amountOut/amountIn; confronta con Chainlink            ← e infine qui
                    → revert oppure clamp
```

**Da qui discende tutta la storia di sicurezza del progetto:**

- Il guard è **outermost**, quindi vede il prezzo **finale** — dopo curva *e* dopo skew. È l'ultima parola.
- Se metti il guard *dopo* lo skew nel bytecode, diventa **interno**: controlla il prezzo pre-skew, e lo skew può poi spostarlo fuori banda **senza che nessuno se ne accorga**.
- Questa è esattamente la regola `OracleGuardMustPrecedeSkew` del compiler, ed è il beat WOW della demo.
- Ed è la tua risposta in Q&A: *"l'ordine delle istruzioni non è stile, è annidamento — sbagliarlo disarma il circuit breaker."*

L'ordine canonico è quindi leggibile come "dal più esterno al più interno":
`deadline → concentration → decay → oracleGuard → inventorySkew → makerFee → protocolFee → curve → salt`

---

## §3 — Cosa scrivi TU: quattro file

### 3.1 L'istruzione guard — `src/instructions/OracleGuard.sol`

Modellata su `MinRate.sol`. **`internal view`** — deve funzionare sotto `quote()`.

```solidity
// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
library OracleGuardArgsBuilder {
    // [oracle:20][oracleDecimals:1][maxStaleness:2][maxDeviationBps:2][mode:1][flags:1]  = 27 byte
    function build(address oracle, uint8 dec, uint16 staleness, uint16 devBps, uint8 mode, uint8 flags)
        internal pure returns (bytes memory)
    { return abi.encodePacked(oracle, dec, staleness, devBps, mode, flags); }
}

contract OracleGuard {
    error OracleStale();
    error OracleDeviation();

    function _oracleGuard2D(Context memory ctx, bytes calldata args) internal view {
        // 1. parse (offset-sliced, errori tipizzati — copia lo stile di MinRateArgsBuilder)
        address oracle = address(bytes20(args[0:20]));
        // ...

        // 2. esegui il programma interno → riempie ctx.swap.amountIn / amountOut
        ctx.runLoop();

        // 3. staleness PRIMA di tutto, e revert SEMPRE (entrambe le mode). È l'halt.
        (, int256 answer,, uint256 updatedAt,) = IPriceOracle(oracle).latestRoundData();
        if (block.timestamp - updatedAt > maxStaleness) revert OracleStale();

        // 4. prezzo implicito vs oracolo, normalizzando decimali e direzione
        //    implied = amountOut * 1e18 / amountIn
        // 5. fuori banda → mode 0: revert  |  mode 1: clamp al bordo, arrotondando A FAVORE DEL MAKER
    }
}
```

### 3.2 L'istruzione skew — `src/instructions/InventorySkew.sol`

Stessa forma. Wrappa, poi **riduce** `amountOut` se il trade allontana l'inventario dal target.

```solidity
function _inventorySkew2D(Context memory ctx, bytes calldata args) internal {
    // parse: targetRatioE18 (uint64) | slopeBps (uint16) | maxSkewBps (uint16)
    ctx.runLoop();
    // bilanci post-trade → deviation = |share'(in) - target|
    // penalty applicata SOLO se il trade AUMENTA la deviazione
    // penaltyBps = min(maxSkewBps, slopeBps * deviation / 0.1e18)
    // exactIn:  amountOut = amountOut * (BPS - penaltyBps) / BPS      (floor)
    // exactOut: amountIn  = ceilDiv(...)                              (arrotonda SU)
}
```

⚠️ **Invariante #5 (rounding favors maker) è quella che ti fa fallire i test upstream se sbagli:** `amountOut` sempre floor, `amountIn` sempre ceil. Sempre.

### 3.3 La tabella opcode — `src/opcodes/StrategyOpcodes.sol`

```solidity
contract StrategyOpcodes is AquaOpcodes, InventorySkew, OracleGuard {
    function _opcodes() internal pure override
        returns (function(Context memory, bytes calldata) internal[] memory ops)
    {
        ops = super._opcodes();          // oppure ricopia l'array di AquaOpcodes
        // APPEND IN FONDO. Mai in mezzo: la tabella è append-only (backward compat).
        // ops[n]   = _inventorySkew2D;
        // ops[n+1] = _oracleGuard2D;
    }
}
```

### 3.4 Il router — `src/routers/EnsStrategyRouter.sol`

```solidity
contract EnsStrategyRouter is Simulator, SwapVM, StrategyOpcodes {
    event StrategyDeployed(bytes32 indexed strategyId, bytes32 programHash, bytes32 ensNode);

    constructor(address aqua, address weth, string memory name, string memory version)
        SwapVM(aqua, weth, name, version) StrategyOpcodes(aqua) {}

    function _instructions() internal pure override
        returns (function(Context memory, bytes calldata) internal[] memory)
    { return _opcodes(); }
}
```

**`StrategyDeployed` va congelato a h2 e l'ABI esportato**: Flavio ci punta `resolveVerify`, Pietro ci punta il mapping del subgraph. Cambiarlo dopo rompe due persone.

---

## §4 — Quattro trappole che costano ore

1. **In modalità Aqua NON si scrive l'istruzione dei balance.** Il README upstream è esplicito: Aqua → *"Balance Instruction: None (Aqua manages)"* + `useAquaInsteadOfSignature: true`. Se metti `_dynamicBalancesXD` **e** shippi su Aqua, il comportamento è sbagliato e il debug è doloroso.
2. **Mai scrivere un indice opcode numerico.** Lo slot 0 è sacrificato come lunghezza dell'array → indice effettivo = posizione − 1. Usa sempre `p.build(InventorySkew._inventorySkew2D, args)`: il ProgramBuilder Solidity risolve l'indice **dal function pointer**. È anche il motivo per cui `slots.json` a G1 è un *dump* generato, non un conteggio a mano.
3. **`internal view` → `internal`** è una conversione legale di function pointer in Solidity (`view` è più restrittivo, quindi assegnabile). Se prendi un errore di tipo criptico sulla tabella, è quasi sempre `pure` vs `view` vs non-payable — non l'architettura.
4. **Chainlink su fork è congelato.** Al blocco del fork il feed non si muove. Happy path = fork fresco tagliato ~15 min dopo un update del feed (leggi `updatedAt` al taglio); il breaker si dimostra con un `MockAggregatorV3` che controlli tu — **dichiarato sulla slide**.

---

## §5 — Una decisione dovuta PRIMA di h8

I doc descrivono `_oracleGuard2D` in due modi che **non sono la stessa istruzione**:

| Fonte | Lettura |
|---|---|
| `10-10-PLAYBOOK.md:79` | **due lati**: `if \|implied − oracle\| / oracle > maxDeviationBps` |
| `PITCH.md:46`, `SWAPVM-INTERNALS.md:37` | **un lato**: "rifiuta i fill *sfavorevoli al maker*" |

Conta **proprio a causa dell'annidamento di §2**: il guard è outermost, quindi vede `amountOut` **dopo** la penalità di skew — e quella penalità muove il prezzo implicito nella direzione **favorevole al maker**. Con la lettura a due lati, una penalità grande può spingere il prezzo fuori banda e far scattare il guard **dal lato che aiuta il maker** → revert spurii, che emergono a h14 dentro `InventorySkewLiveness.t.sol`.

**Decidi ora (5 minuti) invece che a h14 (ore):** la banda rifiuta la deviazione favorevole al maker, o solo quella sfavorevole? Se un lato solo → mettilo nel layout degli args e costa zero. Se due lati → serve una risposta esplicita sulla composizione con lo skew prima di scrivere i test.

---

## §6 — Ordine di lavoro (e cosa NON è tuo)

**Il tuo dealbreaker** (`Flaviano.md`): la `swap()` live attraverso Aqua — `pull`/`push` visibili nel trace, evento `Swapped` nei log del fork, entrambi gli opcode nell'hot path — **più** un `_oracleGuard2D` che halta davvero. Se domenica manca, 1inch è perso e i beat finalist Practicality/WOW non hanno motore.

Hai chiesto "se non anche altro". **No.** Finché G2 non è verde: opcode, router, test, infra fork. Nient'altro.

| Ordine | Cosa | Perché prima di quello dopo |
|---|---|---|
| 1 | §0 — upstream clonato e `forge test` verde | senza questo non puoi nemmeno compilare |
| 2 | Router + `StrategyDeployed` congelato (tabella Aqua stock) | sblocca Flavio **e** Pietro |
| 3 | `OracleGuard.sol` | è la radice della spine: se diverge, il verdetto del compiler non ha nulla da gattare e il beat B non ha halt |
| 4 | `OracleGuardStaleHalt` + `OracleGuardClamp` | ← **scope-cut floor**: se tutto crolla, questo + M1/M2 + uno screenshot RED tiene in piedi Technicality |
| 5 | `InventorySkew.sol` | il secondo opcode è ciò che rende plurale "abbiamo esteso la VM" |
| 6 | liveness + additivity (eredita `CoreInvariants`) | |
| 7 | deploy su fork + `graph deploy` + swap fixture | sblocca il `graphDelta` di Pietro |
| 8 | mutation harness M1/M2/M3 | ⚠️ è il primo a slittare se sei in ritardo — l'arming del Beat B no |

**La tua risposta in Q&A da imparare a memoria:** *"perché un opcode nativo e non `_extruction`?"* → l'header del loro `Extruction.sol` dice che i taker **DEVONO** validare il target esterno perché può rompere silenziosamente la consistenza quote/swap. Noi togliamo quella superficie di fiducia. **Mai dire "impossibile con extruction"** — extruction *può* esprimerlo; l'argomento è la superficie di fiducia, non la possibilità.
