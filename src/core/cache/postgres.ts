import type { Pool } from 'pg';
import { logger } from '../../util/logger.js';
import type { CompletionRequest, CompletionResponse } from '../types.js';
import {
  type Cache,
  type CacheHit,
  cacheKey,
  embeddableText,
  isCacheable,
  promptHash,
} from './cache.js';

/**
 * Adapter for producing a single embedding vector from text. Kept generic so
 * providers/test doubles can be swapped in. Vector dimension must match the
 * schema (default: 1536 for text-embedding-3-small).
 */
export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export interface PostgresCacheOptions {
  pool: Pool;
  embedder: Embedder | null; // null disables semantic matching (exact-only).
  similarityThreshold: number; // cosine similarity cutoff, 0..1.
  ttlSeconds: number;
}

/**
 * Persistent cache backed by Postgres + pgvector. Two paths:
 *   1. Exact hit by (cache_key, prompt_hash) — one indexed read.
 *   2. Semantic hit by cosine distance on prompt_embedding within the same
 *      cache_key, using pgvector's `<=>` operator and the IVFFlat index.
 *
 * We only semantic-match when an embedder is provided and the request is
 * eligible per `isCacheable`. Cosine similarity = 1 - cosine distance.
 */
export class PostgresCache implements Cache {
  constructor(private readonly opts: PostgresCacheOptions) {}

  async lookup(req: CompletionRequest): Promise<CacheHit | null> {
    if (!isCacheable(req)) return null;
    const key = cacheKey(req);
    const hash = promptHash(req);

    // --- Exact hit path ---
    const exact = await this.opts.pool.query<{ response_json: CompletionResponse }>(
      `UPDATE cache_entries
         SET hit_count = hit_count + 1
       WHERE cache_key = $1 AND prompt_hash = $2 AND expires_at > NOW()
       RETURNING response_json`,
      [key, hash],
    );
    if (exact.rows[0]) {
      return { response: exact.rows[0].response_json, status: 'exact' };
    }

    // --- Semantic hit path ---
    if (!this.opts.embedder) return null;
    let vec: number[];
    try {
      vec = await this.opts.embedder.embed(embeddableText(req));
    } catch (err) {
      logger.warn({ err }, 'semantic cache: embedding failed, falling through');
      return null;
    }
    const vectorLiteral = `[${vec.join(',')}]`;
    // Cosine distance is 1 - cosine similarity. Threshold is on similarity.
    const maxDistance = 1 - this.opts.similarityThreshold;
    const semantic = await this.opts.pool.query<{
      response_json: CompletionResponse;
      similarity: number;
      id: string;
    }>(
      `SELECT id,
              response_json,
              1 - (prompt_embedding <=> $2::vector) AS similarity
         FROM cache_entries
        WHERE cache_key = $1
          AND expires_at > NOW()
          AND prompt_embedding IS NOT NULL
        ORDER BY prompt_embedding <=> $2::vector
        LIMIT 1`,
      [key, vectorLiteral],
    );
    const row = semantic.rows[0];
    if (!row) return null;
    if (1 - row.similarity > maxDistance) return null;
    // Bump hit count; best-effort, not in a transaction.
    await this.opts.pool
      .query(`UPDATE cache_entries SET hit_count = hit_count + 1 WHERE id = $1`, [row.id])
      .catch(() => {});
    return { response: row.response_json, status: 'semantic', similarity: row.similarity };
  }

  async store(req: CompletionRequest, res: CompletionResponse): Promise<void> {
    if (!isCacheable(req)) return;
    const key = cacheKey(req);
    const hash = promptHash(req);
    const expiresAt = new Date(Date.now() + this.opts.ttlSeconds * 1000);

    let vectorLiteral: string | null = null;
    if (this.opts.embedder) {
      try {
        const vec = await this.opts.embedder.embed(embeddableText(req));
        vectorLiteral = `[${vec.join(',')}]`;
      } catch (err) {
        logger.warn({ err }, 'semantic cache: embed-on-store failed, exact-only entry');
      }
    }

    await this.opts.pool.query(
      `INSERT INTO cache_entries (
         cache_key, prompt_embedding, prompt_hash, response_json,
         input_tokens, output_tokens, expires_at
       ) VALUES ($1, $2::vector, $3, $4::jsonb, $5, $6, $7)
       ON CONFLICT (cache_key, prompt_hash)
         DO UPDATE SET response_json = EXCLUDED.response_json,
                       expires_at   = EXCLUDED.expires_at,
                       hit_count    = cache_entries.hit_count`,
      [
        key,
        vectorLiteral,
        hash,
        JSON.stringify(res),
        res.usage.inputTokens,
        res.usage.outputTokens,
        expiresAt,
      ],
    );
  }
}
