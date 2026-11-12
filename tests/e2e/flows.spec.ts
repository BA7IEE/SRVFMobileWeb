import {
  test,
  expect,
  login,
  confirm,
  panel,
  scenario,
  switchAccount,
  registerSimple,
} from './fixtures';
import QR from 'qrcode';
test('01 深链接登录 → 报名 → 逐场结果 → 我的活动', async ({ page }) => {
  await login(page, 'demo_a', '/activities/act-open');
  await expect(page.getByRole('heading', { name: '周末应急救护公益培训' })).toBeVisible();
  await page.getByRole('button', { name: '报名参加', exact: true }).click();
  await registerSimple(page);
  await page.goto('/#/my/activities');
  await expect(page.getByText('上午场', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('候补中', { exact: true })).toBeVisible();
});
test('02 保险登记待审 → 原报名草稿 → 测试审核 → 重验资格', async ({ page }) => {
  await login(page, 'demo_a', '/activities/act-open/register');
  await scenario(page, 'INS-MISSING');
  await page.getByLabel('参加本场次').check();
  await page.getByLabel('明确确认').check();
  await page.getByRole('link', { name: '查看保障与登记资料' }).click();
  await page.getByRole('button', { name: '新增登记', exact: true }).click();
  await page.getByLabel('保险公司', { exact: true }).fill('合成演示保障');
  await page.getByLabel('保单号', { exact: true }).fill('SYNTHETIC-ONLY-NEW');
  await page.getByLabel('到期日期', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: '保存资料（演示）' }).click();
  await expect(page.getByText('待审核', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '返回原活动报名并重新核对资格' }).click();
  await expect(page.getByLabel('参加本场次')).toBeChecked();
  await expect(page.getByRole('button', { name: '核对并提交报名' })).toBeDisabled();
  await panel(page);
  await page.getByRole('button', { name: '测试控制：保险审核通过' }).click();
  await expect(page.getByText('满足演示条件', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '核对并提交报名' }).click();
  await confirm(page);
  await expect(page.getByText('报名已提交（演示）', { exact: true })).toBeVisible();
});
test('03 仅统保身份无需重复登记自购', async ({ page }) => {
  await login(page, 'demo_b', '/my/insurance');
  await expect(page.getByText('演示队伍统一保障', { exact: true })).toBeVisible();
  await expect(page.getByText('暂无自购登记，不等于没有队伍统保。')).toBeVisible();
  await page.goto('/#/activities/act-open/register');
  await expect(page.getByText('来自队伍统一保障，无需重复登记自购保险。')).toBeVisible();
  await registerSimple(page);
});
test('04 并发续期、会话过期、受控重新登录', async ({ page }) => {
  await login(page);
  await panel(page);
  await page.getByRole('button', { name: '同时发起 5 次模拟续期' }).click();
  await expect(page.getByText('5 个调用已结束，累计续期执行 1 次')).toBeVisible();
  await page.getByRole('button', { name: '模拟会话失效', exact: true }).click();
  await page.locator('.dev-panel').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('button', { name: '演示登录', exact: true })).toBeVisible();
});
test('05 签到 → 重复扫 → 最短时段 → 推时钟 → 签退', async ({ page }) => {
  await login(page, 'demo_a', '/activities/act-open/register');
  await registerSimple(page);
  await page.getByRole('link', { name: '进入本场次考勤' }).click();
  await page.getByRole('button', { name: '使用预置演示码' }).click();
  await confirm(page);
  await expect(page.getByRole('heading', { name: '签到已记录（演示）' })).toBeVisible();
  await expect(page.getByText(/最早签退时间/)).toBeVisible();
  await page.getByRole('button', { name: '使用预置演示码' }).click();
  await confirm(page);
  await expect(page.getByText('未到允许签退时间，请稍后重新读取')).toBeVisible();
  await panel(page);
  await page.getByRole('button', { name: '推进模拟时间 30 分钟' }).click();
  await page.getByRole('button', { name: '使用预置演示码' }).click();
  await confirm(page);
  await expect(page.getByRole('heading', { name: '签退已记录（演示）' })).toBeVisible();
  await expect(page.getByText('已有历史现场服务段，不代表从未签到')).toBeVisible();
  await page.goto('/#/my/participation');
  await expect(page.getByText('待认定', { exact: true }).first()).toBeVisible();
});
test('06 职责隔离、跨活动拒绝、撤权后清空名单', async ({ page }) => {
  await login(page, 'demo_reg', '/managed/activities');
  await expect(page.getByRole('link', { name: '报名管理', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '现场考勤工作台', exact: true })).toHaveCount(0);
  await page.goto('/#/managed/activities/act-open/onsite');
  await expect(page).toHaveURL(/#\/system\/forbidden$/);
  await expect(page.getByRole('heading', { name: '暂无此活动的操作权限' })).toBeVisible();
  await page.goto('/#/managed/activities/act-multi/registrations');
  await expect(page).toHaveURL(/#\/system\/forbidden$/);
  await expect(page.getByRole('heading', { name: '暂无此活动的操作权限' })).toBeVisible();
  await page.goto('/#/managed/activities/act-open/registrations');
  await expect(page.getByRole('heading', { name: '报名管理', exact: true })).toBeVisible();
  await scenario(page, 'STAFF-06');
  await expect(
    page.getByText(/当前活动职责未授予或已撤销|暂无此活动的操作权限/).first(),
  ).toBeVisible();
  await expect(page.getByText('DEMO-001 演示队员 A', { exact: true })).toHaveCount(0);
  await switchAccount(page, 'demo_onsite');
  await scenario(page, 'DEFAULT');
  await page.goto('/#/managed/activities/act-open/registrations');
  await expect(page.getByRole('heading', { name: '暂无此活动的操作权限' })).toBeVisible();
});
test('07 代签原因必填、确认目标、名单状态一致', async ({ page }) => {
  await login(page, 'demo_onsite', '/managed/activities/act-open/onsite/people');
  await page.getByLabel('核验目标').selectOption('identity-member-a');
  await page.getByRole('button', { name: '核对并执行受控操作' }).click();
  await expect(page.getByText('请填写代签 / 代退原因')).toBeVisible();
  await page.getByLabel('核验原因').fill('合成场景现场核验');
  await page.getByRole('button', { name: '核对并执行受控操作' }).click();
  await confirm(page);
  await expect(page.getByRole('heading', { name: '现场操作已记录（演示）' })).toBeVisible();
  await expect(page.getByText('当前在场（演示）', { exact: true })).toBeVisible();
});
test('08 保险并发冲突先刷新，不强制覆盖', async ({ page }) => {
  await login(page, 'demo_a', '/my/insurance');
  await scenario(page, 'INS-08');
  await page.getByRole('button', { name: '修改资料', exact: true }).click();
  await page.getByLabel('保险公司', { exact: true }).fill('更新的合成公司');
  await page.getByRole('button', { name: '保存资料（演示）' }).click();
  await expect(page.getByText('资料已发生变化，请刷新后核对')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存资料（演示）' })).toBeDisabled();
  await page.getByRole('button', { name: '刷新当前资料并核对' }).click();
  await expect(page.getByLabel('保险公司', { exact: true })).toHaveValue('更新的合成公司');
  await page.getByRole('button', { name: '保存资料（演示）' }).click();
  await expect(page.getByText('待审核', { exact: true })).toBeVisible();
});
test('09 报名回执丢失先查询，刷新后不生成替代意图', async ({ page }) => {
  await login(page, 'demo_a', '/activities/act-open/register');
  await scenario(page, 'REG-06');
  await page.getByLabel('参加本场次').check();
  await page.getByLabel('明确确认').check();
  await page.getByRole('button', { name: '核对并提交报名' }).click();
  await confirm(page);
  await expect(page.getByRole('button', { name: '查询原报名结果' })).toBeVisible();
  await expect(page.getByRole('button', { name: '核对并提交报名' })).toBeDisabled();
  await page.getByRole('button', { name: '查询原报名结果' }).click();
  await expect(page.getByText('报名已提交（演示）', { exact: true })).toBeVisible();
  await page.reload();
  await page.goto('/#/my/activities');
  await expect(page.getByRole('heading', { name: '周末应急救护公益培训' })).toHaveCount(1);
});
test('10 换账号与后退，旧保单、草稿、二维码不复现', async ({ page }) => {
  await login(page, 'demo_a', '/my/insurance');
  await expect(page.getByText('演示保障公司', { exact: true })).toBeVisible();
  await page.goto('/#/activities/act-position/register');
  await page.getByLabel('现场称呼', { exact: false }).fill('只属于 A 的合成草稿');
  await switchAccount(page, 'demo_b');
  await page.goBack();
  await page.goto('/#/my/insurance');
  await expect(page.getByText('演示保障公司', { exact: true })).toHaveCount(0);
  await page.goto('/#/activities/act-position/register');
  await expect(page.getByLabel('现场称呼', { exact: false })).toHaveValue('');
});
test('11 普通产物未接线，URL与存储不能强开mock', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?mock=1#/login');
  await expect(page.getByRole('heading', { name: '服务尚未接通' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('VITE_DATA_SOURCE', 'mock'));
  await page.reload();
  await expect(page.getByRole('heading', { name: '服务尚未接通' })).toBeVisible();
  await expect(page.getByRole('button', { name: '演示登录' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '打开演示场景面板' })).toHaveCount(0);
});
test('12 全流程静态网络与实际二维码图片识别', async ({ page }) => {
  await login(page, 'demo_onsite', '/managed/activities/act-open/onsite');
  await page.getByRole('button', { name: '生成演示码' }).click();
  await confirm(page);
  await expect(page.getByRole('dialog', { name: /上午场/ })).toBeVisible();
  await expect(page.locator('.qr-image')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: '关闭二维码', exact: true }).click();
  await page.getByRole('link', { name: '人员核验与异常处理' }).click();
  await page.getByLabel('核验目标').selectOption('identity-member-a');
  const bytes = await QR.toBuffer('SRVF-DEMO:member:member-a', { width: 400 });
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'synthetic-qr.png', mimeType: 'image/png', buffer: bytes });
  await confirm(page);
  await expect(page.getByRole('heading', { name: '现场操作已记录（演示）' })).toBeVisible();
  const response = await page.request.get('/');
  expect(response.headers()['content-security-policy']).toContain("connect-src 'none'");
});
