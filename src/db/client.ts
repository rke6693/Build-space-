import { Pool, type PoolConfig } from 'pg';
import { logger } from '../util/logger.js';

export function createPool(databaseUrl: string): Pool {
  const config: PoolConfig = {
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'keel',
  };
  const pool = new Pool(config);
  pool.on('error', (err) => {
    logger.error({ err }, 'pg pool error');
  });
  return pool;
}

export async function ping(pool: Pool): Promise<void> {
  await pool.query('SELECT 1');
}
