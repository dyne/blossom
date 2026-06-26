import { test, expect } from '@playwright/test';

test.describe('Blossom smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?autoplay=0');
    await page.waitForSelector('canvas#blossom-canvas', { timeout: 10000 });
  });

  test('renders canvas with toolbar', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('WebSocket')) {
        errors.push(msg.text());
      }
    });

    await expect(page.locator('#toolbar')).toBeVisible();
    await expect(page.locator('#btn-connect')).toBeVisible();
    await expect(page.locator('#btn-pause')).toBeVisible();
    await expect(page.locator('#btn-fit')).toBeVisible();
    await expect(page.locator('#btn-reset')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('canvas has non-zero dimensions', async ({ page }) => {
    const box = await page.locator('canvas#blossom-canvas').boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('reset button clears state', async ({ page }) => {
    await page.click('#btn-reset');
    await expect(page.locator('canvas#blossom-canvas')).toBeVisible();
  });

  test('fit button works without crash', async ({ page }) => {
    await page.click('#btn-fit');
    await expect(page.locator('canvas#blossom-canvas')).toBeVisible();
  });

  test('pause button toggles state', async ({ page }) => {
    await page.click('#btn-pause');
    await expect(page.locator('#btn-pause')).toHaveText('resume');
    await page.click('#btn-pause');
    await expect(page.locator('#btn-pause')).toHaveText('pause');
  });

  test('controls do not overlap canvas', async ({ page }) => {
    const canvasBox = await page.locator('canvas#blossom-canvas').boundingBox();
    const toolbarBox = await page.locator('#toolbar').boundingBox();
    expect(canvasBox).toBeTruthy();
    expect(toolbarBox).toBeTruthy();
    expect(toolbarBox!.y + toolbarBox!.height).toBeLessThan(canvasBox!.height * 0.5);
  });
});

test.describe('Blossom responsive', () => {
  test('status text hidden at 375px width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/?autoplay=0');
    await page.waitForSelector('canvas#blossom-canvas', { timeout: 10000 });

    const visible = await page.locator('#status-text').isVisible();
    expect(visible).toBe(false);
  });

  test('toolbar fits within 375px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/?autoplay=0');
    await page.waitForSelector('canvas#blossom-canvas', { timeout: 10000 });

    const toolbarBox = await page.locator('#toolbar').boundingBox();
    expect(toolbarBox!.x).toBeGreaterThanOrEqual(0);
    expect(toolbarBox!.x + toolbarBox!.width).toBeLessThanOrEqual(375);
  });
});
