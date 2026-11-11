import { test, expect, login, switchAccount } from './fixtures';
import { mkdir } from 'node:fs/promises';
test('四种屏宽截图与13主页面可用，无整页横向滚动', async ({ page }, testInfo) => {
  await mkdir('docs/evidence/screenshots', { recursive: true });
  async function capture(name: string) {
    await page.waitForLoadState('networkidle');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      name + ' horizontal overflow',
    ).toBe(true);
    await page.screenshot({
      path: `docs/evidence/screenshots/${testInfo.project.name}-${page.viewportSize()!.width}-${name}.png`,
      fullPage: true,
    });
  }
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    if (width !== 320) await page.evaluate(() => sessionStorage.clear());
    await page.goto('/?capture=' + width + '#/login');
    await expect(page.getByRole('button', { name: '演示登录', exact: true })).toBeVisible();
    await capture('login');
    await login(page, 'demo_a', '/activities/act-multi');
    await expect(page.getByRole('heading', { name: '城市山野安全联合演练' })).toBeVisible();
    await capture('detail');
    await page.goto('/#/activities/act-position/register');
    await expect(page.locator('[data-question]')).toHaveCount(8);
    await capture('form');
    await page.goto('/#/my/insurance');
    await expect(page.getByRole('heading', { name: '我的保险' })).toBeVisible();
    await capture('insurance');
    await switchAccount(page, 'demo_lead');
    await page.goto('/#/managed/activities/act-open/onsite');
    await expect(page.getByRole('heading', { name: '场次考勤码' })).toBeVisible();
    await capture('onsite');
    await switchAccount(page, 'demo_a');
  }
  for (const path of [
    '/activities',
    '/my/activities',
    '/my/participation',
    '/my',
    '/activities/act-history',
  ]) {
    await page.goto('/#' + path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).not.toBeEmpty();
  }
});
