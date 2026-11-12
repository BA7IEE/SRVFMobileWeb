import { test, expect, login, panel, scenario, switchAccount, confirm } from './fixtures';
import type { Page } from '@playwright/test';

async function layoutFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function clickable(page: Page, name: string) {
  const control = page.getByRole('button', { name, exact: true });
  await control.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest' }),
  );
  await expect(control).toBeInViewport({ ratio: 1 });
  await control.click({ trial: true });
}

test('移动导航：分页列表返回保留结果和位置，快速输入离页也保留筛选，换账号隔离', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page);
  await expect(page.locator('.activity-card')).toHaveCount(3);
  await page.getByRole('button', { name: '加载更多', exact: true }).click();
  await expect(page.locator('.activity-card')).toHaveCount(5);
  const last = page.locator('.activity-card').last();
  const title = await last.locator('h2').innerText();
  await last.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  expect(scroll).toBeGreaterThan(200);
  await last.click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.activity-card')).toHaveCount(5);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll - 60);
  await expect(page.locator('.activity-card').last()).toBeInViewport();
  await page.getByLabel('搜索活动', { exact: true }).fill('演练');
  // 在输入防抖结束前离开，偏好仍需保存。
  await page.getByRole('tab', { name: '我的', exact: true }).click();
  await page.getByRole('tab', { name: '活动', exact: true }).click();
  await expect(page.getByLabel('搜索活动', { exact: true })).toHaveValue('演练');
  await expect(page.locator('.activity-card')).toHaveCount(1);
  await switchAccount(page, 'demo_b');
  await expect(page.getByLabel('搜索活动', { exact: true })).toHaveValue('');
  await expect(page.locator('.activity-card')).toHaveCount(3);
});

