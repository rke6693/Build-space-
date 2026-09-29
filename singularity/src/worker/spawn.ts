/**
 * Creates the simulation worker. The single-file build (vite.embed.config.ts) swaps this module
 * for spawn.inline.ts, which embeds the worker source and starts it from a blob: URL.
 */
export function createSimWorker(): Worker {
  return new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
}
