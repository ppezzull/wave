# Runbook 1inch — ogni step spiegato · P1 / Flaviano

_La checklist operativa è **[../tasks/Flaviano.md](../tasks/Flaviano.md)** — là c'è **cosa** fare. Qui c'è **cosa sta succedendo**, **perché in quest'ordine** e **cosa fare se si rompe**. Le fasi F0–F6 qui sotto sono raggruppamenti di questo documento, non un secondo piano: dove una fase corrisponde a una riga della checklist, la riga della checklist comanda._

**Convenzione:**
🔎 = **da verificare sul sorgente**, non fidarti di questo file. Non ho il sorgente `swap-vm` sotto mano mentre scrivo: le firme esatte vanno confermate. Dove sono sicuro (perché sta nella doc upstream vendorizzata) non c'è la lente.

---

## Il modello mentale, in 60 secondi

Prima di toccare qualsiasi cosa, tieni a mente tre livelli. Sono di **Aqua**, non di SwapVM, ed è la parte che confonde tutti:

| Livello | Cos'è | Chi lo scrive |
|---|---|---|
| **Aqua Router** | ~80 righe. Non tiene token. Segna chi ha impegnato cosa e sposta i token dal/al wallet del maker. Uno solo, già on-chain | 1inch |
| **Aqua App** | Il contratto con la logica di scambio. Constant product era un'app, concentrated liquidity un'altra — un contratto ciascuno | ⬅️ **TU** |
| **Strategy** | L'impegno di un singolo LP verso un'app: *"constant product WETH/USDC, 1 ETH + 1500 USDC"* | il compiler di Flavio |

**SwapVM è un'Aqua App generica**: invece di cablare la curva in Solidity, la logica è bytecode. Il tuo `EnsStrategyRouter` è **un'Aqua App costruita su SwapVM** — cioè letteralmente il deliverable della bounty "Build an Aqua App", non un contorno.

E la regola che spiega tutto il resto: **un'istruzione può chiamare `ctx.runLoop()` a metà del proprio corpo**, e `runLoop()` esegue tutte le istruzioni successive. Quindi **chi sta prima nel bytecode è più ESTERNO**. Il programma è una matrioska, non una lista.

---

# F0 — Ambiente e verità di partenza

## F0.1 — Clonare l'upstream

```bash
cd /Users/flaviano/Desktop/wave
mkdir -p srcs/requirements
git clone -b release/1.1 https://github.com/1inch/swap-vm srcs/requirements/swap-vm
```

**Cosa sta succedendo.** Tutti i doc del repo (`Flaviano.md`, `HOW-IT-WORKS.md`) puntano a `srcs/requirements/swap-vm/...`, ma quella cartella non è mai stata creata. Stai colmando il buco.

**Perché `release/1.1` e non `main`.** Il vostro `SWAPVM-INTERNALS.md` è stato scritto contro 1.1, e 1.1 contiene istruzioni che il whitepaper 1.0 non ha (`LimitSwap`, `MinRate`, `DutchAuction`, `BaseFeeAdjuster`, `OraclePriceAdjuster`). Se prendi un branch diverso, metà delle vostre note non corrispondono più. ⚠️ La pagina bounty però linka `/tree/main` — se `release/1.1` non esiste più, prendi `main` e **rileggi** `MinRate.sol` prima di fidarti delle note.

**Aggiungilo al `.gitignore`** o mettilo come submodule: non vuoi committare migliaia di file altrui nel vostro repo, e la Classic track guarda lo storico Git.

## F0.2 — `forge test` verde su codice intatto 🚧

```bash
cd srcs/requirements/swap-vm
forge build && forge test
```

**Perché questo blocca tutto.** Se non compila il *loro* codice, non compilerà il tuo, e passeresti un'ora a debuggare il tuo `_oracleGuard2D` quando il problema è la versione di `solc`. Sono Solidity 0.8.30 + Foundry.

**Se fallisce:** `foundryup` per aggiornare, `forge install` per le dipendenze mancanti. Se restano rossi solo alcuni test di fork (per RPC mancante), va bene — ti serve verde il **build** e i test unitari.

## F0.3 — Clonare Aqua

