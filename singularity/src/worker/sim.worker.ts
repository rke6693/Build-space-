/// <reference lib="webworker" />
import { SimHost } from './host';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const host = new SimHost((msg: FromWorker, transfer?: Transferable[]) => self.postMessage(msg, transfer ?? []));
self.onmessage = (ev: MessageEvent<ToWorker>) => host.handle(ev.data);
