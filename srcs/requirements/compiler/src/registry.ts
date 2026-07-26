// wave compiler — Chainlink feed registry (compiler-owned).
//
// The LLM picks a SYMBOL (ast.ts FeedSymbol); this registry resolves it to a
// concrete aggregator per chain. The demo drives a MockAggregatorV3 instead
// (PLAYBOOK §1.5 dual-oracle decision) — pass it via
// LowerOptions.feedOverride; the registry stays the production wiring quoted
// on the safety card.
//
// `verified` is load-bearing, not documentation: resolveFeed THROWS on an
// unverified feed (review finding on PR #26). A wrong address that is not a
// feed fails safe (no latestRoundData → revert); a wrong address that IS a
// valid feed of another pair passes every guard check and silently prices
// against the wrong market. Verify against docs.chain.link, flip the flag.

import type { z } from "zod/v4";

import type { FeedSymbol } from "./ast.js";

export interface FeedInfo {
  address: `0x${string}`;
  decimals: number;
}

interface RegistryEntry extends FeedInfo {
  /// True only for addresses verified against docs.chain.link (or attested
  /// in the repo docs). resolveFeed refuses unverified entries.
  verified: boolean;
}

type Symbol_ = z.infer<typeof FeedSymbol>;

/// Sepolia (11155111). ETH/USD is attested in PLAYBOOK §1.5 (measured
/// heartbeat ~3600s). The other four are the standard Chainlink Sepolia
/// aggregators FROM MEMORY — unverified, so resolveFeed throws on them
/// until someone checks docs.chain.link and flips the flag. The demo path
/// never hits this: it uses feedOverride (MockAggregatorV3).
const SEPOLIA_FEEDS: Record<Symbol_, RegistryEntry> = {
  "ETH/USD": { address: "0x694AA1769357215DE4FAC081bf1f309aDC325306", decimals: 8, verified: true },
  "BTC/USD": { address: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43", decimals: 8, verified: false },
  "LINK/USD": { address: "0xc59E3633BAAC79493d908e63626716e204A45EdF", decimals: 8, verified: false },
  "USDC/USD": { address: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", decimals: 8, verified: false },
  "DAI/USD": { address: "0x14866185B1962B63C3Ea9E03Bc1da838bab34C19", decimals: 8, verified: false },
};

export const FEED_REGISTRY: Record<number, Record<Symbol_, RegistryEntry>> = {
  11155111: SEPOLIA_FEEDS,
};

export class UnverifiedFeedError extends Error {
  constructor(chainId: number, symbol: string, address: string) {
    super(
      `feed ${symbol} on chain ${chainId} (${address}) is UNVERIFIED — check it on docs.chain.link and flip \`verified\`, or pass feedOverride. Refusing to emit: a wrong-but-valid feed passes every guard check and silently prices against the wrong market.`,
    );
    this.name = "UnverifiedFeedError";
  }
}

export function resolveFeed(chainId: number, symbol: Symbol_): FeedInfo {
  const feeds = FEED_REGISTRY[chainId];
  if (feeds === undefined) {
    throw new Error(`no feed registry for chain ${chainId}`);
  }
  const entry = feeds[symbol];
  if (!entry.verified) {
    throw new UnverifiedFeedError(chainId, symbol, entry.address);
  }
  return { address: entry.address, decimals: entry.decimals };
}