```bash
git clone https://github.com/1inch/aqua srcs/requirements/aqua
```

Ti serve l'indirizzo del router Aqua e l'interfaccia `ship`/`dock`/`pull`/`push`. Il costruttore del tuo router prende `aqua` come primo argomento.

## F0.4 — Il fork

```bash
anvil --fork-url <RPC> --fork-block-number <N>
```

**Perché un fork e non una chain vuota.** Ti serve un **feed Chainlink vivo** per `_oracleGuard2D`, e ti servono token veri (WETH/USDC) con decimali veri — perché la normalizzazione dei decimali è dove nascono i bug del guard.

⚠️ **La trappola del fork.** Al blocco del fork il feed Chainlink è **congelato**: `updatedAt` non avanza più. Quindi:
- **Happy path** = fork fresco tagliato ~15 min dopo un aggiornamento del feed. Al taglio, **leggi `updatedAt`** e verifica di stare dentro `maxStaleness`.
- **Dimostrare il breaker** = impossibile con un feed vero (non puoi muovere Chainlink a comando). Serve il `MockAggregatorV3` che controlli tu, **dichiarato sulla slide**.

Questi sono due oracoli diversi nella stessa demo. È voluto, non è un trucco, ma va detto ad alta voce.

## F0.5 — Le quattro letture

In quest'ordine preciso:

1. **Un test AMM con `-vvvv`.** `forge test --match-path "test/*XYC*" -vvvv`. Guarda la sequenza `runLoop` → istruzioni → registri. Qui capisci il 70% della VM, e lo capisci guardando, non leggendo.
2. **`src/instructions/MinRate.sol`.** È il template **letterale** del tuo guard: parse degli args packed → `ctx.runLoop()` → assert della post-condizione. Nota come fa il check del rate **per moltiplicazione incrociata, senza divisione** — copia anche quello, evita errori di arrotondamento.
3. **`test/invariants/CoreInvariants.t.sol`.** ⚠️ **Non riscriverai gli invariant test: li erediti.** `assertAllInvariantsWithConfig(...)` ti copre simmetria, monotonicità, additività e quote==swap gratis. I tuoi test coprono solo ciò che è *tuo* (stale-halt, clamp, liveness).
4. **`test/utils/ProgramBuilder.sol`.** Come si compone un programma senza scrivere indici a mano.

## F0.6 🔎 — Chiudere la contraddizione sull'oracle-guard

**Il problema.** I vostri doc descrivono `_oracleGuard2D` in due modi che non sono la stessa istruzione:

| Fonte | Lettura |
|---|---|
| `10-10-PLAYBOOK.md` (spec) | **due lati**: `\|implied − oracle\| / oracle > maxDeviationBps` |
| `PITCH.md` e `SWAPVM-INTERNALS.md` | **un lato**: rifiuta i fill *sfavorevoli al maker* |

**Perché conta davvero.** Il guard è **esterno** allo skew, quindi vede `amountOut` **dopo** la penalità di skew — e quella penalità muove il prezzo implicito nella direzione **favorevole al maker**. Con la lettura a due lati, una penalità grande può spingere il prezzo fuori banda e far scattare il guard **dal lato che aiuta il maker**: revert spurii.

Non lo scopriresti adesso. Lo scopriresti a F4.8, quando i test di liveness diventano rossi per un motivo che sembra assurdo.

**Decidi ora, scrivilo nel layout degli args.** Se un lato solo, un flag nel byte `mode`. Costa 5 minuti adesso, ore dopo.

## F0.7 🔎 — Chiudere il dubbio su `decay`

Al workshop 1inch (19:38–20:37) il presentatore dice che l'opcode `decay` può puntare *"a un prezzo Chainlink o a qualunque prezzo tu voglia impostare"*. I vostri doc invece descrivono `_decayXD` come uno sfasamento temporale delle riserve virtuali, **senza oracolo**.

```bash
grep -rn "latestRoundData\|IPriceOracle\|oracle" srcs/requirements/swap-vm/src/instructions/Decay.sol
grep -rln "latestRoundData" srcs/requirements/swap-vm/src/instructions/
```

**La domanda:** il target del decay è un **parametro statico** o una **lettura live** dell'oracolo?

