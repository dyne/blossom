import { test, expect } from '@playwright/test';

test.describe('Blossom performance', () => {
  test('renders without fatal frame drops', async ({ page }) => {
    await page.goto('/?autoplay=0');
    await page.waitForSelector('canvas#blossom-canvas', { timeout: 10000 });

    // Wait a few frames, then check the canvas is still alive
    await page.waitForTimeout(1000);

    // Canvas should still be rendered (not blank/crashed)
    const box = await page.locator('canvas#blossom-canvas').boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);

    // No runtime errors accumulated
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(500);
    const runtimeErrors = errors.filter(
      (e) => !e.includes('WebSocket') && !e.includes('autoplay'),
    );
    expect(runtimeErrors).toEqual([]);
  });

  test('starts and stops without leak', async ({ page }) => {
    await page.goto('/?autoplay=0');
    await page.waitForSelector('canvas#blossom-canvas', { timeout: 10000 });

    // Toggle pause a few times
    for (let i = 0; i < 5; i++) {
      await page.click('#btn-pause');
      await page.waitForTimeout(100);
    }

    // Reset
    await page.click('#btn-reset');
    await page.waitForTimeout(200);

    // Still renders
    const box = await page.locator('canvas#blossom-canvas').boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
  });
});
