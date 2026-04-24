import { sha256Hex, stableStringify } from '../../util/hash.js';
import type { CompletionRequest, CompletionResponse } from '../types.js';

export interface CacheHit {
  response: CompletionResponse;
  status: 'exact' | 'semantic';
  similarity?: number;
}

export interface Cache {
  lookup(req: CompletionRequest): Promise<CacheHit | null>;
  store(req: CompletionRequest, res: CompletionResponse): Promise<void>;
}

/** Current cache schema version. Bump to invalidate everything. */
const CACHE_SCHEMA_VERSION = 1;

/**
 * Build a deterministic cache key from the non-prompt parts of the request.
 * Two requests with the same cache key and the same prompt content can be
 * considered equivalent; we split prompt out so semantic similarity can match.
 */
export function cacheKey(req: CompletionRequest): string {
  const shape = {
    v: CACHE_SCHEMA_VERSION,
    model: req.model,
    maxTokens: req.maxTokens ?? null,
    temperature: req.temperature ?? null,
    topP: req.topP ?? null,
    stop: req.stop ?? null,
  };
  return sha256Hex(stableStringify(shape));
}

/**
 * The prompt hash is the sha256 of the stable-stringified messages array.
 * Used for exact cache hits (no embedding needed) and as a primary key.
 */
export function promptHash(req: CompletionRequest): string {
  return sha256Hex(stableStringify(req.messages));
}

/**
 * Concatenate messages for embedding. We include role markers so the embedding
 * captures conversational structure, not just the last user turn.
 */
export function embeddableText(req: CompletionRequest): string {
  return req.messages.map((m) => `<${m.role}>\n${m.content}`).join('\n');
}

/**
 * Policy: only cache deterministic requests. Non-streaming, low-temperature.
 * Streamed responses can't be replayed reliably and temperature > 0.15 means
 * the client explicitly wants variation.
 */
export function isCacheable(req: CompletionRequest): boolean {
  if (req.stream === true) return false;
  if (req.temperature !== undefined && req.temperature > 0.15) return false;
  return true;
}
