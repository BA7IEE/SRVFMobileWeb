import { test, expect, login, switchAccount, scenario } from './fixtures';
import { mkdir, writeFile } from 'node:fs/promises';
test('四种屏宽完成态截图，长文案多记录及页尾可达', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await mkdir('docs/evidence/screenshots', { recursive: true });
  const evidence: { file: string; state: 'ready'; width: number; checks: string[] }[] = [];
  async function capture(name: string, checks: string[]) {
    await expect(page.locator('.dev-panel')).toBeHidden();
    await expect(page.locator('.van-overlay')).toBeHidden();
    await expect(page.getByText('正在读取…', { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      name + ' horizontal overflow',
    ).toBe(true);
    const width = page.viewportSize()!.width;
    const file = `${testInfo.project.name}-${width}-${name}.png`;
    await page.screenshot({
      path: `docs/evidence/screenshots/${file}`,
      fullPage: true,
    });
    evidence.push({ file, state: 'ready', width, checks });
  }
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    if (width !== 320) await page.evaluate(() => sessionStorage.clear());
    await page.goto('/?capture=' + width + '#/login');
    await expect(page.getByRole('button', { name: '演示登录', exact: true })).toBeVisible();
    await capture('login', ['演示登录可操作']);
    await login(page, 'demo_a', '/activities/act-multi');
    await expect(page.getByRole('heading', { name: '城市山野安全联合演练' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '场次与岗位' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '下午场 · 次日', exact: true })).toBeVisible();
    await capture('detail', ['实际场次和岗位区已出现']);
    await page.goto('/#/activities/act-position/register');
    await expect(page.locator('[data-question]')).toHaveCount(8);
    await expect(page.getByRole('button', { name: '核对并提交报名' })).toBeVisible();
    await capture('form', ['八类题目已渲染', '提交操作存在']);
    await page.goto('/#/my/insurance');
    await scenario(page, 'INS-LAYOUT');
    await expect(page.getByRole('heading', { name: '队伍统一保险' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '本人登记的自购保险' })).toBeVisible();
    await expect(page.locator('h3')).toHaveCount(5);
    await expect(
      page.getByText('SYNTHETIC-LAYOUT-ONLY-'.repeat(6).slice(0, 128), { exact: false }),
    ).toBeVisible();
    for (const status of ['团队保障（演示）', '已审核（演示）', '待审核', '审核未通过'])
      await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
    const footer = page.getByRole('button', { name: '删除登记', exact: true }).last();
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport({ ratio: 1 });
    await footer.click({ trial: true });
    await capture('insurance', [
      '统保2条、自购3条已加载',
      '长名称及128字符保单号',
      '三种审核状态',
      '最后一条记录删除操作滚动可达',
    ]);
    await scenario(page, 'DEFAULT');
    await switchAccount(page, 'demo_lead');
    await page.goto('/#/managed/activities/act-open/onsite');
    await expect(page.getByRole('heading', { name: '场次考勤码' })).toBeVisible();
    await expect(page.getByText('本场次参与人数', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '生成演示码', exact: true })).toBeVisible();
    await capture('onsite', ['现场统计及生成考勤码操作已加载']);
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
  await writeFile(
    `docs/evidence/layout-${testInfo.project.name}.json`,
    JSON.stringify(evidence, null, 2) + '\n',
  );
});
