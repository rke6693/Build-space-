import type { MiddlewareHandler } from 'hono';
import type { Repo } from '../../db/repo.js';
import { KeelError } from '../../util/errors.js';
import { sha256Hex, safeEqual } from '../../util/hash.js';

export interface AuthContext {
  apiKeyId: string;
  label: string;
}

/**
 * Auth is either:
 *   - Static (env-provided KEEL_API_KEYS): each key is identified by its
 *     sha256 prefix so logs can reference keys without storing them.
 *   - DB-backed (when Postgres is configured AND the `api_keys` table is
 *     populated): key is looked up by sha256(raw).
 *
 * If both are configured, DB is tried first, static is fallback. This makes
 * local dev painless (just set KEEL_API_KEYS=...) while production can use
 * the api_keys table exclusively by leaving the env list empty.
 */
export function auth(options: {
  staticKeys: string[];
  repo: Repo | null;
}): MiddlewareHandler<{ Variables: { auth: AuthContext } }> {
  const staticSet = new Set(options.staticKeys);

  return async (c, next) => {
    const header =
      c.req.header('authorization') ?? c.req.header('x-api-key') ?? '';
    const token = header.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : header.trim();
    if (!token) {
      throw new KeelError('auth_missing', 'missing Authorization header');
    }

    if (options.repo) {
      const row = await options.repo.findApiKeyByRaw(token);
      if (row) {
        if (!row.isActive) throw new KeelError('auth_invalid', 'api key is disabled');
        c.set('auth', { apiKeyId: row.id, label: row.label });
        await next();
        return;
      }
    }

    if (hasStaticKey(staticSet, token)) {
      const fingerprint = sha256Hex(token).slice(0, 12);
      c.set('auth', { apiKeyId: `static-${fingerprint}`, label: 'static' });
      await next();
      return;
    }

    throw new KeelError('auth_invalid', 'invalid api key');
  };
}

function hasStaticKey(set: Set<string>, token: string): boolean {
  // Constant-time compare against each entry to avoid leaking which key matched
  // via timing. Small key sets only — if you have thousands of keys, use DB.
  for (const k of set) if (safeEqual(k, token)) return true;
  return false;
}
