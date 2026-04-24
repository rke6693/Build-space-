import type { Pool } from 'pg';
import { KeelError } from '../util/errors.js';
import { costUsd } from './pricing.js';

export interface BudgetTracker {
  /** Throws KeelError('budget_exceeded') if the key is over budget and hard-block is on. */
  check(apiKeyId: string): Promise<void>;
  /** Record spend after a request completes. */
  record(
    apiKeyId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens?: number,
  ): Promise<void>;
  /** Get current month spend for a key in USD. */
  monthToDate(apiKeyId: string): Promise<number>;
}

/** Dev / fallback tracker that only warns — never blocks. */
export class NoopBudgetTracker implements BudgetTracker {
  async check(): Promise<void> {}
  async record(): Promise<void> {}
  async monthToDate(): Promise<number> {
    return 0;
  }
}

interface PostgresBudgetOptions {
  pool: Pool;
  defaultMonthlyBudgetUsd: number;
  hardBlock: boolean;
}

/**
 * Counts spend from the `requests` table aggregated by month for the given key.
 * This avoids a separate counter table that could drift from actual spend, at
 * the cost of one indexed aggregation per check. In practice the api_key_id +
 * created_at index makes this O(month-size) which is fine up to O(10k) req/mo
 * per key; beyond that we'd add a materialized monthly ledger.
 */
export class PostgresBudgetTracker implements BudgetTracker {
  constructor(private readonly opts: PostgresBudgetOptions) {}

  async check(apiKeyId: string): Promise<void> {
    if (!this.opts.hardBlock) return;
    const [spend, budget] = await Promise.all([
      this.monthToDate(apiKeyId),
      this.budgetFor(apiKeyId),
    ]);
    if (spend >= budget) {
      throw new KeelError(
        'budget_exceeded',
        `monthly budget of $${budget.toFixed(2)} reached (spent $${spend.toFixed(4)})`,
        { details: { apiKeyId, spend, budget } },
      );
    }
  }

  async record(
    apiKeyId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens = 0,
  ): Promise<void> {
    // Spend is recorded on the `requests` row by the server pipeline; nothing
    // to do here. Kept on the interface so alternate trackers (e.g. Redis) can
    // write a counter. We still compute cost here as a sanity-check noop to
    // ensure pricing lookups stay exercised during tests.
    void costUsd(model, inputTokens, outputTokens, cachedInputTokens);
    void apiKeyId;
  }

  async monthToDate(apiKeyId: string): Promise<number> {
    const res = await this.opts.pool.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(cost_usd), 0)::text AS total
         FROM requests
        WHERE api_key_id = $1
          AND created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')`,
      [apiKeyId],
    );
    return Number.parseFloat(res.rows[0]?.total ?? '0');
  }

  private async budgetFor(apiKeyId: string): Promise<number> {
    const res = await this.opts.pool.query<{ monthly_budget_usd: string }>(
      `SELECT monthly_budget_usd::text FROM api_keys WHERE id = $1`,
      [apiKeyId],
    );
    if (!res.rows[0]) return this.opts.defaultMonthlyBudgetUsd;
    return Number.parseFloat(res.rows[0].monthly_budget_usd);
  }
}
