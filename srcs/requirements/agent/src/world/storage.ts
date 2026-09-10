// LibSQL-backed AgentKitStorage — durable usage counters + nonce anti-replay
// for the MCP gate. Implements the SDK's AgentKitStorage interface with the
// atomicity its docs demand: tryIncrementUsage is a single-statement
// conditional UPDATE (check-and-increment in one round trip, no TOCTOU).
//
// Reuses the LIBSQL_URL env family of the Mastra store (default :memory: —
// container-safe; set file:./data.db for counters/nonces that survive a
// restart, same tradeoff as the HITL workflow storage).
import { createClient, type Client } from "@libsql/client";
import type { AgentKitStorage } from "@worldcoin/agentkit";

export class LibSqlAgentKitStorage implements AgentKitStorage {
  private readonly client: Client;
  private readonly ready: Promise<void>;

  constructor(url: string) {
    this.client = createClient({ url });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.client.batch(
      [
        `CREATE TABLE IF NOT EXISTS agentkit_usage (
          endpoint TEXT NOT NULL,
          human_id TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (endpoint, human_id)
        )`,
        `CREATE TABLE IF NOT EXISTS agentkit_nonce (
          nonce TEXT PRIMARY KEY,
          recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      ],
      "write",
    );
  }

  async tryIncrementUsage(endpoint: string, humanId: string, limit: number): Promise<boolean> {
    await this.ready;
    // Existing row below the limit: atomic check-and-increment.
    const bumped = await this.client.execute({
      sql: "UPDATE agentkit_usage SET count = count + 1 WHERE endpoint = ? AND human_id = ? AND count < ?",
      args: [endpoint, humanId, limit],
    });
    if (bumped.rowsAffected > 0) return true;
    // No row yet: first use. OR IGNORE makes concurrent first-calls race-safe
    // (exactly one INSERT wins; the loser falls through to `false`).
    const inserted = await this.client.execute({
      sql: "INSERT INTO agentkit_usage (endpoint, human_id, count) VALUES (?, ?, 1) ON CONFLICT (endpoint, human_id) DO NOTHING",
      args: [endpoint, humanId],
    });
    return inserted.rowsAffected > 0;
  }

  async hasUsedNonce(nonce: string): Promise<boolean> {
    await this.ready;
    const rows = await this.client.execute({
      sql: "SELECT 1 FROM agentkit_nonce WHERE nonce = ?",
      args: [nonce],
    });
    return rows.rows.length > 0;
  }

  async recordNonce(nonce: string): Promise<void> {
    await this.ready;
    await this.client.execute({
      sql: "INSERT OR IGNORE INTO agentkit_nonce (nonce) VALUES (?)",
      args: [nonce],
    });
  }

  async close(): Promise<void> {
    await this.ready;
    this.client.close();
  }
}
