# Pitch in parole semplici — cos'è il progetto e cosa dire agli sponsor

_Per chi deve capire il progetto in fretta e fare il pitch ai booth degli sponsor. Tutto in parole povere, niente gergo. Per la versione più tecnica: `COME-FUNZIONA_ITA.md`._
_Aggiornato: 24 luglio 2026._

---

## 1. L'idea in una frase

Un trader vuole una strategia di compravendita su misura su 1inch, ma per crearla dovrebbe scrivere un codice complicatissimo che quasi nessuno sa scrivere. **Noi facciamo un "traduttore": lui lo descrive a parole, noi gli scriviamo il codice, lo proviamo, lo mettiamo in funzione e lo aggiustiamo da soli quando il mercato cambia.**

## 2. L'analogia della cucina 🍳

- **1inch** ha costruito una cucina potentissima (si chiama *SwapVM*). Per usarla devi scrivere la ricetta in un linguaggio di macchina precisissimo e **pericoloso**: se sbagli un passaggio, perdi soldi.
- Quasi nessun trader sa scrivere quella ricetta. Risultato: il **94% dei soldi che potrebbero "lavorare" sta fermo** (non viene usato).
- **Noi costruiamo il traduttore.** Il trader dice:
  > *"Voglio comprare e vendere ETH/USDC, tieni i miei soldi in bilancia, e se il prezzo impazzisce fermati."*

  Il nostro sistema:
  1. traduce la frase in una ricetta (un programma),
  2. la prova una volta "a vuoto" per controllare che sia sicura,
  3. la mette in funzione nella cucina di 1inch,
  4. un "robot" controlla come va e, quando serve, la modifica da solo.

## 3. Le 3 parole strane (se qualcuno le usa, sai cosa sono)

- **SwapVM / Aqua** = il sistema di 1inch. *Aqua* = dove stanno i soldi. *SwapVM* = il motore che calcola i prezzi.
- **Bytecode / opcode** = il linguaggio di macchina della cucina. Un *opcode* è un singolo comando (es. "metti una fee", "controlla il prezzo"). Noi ne **aggiungiamo 2 nuovi**: uno per tenere i soldi in bilancia, uno per fermarsi se il prezzo impazzisce.
- **Fork** = una copia della blockchain vera, sul tuo computer, per fare prove **senza rischiare soldi veri**.

## 4. I 3 sponsor = 3 parti dello STESSO prodotto

Non sono 3 prodotti separati. È tutto un prodotto, e ogni sponsor è una parte:

- **1inch** = il **motore** su cui costruiamo (la cucina). È il cuore. ← il premio più importante per noi.
- **The Graph** = gli **occhi** del robot: guarda cosa succede e decide quando cambiare la ricetta.
- **ENS** = il **nome** della strategia (es. `eth-usdc.strategist.eth`): così altri la trovano e sanno che è quella giusta.

## 5. Domanda sicura di 1inch: "Come fate a trasformare il linguaggio umano in azione?"

È la domanda che ti faranno di sicuro al booth. Risposta pronta (una frase da memorizzare):

> **"L'AI non scrive mai il codice. Trasforma solo la frase in un *modulo* con opzioni fisse. Poi un nostro programma — senza AI — trasforma quel modulo nel codice, usando i vostri stessi blocchi. Per questo un'allucinazione dell'AI non può fare danni."**

Il messaggio chiave: **1inch ha paura che un AI deployi codice che muove soldi. La risposta è: l'AI non tocca il codice.**

**Se vogliono un esempio** — l'analogia dell'auto: è come configurare un'auto su un sito web (scegli colore, motore, ruote dai menu). Non puoi chiedere "un'auto volante" perché *volante* non è un'opzione. L'AI è l'assistente che ti aiuta a riempire il modulo; la fabbrica (regole fisse, nostre) costruisce l'auto con i pezzi di 1inch.

**I 3 passi (se chiedono "come funziona nel dettaglio"):**
1. **Frase → modulo (con AI).** L'AI riempie un modulo con opzioni predefinite (es. "coppia ETH/USDC", "fee 5", "protezione prezzo sì"). Numeri sempre dentro limiti sicuri. Se chiede qualcosa che non esiste → rifiutato.
2. **Modulo → codice (senza AI).** Un nostro programma assembla il codice usando i blocchi di 1inch (c'è già un loro strumento, il *ProgramBuilder*, che attacca i pezzi). L'ordine dei pezzi è fisso e sicuro.
3. **Codice → azione.** Se il modulo avesse un ordine pericoloso, il programma lo **rifiuta e lo riscrive** in quello sicuro (e ti mostra cosa ha cambiato).

**Il punto che li rassicura:** "La parte pericolosa — scegliere e ordinare il codice — non la fa l'AI. La fanno regole fisse nostre. L'AI è solo un traduttore frase→modulo."

**Onestà (1inch la apprezza, non nasconderla):** "Le cose davvero difficili le scriviamo a mano noi: i 2 nuovi comandi (opcode) e le regole fisse del compilatore. L'AI non tocca quella roba."

**Domanda di seguito — "E se l'AI sbaglia a capire la frase?":** "Il modulo ha limiti rigidi e opzioni chiuse; quello che non rientra viene rifiutato. E prima di mettere in funzione la strategia, la proviamo 'a vuoto' con il vostro strumento `quote()` e mostriamo una scheda di sicurezza verde. Se non è sicura, non parte."

In due parole per 1inch: **"AI = solo il traduttore; il codice lo scrivono regole fisse nostre + i vostri blocchi."**

## 6. Quali documenti leggere per il pitch

In ordine di importanza per preparare il pitch:

1. **`docs/strategy/PITCH.md`** — IL documento del pitch: demo di 4 minuti, Q&A pronte, e l'angolo per ogni sponsor. **Parti da qui.**
2. **Questo doc (`PITCH-SEMPICE_ITA.md`)** — per capire il progetto in parole semplici e avere la risposta pronta a 1inch.
3. **I 3 OVERVIEW dei sponsor** — i requisiti esatti dei bounty (cosa serve per qualificarsi). Da leggere prima di andare al booth di ciascuno:
   - `docs/sponsors/1inch/OVERVIEW.md`
   - `docs/sponsors/the-graph/OVERVIEW.md`
   - `docs/sponsors/ens/OVERVIEW.md`
4. **`docs/strategy/COME-FUNZIONA_ITA.md`** — se vuoi capire il prodotto in modo più tecnico (pipeline, i 3 strati del compilatore, i 2 opcode).
5. **`docs/sponsors/1inch/SWAPVM-INTERNALS.md`** — reference tecnico su come si aggiunge un opcode a SwapVM (utile se 1inch fa domande tecniche profonde).

Per l'esecuzione durante l'evento (non per il pitch, ma utile): `docs/strategy/10-10-PLAYBOOK.md` (piano di build) e `docs/strategy/EVENT-RUNBOOK.md` (operazioni nelle 36 ore + submission).

---

💡 **Regola d'oro per i booth:** il vero obiettivo non è spiegare il progetto, ma far **spuntare i requisiti del bounty** nella testa del giudice, e fargli sentire che **abbiamo letto la loro roba**. Tieni ogni pitch a 2-3 minuti e finisci sempre con una domanda: *"questo vi qualifica per la vostra traccia? c'è qualcosa che ci sfugge?"*
