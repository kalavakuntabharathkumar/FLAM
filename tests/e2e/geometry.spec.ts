import { test, expect, type Page } from '@playwright/test';

const surfaces = [
  'Mobile Portrait',
  'Mobile Landscape',
  'Broadcast Lower Third',
  'Retail Kiosk',
  'Unknown 713 × 287',
];

/**
 * `.ad-frame` and `.ad-element` animate on different transition durations
 * (360ms vs 300ms — see styles.css), so reading boundingBox() immediately
 * after a surface switch can capture a mid-transition frame where the
 * element's position and the frame's position are momentarily out of sync
 * with each other, even though the underlying resolved layout is correct.
 *
 * This polls getBoundingClientRect() for the frame and every element until
 * two consecutive snapshots (50ms apart) are identical, meaning all CSS
 * transitions have finished. Bounded at 1s (20 * 50ms) so a genuine layout
 * bug still fails fast instead of hanging.
 */
async function waitForStableLayout(page: Page): Promise<void> {
  let previous: string | null = null;

  for (let i = 0; i < 20; i++) {
    const snapshot = await page.evaluate(() => {
      const frame = document.querySelector('.ad-frame');
      const els = [...document.querySelectorAll('.ad-element')];
      const rects = [frame, ...els].map(el => {
        if (!el) return 'none';
        const r = el.getBoundingClientRect();
        return `${r.x.toFixed(2)},${r.y.toFixed(2)},${r.width.toFixed(2)},${r.height.toFixed(2)}`;
      });
      return rects.join('|');
    });

    if (snapshot === previous) {
      return;
    }

    previous = snapshot;
    await page.waitForTimeout(50);
  }
}

test('all visible DOM geometry stays inside the complete logical frame', async ({ page }) => {
  await page.goto('/');

  for (const name of surfaces) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await waitForStableLayout(page);

    const frame = await page.locator('.ad-frame').boundingBox();
    expect(frame).not.toBeNull();

    const els = page.locator('.ad-element');
    for (let i = 0; i < await els.count(); i++) {
      const b = await els.nth(i).boundingBox();
      expect(b).not.toBeNull();
      expect(b!.x).toBeGreaterThanOrEqual(frame!.x - 1);
      expect(b!.y).toBeGreaterThanOrEqual(frame!.y - 1);
      expect(b!.x + b!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1);
      expect(b!.y + b!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
    }

    const overlapCount = await page.locator('.ad-frame').evaluate(frameEl => {
      const children = [...frameEl.querySelectorAll<HTMLElement>('.ad-element')];
      const rects = children.map(el => el.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++;
        }
      }
      return overlaps;
    });
    expect(overlapCount).toBe(0);

    const textFit = await page.locator('.ad-frame').evaluate(frameEl => {
      const nodes = [...frameEl.querySelectorAll<HTMLElement>('.ad-element.text, .ad-element.logo')];
      return nodes.map(el => ({
        id: el.dataset.element,
        fitsWidth: el.scrollWidth <= el.clientWidth + 1,
        fitsHeight: el.scrollHeight <= el.clientHeight + 1,
      }));
    });
    for (const item of textFit) {
      expect(item.fitsWidth, `${item.id} text overflows horizontally`).toBe(true);
      expect(item.fitsHeight, `${item.id} text overflows vertically`).toBe(true);
    }

    const scale = await page.locator('.ad-frame').getAttribute('data-scale');
    expect(Number(scale)).toBeGreaterThan(0);
  }
});