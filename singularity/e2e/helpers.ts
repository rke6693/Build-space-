import { expect, type Page } from '@playwright/test';

export interface StatusView {
  tick: number;
  frontier: number;
  playing: boolean;
  speed: number;
  replay: boolean;
  verified: number;
  mismatches: number;
  seeking: boolean;
  nanRepairs: number;
}

/** Opens the app with the intro and tour skipped at low render quality; returns collected page errors. */
export async function boot(page: Page, overrides: Record<string, string> = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GPU stall|WebGL|swiftshader|GL Driver/i.test(m.text())) errors.push(m.text());
  });
  const q = new URLSearchParams({ intro: '0', tour: '0', quality: 'low', autoquality: '0', ...overrides });
  await page.goto(`/?${q}`);
  await page.waitForFunction(() => {
    const w = window as unknown as { __singularity?: { runtime: { client: { status: unknown; frame: unknown } } } };
    return !!w.__singularity?.runtime.client.status && !!w.__singularity.runtime.client.frame;
  }, undefined, { timeout: 120_000 });
  if (q.get('intro') === '0') await expect(page.locator('.app.intro')).toHaveCount(0);
  return errors;
}

export function status(page: Page): Promise<StatusView> {
  return page.evaluate(() => {
    const w = window as unknown as { __singularity: { runtime: { client: { status: StatusView } } } };
    return { ...w.__singularity.runtime.client.status };
  });
}

export function eventTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __singularity: { runtime: { client: { events: { type: string }[] } } } };
    return w.__singularity.runtime.client.events.map((e) => e.type);
  });
}

export async function waitForTick(page: Page, minTick: number, timeout = 120_000) {
  await page.waitForFunction(
    (t) => {
      const w = window as unknown as { __singularity: { runtime: { client: { status: { tick: number } } } } };
      return w.__singularity.runtime.client.status.tick >= t;
    },
    minTick,
    { timeout },
  );
}

/** Triggers an earthquake with the toolbox defaults (M6.9, offshore south). */
export async function triggerEarthquake(page: Page) {
  await page.getByTestId('left-tab-disasters').click();
  await page.getByTestId('tool-earthquake').click();
  await expect(page.getByTestId('tool-form')).toBeVisible();
  await page.getByTestId('trigger').click();
}
