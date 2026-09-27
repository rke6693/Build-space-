import type { Viewport, ViewportCallbacks } from '../render/Viewport';
import type { City } from '../sim/types';
import { SimClient } from '../worker/client';

/** Long-lived singletons shared by UI components. */
export const runtime: {
  client: SimClient;
  viewport: Viewport | null;
  city: City | null;
  container: HTMLElement | null;
  callbacks: ViewportCallbacks | null;
} = {
  client: new SimClient(),
  viewport: null,
  city: null,
  container: null,
  callbacks: null,
};