test('安全返回：深链接无站内历史可返回父页，身份读取失败和过期登录回到原场次', async ({
  page,
  context,
}) => {
  const target = '/activities/act-multi/sessions/session-am/attendance';
  await login(page, 'demo_a', target);
  await expect(page.getByRole('heading', { name: '当前不在场', exact: true })).toBeVisible();
  const storage = await page.evaluate(() => Object.entries(sessionStorage));
  const fresh = await context.newPage();
  await fresh.addInitScript(
    (entries) => entries.forEach(([key, value]) => sessionStorage.setItem(key, value)),
    storage,
  );
  await fresh.goto('/#' + target);
  await expect(
    fresh.getByRole('heading', { name: '城市山野安全联合演练', exact: true }),
  ).toBeVisible();
  await fresh.getByRole('button', { name: '返回', exact: true }).click();
  await expect(fresh).toHaveURL(/#\/my\/activities$/);
  await expect(fresh.getByRole('heading', { name: '我的活动', exact: true })).toBeVisible();
  await fresh.close();
  await scenario(page, 'AUTH-RESTORE-ONCE');
  await page.reload();
  await expect(page.getByRole('heading', { name: '暂时无法确认身份' })).toBeVisible();
  await page.getByRole('button', { name: '重新确认身份', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('#' + target + '$'));
  await expect(page.getByRole('heading', { name: '当前不在场', exact: true })).toBeVisible();
  await panel(page);
  await page.getByRole('button', { name: '模拟会话失效', exact: true }).click();
  await expect(page.getByRole('button', { name: '演示登录', exact: true })).toBeVisible();
  await page.locator('.dev-panel').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.van-overlay:visible')).toHaveCount(0);
  await page.getByPlaceholder('请输入演示账号').fill('demo_a');
  await page.getByPlaceholder('请输入演示密码').fill('demo-only');
  await page.getByRole('button', { name: '演示登录', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('#' + target + '$'));
  await expect(page.getByRole('heading', { name: '当前不在场', exact: true })).toBeVisible();
});

for (const width of [320, 375, 390, 430]) {
  test(`移动表单 ${width}：首错定位、八类题、0值、志愿摘要和矮屏页尾提交`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 568 });
    await login(page, 'demo_a', '/activities/act-position/register');
    await expect(page.locator('[data-question]')).toHaveCount(8);
    await page.getByRole('button', { name: '核对并提交报名', exact: true }).click();
    await expect(page.locator('#registration-sessions')).toBeFocused();
    await expect(page.locator('#registration-sessions')).toBeInViewport();
    await page.getByLabel('参加本场次').check();
    await page.getByLabel('宣讲协作', { exact: true }).check();
    await page.getByRole('button', { name: '核对并提交报名', exact: true }).click();
    await expect(page.getByLabel('现场称呼', { exact: false })).toBeFocused();
    await expect(page.getByLabel('现场称呼', { exact: false })).toBeInViewport();
    await page.getByLabel('现场称呼', { exact: false }).fill('仅供本地演练的称呼');
    await page
      .getByLabel('相关经验与需要说明的事项', { exact: false })
      .fill('合成说明'.repeat(100));
    await page.getByLabel('可携带装备数量', { exact: false }).fill('0');
    await page.getByLabel('可参与日期', { exact: false }).fill('2026-11-21');
    await page.getByLabel('到场方式', { exact: false }).selectOption('自行到场');
    await page.getByLabel('救护', { exact: true }).check();
    await page.locator('#q-material').setInputFiles({
      name: 'synthetic-local.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('synthetic-only'),
    });
    await page.getByLabel('明确确认').check();
    const summary = page.getByRole('region', { name: '报名摘要', exact: true });
    await expect(summary).toContainText('上午场');
    await expect(summary).toContainText('宣讲协作');
    await summary.scrollIntoViewIfNeeded();
    await layoutFits(page);
    await clickable(page, '核对并提交报名');
    await expect(page.getByRole('button', { name: '核对并提交报名', exact: true })).toHaveCSS(
      'height',
      '48px',
    );
    if (width === 320 || width === 390)
      await page.screenshot({
        path: testInfo.outputPath(`form-${width}-ready.png`),
        fullPage: true,
      });
    await page.getByRole('button', { name: '核对并提交报名', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('上午场');
    await expect(page.getByRole('dialog')).toContainText('宣讲协作');
    await confirm(page);
    await expect(page.getByText('报名已提交（演示）', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '进入本场次考勤', exact: true })).toBeVisible();
    await layoutFits(page);
  });
}

test('演示控制在顶栏，矮屏弹层页尾可达，关闭后导航与焦点可用', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page, 'demo_a', '/my');
  const trigger = page.getByRole('button', { name: '打开演示场景面板' });
  await expect(trigger).toBeInViewport({ ratio: 1 });
  expect(await trigger.evaluate((element) => element.closest('.mock-banner') !== null)).toBe(true);
  await trigger.click();
  const reset = page.getByRole('button', { name: '重置合成数据与时钟', exact: true });
  await reset.scrollIntoViewIfNeeded();
  await expect(reset).toBeInViewport({ ratio: 1 });
  await reset.click({ trial: true });
  await page.locator('.dev-panel').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.van-overlay:visible')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/van-overflow-hidden/);
  await page.getByRole('tab', { name: '我的活动', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的活动', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '活动', exact: true }).click();
  await expect(page.getByRole('heading', { name: '活动日程', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('navigation-320-short.png'), fullPage: true });
});

test('13个主页面：三种职责下等待业务内容，末条记录和主要操作实际可达', async ({ page }) => {
  await page.goto('/#/login');
  await expect(page.getByRole('heading', { name: '登录队员端', exact: true })).toBeVisible();
  await clickable(page, '演示登录');
  await login(page);
  await expect(page.getByRole('heading', { name: '活动日程', exact: true })).toBeVisible();
  await clickable(page, '加载更多');
  await page.goto('/#/activities/act-open');
  await expect(page.getByRole('heading', { name: '场次与岗位', exact: true })).toBeVisible();
  await clickable(page, '报名参加');
  await page.getByRole('button', { name: '报名参加', exact: true }).click();
  await expect(page.getByRole('heading', { name: '选择场次与岗位', exact: true })).toBeVisible();
  await expect(page.locator('[data-question]')).toHaveCount(1);
  await clickable(page, '核对并提交报名');
  await page.goto('/#/my/activities');
  await expect(page.getByText('候补中', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '进入本场次考勤', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '城市山野安全联合演练', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('下一步：签到', { exact: true })).toBeVisible();
  await clickable(page, '出示本人成员码');
  await page.goto('/#/my/participation');
  await expect(
    page.getByRole('heading', { name: '正式认定汇总（演示）', exact: true }),
  ).toBeVisible();
  const lastRecord = page.getByRole('button', { name: '查看记录说明', exact: true }).last();
  await lastRecord.scrollIntoViewIfNeeded();
  await expect(lastRecord).toBeInViewport({ ratio: 1 });
  await lastRecord.click();
  await expect(page.getByRole('button', { name: '关闭说明', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭说明', exact: true }).click();
  await page.goto('/#/my/insurance');
  await expect(page.getByRole('heading', { name: '队伍统一保险', exact: true })).toBeVisible();
  await clickable(page, '删除登记');
  await page.goto('/#/my');
  await expect(page.getByRole('heading', { name: '演示队员 A', exact: true })).toBeVisible();
  await clickable(page, '本人成员码');
  await switchAccount(page, 'demo_reg');
  await page.goto('/#/managed/activities');
  await expect(page.getByRole('heading', { name: '我负责的活动', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '报名管理', exact: true }).click();
  await expect(page.getByLabel('DEMO-001 演示队员 A')).toBeVisible();
  await expect(page.getByText('DEMO-003 演示队员 C', { exact: true })).toBeVisible();
  await switchAccount(page, 'demo_onsite');
  await page.goto('/#/managed/activities/act-open/onsite');
  await expect(page.getByText('本场次参与人数', { exact: true })).toBeVisible();
  await clickable(page, '生成演示码');
  await page.getByRole('link', { name: '人员核验与异常处理', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本场次人员摘要', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: /^核验目标/ }).selectOption('identity-member-a');
  await page.getByLabel('核验原因', { exact: true }).fill('合成现场核验原因');
  await clickable(page, '核对并执行受控操作');
});

test('负责人上下文：搜索清选择、确认锁定对象，动作切换不遗留旧成功回执', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page, 'demo_reg', '/managed/activities/act-open/registrations');
  await expect(page.getByText('周末应急救护公益培训', { exact: true })).toBeVisible();
  await page.getByLabel('DEMO-001 演示队员 A', { exact: true }).check();
  await expect(page.getByRole('button', { name: '审核已选 1 人', exact: true })).toBeEnabled();
  await page.getByLabel('查找人员', { exact: true }).fill('DEMO-003');
  await expect(page.getByRole('button', { name: '审核已选 0 人', exact: true })).toBeDisabled();
  await expect(page.getByLabel('DEMO-001 演示队员 A', { exact: true })).toHaveCount(0);
  await page.getByLabel('查找人员', { exact: true }).fill('合成无匹配成员');
  await expect(
    page.getByRole('heading', { name: '没有符合条件的报名记录', exact: true }),
  ).toBeVisible();
  await page.getByLabel('查找人员', { exact: true }).fill('');
  await expect(page.getByRole('button', { name: '审核已选 0 人', exact: true })).toBeDisabled();
  await switchAccount(page, 'demo_onsite');
  await page.goto('/#/managed/activities/act-open/onsite/people');
  await expect(page.getByText('职责：本活动现场考勤', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: /^核验目标/ }).selectOption('identity-member-a');
  await page.getByLabel('核验原因', { exact: true }).fill('合成现场核验原因');
  await page.getByRole('button', { name: '核对并执行受控操作', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('DEMO-001 演示队员 A');
  await expect(page.getByRole('dialog')).toContainText('identity-member-a');
  for (const label of ['场次', '核验目标', '现场动作'])
    await expect(page.getByRole('combobox', { name: new RegExp('^' + label) })).toBeDisabled();
  for (const label of ['查找人员', '核验原因'])
    await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
  await confirm(page);
  await expect(
    page.getByRole('heading', { name: '现场操作已记录（演示）', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: /^现场动作/ }).selectOption('check_out');
  await expect(
    page.getByRole('heading', { name: '现场操作已记录（演示）', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('查找人员', { exact: true }).fill('无匹配合成人员');
  await expect(page.getByText('没有匹配的人员，请调整关键词', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^核验目标/ })).toHaveValue('');
  await layoutFits(page);
});

test('已报名详情优先本人结果和下一步，取消报名保持次要操作', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page, 'demo_a', '/activities/act-multi');
  await expect(page.getByText('报名已提交（演示）', { exact: true })).toBeVisible();
  await expect(page.getByText('候补中', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '报名参加', exact: true })).toHaveCount(0);
  const primary = page.getByRole('button', { name: '查看我的活动', exact: true });
  await expect(primary).toHaveClass(/van-button--primary/);
  await expect(page.getByRole('button', { name: '取消报名', exact: true })).not.toHaveClass(
    /van-button--primary/,
  );
  await clickable(page, '查看我的活动');
  await primary.click();
  await expect(page).toHaveURL(/#\/my\/activities$/);
  await expect(page.getByRole('link', { name: '进入本场次考勤', exact: true })).toBeVisible();
});