- **Statico** → il presentatore intendeva "un numero che ti sei preso da un oracolo fuori catena". La tua differenziazione è pulita e gratis.
- **Live** → c'è sovrapposizione reale e ti serve una risposta prima di scrivere il guard.

In entrambi i casi la **forma** della risposta è la stessa: *il decay è un meccanismo di prezzo, muove il prezzo verso un target nel tempo; il nostro guard è un rifiuto, ferma lo scambio. Uno spinge, l'altro stacca.* Ma se un giudice ti chiede questo e non hai guardato il file, si vede.

⚠️ Nota che questo è il **terzo** pezzo di prior art vicino all'oracolo, dopo `OraclePriceAdjuster` (in repo, non cablato in nessuna tabella, muove il prezzo a favore del *taker*) e `_extruction`.

## F0.8 — La tabella opcode

Apri `src/opcodes/AquaOpcodes.sol` e guarda come costruisce l'array.

**Il dettaglio che ti salva.** Un trucco in assembly sacrifica lo **slot 0** per usarlo come lunghezza dell'array dinamico. Quindi **indice effettivo = posizione − 1**. Non contare mai a mano: il ProgramBuilder Solidity risolve l'indice **dal function pointer**. Vedrai anche dei `_notInstruction` — sono gap che riservano indici per aggiunte future, e i commenti "Add new instructions here" marcano il punto.

---

# F1 — Il router che non aggiunge nulla

**Il senso della fase.** Stai costruendo l'impalcatura prima del contenuto. Un router con la tabella Aqua stock non ha incognite: o compila o no. E sblocca gli altri due immediatamente.

## F1.1 — `StrategyOpcodes.sol`

```solidity
// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
contract StrategyOpcodes is AquaOpcodes {
    constructor(address aqua) AquaOpcodes(aqua) {}   // 🔎 firma esatta da confermare
    // per ora: nessun override. _opcodes() è quello del padre.
}
```

Sembra inutile. Non lo è: è il punto di innesto. A F3.4 qui dentro aggiungerai l'override che appende i tuoi due opcode, e nient'altro nel repo dovrà cambiare.

## F1.2 — `EnsStrategyRouter.sol`

```solidity
contract EnsStrategyRouter is Simulator, SwapVM, StrategyOpcodes {
    constructor(address aqua, address weth, string memory name, string memory version)
        SwapVM(aqua, weth, name, version)
        StrategyOpcodes(aqua)
    {}

    function _instructions() internal pure override
        returns (function(Context memory, bytes calldata) internal[] memory)
    { return _opcodes(); }
}
```

**Cosa fa ciascun pezzo:**
- **`SwapVM`** — astratto, porta `quote()` e `swap()`. È il motore.
- **`Simulator`** — il mixin che dà `asView()`, cioè la simulazione in contesto statico. È ciò che rende possibile la batteria di sicurezza di Flavio.
- **`StrategyOpcodes`** — il set di istruzioni disponibili.
- **`_instructions()`** — l'unica cosa che devi dire a `SwapVM`: quale tabella usare.

⚠️ **`_instructions()` è `pure`, `_opcodes()` è `pure`, ma `_oracleGuard2D` sarà `view`.** In Solidity infilare una funzione `view` in un array di puntatori a funzione non-payable è **legale** (`view` è più restrittiva, quindi assegnabile). Se prendi un errore di tipo criptico sulla tabella, il colpevole è quasi sempre `pure`/`view`/non-payable — non l'architettura. Non riprogettare niente per questo.

## F1.3 — L'evento congelato

```solidity
event StrategyDeployed(bytes32 indexed strategyId, bytes32 programHash, bytes32 ensNode);
```

**Perché adesso e non dopo.** Questo evento è il **contratto sociale** fra te e gli altri due:
- **Flavio** ci punta `resolveVerify`: legge `programHash` da ENS e lo confronta con quello on-chain.
- **Pietro** ci punta il mapping del subgraph: `ensNode` è ciò che permette al feed di risolvere le strategie via ENS invece che da un database.

Cambiare questa firma dopo che l'hanno consumata significa rompere due persone contemporaneamente, di notte. **Congelala e non toccarla.**

