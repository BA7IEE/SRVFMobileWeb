import { test, expect, login, panel, confirm } from './fixtures';
import type { Page } from '@playwright/test';

async function revokeScopeInPlace(page: Page) {
  const current = page.url();
  await panel(page);
  await page
    .getByRole('button', { name: '测试控制：撤销当前活动职责（保留页面）', exact: true })
    .click();
  await expect(page.locator('.dev-panel')).toBeHidden();
  await expect(page.locator('.van-overlay:visible')).toHaveCount(0);
  await expect(page).toHaveURL(current);
}

async function expectDenied(page: Page) {
  const alert = page.getByRole('alert').filter({ hasText: '当前活动的操作权限已失效' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('当前活动职责未授予或已撤销');
  const back = page.getByRole('link', { name: '返回我负责的活动', exact: true });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '#/managed/activities');
  await expect(page.getByRole('button', { name: '重新读取权限与数据', exact: true })).toBeVisible();
  await expect(page.locator('.qr-image')).toHaveCount(0);
  await expect(page.getByText('DEMO-001 演示队员 A', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '现场操作已记录（演示）', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^本次成功/ })).toHaveCount(0);
}

async function retryReadsOnly(page: Page) {
  await page.getByRole('button', { name: '重新读取权限与数据', exact: true }).click();
  await expect(page.getByRole('button', { name: '重新读取权限与数据', exact: true })).toBeEnabled();
  await expect(page.getByText('正在读取…', { exact: true })).toHaveCount(0);
  await expectDenied(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('F01 已加载的现场页局部二维码读取失权，独立提示与安全返回实际可见', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page, 'demo_onsite', '/managed/activities/act-open/onsite');
  await expect(page.getByText('本场次参与人数', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '生成演示码', exact: true }).click();
  await confirm(page);
  await expect(page.getByRole('dialog', { name: '上午场 · 签到码' })).toBeVisible();
  await expect(page.locator('.qr-image')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: '关闭二维码', exact: true }).click();
  await expect(page.locator('.van-overlay:visible')).toHaveCount(0);
  await expect(page.getByText('有效演示码', { exact: true })).toBeVisible();
  await revokeScopeInPlace(page);
  // 控制只撤职责，不重建页面；先确认当前成功内容仍在，再触发局部读请求。
  await expect(page.getByText('本场次参与人数', { exact: true })).toBeVisible();
  await expect(page.getByText('有效演示码', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '刷新二维码状态', exact: true }).click();
  await expectDenied(page);
  await expect(page.getByText('本场次参与人数', { exact: true })).toHaveCount(0);
  await expect(page.getByText('有效演示码', { exact: true })).toHaveCount(0);
  await retryReadsOnly(page);
  await page.screenshot({
    path: testInfo.outputPath('onsite-local-forbidden-320.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: '返回我负责的活动', exact: true }).click();
  await expect(page).toHaveURL(/#\/managed\/activities$/);
  await expect(
    page.getByRole('heading', { name: '当前没有可管理的活动', exact: true }),
  ).toBeVisible();
});

test('F01 已加载的人员页代签返回失权，旧名单和回执移除后仍有提示及返回入口', async ({ page }) => {
  await login(page, 'demo_onsite', '/managed/activities/act-open/onsite/people');
  await expect(
    page.locator('.session-row strong').filter({ hasText: 'DEMO-001 演示队员 A' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: /^核验目标/ }).selectOption('identity-member-a');
  await page.getByLabel('核验原因', { exact: true }).fill('合成现场核验');
  await page.getByRole('button', { name: '核对并执行受控操作', exact: true }).click();
  await confirm(page);
  await expect(
    page.getByRole('heading', { name: '现场操作已记录（演示）', exact: true }),
  ).toBeVisible();
  await page.getByLabel('核验原因', { exact: true }).fill('第二次合成核验');
  await revokeScopeInPlace(page);
  await expect(
    page.locator('.session-row strong').filter({ hasText: 'DEMO-001 演示队员 A' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '核对并执行受控操作', exact: true }).click();
  await confirm(page);
  await expectDenied(page);
  await retryReadsOnly(page);
});

test('F01 已加载的报名管理审核失权，有独立反馈且不显示成空名单', async ({ page }) => {
  await login(page, 'demo_reg', '/managed/activities/act-open/registrations');
  await expect(page.getByLabel('DEMO-001 演示队员 A', { exact: true })).toBeVisible();
  await page.getByLabel('DEMO-001 演示队员 A', { exact: true }).check();
  await expect(page.getByRole('button', { name: '审核已选 1 人', exact: true })).toBeEnabled();
  await revokeScopeInPlace(page);
  await expect(page.getByLabel('DEMO-001 演示队员 A', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: '审核已选 1 人', exact: true }).click();
  await confirm(page);
  await expectDenied(page);
  await expect(
    page.getByRole('heading', { name: '没有符合条件的报名记录', exact: true }),
  ).toHaveCount(0);
  await retryReadsOnly(page);
});

test('F01 旧权限确认框遇读取失权后关闭并清资料，提示与返回不被遮挡', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page, 'demo_onsite', '/managed/activities/act-open/onsite/people');
  await expect(
    page.locator('.session-row strong').filter({ hasText: 'DEMO-001 演示队员 A' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: /^核验目标/ }).selectOption('identity-member-a');
  await page.getByLabel('核验原因', { exact: true }).fill('只属于旧权限的合成核验原因');
  await revokeScopeInPlace(page);
  await expect(
    page.locator('.session-row strong').filter({ hasText: 'DEMO-001 演示队员 A' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '核对并执行受控操作', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toContainText('identity-member-a');
  await expect(confirmation).toContainText('DEMO-001 演示队员 A');
  // 只读恢复触发forbidden，不点击旧确认框的确认，不发起代签写入。
  await page.evaluate(() => window.dispatchEvent(new Event('srvf:resume')));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.van-overlay:visible')).toHaveCount(0);
  await expect(page.getByText(/identity-member-a/)).toHaveCount(0);
  await expect(page.getByText(/只属于旧权限的合成核验原因/)).toHaveCount(0);
  await expectDenied(page);
  const back = page.getByRole('link', { name: '返回我负责的活动', exact: true });
  await back.scrollIntoViewIfNeeded();
  await expect(back).toBeInViewport({ ratio: 1 });
  await back.click({ trial: true });
  await page.screenshot({
    path: testInfo.outputPath('people-confirmation-forbidden-320.png'),
    fullPage: true,
  });
  await back.click();
  await expect(page).toHaveURL(/#\/managed\/activities$/);
  await expect(
    page.getByRole('heading', { name: '当前没有可管理的活动', exact: true }),
  ).toBeVisible();
});
