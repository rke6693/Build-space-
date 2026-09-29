import SimWorker from './sim.worker.ts?worker&inline';

/** Single-file build: the worker source is embedded in the page and started from a blob: URL. */
export function createSimWorker(): Worker {
  return new SimWorker();
}