Se a questo punto non hai ancora `programHash()` da Flavio, emetti `bytes32(0)`. Il **tipo** e l'**ordine** dei campi sono ciò che conta ora; il valore vero arriva a F5.1.

## F1.4 — Consegnare l'ABI 📤

```bash
forge build
cat out/EnsStrategyRouter.sol/EnsStrategyRouter.json | jq '.abi' > abi/EnsStrategyRouter.abi.json
```

Committalo e dillo esplicitamente a entrambi. **Non è una formalità: sono bloccati finché non arriva.**

## F1.5 — Licenza

Ogni nuovo `.sol`, prima riga:

```solidity
// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSE
```

SwapVM **non è MIT** — è una licenza custom Degensoft. Le regole della bounty permettono esplicitamente di ridispiegare uno SwapVM modificato per l'hackathon, ma gli header devono esserci.

---

# F2 — Lo swap vivo 🎯

**Il senso della fase.** Le tre righe di qualificazione di 1inch sono: contratti ufficiali, trasferimenti on-chain nella demo, storico Git sano. **Nessuna richiede un opcode custom.** Alla fine di questa fase sei dentro la bounty. Tutto il resto alza il punteggio.

## F2.1 — Deploy

Script Forge che deploya `EnsStrategyRouter(aqua, weth, "Wave", "1")` sul fork e stampa l'indirizzo.

## F2.2 — Il programma stock

```solidity
Program memory p = ProgramBuilder.init(_opcodes());
bytes memory program = bytes.concat(
    p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(0.003e9)),
    p.build(XYCSwap._xycSwapXD)
);
```

⚠️⚠️ **La trappola numero uno: in modalità Aqua NON si scrive l'istruzione dei balance.** Il README upstream lo dice esplicitamente: con Aqua → *"Balance Instruction: None (Aqua manages)"*. Se metti anche `_dynamicBalancesXD` **e** shippi su Aqua, i saldi vengono gestiti due volte e il debug è un incubo.

Rileggi il programma con la regola della matrioska: la fee sta **prima**, quindi è **esterna**; `_xycSwapXD` è l'ultima, quindi è il **cuore** che calcola davvero. La fee wrappa lo swap, non lo precede.

## F2.3 — Ship

```solidity
ISwapVM.Order memory order = MakerTraitsLib.build(MakerTraitsLib.Args({
    maker: maker,
    receiver: address(0),
    useAquaInsteadOfSignature: true,   // ⬅️ modalità Aqua
    program: program
    // ...resto degli args
}));
// maker: approve dei token al router Aqua, poi
aqua.ship(routerAddress, strategy, tokens, amounts);   // 🔎 firma esatta
```

**Cosa succede davvero.** `ship()` **non muove token.** Registra un saldo virtuale ("questo maker ha impegnato tanto per questa strategia") ed **emette un evento**. I token restano nel wallet del maker, esposti solo via allowance.

Due conseguenze che useremo per tutto il progetto:
1. **Il retune costa quasi niente** — `dock()` + ricompila + `ship()` non sposta capitale.
2. **Quell'evento è l'unico modo per scoprire che la strategia esiste.** È il buco che The Graph riempie (vedi `HOW-IT-WORKS.md`).

## F2.4 — Quote

```solidity
(uint256 qIn, uint256 qOut,) = router.asView().quote(order, tokenIn, tokenOut, amount, takerData);
```

`quote()` gira lo **stesso identico codice** di `swap()`, ma in contesto statico (`ctx.vm.isStaticContext == true`). Per questo la simulazione è esatta al 100%: simulare *è* eseguire.

## F2.5 — Swap

```solidity
(uint256 aIn, uint256 aOut,) = router.swap(order, tokenIn, tokenOut, amount, takerData);
```

**Il taker può essere un EOA semplice** — niente MockTaker, niente resolver. È verificato nei test del template.

⚠️ **Riusa lo stesso `takerData` fra quote e swap.** Contiene la soglia di slippage e i dati che le istruzioni consumano runtime; cambiarlo fra i due rompe l'equivalenza.

## F2.6 — Gli assert

Verifica **tre cose**, non una:
1. `tokenIn` è uscito dal wallet del taker
2. `tokenOut` è uscito dal wallet del **maker** (custody nel wallet — è il punto di Aqua)
3. L'evento `Swapped` è nei log

