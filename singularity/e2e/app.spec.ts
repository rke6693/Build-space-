import { expect, test } from '@playwright/test';
import { boot, eventTypes, status, triggerEarthquake, waitForTick } from './helpers';

test('launches into a running city with live status, labels and panels', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('.viewport canvas')).toBeVisible();
  await expect(page.getByTestId('sim-status')).toContainText(/live/i);
  const t0 = (await status(page)).tick;
  await waitForTick(page, t0 + 20);
  await expect(page.locator('.labels .label').first()).toBeVisible();
  await expect(page.getByTestId('analytics')).toBeVisible();
  expect(errors).toEqual([]);
});

test('earthquake propagates damage and cascades; pause freezes time', async ({ page }) => {
  const errors = await boot(page);
  await triggerEarthquake(page);
  await page.keyboard.press('4'); // 5×
  await expect.poll(async () => (await eventTypes(page)).includes('earthquake'), { timeout: 60_000 }).toBe(true);
  // shaking reaches the city: buildings are damaged and at least one downstream consequence is logged
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __singularity: { runtime: { client: { frame: { metrics: { bSlight: number; bModerate: number } } } } } }).__singularity.runtime.client.frame.metrics.bModerate), { timeout: 90_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        page.evaluate(() => (window as unknown as { __singularity: { runtime: { client: { events: { causes: number[] }[] } } } }).__singularity.runtime.client.events.some((e) => e.causes.length > 0)),
      { timeout: 90_000 },
    )
    .toBe(true);

  await page.keyboard.press(' ');
  await expect(page.getByTestId('sim-status')).toContainText(/paused/i);
  const a = (await status(page)).tick;
  await page.waitForTimeout(1500);
  expect((await status(page)).tick).toBe(a);
  expect((await status(page)).nanRepairs).toBe(0);
  expect(errors).toEqual([]);
});

test('events explain their causal chain and objects can be inspected', async ({ page }) => {
  await boot(page);
  await triggerEarthquake(page);
  await page.keyboard.press('5'); // 10×
  await expect
    .poll(
      async () =>
        page.evaluate(() => (window as unknown as { __singularity: { runtime: { client: { events: { causes: number[] }[] } } } }).__singularity.runtime.client.events.filter((e) => e.causes.length > 0).length),
      { timeout: 90_000 },
    )
    .toBeGreaterThan(2);
  await page.keyboard.press(' ');
  await page.getByTestId('right-tab-events').click();
  const caused = page.locator('.ev-list .ev', { hasText: 'caused by' }).first();
  await caused.click();
  await expect(page.getByTestId('event-detail')).toBeVisible();
  await expect(page.getByTestId('causal-chain').locator('li')).not.toHaveCount(0);

  // selecting an event flies the camera there; return to the overview and let it settle
  await page.keyboard.press('o');
  await page.waitForTimeout(3000);
  // labels track the (damped) camera every frame, so skip Playwright's stability wait
  await page.locator('.labels .label', { hasText: 'St. Aurelia' }).first().click({ force: true });
  await expect(page.getByTestId('right-tab-inspector')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('complementary', { name: 'Inspector and analytics' }).getByRole('tabpanel')).toContainText(/Depends on/i);
});

test('seeking back replays deterministically and returns to live', async ({ page }) => {
  await boot(page);
  await triggerEarthquake(page);
  await page.keyboard.press('5');
  await waitForTick(page, 600);
  await page.keyboard.press(' ');
  const before = await status(page);
  await page.keyboard.press('Shift+ArrowLeft'); // −10 simulated minutes
  await expect.poll(async () => (await status(page)).replay, { timeout: 60_000 }).toBe(true);
  const during = await status(page);
  expect(during.tick).toBeLessThan(before.tick);
  await expect(page.getByTestId('replay-note')).toBeVisible();
  await expect(page.getByTestId('sim-status')).toContainText(/replay/i);

  // play through the recorded range: every keyframe checksum must match
  await page.keyboard.press(' ');
  await expect.poll(async () => (await status(page)).replay, { timeout: 120_000 }).toBe(false);
  const after = await status(page);
  expect(after.mismatches).toBe(0);
  expect(after.verified).toBeGreaterThan(0);
});

test('comparison runs both scenarios from identical initial conditions', async ({ page }) => {
  await boot(page);
  await triggerEarthquake(page);
  await page.keyboard.press('5');
  await waitForTick(page, 300);
  await page.getByTestId('right-tab-compare').click();
  await page.getByTestId('run-compare').click();
  const results = page.getByTestId('compare-results');
  await expect(results).toBeVisible({ timeout: 170_000 });
  await expect(results.locator('tbody tr')).not.toHaveCount(0);
  await expect(results).toContainText(/Buildings collapsed/i);
});

test('scenarios can be saved locally and loaded again after reload', async ({ page }) => {
  await boot(page);
  await triggerEarthquake(page);
  await page.getByTestId('left-tab-scenarios').click();
  await page.getByTestId('save-name').fill('E2E drill');
  await page.getByTestId('save-scenario').click();
  await expect(page.getByTestId('load-saved-E2E drill')).toBeVisible();

  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __singularity?: { runtime: { client: { status: unknown } } } }).__singularity?.runtime.client.status);
  await page.getByTestId('left-tab-scenarios').click();
  await page.getByTestId('load-saved-E2E drill').click();
  await expect(page.locator('.brand-sub')).toContainText('E2E drill', { timeout: 60_000 });
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __singularity: { runtime: { client: { commands: unknown[] } } } }).__singularity.runtime.client.commands.length))
    .toBeGreaterThan(0);
});

test('keyboard shortcuts drive speed, cinematic mode and diagnostics', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('3');
  await expect.poll(async () => (await status(page)).speed).toBe(2);
  await page.keyboard.press('g');
  await expect(page.getByTestId('diagnostics')).toBeVisible();
  await page.keyboard.press('c');
  await expect(page.locator('.app.cinematic')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.app.cinematic')).toHaveCount(0);
});

test('onboarding tour can be stepped through and dismissed', async ({ page }) => {
  await boot(page, { tour: '1' });
  await expect(page.getByTestId('tour')).toBeVisible();
  await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('tour')).toContainText(/Step 2/);
  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('layout fits a phone without horizontal scrolling', async ({ page }) => {
    await boot(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('play-toggle')).toBeVisible();
    await expect(page.getByTestId('sim-clock')).toBeVisible();
  });
});
