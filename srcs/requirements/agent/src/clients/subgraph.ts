// The Graph subgraph client (strategy + swap data). STUB — awaits Pietro's
// subgraph endpoint (docs/tasks/Pietro.md). Methods throw until wired so NO
// fake data ever reaches policy.decide().
export type StrategyStatus = "active" | "stopped" | "removed";

export type Strategy = {
  id: string;
  programHash: string;
  ensNode: string;
  status: StrategyStatus;
};

export type Swap = {
  id: string;
  strategyId: string;
  amountIn: string;
  amountOut: string;
  timestamp: number; // unix secs
};

const NOT_WIRED = "subgraph client not wired — awaiting Pietro's subgraph endpoint (docs/tasks/Pietro.md)";

export const subgraph = {
  async getStrategy(id: string): Promise<Strategy> {
    throw new Error(`${NOT_WIRED} [getStrategy ${id}]`);
  },
  async listStrategies(status?: StrategyStatus): Promise<Strategy[]> {
    throw new Error(`${NOT_WIRED} [listStrategies ${status ?? "*"}]`);
  },
  async getSwapHistory(strategyId: string, limit = 50): Promise<Swap[]> {
    throw new Error(`${NOT_WIRED} [getSwapHistory ${strategyId}]`);
  },
};