## F2.7 — L'artefatto 📸

```bash
forge test --match-test test_LiveSwapThroughAqua -vvvv > artifacts/swap-trace.txt
```

Questo file è **la prova da 30 secondi per il giudice 1inch**: ci deve vedere `IAqua` pull/push, i tuoi opcode (dopo F3/F4) e `Swapped`. Vale più di dieci minuti di spiegazione.

## F2.8 — Commit

⚠️ *"Proper Git commit history (no single-commit entries on the final day)"* è una **regola di qualificazione esplicita**, non un consiglio. Committa a ogni fase.

---

# F3 — `_oracleGuard2D`

## F3.1 — MockOracle

`AggregatorV3` finto in `test/mocks/MockOracle.sol` con setter per `answer` e `updatedAt`.

**In `test/mocks/`, mai inline nel test.** Perché lo stesso mock serve a tre cose: i tuoi unit test, il Beat B della demo (dove il giudice muove il prezzo), e la mutation harness. Un mock inline andrebbe duplicato tre volte e divergerebbe.

## F3.2 — L'ArgsBuilder

```
[oracle:20][oracleDecimals:1][maxStaleness:2][maxDeviationBps:2][mode:1][flags:1] = 27 byte
```

**Perché packed e non `abi.encode`.** Il programma è bytecode con un byte solo per la lunghezza degli args: **max 255 byte per istruzione**. `abi.encode` paddizza tutto a 32 byte e sprecherebbe lo spazio. Packed è la convenzione di tutte le istruzioni upstream — copia lo stile di `MinRateArgsBuilder`: build con `abi.encodePacked`, parse a slice con errori tipizzati.

`oracleDecimals: 0` significa "leggi i decimali dall'oracolo" — comodo, ma costa una call in più.

`maxStaleness` default **7200s**: l'heartbeat Chainlink è ~3600s, il doppio dà margine senza rendere il check inutile.

## F3.3 — L'istruzione

```solidity
function _oracleGuard2D(Context memory ctx, bytes calldata args) internal view {
    // 1. parse
    // 2. ctx.runLoop();                    ⬅️ esegue TUTTO il resto del programma
    // 3. staleness → revert SEMPRE (entrambe le mode)
    // 4. implied = amountOut * 1e18 / amountIn, normalizzato per decimali e direzione
    // 5. fuori banda → mode 0: revert | mode 1: clamp al bordo
}
```

**L'ordine dei passi non è arbitrario:**

- **`runLoop()` sta al punto 2**, non al punto 5. Deve girare *prima* dei controlli, perché prima di lui `amountIn`/`amountOut` non sono ancora calcolati — non c'è niente da controllare. Il guard è l'ultimo a giudicare proprio perché è il primo a partire.
- **La staleness è il primo controllo e reverta in entrambe le mode.** Un oracolo fermo non è "un prezzo un po' vecchio": è **nessuna informazione**. Clampare verso un prezzo di cui non sai l'età sarebbe peggio che fermarsi. Questo è **l'HALT** del Beat B.
- **`internal view`.** Se lo dichiari non-view, il guard non funziona sotto `quote()` e l'intera batteria di sicurezza di Flavio salta.
- **Il clamp arrotonda a favore del maker.** Invariante #5. Sempre.

## F3.5 / F3.6 — I test

**`vm.expectRevert` con il selettore esatto**, mai la forma nuda:

```solidity
vm.expectRevert(OracleGuard.OracleStale.selector);   // ✅
vm.expectRevert();                                    // ❌ passa anche se reverta per un altro motivo
```

Un `expectRevert()` nudo è un test che si autoconvince: passerebbe anche se il tuo guard revertasse per un overflow. Il selettore esatto è ciò che rende il test una prova.

