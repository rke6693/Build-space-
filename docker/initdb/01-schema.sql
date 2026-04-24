-- Keel initial schema.
-- pgvector is needed for semantic cache. The pgvector/pgvector image ships it.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- API keys that clients use to call the gateway.
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash        TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  monthly_budget_usd NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every request that passes through the gateway. One row per client request.
-- Primary + (optionally) shadow attempts are joined in request_attempts.
CREATE TABLE IF NOT EXISTS requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint        TEXT NOT NULL,         -- 'messages' | 'chat.completions'
  requested_model TEXT NOT NULL,         -- what the client asked for
  served_model    TEXT NOT NULL,         -- what we actually used (post-routing)
  cache_status    TEXT NOT NULL,         -- 'miss' | 'exact' | 'semantic'
  status_code     INT NOT NULL,
  input_tokens    INT NOT NULL DEFAULT 0,
  output_tokens   INT NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(12, 6) NOT NULL DEFAULT 0,
  latency_ms      INT NOT NULL DEFAULT 0,
  error_code      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS requests_api_key_created_idx
  ON requests(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_served_model_idx
  ON requests(served_model);

-- Shadow-eval attempts: candidate responses we fired alongside primary.
CREATE TABLE IF NOT EXISTS shadow_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  candidate_model TEXT NOT NULL,
  primary_model   TEXT NOT NULL,
  judge_model     TEXT NOT NULL,
  judge_score     NUMERIC(4, 3),        -- 0.000 .. 1.000
  cost_delta_usd  NUMERIC(12, 6),       -- negative = candidate cheaper
  candidate_ok    BOOLEAN NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shadow_attempts_models_idx
  ON shadow_attempts(primary_model, candidate_model, created_at DESC);

-- Semantic cache: embedding of the prompt keyed by model + params.
-- cache_key is a deterministic hash of (model, non-prompt params, schema version).
CREATE TABLE IF NOT EXISTS cache_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key       TEXT NOT NULL,
  prompt_embedding vector(1536),        -- text-embedding-3-small dimension
  prompt_hash     TEXT NOT NULL,        -- sha256 of exact prompt (for exact hits)
  response_json   JSONB NOT NULL,
  input_tokens    INT NOT NULL DEFAULT 0,
  output_tokens   INT NOT NULL DEFAULT 0,
  hit_count       INT NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cache_entries_exact_idx
  ON cache_entries(cache_key, prompt_hash);
-- IVFFlat needs >0 rows to build; created lazily in migrations if needed.
CREATE INDEX IF NOT EXISTS cache_entries_vec_idx
  ON cache_entries USING ivfflat (prompt_embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX IF NOT EXISTS cache_entries_expires_idx
  ON cache_entries(expires_at);

-- Simple audit of routing decisions for "why did you serve X?" questions.
CREATE TABLE IF NOT EXISTS routing_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  rule            TEXT NOT NULL,        -- 'exact-cache' | 'semantic-cache' | 'override' | 'shadow-promoted' | 'default'
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
