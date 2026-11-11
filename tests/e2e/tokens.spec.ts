import { test, expect, login } from './fixtures';
test('SRVF tokens 在按钮、Tab、焦点和 Teleport 弹层中生效', async ({ page }) => {
  await page.goto('/#/dev/components');
  const primary = page.getByTestId('theme-primary');
  await expect(primary).toHaveCSS('background-color', 'rgb(196, 0, 27)');
  await expect(primary).toHaveCSS('color', 'rgb(255, 255, 255)');
  const input = page.getByPlaceholder('焦点样式');
  await input.focus();
  await expect(input).toHaveCSS('outline-color', 'rgb(196, 0, 27)');
  await expect(page.getByText('当前在场', { exact: true })).toHaveCSS('color', 'rgb(10, 20, 38)');
  await page.getByRole('button', { name: '打开确认弹层' }).click();
  await expect(page.locator('.van-dialog__confirm')).toHaveCSS('color', 'rgb(196, 0, 27)');
  await page.locator('.van-dialog__cancel').click();
  await page.getByRole('button', { name: '展示全屏码' }).click();
  await expect(page.locator('.full-popup .van-button--primary')).toHaveCSS(
    'background-color',
    'rgb(196, 0, 27)',
  );
  await expect(page.locator('.qr-image')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: '关闭二维码', exact: true }).click();
  await login(page);
  await expect(page.locator('.van-tabbar-item--active')).toHaveCSS('color', 'rgb(196, 0, 27)');
  const requests = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => r.name),
  );
  expect(
    requests.some(
      (u) =>
        ['http:', 'https:'].includes(new URL(u).protocol) && new URL(u).hostname !== '127.0.0.1',
    ),
  ).toBe(false);
});
