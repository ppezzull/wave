# The Thesis — Proof-of-Capital

_The product idea, stated once and clearly, so the team doesn't lose the thread. Read this before writing a line of UI or a slide. The compiler, Aqua, The Graph, ENS are **infrastructure in service of this thesis** — not the thesis itself._

## The one-paragraph thesis

Every existing social network measures **vanity**: likes, follows, views — signals that cost nothing to produce and are therefore worth nothing, which is why every social graph drowns in bots and the signal-to-noise collapses. **Wave is a social network where reputation costs real money.** On-chain, for the first time, we can make an endorsement that is *unfakeable without skin in the game*: a "like" is liquidity, a "follow" is a relation written on your own name, a profile is your ENS identity. Capital is the metric. We turn financial performance **into** the social metric — not a vanity layer bolted on top of a product, but a social layer that *is* the product's economics.

This is next-level not because of any single technique, but because it takes the central failure of social (reputation is free, so reputation is worthless) and resolves it with an assumption only a chain allows (reputation must cost something real). The whole stack is coherent with that one idea.

## The three mappings — memorize these

This is the version a judge remembers. Three primitives, each a 1:1 mapping from a social verb to an on-chain financial primitive — **not** an off-chain imitation:

| Social primitive | Wave primitive | Why it's unfakeable |
|---|---|---|
| **Like** | **liquidity / volume** — capital committed behind the strategy | costs real money; can't be botted at zero cost; the endorsement IS the position |
| **Feed** | **The Graph subgraph** — ranked by real on-chain performance | there is no database; discovery is pure event-indexing of chain truth |
| **Profile** | **ENS** — the name, the avatar, the description, the follow graph | identity is the public-key infrastructure, not a row we control |

> **The line, verbatim:** *"i like sono la liquidità, il feed è The Graph, i profili sono ENS."* Put it on slide one.

## Why "likes are capital" is the core insight

A like on Twitter is **free** — therefore zero-signal, therefore gameable, therefore the social graph rots. A like on Wave is **capital you put behind a strategy** — therefore costly, therefore self-selecting, therefore honest. You cannot manufacture endorsement without risking money. That single inversion — *free → costly* — is what makes a Wave reputation mean something a Twitter reputation structurally cannot. **The metric is the mechanism.**

This is why comments were cut, not because they were hard: a comment is not a financial act, and in a proof-of-capital social, non-financial acts do not belong. **The purity is the feature.** Reducing the social surface to verbs that all have on-chain consequence is what makes the thesis legible. A social with comments bolted back in would read as "DeFi with a chat" — incoherent. A social with *only* capital-weighted verbs reads as "a new kind of reputation system."

## How every part of the stack serves the thesis

Read the architecture through this lens and it stops being "a bunch of sponsor integrations" and becomes "one idea, expressed in five layers":

- **SwapVM + the compiler** — the *engine*. A strategy is verified bytecode, not a deployed contract someone can tamper with. This is what makes a "strategy" a thing you can put capital behind *and trust*. Without the compiler, there's no safe object to endorse.
- **Aqua settlement** — the *commitment mechanism*. Custody never leaves the maker wallet, so "I put capital behind this" is a real, revocable, on-chain position — not a transfer to a black box.
- **The Graph** — the *measurement*. The feed ranks by `returnPct × recency × log(followers)` — every term sourced from `Swapped` events and ENS records. No off-chain store can lie about how a strategy performed.
- **ENS** — the *identity and the follow graph*. A profile is a name you own; a follow is a record on *your* name. *"If Wave disappears tomorrow, my reputation and my follow list survive — they were never ours."*
- **The ranking** — the *social ordering*. It surfaces the strategies that earned it (return %), decays the stale (recency), and lets the crowd nudge (followers in log space) — but never lets a thumb outweigh money.

## The verb that proves the thesis in motion: Fork

**Fork** — load someone else's ENS-published strategy spec into your composer — is the most on-brand verb we have, and the one to elevate. It is the *only* social act that is simultaneously a **judgment** (you fork because the strategy makes money) and a **financial act** (forking means you're about to compile and ship capital). It is proof-of-capital *propagating*: capital flows from the strategist who earned it to the one who recognized it. The demo loop **see a profitable strategy → fork → retune → ship → it's on your feed too** is the social graph growing *through* capital decisions, not alongside them. **If the thesis is true, fork is how it spreads. Treat fork as the social heart, not a card CTA.**

## What this changes about how we pitch and build

- **Open with the thesis, not the engineering.** A judge who hears "we built a compiler" files Wave under "another DeFi tool." A judge who hears *"every social measures vanity; Wave measures capital, because on-chain the only like you can't fake is one that costs"* files it under "a new kind of social" — a rarer, stickier category. The compiler and the autonomous retune are then shown as *the machines that make this metric possible*, in that order.
- **Protect the purity.** Every time someone proposes adding a feature, ask: *does this have an on-chain consequence, or is it vanity?* Comments, reaction emoji, share counts — these are vanity. Fork, follow, commit capital, retune — these have consequence. Ship only the second category.
- **The three sponsor prizes are one product, not three integrations.** 1inch is the engine that makes capital-backable strategies possible; The Graph is the measurement that ranks them honestly; ENS is the identity that makes reputation portable. The proof-of-capital thesis is what makes them a *product* instead of a checklist. Lead with the product; the bounties follow.

## The falsifiable version of the claim

If a judge asks "is this really social, or DeFi with a feed?" — the answer that must be true in the code: **every signal that orders, ranks, or endorses a strategy is sourced from chain or ENS, and every social verb has a financial consequence.** Remove the subgraph and the feed can't rank; remove ENS and there are no profiles; remove capital and there are no likes. There is no off-chain store doing any of this work. That is the integrity test — and unlike most demo claims, it's one we can pass by construction because there is no database to unplug.
