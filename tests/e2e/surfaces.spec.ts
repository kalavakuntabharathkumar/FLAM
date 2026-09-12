import { test, expect } from '@playwright/test';

test('all five surfaces render valid ads', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Mobile Portrait', 'Mobile Landscape', 'Broadcast Lower Third', 'Retail Kiosk', 'Unknown 713 × 287']) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.locator('.ad-frame')).toBeVisible();
    await expect(page.locator('.status.ok')).toBeVisible();
  }
});
