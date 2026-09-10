# wave → ETHOnline 2026 (4–16 set) — Continuity Track

> ## ⚠️ AGGIORNAMENTO 9 set (post commit del 9 set + issue #61 — correzioni applicate)
> Questo piano è nato sulla copia ZIP del 26 luglio. Stato del `main` reale:
> - **Rimozione ENS + scelta World** (`f441287`, 8 set): layer ENS eliminato, **follow eliminati del tutto** (ranking senza termine follower, follow entities via dal subgraph). Nel corpo storico qui sotto, dove si legge "l'integrazione ENS resta nel codice", vale il contrario — rimossa.
> - **Hardening 1inch** (`a35e480`+, 9 set): re-ship idempotente (deadline quantizzata → short-circuit `programHash`), oracle decimal fold (fix 1e12 su pair a decimali misti), guard curve-required — provati su fork mainnet con `quote==swap`. Sono fix, NON nuova superficie contrattuale → la Fase 3 resta obbligatoria.
> - **Il post vive on-chain** (`9501b4a`): `StrategyDescribed(bytes32 indexed strategyId, string description)` in `EnsStrategyRouter.sol:42`, `strategyId = hash(order)` → **signal naturale e verificabile per le proof World ID**.
> - **Stack locale completo** (`c1297e3`, `0b61061`): fork Sepolia chain-id 11155111 + rpc-shim + graph-node compose + login fake-Privy → tutto sviluppabile/demoabile in locale (istruzioni: issue #61 §5).
> - **Retune autonomo G2 già eseguito live su Sepolia** (`deea4f3`) → primo bullet di Fase 2 fatto.
> - **AgentKit NON integrato** (zero dipendenze `@worldcoin`): seam pronto in `ui/lib/identity.ts` (`{address, handle, verifiedHuman}`) → **Fase 1 = il lavoro aperto**, target il flusso compose→ship.
> - Subgraph: v0.0.5 **deploy pending** (schema/mapping committed), Studio serve v0.0.4.
> - **Giorno 6/13**: la form Sandbox World ID + l'email per il flag Selfie Check (`developers@toolsforhumanity.com`) sono **OVERDUE** — solo Flavio può farle (issue #61, item #1).

## 📌 Stato lavori (10 set)

- **Step 0 (utente)**: form Sandbox World ✅ · email flag Selfie Check a Tools for Humanity ✅ · signing key salvata ✅ · app creata sul Developer Portal (`app_d088…13e` / `rp_6d0…4de`, committate in `.env.example` perché pubbliche) · azione di verifica creata (10 set, sezione **Verification**): si chiama `proofofhuman` (non `wave-publish` come pianificato — equivalente, staging, proofOfHuman) · App type = **External integration** (niente MiniKit: pattern "World ID su web app esistente") · review sottomessa e poi **ritirata** (l'App URL puntava a un deploy 522 — ri-sottomettere dopo il revival del deploy, non blocca il bounty).
- **Step 1 (branch `feat/world-agentkit`, commit `8a4d928`)**: dep `@worldcoin/agentkit@0.2.1` (+ `agentkit-core`, `@x402/core`) · due wallet agente throwaway per la registrazione AgentBook — publisher `0xf4AF4E8f4F49032257D9C1e3F1d9c5324a040620`, retuner `0x92b4747d624253f1B7598A996bb44855d8008017` (chiavi private SOLO nel `.env`, permessi 600) · `FEEDBACK-WORLD.md` alla radice con le 4 sezioni richieste dal bounty, già con i primi rilievi del giorno 1.
- **Nota repo**: `srcs/requirements/agent/package-lock.json` è rimasto stale rispetto a `pnpm-lock.yaml` (il repo è passato a pnpm) — da rimuovere o rigenerare prima che qualcuno faccia `npm ci`.
- **Step 2 ✅ (commit `b887515`, branch `feat/world-agentkit`)**: gate AgentKit attivo sui POST `/mcp*` — pipeline parse→validate→firma→AgentBook, storage libsql (counter atomici + anti-replay nonce), motivi di rifiuto tipizzati (`x-agentkit-error`), kill-switch `WORLD_MCP_GATE=off`. Modulo `agent/src/world/` (storage/verify/gate/middleware) + 16 test, suite agente 102/102 verde, typecheck pulito. Agenti interni e UI non toccati. Restano dello Step 2: tier reads/writes + fallback x402 (con il pricing), smoke e2e con client AgentKit reale dopo la registrazione AgentBook.
- **Step 4 ✅ (stessa serata)**: seam identità vivo — `ui/lib/data/identity-server.ts` (lookup AgentBook server-only, cache 5', degrade onesto, dev-allow `WORLD_AGENTBOOK_DEV_ALLOW`), action `app/actions/identity.ts`, hook `use-session-user` che fonde `verifiedHuman`/`humanId` nella sessione → **badge "verified human" nell'AccountChip** (già cablato, ora con sorgente) + **sezione "World trust" in Settings** (stato dei wallet agente publisher/retuner). Smoke e2e `agentkit-gate.smoke.ts`: **ALL GREEN** su agente vivo (anonimo→403, firmato→passa con `x-agentkit-human`, replay→403 nonce-replayed). Scoperte SDK annotate in `FEEDBACK-WORLD.md` §4 (client firma solo dopo 402 con estensione dichiarata; nonce SIWE alfanumerico; domain=solo hostname). Build UI verde.
- **Step 5 ✅ (10 set, branch `feat/world-agentkit`)**: gate World ID live sul publish — `useWorldPublishGate()` (`ui/components/world-publish-gate.tsx`) apre IDKit nel flusso compose→ship di ENTRAMBI i caller (compose-screen + create-drawer): preset `proofOfHuman`, `signal = sha256(canonicalJson({description, spec}))` (`ui/lib/world/publish-signal.ts` — JSON key-sorted, così browser e server action derivano lo stesso digest). Lato server (`ui/app/actions/world.ts` + `ship.ts`): rp_context firmato con `signRequest`, verify inoltrato as-is a `/api/v4/verify/{rp_id}`, binding `signal_hash === hashSignal(signal)`, **ledger nullifier→signal consumato one-shot alla ship** (una proof sblocca solo la strategia per cui è stata coniata, una volta sola). Kill-switch `WORLD_PUBLISH_GATE=off` · dev fixture `WORLD_ID_DEV_ALLOW=on` · env passati anche al container ui in `srcs/docker-compose.yml` (nessun NEXT_PUBLIC_ necessario: la config arriva via server action). Build UI verde, smoke `/compose` 200, determinismo del signal verificato (key-order independent). **Restano**: prova con la Sandbox App appena arriva l'accesso · al redeploy Dokploy settare `WORLD_SIGNING_KEY`/`WORLD_APP_ID`/`WORLD_RP_ID` sulla ui (senza chiavi il gate resta on e il publish si blocca con motivo onesto — per il demo locale `WORLD_ID_DEV_ALLOW=on`). Rilievi SDK del giorno in `FEEDBACK-WORLD.md` §2/§4.

## Context

wave è stato costruito e submitted a **ETHGlobal Lisboa 2026** (track Classic/from-scratch): social market per strategie on-chain in linguaggio naturale su 1inch SwapVM. **ETHOnline 2026 (4–16 settembre**, finestra da 12 giorni**)** ha pool **Continuity** dedicati che a luglio erano inaccessibili (Classic track). Il progetto è già qualificato su 1inch e The Graph; ENS qui vale solo $500 e richiederebbe un porting a ENSv2.

**Risposta alla domanda-chiave (swap sponsor): SÌ, verificato sulle regole ufficiali.**
- Regole ETHGlobal ([rules](https://ethglobal.com/rules), [details](https://ethglobal.com/events/ethonline/info/details), [start](https://ethglobal.com/events/ethonline/info/start)): Continuity = *"you may build on an existing codebase"*, la submission deve *"clearly document what work existed before the hackathon"* e includere *"substantive new features, improvements, or functionality developed during the event"*; sui premi partner: *"For Continuity-track submissions, eligibility for specific partner prizes may vary — check the event and partner rules"* → decide il testo di ogni bounty, non c'è vincolo ETHGlobal sugli sponsor.
- Nessun premio Continuity richiede che la tecnologia dello sponsor fosse già nel progetto: World dice esplicitamente *"Extend an existing project with AgentKit"* → l'integrazione World fatta durante l'evento È il lavoro Continuity. La continuity è del progetto (submitted a Lisboa), non dello sponsor.
- Impegni obbligatori delle regole: (1) **divulgazione scritta** del pre-esistente con *"full details in your submission (repo history, video, and description)"* → `CONTINUITY.md`; (2) **version control per tutto l'evento** — *"Any repositories with single commits... without proper history will be default assumed to be unqualified"*; (3) *"All new parts of extending an existing project must remain open source"*.
- Avvertenza di giudizio: *"projects that use a majority of pre-existing work do not score as high"* → il lavoro nuovo deve essere sostanziale e protagonista del demo.
- Quindi ENS **esce dal pitch premi** (l'integrazione resta nel codice — è load-bearing: nomi, `v0.programhash`, resolveVerify) e **entra World** come lavoro nuovo.

**Decisioni prese:** World AgentKit come terzo target · partecipazione col team originale (repo `github.com/ppezzul/wave`) · focus 3 premi core.

## Lineup premi target — matrice di ammissibilità

Regola: i bounty marcati `🆕 only Continuity` sono i nostri pool naturali; quelli **senza** marcatura sono aperti a entrambi i track → li possiamo ottinare. Da evitare solo i pool esplicitamente **from-scratch** (Graph AI "From Scratch": wave ha codice pre-esistente). Una sola submission ETHGlobal, registrata come **Continuity** (link alla submission di Lisboa), con opt-in ai bounty in fase di submission.

| Bounty | Pool | wave entra? | Importo |
|---|---|---|---|
| 1inch 💧 Aqua App | aperto | ✅ sì (nessun vincolo di track nei requisiti) | $5k |
| 1inch 💦 Aqua App Continuity | continuity-only | ✅ pool naturale | $2k |
| Graph 🧩 Composable/Standardized | aperto | ✅ se composiamo 2+ prodotti (nostro subgraph + Subgraph MCP ufficiale) | $5k |
| Graph 🤖 AI Use Case **From Scratch** | from-scratch | ❌ NO — esplicitamente per progetti net-new | $5k |
| Graph 🤖 AI Use Case **Continuity** | continuity-only | ✅ pool naturale | $5k (1° $2,5k) |
| World 🤖 AgentKit Continuity | continuity-only | ✅ la continuità è del PROGETTO, non dello sponsor: "extend an existing project with AgentKit" — l'integrazione World è il lavoro nuovo dell'evento | $3,5k (**fino a 3 squadre × $1.166**) |
| World 🤳 Selfie Check | aperto | ✅ fast-follow opzionale (giorni 8–10): Selfie Check come **piolo "presenza viva all'azione"** sui cancelli HITL — vedi Fase 1bis. Pool aperto (competiamo anche coi from-scratch) | $3,5k (**fino a 3 squadre × $1.166**) |

**Target core (3):** 1inch Continuity + Graph AI Continuity + World AgentKit Continuity, con opt-in gratuiti ai pool aperti 1inch $5k e Graph Composable $5k.

| Premio | Perché wave è già forte / cosa manca |
|---|---|
| **1inch — Aqua App Continuity** (+ opt-in pool aperto $5k) | Già qualificato a luglio + hardening 9 set (idempotenza re-ship, decimal fold, curve-required — fork mainnet `quote==swap()`). Manca: **nuova superficie contrattuale** (Fase 3) + commit incrementali |
| **The Graph — AI Use Case (Continuity)** (+ opt-in Composable se facciamo MCP) | $2,5k 1° — Subgraph live su Studio + agente che agisce sui dati; retune zero-click già live (`deea4f3`). Manca: deploy v0.0.5 + Subgraph MCP |
| **World — AgentKit Continuity** | $3,5k — Lavoro NUOVO dell'evento: umani verificati sul publish + agenti registrati in AgentBook. Manca tutto: sandbox, integrazione, feedback doc obbligatoria |

Requisiti d'occhio: 1inch = contratti ufficiali + transfer onchain nel demo (fork locali ok) + **proper git commit history, no commit singolo l'ultimo giorno** · Graph = dati live da provider (Studio API key) + reasoning/automazione + video 2–4 min + selezione pool Continuity · World = AgentKit significativo + AgentBook + test via World ID Sandbox App + **feedback document**.

## Stato attuale (allineato al `main` del 9 set — vedi issue #61)

- **Contratti** (`srcs/requirements/swap-vm/`): `src/opcodes/StrategyOpcodes.sol` (Guard=33, Skew=34), `src/routers/EnsStrategyRouter.sol` deployato su Sepolia `0x698d798895a03c858aab493564e0795732da0c68` (block 11352568), Aqua self-deployed `0xdc8C…D1E`. Evento nuovo: `StrategyDescribed(bytes32 indexed strategyId, string description)` (`EnsStrategyRouter.sol:42`) — il post vive on-chain, `strategyId = hash(order)`. Test wave: `test/EnsStrategyRouter.t.sol`, `test/StrategyOpcodesSlots.t.sol`, invariants OracleGuard/InventorySkew.
- **Hardening 9 set** (provato su fork mainnet, `quote==swap`): re-ship idempotente (deadline quantizzata → short-circuit `programHash`), oracle decimal fold (fix 1e12 su pair a decimali misti), guard curve-required. NB: fix, non nuova superficie contrattuale → Fase 3 comunque necessaria.
- **Subgraph** (`srcs/requirements/subgraph/`): Studio account 1756983, progetto `wave`; Studio serve v0.0.4, **v0.0.5 deploy pending** (schema/mapping committed in `9501b4a`; 2 data source router+Aqua, follow entities rimosse). Stack locale: rpc-shim + graph-node compose (`c1297e3`).
- **Agente** (`srcs/requirements/agent/`): Mastra + z.ai, MCP server (8 tools), monitor `graphDelta`, policy R1–R4 autonome / S1–S4 HITL; faucet `faucetDrip`.
- **UI** (`srcs/requirements/ui/`): Next.js 16, pagine chat/compose/explore/settings; actions = `emit`/`ship`/`faucet` (follow rimosso); seam identità `ui/lib/identity.ts` `{address, handle, verifiedHuman}`.
- **ENS**: layer rimosso (`f441287`) — `ENS_STRATEGY_ROUTER` resta solo come alias storico dell'indirizzo router.
- **Debt**: `.env.example` router vecchio → **sistemato in questo commit** · drift versione subgraph → si chiude col deploy v0.0.5 · package ui ancora `my-project`.

## Fase 0 — Prep (stasera / prima dell'apertura)

1. `git clone github.com/ppezzul/wave` (repo vero, history intatta) → branch `continuity-online-2026`. **Non** lavorare sulla copia ZIP.
2. `npm install` in `srcs/requirements/swap-vm/` → `forge build` → `forge test` (sanity, suite era verde a luglio: 85 suite / 706 test).
3. Boot stack via `srcs/docker-compose.yml`; verificare UI + agent + endpoint subgraph.
4. Health-check subgraph: `scripts/verify-subgraph.sh` (v0.0.4). Se unhealthy → redeploy (conta come lavoro evento).
5. Verifica onchain: router/Aqua su Sepolia ancora operativi; seed di transazioni per il demo.
6. Registrazione ETHGlobal come **Continuity**, linkando la submission di Lisboa.
7. **Subito**: richiesta accesso World ID Sandbox (form nelle risorse del premio — lead time) + World App installata sul telefono di chi registra (serve la verifica World ID per `agentkit-cli register`) + **email a developers@toolsforhumanity.com per il feature flag Selfie Check** (Beta access-gated, lead time). Compito naturale di P2/Flavio (area agentic/identity), come da divisione task di luglio.

## Fase 1 — World AgentKit Continuity ($3,500) — piano dettagliato

**Cosa giudica il bounty:** estendere un progetto esistente con AgentKit per distinguere bot da agenti che agiscono per conto di un umano reale verificato; autorizzazione human-backed per accesso, commercio, rate limit, fiducia. Requisiti espliciti: uso significativo di AgentKit · app funzionante · registrazione/risoluzione agenti in AgentBook · test via World ID Sandbox App · **feedback document obbligatoria**.

**Cosa è AgentKit (verificato su docs.world.org + repo worldcoin/agentkit):**
- Estende x402: `@worldcoin/agentkit` (client `createAgentkitClient` + server `createAgentkitHooks` con `AgentBookVerifier`, mode `free-trial`/`discount`), `@worldcoin/agentkit-cli` (`register`/`status`), stack `@x402/{hono,core,evm}`.
- **AgentBook** = registry on-chain canonico su World Chain (`eip155:480`) che lega wallet-agente → umano World ID-verificato. Registrazione gasless via relay hosted: `npx @worldcoin/agentkit-cli register <agent-address>` (verifica via World App, una volta per wallet).
- Runtime flow: l'agente firma un messaggio CAIP-122 (EIP-191, con chainId) → il server verifica firma + risolve il wallet in AgentBook → ottiene l'identificatore umano anonimo → applica la policy (free/trial/discount/rate-limit).

**La mappatura su wave (il cuore del lavoro nuovo):**
- Problema reale nel prodotto: la **pubblicazione** è la superficie sybil (i follow non esistono più, `f441287`): bot a costo zero possono inondare il feed di strategie-spazzatura e inquinare il ranking. Il post ora vive on-chain (`StrategyDescribed`, `strategyId = hash(order)`) → **signal naturale e verificabile per la proof World ID**. E la superficie agent-facing **esiste già**: MCP server `agent/src/mcp/{reads,writes,server}.ts` su `http://agent:3002`.
- Mossa principale — **wave diventa un servizio AgentKit/x402-gated**:
  - **Reads MCP** (feed/strategia/ranking) → mode `free-trial` (es. 5 richieste, poi x402).
  - **Writes MCP** (publish/announce, retune) → solo agenti human-backed (risolti in AgentBook): gratuiti, rate limit più alti; agenti anonimi → x402 pay-per-write (World Chain/Base); wallet non registrati → 403.
  - Storage persistente `AgentKitStorage` (usage counter + anti-replay nonce) su **libsql** — riusiamo `@mastra/libsql` già nel progetto.
- **Agenti wave in AgentBook**: wallet per ruolo (almeno compose/publish e retune autonomo) registrati con il World ID del team → il retune zero-click dimostra di agire per conto di un umano verificato = "durable human-backed authorization".
- **Client**: chiamate outbound degli agenti wave via `createAgentkitClient({ signer: { address, chainId, type: 'eip191', signMessage } })` — demo end-to-end: l'agente wave chiama il proprio API gated, firma, viene risolto in AgentBook, accesso free.
- **Livello utenti web — World ID via IDKit** (scope scelto: verifica anche per gli umani nel browser):
  - IDKit widget nel flusso compose→ship (`ui/app/actions/ship.ts`): chi pubblica una strategia completa la verifica World ID (Sandbox App per i test).
  - Server-side: verifica della proof (cloud verification World) con `signal = strategyId = hash(order)` (emesso da `StrategyDescribed`, ricostruibile on-chain) → proof unica e non riutilizzabile su un'altra azione.
  - Serve registrare l'app nel Developer Portal (App ID + action `wave-publish`) — l'esperienza sul Portal finisce dritto nella feedback doc richiesta dal bounty.
  - Badge *"verified human"* su profilo/autore; azioni non verificate rifiutate.
- **UI — trust panel**: stato AgentBook dell'agente agente (human-backed ✓, identificatore anonimo, tier di rate limit), stato World ID dell'utente, badge "shipped by a human-backed agent" sulle card strategia, e il percorso negativo (bot bloccato / reindirizzato a x402).
- **Gerarchia da rispettare nella submission**: il bounty è *AgentKit* Continuity → il pezzo load-bearing resta il gating agenti/AgentBook; il livello World ID utentiweb è il complemento che completa la storia anti-sybil ("ogni attore su wave prova la propria natura: gli umani via World ID, gli agenti via AgentKit"). Non il contrario.

**Demo beat (atto 2 del video) — contrasto a tre vie:**
1. 🟢 Umano nel browser verifica con World ID → pubblica (compose→ship) → badge *verified human*;
2. 🟢 Agente wave registrato in AgentBook → pubblica/ritocca → badge *human-backed agent*;
3. 🔴 Script anonimo tenta il mass-publish di spam → la policy lo blocca o gli chiede x402.
Riga per i judge: *"su wave la fiducia è gratis solo se chi agisce è un umano — in carne od ossa o dietro un agente verificato"*.

**Task sequencing (finestra 4–16 set):**
1. **[OVERDUE — giorno 6/13, issue #61 item #1]**: form Sandbox World ID + World App sul telefono · `npm i @worldcoin/agentkit @worldcoin/agentkit-cli` (+ `@x402/hono` se serve) · `register` in sandbox · smoke-test risoluzione AgentBook (`status`) · registrazione app nel Developer Portal (App ID, actions).
2. **Giorni 1–4**: gating server sull'API agente — middleware x402/AgentKit davanti al server MCP di Mastra (verificare il transport; fallback: piccolo gateway Hono dedicato, `@x402/hono` è il reference) · storage libsql · policy reads/writes.
3. **Giorni 4–6**: registrazione AgentBook dei wallet agente wave · client `createAgentkitClient` · trust panel in UI.
4. **Giorni 6–9**: livello utenti web — IDKit nel flusso compose→ship (`ui/app/actions/ship.ts`) · verifica server delle proof con `signal = strategyId` · badge verified human.
5. **Giorni 9–10**: end-to-end a tre vie (✓ umano / ✓ agente / ✗ bot) · edge case (nonce replay, wallet non registrato, proof riusata, verify fallita) · `FEEDBACK-WORLD.md` scritta in itinere.

**Rischi specifici:**
- AgentKit è **Beta**: verificare al giorno 0 che register/verify funzionino in sandbox; se qualcosa è rotto, documentarlo nella feedback doc (è esattamente il materiale che il premio chiede).
- Mastra MCP transport vs middleware x402: da verificare; fallback gateway Hono.
- **Non toccare i flussi Sepolia (1inch)**: AgentBook/x402 vivono su World Chain/Base — rail ortogonale, nessun conflitto con router/Aqua/subgraph.
- Il livello World ID utenti-web aggiunge ~2 giorni e non è richiesto dal bounty: **prima cosa da tagliare** se il tempo stringa. Scope floor invariato: gating AgentKit sui writes MCP + registrazione AgentBook + trust panel + feedback doc.

## Fase 1bis — World Selfie Check ($3,500 pool: fino a 3 squadre × $1.166 — aperto, fast-follow opzionale giorni 8–10)

**La tesi (ciò che il bounty chiede di dimostrare):** Selfie Check non è un'identità più debole — è lo strumento giusto quando la domanda non è *"chi sei"* ma *"ci sei, adesso?"*. Credenziale media-assurance (credito ID 11, Beta): prova **liveness** (persona viva, anti-spoof/anti-injection) e **continuity** (stessa persona che si è iscritta); NON prova unicità né dà un sybil score. Valida 90 giorni.

**La scala della fiducia a tre pioli di wave** (narrativa per submission e video):
| Piolo | Domanda | Strumento | Dove |
|---|---|---|---|
| Account | "sei un umano unico?" | World ID | publish (serve unicità per chi entra nel feed) |
| Agente | "chi firma ha un umano dietro?" | AgentKit/AgentBook | API/MCP writes |
| Azione | "c'è un umano vivo ADESSO?" | **Selfie Check** | cancelli HITL |

**Integrazione concreta — il cancello HITL diventa biometrico:**
- wave ha già la coda HITL (`agent/src/policy/` S1–S4/M1 + `gateAgent`): oggi l'approvazione è un click che prova solo il possesso della sessione (rubabile/replayabile).
- Le azioni che muovono capitale (classi di rischio più alte) richiedono il Selfie Check: finestra di approvazione con **QR cross-device** (desktop → telefono, la proof torna alla sessione web — è il percorso indicato dalle doc per i demo remoti), verifica server-side della proof con **signal per-cancello** (hash dell'azione → proof non riutilizzabile).
- Trust panel: triplo stato account ✓ / agente ✓ / azione ✓ + timestamp.
- Keywords del premio coperte: risk (capitale-moving), continuity (returning user = stessa persona), abuse prevention (approvazioni replayate muoiono), fairness (no Orb richiesto per un click: chiunque abbia una telecamera passa).
- IDKit è già nel piano per il layer World ID → seconda credenziale, costo ~1–1,5 giorni. Dettagli SDK verificati (`docs.world.org/world-id/idkit/credentials`): preset **`selfieCheckLegacy`** da `@worldcoin/idkit`, `{ signal }` + `app_id` + `action`; **`rp_context` pre-generato e firmato dal backend** prima di aprire il widget → si lega naturalmente al cancello HITL (contesto bindato all'hash dell'azione = anti-replay nativo); risultato inoltrato all'endpoint verify del Developer Portal; il backend deve far rispettare lo stesso `signal`. Il preset usa World ID 3.0 (4.0 non ancora supportato).
- Il preset account-level per il publish (Step 5) va scelto tra i preset IDKit: serve **Proof of Human/World ID** (unicità), NON Selfie Check — la scala a tre pioli resta: publish = World ID (unicità) · agente = AgentKit · azione = Selfie Check (presenza).
- **Seconda feedback doc separata** (`FEEDBACK-SELFIE.md`): doc SelfieCheck, Developer Portal, stati sandbox Hot/Cold/Semi-cold, limiti noti (es. semi-cold iOS rotto), cosa era confuso/mancante.

**Demo beat (quarto atto):** retune rischioso → cancello → QR → selfie → verde → esecuzione on-chain. Contrario: script che tenta di auto-approvare → rifiutato, nessuna faccia viva.

**Vincoli/rischi:** feature flag da email day-0 (`developers@toolsforhumanity.com`) — se tarda, si taglia senza dolore e il ritardo va nella feedback doc · pool APERTO (si compete anche coi from-scratch) · secondo nella lista di taglio (prima il layer World ID utenti-web).

## Fase 2 — The Graph (approfondimento)

- ~~Retune zero-click end-to-end~~ **FATTO** — eseguito live su Sepolia (`deea4f3`, G2). Resta da curare la beating demo: evidence log che cita il `Swapped` entity ID (*"data-caused, not time-triggered"* — ciò che il pool AI premia).
- Integrare il **Subgraph MCP ufficiale** nella toolbox dell'agente (composizione 2 prodotti → abilita anche l'opt-in al track Composable come upside).
- Bump subgraph (v0.0.5) + redeploy Studio; allineare le tre versioni sparse (env/README/codice).

## Fase 3 — 1inch (core)

- Nuovo lavoro contrattuale visibile: completare lo stretch tagliato a luglio (**StrategyFactory** on-chain) o un terzo opcode custom; comunque nuovo test invariant per ciò che si aggiunge, suite verde, snapshot gas.
- Demo: swap live su Sepolia attraverso il router (path già provato: tx `0xd8056fde…9601`).

## Fase 4 — Submission

- **`CONTINUITY.md`** alla radice: cosa esisteva prima (link al range di commit fino al 26 lug 2026) vs cosa è nuovo (commit dall'apertura evento), in chiave per-sponsor. Sezione analoga nel README.
- **Video unico 3–4 min** che serve tutti i premi: atto 1 feed + compose→reject-and-rewrite→ship live (1inch) · atto 2 discovery + halt con autore verificato (World + 1inch) · atto 3 retune autonomo causato dal subgraph (Graph) · [se Fase 1bis entra] atto 4 cancello HITL con Selfie Check (World). Aggiornare `docs/strategy/PITCH.md`.
- **Commit incrementali costanti** per tutto l'evento — mai un mega-commit finale (requisito esplicito 1inch).
- Opt-in ai bounty: 1inch Continuity (+ pool aperto $5k), Graph AI Continuity (+ Composable se MCP fatto), World AgentKit Continuity.

## Rischi & mitigazioni

- **Sandbox World in ritardo** → domanda subito in Fase 0; sviluppare il gate con la flow di test dev nel frattempo.
- **Subgraph unhealthy** dopo 6 settimane → verify/redeploy in Fase 0.
- **Lavorare per sbaglio sulla copia ZIP** (no `.git`) → perdita irreversibile del requisito commit history di 1inch. Solo clone del repo vero.
- **Sovraccarico SDK World** → rispettare lo scope floor.
- Il judge-triggered halt continua a usare il `MockAggregatorV3` dichiarato (beat demo, nessun impatto World).

## Verification

1. `cd srcs/requirements/swap-vm && npm install && forge build && forge test` — suite verde.
2. Query manuale all'endpoint Studio: entity Strategy/Swap (ID storici + nuovi della sessione).
3. `docker compose up` in `srcs/`: UI raggiungibile, path chat → compile → ship su Sepolia funzionante.
4. Flusso World end-to-end: verify → publish consentito; non-verified → negato; AgentBook risolve l'agente.
5. `git log` pulito: commit incrementali, nessun commit singolo nell'ultimo giorno.
