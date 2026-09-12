import { test, expect } from '@playwright/test';

test('extreme price stays inside its resolved box without browser clipping', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Broadcast Lower Third/ }).click();

  const price = page.locator('[data-element="price"]');
  await expect(price).toBeVisible();
  await expect(price).toHaveAttribute('data-truncated', 'false');

  const fits = await price.evaluate(el => {
    const node = el as HTMLElement;
    return node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1;
  });
  expect(fits).toBe(true);

  const overflow = await price.evaluate(el => getComputedStyle(el).overflow);
  expect(overflow).not.toBe('hidden');
});
