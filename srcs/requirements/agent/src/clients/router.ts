// EnsStrategyRouter client. STUB — awaits Flaviano's frozen router ABI +
// programHash() (docs/tasks/Flaviano.md L10, L22).
import type { StrategyStatus } from "./subgraph.js";

const NOT_WIRED = "router client not wired — awaiting Flaviano's EnsStrategyRouter ABI + programHash() (docs/tasks/Flaviano.md)";

export const router = {
  async getProgramHash(strategyId: string): Promise<`0x${string}`> {
    throw new Error(`${NOT_WIRED} [getProgramHash ${strategyId}]`);
  },
  async getStrategyStatus(strategyId: string): Promise<StrategyStatus> {
    throw new Error(`${NOT_WIRED} [getStrategyStatus ${strategyId}]`);
  },
};