Copertura minima: dentro banda passa · fuori banda mode 0 reverta · fuori banda mode 1 clampa al bordo · stale reverta in **entrambe** le mode · **monotonicità al kink** (mode 1: al punto dove il clamp entra in azione il prezzo non deve saltare — l'invariante #4 vale anche lì).

## F3.8 — Il test che quasi tutti dimenticano

Chiama `quote()` su un programma che contiene il guard. Se esplode qui ma non in `swap()`, il colpevole è `view`: hai messo una scrittura di stato dentro un'istruzione che deve girare in contesto statico.

## F3.9 / F3.10 — Le mutation 📸

**Perché esistono.** Una suite verde dimostra "i test passano". **Non dimostra che i test verificherebbero qualcosa se il codice fosse rotto.** La mutation harness chiude quel buco: rompi il codice apposta, e se i test restano verdi, i test erano teatro.

- **M1** — togli il revert sullo staleness → `OracleGuardStaleHalt` deve diventare **ROSSO**
- **M2** — inverti la direzione del clamp (`>=` → `<=`) → `OracleGuardClamp` deve diventare **ROSSO**
- **M3** — penalità dello skew > 100% → `InventorySkewLiveness` deve diventare **ROSSO**

Un interruttore unico via env: `MUTATION=M1 forge test`. **Cattura gli screenshot ROSSI quando li fai** — a T+14 non avrai tempo di rifarli.

Questo split-screen (VERDE su codice reale, ROSSO su mutazione) è la tua prova di Technicality. *Il fallimento sul bug è la prova.*

---

# F4 — `_inventorySkew2D`

> Se F3 non è verde a T+7, **salta tutta questa fase.** Un opcode custom funzionante batte due opcode a metà.

## F4.2 / F4.3 — La matematica

- Deviazione **post-trade**, non pre-trade
- Penalità **solo se il trade aumenta** la deviazione dal target
- `penaltyBps = min(maxSkewBps, slopeBps × deviation / 0.1e18)`
- exactIn: `amountOut × (BPS − penaltyBps) / BPS`, **floor**
- exactOut: specchia con **`ceilDiv`**

⚠️ **L'invariante #5 è quella che ti fa fallire i test upstream se sbagli:** `amountOut` sempre floor, `amountIn` sempre ceil. Se ti trovi test rossi con differenze di 1 wei, è quasi certamente questo.

**Perché niente `maxImproveBps`.** Le vostre analisi dicono che non vincola mai (0% dei casi): la banda dell'oracolo è il vero limite. Un parametro che non morde è superficie in più da testare e da spiegare. Fuori.

## F4.7 — Eredita, non riscrivere

```solidity
contract SkewTest is Test, OpcodesDebug, CoreInvariants {
    function test_AllInvariants() public {
        InvariantConfig memory config = _getDefaultConfig();
        config.exactInTakerData  = _signAndPackTakerData(order, true, 0);
        config.exactOutTakerData = _signAndPackTakerData(order, false, type(uint256).max);
        assertAllInvariantsWithConfig(swapVM, order, tokenA, tokenB, config);
    }
}
```

Una riga ti dà simmetria, monotonicità, additività e quote==swap. Riscriverli a mano è mezza giornata e li faresti peggio.

## F4.8 — Il test di composizione ⚠️

Il test che scopre il problema di F0.6. Programma completo: **guard esterno, skew interno, curva al centro**. Fai passare un trade abbastanza grosso da generare una penalità di skew grande.

**La domanda:** la penalità sposta il prezzo implicito abbastanza da far scattare il guard **dal lato favorevole al maker**?

Se sì e la tua banda è a due lati, hai un revert spurio: la strategia si rifiuta di eseguire un trade che sarebbe *ottimo* per il maker. È il tipo di bug che in demo sembra "l'abbiamo rotto".

---

# F5 — Superficie d'integrazione

## F5.2 — Il round-trip dell'hash

Flavio emette bytecode in TypeScript e ne calcola l'hash. Tu emetti lo stesso bytecode dal ProgramBuilder Solidity e ne calcoli l'hash. **Devono coincidere byte per byte.**

**Perché è critico.** L'intera prova ENS è: risolvi il subname → leggi `programHash` dal text record → ricalcolalo dal programma on-chain → **coincidono**. Se i vostri due emettitori divergono di un byte, il pannello ENS diventa **rosso in demo** e sembra che qualcuno abbia manomesso la strategia.

Testalo appena hai entrambi i lati. È dieci minuti ora, è il panico a T+14.

## F5.3 — `slots.json`

Script Forge che **dumpa** la mappa indice→opcode leggendola dall'array di function pointer, e la scrive su file.

**Perché generato e non scritto a mano.** L'emitter di Flavio deve sapere che `_oracleGuard2D` è all'indice N. Se qualcuno scrive quel numero a mano da qualche parte e poi tu appendi un'istruzione, ogni programma emesso da quel momento chiama **l'opcode sbagliato** — e il bytecode resta perfettamente valido, quindi non esplode: fa la cosa sbagliata in silenzio.

Da qui in poi la tabella è **append-only con handshake annunciato**: se aggiungi, lo dici e rigeneri il file.

## F5.6 — Lo script del mock 📤

Due funzioni per Pietro: `deviate(bps)` e `restore()`. È ciò che il giudice tocca nel Beat B.

⚠️ **Priorità in caso di ritardo: la mutation harness slitta PRIMA di questo.** Il Beat B senza il controllo del mock non ha il suo momento di HALT — e l'HALT è nella tua lista dei mai-tagliare.

---

# F6 — Indurimento

## F6.4 — L'artefatto swap-trace 📸

Un trace unico che mostra, nello stesso flusso: `IAqua` pull/push + `_oracleGuard2D` + `_inventorySkew2D` + `Swapped`. **Un file, tutta la storia.** Quando il giudice 1inch chiede "fammi vedere che è vero", apri questo.

## F6.7 — La prova sul testnet (Sepolia, niente fork)

Niente anvil fork, niente `DEMO_LIVE=0`, niente canned twin. La demo gira contro **Sepolia live**. Due cose da provare **prima** della demo, non durante:
1. **Seed idempotente pre-demo** — 3–5 strategie reali già deployate con capitale reale, swap reali (≥3 fill ciascuna per superare la soglia di ranking), e follow ENS reali. Vedi [PROD-TESTNET.md](./PROD-TESTNET.md) §5. Rieseguire il seed su chain sporca aggiunge solo dati, non rompe la demo.
2. **RPC + wallet di riserva finanziati.** Il rischio delle 3 di notte è la morte dell'RPC Sepolia o lag del subgraph durante un beat live. Mitigazione: secondo wallet finanziato + URL RPC di backup (Alchemy/Infura); per il Beat C (retune), fallback a un poll `eth_getLogs` diretto se il subgraph lagga di più di qualche blocco. **Non esiste fallback canned** — ogni fallimento si narra onestamente contro lo stato a schermo.

---

## Le tre frasi da sapere a memoria

**"Perché un opcode nativo e non `_extruction`?"**
> *"Extruction funzionerebbe. Ma l'header del vostro `Extruction.sol` dice che i taker **DEVONO** validare il target esterno, tenerlo non aggiornabile, e fidarsi che non rompa la consistenza quote/swap. Noi togliamo quella superficie di fiducia: nessuna chiamata esterna, testato con invarianti dentro la VM, riusabile da qualsiasi strategia. Abbiamo trasformato una decisione di fiducia per-strategia in una garanzia a livello di protocollo."*

⚠️ **Mai dire "impossibile con extruction".** Extruction *può* esprimerlo. L'argomento è la superficie di fiducia, non la possibilità. Un giudice che conosce il codice ti smonta in tre secondi.

**"Non esiste già un'istruzione oracolo?"**
> *"Sì — `OraclePriceAdjuster`, nel vostro repo ma cablato in nessuna tabella e non testato. Muove il prezzo verso l'oracolo a favore del **taker**. Il nostro fa l'opposto: protezione del maker, rifiuta i fill quando il prezzo esce dalla banda. Abbiamo studiato il vostro prima."*

Conoscere il loro codice non spedito meglio della maggior parte dei partecipanti vale credibilità immediata.

**"Cosa si rompe se stacco The Graph?"**
> *"I taker non trovano più le strategie. Le posizioni restano vive e tradabili se conosci l'indirizzo, ma nessuno le scopre. Aqua toglie la pool — e con la pool sparisce il posto dove trovi la liquidità. Al vostro workshop, alla domanda diretta sull'indexer, avete risposto 'non ne forniamo uno, usate The Graph'. Quel layer è quello che abbiamo costruito."*
