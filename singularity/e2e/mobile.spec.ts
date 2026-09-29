import { expect, test, type Page } from '@playwright/test';
import { boot, eventTypes, status } from './helpers';

/**
 * iPhone-class checks, run by the "iphone" projects (touch, mobile viewport, 3x DPR).
 * Everything is driven with taps: there is no keyboard on a phone.
 */

/** Side rails end above the timeline and every rail tab is on screen. */
async function railsClearOfTimeline(page: Page) {
  const m = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    return { left: r('.side.left').bottom, right: r('.side.right').bottom, tl: r('.timeline').top, lastTab: r('[data-testid=right-tab-compare]').bottom };
  });
  expect(m.left).toBeLessThanOrEqual(m.tl);
  expect(m.right).toBeLessThanOrEqual(m.tl);
  expect(m.lastTab).toBeLessThanOrEqual(m.right);
}

async function withinViewport(page: Page, selector: string) {
  const vw = await page.evaluate(() => window.innerWidth);
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, w: r.width })),
  );
  for (const b of boxes) if (b.w > 0) expect(b.r, `${selector} overflows the screen`).toBeLessThanOrEqual(vw + 0.5);
}

test.describe('iPhone portrait', () => {
  test('boots with the city visible, compact chrome and phone defaults', async ({ page }) => {
    const errors = await boot(page);
    await expect(page.locator('.viewport canvas')).toBeVisible();
    // panels start collapsed so the city is visible
    await expect(page.locator('.side.left')).toHaveClass(/collapsed/);
    await expect(page.locator('.side.right')).toHaveClass(/collapsed/);
    // nothing in the top bar or timeline runs off the screen
    await withinViewport(page, '.topbar > *');
    await withinViewport(page, '.timeline button, .timeline .track');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await railsClearOfTimeline(page);
    // page zoom is disabled in favour of camera gestures; inputs are 16px so iOS does not focus-zoom
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe('pan-x pan-y');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.viewport canvas')!).touchAction)).toBe('none');
    expect(errors).toEqual([]);
  });

  test('default render quality is the phone preset', async ({ page }) => {
    await page.goto('/?intro=0&tour=0&autoquality=0');
    await page.waitForFunction(() => !!(window as unknown as { __singularity?: { store: { get(): { ready: boolean } } } }).__singularity?.store.get().ready, undefined, { timeout: 120_000 });
    expect(await page.evaluate(() => (window as unknown as { __singularity: { store: { get(): { quality: string } } } }).__singularity.store.get().quality)).toBe('medium');
  });

  test('tap-only workflow: speed, earthquake, events, inspect', async ({ page }) => {
    await boot(page);
    // speed without a keyboard
    await page.getByTestId('speed-cycle').tap();
    await expect.poll(async () => (await status(page)).speed).toBe(2);
    await page.getByTestId('speed-cycle').tap();
    await page.getByTestId('speed-cycle').tap();
    await expect.poll(async () => (await status(page)).speed).toBe(10);

    // open the toolbox from the collapsed rail and trigger an earthquake
    await page.getByTestId('left-tab-disasters').tap();
    await expect(page.locator('.side.left')).not.toHaveClass(/collapsed/);
    await page.getByTestId('tool-earthquake').tap();
    await page.getByTestId('trigger').tap();
    await expect.poll(async () => (await eventTypes(page)).includes('earthquake'), { timeout: 60_000 }).toBe(true);

    // collapse the toolbox again, then open events from the right rail
    await page.locator('.side.left .panel-head .icon-btn').first().tap();
    await expect(page.locator('.side.left')).toHaveClass(/collapsed/);
    await page.getByTestId('play-toggle').tap();
    await expect(page.getByTestId('sim-status')).toContainText(/paused/i);
    await page.getByTestId('right-tab-events').tap();
    await expect(page.locator('.ev-list .ev').first()).toBeVisible({ timeout: 60_000 });
    await withinViewport(page, '.side.right');
  });

  test('a pinch never registers as a tap-to-select', async ({ page }) => {
    await boot(page);
    const selected = await page.evaluate(async () => {
      const canvas = document.querySelector('.viewport canvas') as HTMLCanvasElement;
      const r = canvas.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const fire = (type: string, id: number, dx: number) =>
        canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x + dx, clientY: y, bubbles: true, isPrimary: id === 1, button: 0 }));
      // two fingers down, second one lifts without moving, then the first
      fire('pointerdown', 1, 0);
      fire('pointerdown', 2, 60);
      fire('pointerup', 2, 60);
      fire('pointerup', 1, 0);
      await new Promise((res) => setTimeout(res, 300));
      return (window as unknown as { __singularity: { store: { get(): { selection: unknown } } } }).__singularity.store.get().selection;
    });
    expect(selected).toBeNull();
  });
});

test('rotating the phone resizes the 3D view and re-lays out the chrome', async ({ page }) => {
  await boot(page);
  const canvasAspect = () => page.evaluate(() => {
    const c = document.querySelector('.viewport canvas') as HTMLCanvasElement;
    return c.width / c.height;
  });
  expect(await canvasAspect()).toBeLessThan(1);
  await page.setViewportSize({ width: 956, height: 390 });
  await expect.poll(canvasAspect).toBeGreaterThan(2);
  await expect(page.getByTestId('speed-cycle')).toBeVisible();
  await railsClearOfTimeline(page);
  await page.setViewportSize({ width: 440, height: 800 });
  await expect.poll(canvasAspect).toBeLessThan(1);
  await railsClearOfTimeline(page);
});

test.describe('iPhone landscape', () => {
  test.use({ viewport: { width: 956, height: 390 } });
  test('short landscape screen keeps the city visible and panels usable', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.side.left')).toHaveClass(/collapsed/);
    await expect(page.locator('.side.right')).toHaveClass(/collapsed/);
    await expect(page.getByTestId('play-toggle')).toBeVisible();
    await expect(page.getByTestId('speed-cycle')).toBeVisible();
    await withinViewport(page, '.topbar > *');
    await railsClearOfTimeline(page);
    const tl = await page.locator('.timeline').boundingBox();
    expect(tl!.y + tl!.height).toBeLessThanOrEqual(390);
    // an opened panel overlays at most about half the width and fits vertically
    await page.getByTestId('right-tab-analytics').tap();
    const side = await page.locator('.side.right').boundingBox();
    expect(side!.width).toBeLessThanOrEqual(956 * 0.47);
    expect(side!.y + side!.height).toBeLessThanOrEqual(tl!.y);
  });
});
