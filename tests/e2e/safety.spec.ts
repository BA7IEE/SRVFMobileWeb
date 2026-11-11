import { test, expect, login, panel, scenario, confirm } from './fixtures';
test('多场次多岗位志愿排序，逐场通过与候补保持区别', async ({ page }) => {
  await login(page, 'demo_b', '/activities/act-multi/register');
  const morning = page.getByRole('group', { name: '上午场', exact: true });
  const afternoon = page.getByRole('group', { name: '下午场 · 次日', exact: true });
  await morning.getByLabel('参加本场次').check();
  await morning.getByLabel('救护协作', { exact: true }).check();
  await morning.getByLabel('后勤保障', { exact: true }).check();
  await morning.getByRole('button', { name: '上移' }).click();
  await afternoon.getByLabel('参加本场次').check();
  await afternoon.getByLabel('通信联络', { exact: true }).check();
  await page.getByLabel('明确确认').check();
  await page.getByRole('button', { name: '核对并提交报名' }).click();
  await confirm(page);
  await expect(page.getByText('岗位：后勤保障', { exact: true })).toBeVisible();
  await expect(page.getByText('候补中', { exact: true })).toBeVisible();
});
test('无键保险创建回执未知，刷新后阻止替代登记', async ({ page }) => {
  await login(page, 'demo_a', '/my/insurance');
  await scenario(page, 'WIRE-05');
  await page.getByRole('button', { name: '新增登记', exact: true }).click();
  await page.getByLabel('保险公司', { exact: true }).fill('合成保障');
  await page.getByLabel('保单号', { exact: true }).fill('SYNTHETIC-UNRESOLVED');
  await page.getByLabel('到期日期', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: '保存资料（演示）' }).click();
  await expect(page.getByText('资料可能已登记，请返回列表核对，勿重复提交')).toBeVisible();
  await page.reload();
  await expect(page.getByText(/上次登记结果待核实，原始资料未保留/)).toBeVisible();
  await expect(page.getByRole('button', { name: '新增登记', exact: true })).toBeDisabled();
});
test('复制标签页恢复独立family，一页退出不会使旧页复活', async ({ page, context }) => {
  await login(page);
  const original = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('srvf:mock:v1:session')!).value.id as string,
  );
  const [other] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      window.open('/#/my', '_blank');
    }),
  ]);
  await other.waitForLoadState('networkidle');
  await expect(other.getByRole('heading', { name: '演示队员 A' })).toBeVisible();
  const restored = await other.evaluate(
    () => JSON.parse(sessionStorage.getItem('srvf:mock:v1:session')!).value.id as string,
  );
  expect(restored).not.toBe(original);
  await page.goto('/#/my');
  await page.getByRole('button', { name: '退出 / 切换账号' }).click();
  await confirm(page);
  await expect(page.getByRole('button', { name: '演示登录', exact: true })).toBeVisible();
  await other.reload();
  await expect(other.getByRole('heading', { name: '演示队员 A' })).toBeVisible();
  await expect(page.getByRole('button', { name: '演示登录', exact: true })).toBeVisible();
  await other.close();
});
test('错误密码、未绑定与恶意返回目标均有可见反馈', async ({ page }) => {
  await page.goto('/#/login?returnTo=https%3A%2F%2Foutside.invalid');
  await page.getByPlaceholder('请输入演示账号').fill('demo_a');
  await page.getByPlaceholder('请输入演示密码').fill('wrong');
  await page.getByRole('button', { name: '演示登录', exact: true }).click();
  await expect(page.getByText('演示账号或密码不正确', { exact: true })).toBeVisible();
  await page.getByPlaceholder('请输入演示密码').fill('demo-only');
  await page.getByRole('button', { name: '演示登录', exact: true }).click();
  await expect(page).toHaveURL(/#\/activities$/);
  await panel(page);
  await page.getByLabel('切换演示身份', { exact: true }).selectOption('demo_unbound');
  await page.getByRole('button', { name: '切换身份并清理当前上下文' }).click();
  await expect(page.getByRole('heading', { name: '当前成员无法准入' })).toBeVisible();
});
test('八类长表单与本地文件，保留0且错误可恢复', async ({ page }) => {
  await login(page, 'demo_a', '/activities/act-position/register');
  await page.getByLabel('参加本场次').check();
  await page.getByLabel('宣讲协作', { exact: true }).check();
  await page.getByRole('button', { name: '核对并提交报名' }).click();
  await expect(page.locator('.field-error').first()).toBeVisible();
  await page.getByLabel('现场称呼', { exact: false }).fill('合成现场称呼');
  await page.getByLabel('可携带装备数量', { exact: false }).fill('0');
  await page.getByLabel('可参与日期', { exact: false }).fill('2026-11-21');
  await page.getByLabel('到场方式', { exact: false }).selectOption('自行到场');
  await page.getByLabel('救护', { exact: true }).check();
  await page.locator('#q-material').setInputFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('synthetic-local-only'),
  });
  await expect(page.getByText(/仅本地选择，尚未上传/)).toBeVisible();
  await page.getByLabel('明确确认').check();
  await page.getByRole('button', { name: '核对并提交报名' }).click();
  await confirm(page);
  await expect(page.getByText('报名已提交（演示）', { exact: true })).toBeVisible();
});
test('表单版本变化拒绝旧表单，刷新后保留安全输入', async ({ page }) => {
  await login(page, 'demo_a', '/activities/act-open/register');
  await scenario(page, 'REG-04');
  await page.getByLabel('参加本场次').check();
  await page.getByLabel('明确确认').check();
  await page.getByRole('button', { name: '核对并提交报名' }).click();
  await confirm(page);
  await expect(page.getByText('表单已更新，请刷新后重新核对')).toBeVisible();
  await page.getByRole('button', { name: '刷新定义并核对' }).click();
  await expect(page.getByLabel('参加本场次')).toBeChecked();
  await page.getByRole('button', { name: '核对并提交报名' }).click();
  await confirm(page);
  await expect(page.getByText('报名已提交（演示）', { exact: true })).toBeVisible();
});
test('批量部分失败、状态回显与筛选清空选择', async ({ page }) => {
  await login(page, 'demo_reg', '/managed/activities/act-open/registrations');
  await page.getByLabel('DEMO-001 演示队员 A').check();
  await page.getByLabel('DEMO-003 演示队员 C').check();
  await page.getByRole('button', { name: '审核已选 2 人' }).click();
  await confirm(page);
  await expect(page.getByRole('heading', { name: '本次成功 1 / 2' })).toBeVisible();
  await expect(page.locator('.status-badge').filter({ hasText: '已确认' })).toBeVisible();
  await page.getByRole('combobox', { name: '报名状态', exact: true }).selectOption('pending');
  await expect(page.getByRole('button', { name: '审核已选 0 人' })).toBeDisabled();
});
test('chunk失效提示恢复；BFCache恢复重新读取且保留会话草稿', async ({ page }) => {
  await login(page, 'demo_a', '/activities/act-position/register');
  await page.getByLabel('现场称呼', { exact: false }).fill('恢复前的合成草稿');
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByLabel('现场称呼', { exact: false })).toHaveValue('恢复前的合成草稿');
  await page.evaluate(() =>
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })),
  );
  await expect(page.getByRole('heading', { name: '页面资源已更新' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible();
});
test('相机授权一直未选择可离页，晚到流立即停止', async ({ page }) => {
  await page.addInitScript(() => {
    type CameraWindow = Window & {
      __finishCamera?: (stream: MediaStream) => void;
      __stopped?: number;
    };
    const w = window as CameraWindow;
    w.__stopped = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise<MediaStream>((resolve) => {
            w.__finishCamera = resolve;
          }),
      },
    });
  });
  await login(page, 'demo_onsite', '/managed/activities/act-open/onsite/people');
  await page.getByRole('button', { name: '扫一扫 / 测试相机' }).click();
  await expect(page.getByText(/等待相机授权/)).toBeVisible();
  await page.goto('/#/my');
  await page.evaluate(() => {
    const w = window as Window & {
      __finishCamera?: (stream: MediaStream) => void;
      __stopped?: number;
    };
    w.__finishCamera?.({
      getTracks: () => [
        {
          stop() {
            w.__stopped = (w.__stopped ?? 0) + 1;
          },
        },
      ],
    } as unknown as MediaStream);
  });
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __stopped?: number }).__stopped))
    .toBe(1);
});
test('本地相机拒绝有指引，服务失败可以重读，空态不冒充错误', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('synthetic denied', 'NotAllowedError')),
      },
    }),
  );
  await login(page, 'demo_onsite', '/managed/activities/act-open/onsite/people');
  await page.getByRole('button', { name: '扫一扫 / 测试相机' }).click();
  await expect(page.getByText(/相机权限未获批准或被占用/)).toBeVisible();
  await page.goto('/#/activities');
  await scenario(page, 'SYSTEM-01');
  await expect(page.getByText('模拟服务暂不可用，请重试')).toBeVisible();
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect(page.getByRole('heading', { name: '活动日程' })).toBeVisible();
  await scenario(page, 'LIST-EMPTY');
  await expect(page.getByRole('heading', { name: '没有符合条件的活动' })).toBeVisible();
});
