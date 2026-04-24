#!/usr/bin/env tsx
/**
 * Idempotent "migration": applies docker/initdb/01-schema.sql against the
 * DATABASE_URL. Intentionally minimal — we don't need a migration framework
 * for a single-file schema yet. When we do, we'll add one.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createPool, ping } from '../src/db/client.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlPath = resolve(here, '..', 'docker', 'initdb', '01-schema.sql');
  const sql = await readFile(sqlPath, 'utf8');

  const pool = createPool(databaseUrl);
  try {
    await ping(pool);
    await pool.query(sql);
    console.log(`applied schema from ${sqlPath}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
