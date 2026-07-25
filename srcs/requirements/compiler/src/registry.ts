// wave compiler — Chainlink feed registry (compiler-owned).
//
// The LLM picks a SYMBOL (ast.ts FeedSymbol); this registry resolves it to a
// concrete aggregator per chain. The demo drives a MockAggregatorV3 instead
// (PLAYBOOK §1.5 dual-oracle decision) — pass it via
// LowerOptions.feedOverride; the registry stays the production wiring quoted
// on the safety card.

import type { z } from "zod/v4";

import type { FeedSymbol } from "./ast.js";

export interface FeedInfo {
  address: `0x${string}`;
  decimals: number;
}

type Symbol_ = z.infer<typeof FeedSymbol>;

/// Sepolia (11155111). ETH/USD is attested in PLAYBOOK §1.5 (measured
/// heartbeat ~3600s); the others are the standard Chainlink Sepolia
/// aggregators — re-verify against docs.chain.link before any run that
/// leans on them (the demo path never does: it uses the mock).
const SEPOLIA_FEEDS: Record<Symbol_, FeedInfo> = {
  "ETH/USD": { address: "0x694AA1769357215DE4FAC081bf1f309aDC325306", decimals: 8 },
  "BTC/USD": { address: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43", decimals: 8 },
  "LINK/USD": { address: "0xc59E3633BAAC79493d908e63626716e204A45EdF", decimals: 8 },
  "USDC/USD": { address: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", decimals: 8 },
  "DAI/USD": { address: "0x14866185B1962B63C3Ea9E03Bc1da838bab34C19", decimals: 8 },
};

export const FEED_REGISTRY: Record<number, Record<Symbol_, FeedInfo>> = {
  11155111: SEPOLIA_FEEDS,
};

export function resolveFeed(chainId: number, symbol: Symbol_): FeedInfo {
  const feeds = FEED_REGISTRY[chainId];
  if (feeds === undefined) {
    throw new Error(`no feed registry for chain ${chainId}`);
  }
  return feeds[symbol];
}
