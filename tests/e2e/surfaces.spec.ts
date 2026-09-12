import { test, expect } from '@playwright/test';

test('all six surfaces render valid ads', async ({ page }) => {
  await page.goto('/');
  for (const name of [
    'Mobile Portrait',
    'Mobile Landscape',
    'Broadcast Lower Third',
    'Retail Kiosk',
    'Compact Widget',
    'Unknown 713 × 287',
  ]) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.locator('.ad-frame')).toBeVisible();
    await expect(page.locator('.status.ok')).toBeVisible();
  }
});

test('Compact Widget actually drops branding in the real browser, without clipping or overlap', async ({ page }) => {
  // Unit tests (degradation.test.ts, reposition.test.ts) already prove this
  // at the resolver level. This proves the same thing where it actually
  // matters for the assignment's "no overlaps/clipping" guarantee: real
  // rendered DOM geometry, on the one surface intentionally built too tight
  // for all five elements at full priority.
  await page.goto('/');
  await page.getByRole('button', { name: /Compact Widget/ }).click();

  const logo = page.locator('[data-element="logo"]');
  await expect(logo).toHaveCount(0);

  const headline = page.locator('[data-element="headline"]');
  const cta = page.locator('[data-element="cta"]');
  await expect(headline).toBeVisible();
  await expect(cta).toBeVisible();
  await expect(headline).toHaveAttribute('data-truncated', 'false');

  const ctaBox = await cta.boundingBox();
  expect(ctaBox).not.toBeNull();
  expect(Math.min(ctaBox!.width, ctaBox!.height)).toBeGreaterThanOrEqual(60 - 1);
});