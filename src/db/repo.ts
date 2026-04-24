import type { Pool } from 'pg';
import { sha256Hex } from '../util/hash.js';
import type { ShadowAttempt, ShadowLogger } from '../core/shadow/shadow.js';
import type { RoutingContext } from '../core/types.js';

export interface ApiKeyRow {
  id: string;
  label: string;
  isActive: boolean;
  monthlyBudgetUsd: number;
}

export interface RequestLogRow {
  id: string;
  apiKeyId: string | null;
  endpoint: 'messages' | 'chat.completions';
  requestedModel: string;
  servedModel: string;
  cacheStatus: 'miss' | 'exact' | 'semantic';
  statusCode: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  errorCode: string | null;
}

export class Repo implements ShadowLogger {
  constructor(private readonly pool: Pool) {}

  async findApiKeyByRaw(rawKey: string): Promise<ApiKeyRow | null> {
    const hash = sha256Hex(rawKey);
    const res = await this.pool.query<{
      id: string;
      label: string;
      is_active: boolean;
      monthly_budget_usd: string;
    }>(
      `SELECT id, label, is_active, monthly_budget_usd::text
         FROM api_keys
        WHERE key_hash = $1`,
      [hash],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      label: row.label,
      isActive: row.is_active,
      monthlyBudgetUsd: Number.parseFloat(row.monthly_budget_usd),
    };
  }

  async insertRequest(row: RequestLogRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO requests (
         id, api_key_id, endpoint, requested_model, served_model,
         cache_status, status_code, input_tokens, output_tokens,
         cost_usd, latency_ms, error_code
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        row.id,
        row.apiKeyId,
        row.endpoint,
        row.requestedModel,
        row.servedModel,
        row.cacheStatus,
        row.statusCode,
        row.inputTokens,
        row.outputTokens,
        row.costUsd,
        row.latencyMs,
        row.errorCode,
      ],
    );
  }

  async insertRoutingDecision(requestId: string, ctx: RoutingContext): Promise<void> {
    await this.pool.query(
      `INSERT INTO routing_decisions (request_id, rule, reason)
         VALUES ($1, $2, $3)`,
      [requestId, ctx.routingRule ?? 'default', ctx.routingReason ?? null],
    );
  }

  async logAttempt(attempt: ShadowAttempt): Promise<void> {
    await this.pool.query(
      `INSERT INTO shadow_attempts (
         request_id, candidate_model, primary_model, judge_model,
         judge_score, cost_delta_usd, candidate_ok
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        attempt.requestId,
        attempt.candidateModel,
        attempt.primaryModel,
        attempt.judgeModel,
        attempt.judgeScore,
        attempt.costDeltaUsd,
        attempt.candidateOk,
      ],
    );
  }

  async stats24h(): Promise<{
    requests: number;
    cacheHitRate: number;
    totalCostUsd: number;
    savedByCache: number;
    avgLatencyMs: number;
  }> {
    const res = await this.pool.query<{
      reqs: string;
      hits: string;
      cost: string;
      saved: string;
      latency: string;
    }>(
      `SELECT
         COUNT(*)::text AS reqs,
         COUNT(*) FILTER (WHERE cache_status <> 'miss')::text AS hits,
         COALESCE(SUM(cost_usd), 0)::text AS cost,
         COALESCE(SUM(CASE WHEN cache_status <> 'miss' THEN cost_usd ELSE 0 END), 0)::text AS saved,
         COALESCE(AVG(latency_ms), 0)::text AS latency
       FROM requests
       WHERE created_at > NOW() - INTERVAL '24 hours'`,
    );
    const row = res.rows[0]!;
    const reqs = Number.parseInt(row.reqs, 10);
    const hits = Number.parseInt(row.hits, 10);
    return {
      requests: reqs,
      cacheHitRate: reqs === 0 ? 0 : hits / reqs,
      totalCostUsd: Number.parseFloat(row.cost),
      savedByCache: Number.parseFloat(row.saved),
      avgLatencyMs: Number.parseFloat(row.latency),
    };
  }
}
