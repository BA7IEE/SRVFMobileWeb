import { test, expect, login, scenario } from './fixtures';
import { writeFile } from 'node:fs/promises';

test('R2 启动身份读取首次失败，点击重新确认身份后恢复业务页', async ({ page }) => {
  await login(page);
  await scenario(page, 'AUTH-RESTORE-ONCE');
  await page.reload();
  await expect(page.getByRole('heading', { name: '暂时无法确认身份' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '一起行动', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '重新确认身份', exact: true }).click();
  await expect(page).toHaveURL(/#\/activities$/);
  await expect(page.getByRole('heading', { name: '一起行动', exact: true })).toBeVisible();
  await expect(page.getByText('周末应急救护公益培训', { exact: true })).toBeVisible();
});

test('R4 保险加载、空记录、服务错误、权限拒绝分别留证', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await login(page, 'demo_a', '/my/insurance');
  await expect(page.getByRole('heading', { name: '队伍统一保险' })).toBeVisible();
  await page.clock.install();
  const evidence: { file: string; state: string; width: number; checks: string[] }[] = [];
  async function capture(state: string, checks: string[]) {
    await expect(page.locator('.dev-panel')).toBeHidden();
    await expect(page.locator('.van-overlay')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const width = page.viewportSize()!.width;
    const file = `${testInfo.project.name}-${width}-insurance-${state}.png`;
    await page.screenshot({
      path: testInfo.outputPath(file),
      fullPage: true,
      animations: 'disabled',
    });
    evidence.push({ file, state, width, checks });
  }
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await scenario(page, 'INS-SLOW');
    await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 100));
    await expect(page.getByText('正在读取…', { exact: true })).toBeVisible();
    await capture('loading', ['保险异步读取尚未完成']);
    await expect(page.getByText('正在读取…', { exact: true })).toBeVisible();
    await page.clock.runFor(2500);
    await expect(page.getByRole('heading', { name: '队伍统一保险' })).toBeVisible();
    await page.clock.resume();
    await scenario(page, 'INS-EMPTY');
    await expect(page.getByText('当前演示读面暂无本人统保记录。', { exact: true })).toBeVisible();
    await expect(
      page.getByText('暂无自购登记，不等于没有队伍统保。', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('正在读取…', { exact: true })).toHaveCount(0);
    await capture('empty', ['两类记录均为空', '读取完成']);
    await scenario(page, 'INS-ERROR');
    await expect(page.getByRole('alert')).toContainText('保险资料暂不可用');
    await expect(page.getByRole('heading', { name: '队伍统一保险' })).toHaveCount(0);
    await capture('error', ['显示服务错误', '旧资料已清除']);
    await scenario(page, 'INS-FORBIDDEN');
    await expect(page.getByRole('alert')).toContainText('当前身份无权读取保险资料');
    await expect(page.getByRole('heading', { name: '队伍统一保险' })).toHaveCount(0);
    await capture('forbidden', ['显示权限拒绝', '未当作空记录或已授权']);
    await scenario(page, 'DEFAULT');
    await expect(page.getByRole('heading', { name: '队伍统一保险' })).toBeVisible();
  }
  await writeFile(
    testInfo.outputPath(`insurance-states-${testInfo.project.name}.json`),
    JSON.stringify(evidence, null, 2) + '\n',
  );
});
