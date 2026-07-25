// 1inch Aqua client (read-only quote via SwapVM asView(), + Chainlink oracle
// state). STUB — awaits Flaviano's router address + the Aqua SDK wiring.
export type Quote = {
  amountIn: string;
  amountOut: string;
  // asView() sim — the read-only safety card before ship. Never settles.
};

export type OracleState = {
  feed: string; // e.g. "ETH/USD"
  price: string; // 1e18-scaled
  updatedAt: number; // unix secs (S3 staleness checks this)
  decimals: number;
};

const NOT_WIRED = "aqua client not wired — awaiting Flaviano's router address + Aqua SDK";

export const aqua = {
  async quote(strategyId: string, amountIn: string): Promise<Quote> {
    throw new Error(`${NOT_WIRED} [quote ${strategyId}]`);
  },
  async getOracleState(feed: string): Promise<OracleState> {
    throw new Error(`${NOT_WIRED} [getOracleState ${feed}]`);
  },
};
