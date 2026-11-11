import { test as base, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const test = base.extend<{ networkEvidence: void }>({
  networkEvidence: [
    async ({ context, page, browser }, use, testInfo) => {
      const requests: { path: string; type: string }[] = [];
      const forbidden: string[] = [];
      const errors: string[] = [];
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const local = url.hostname === '127.0.0.1' && ['4173', '4174'].includes(url.port);
        const localImage =
          url.protocol === 'blob:' &&
          ['http://127.0.0.1:4173', 'http://127.0.0.1:4174'].includes(url.origin) &&
          route.request().resourceType() === 'image';
        if (
          (!local && !localImage) ||
          url.pathname.startsWith('/api/') ||
          ['eventsource', 'websocket', 'ping'].includes(route.request().resourceType())
        ) {
          forbidden.push(url.origin + url.pathname);
          await route.abort();
        } else await route.continue();
      });
      context.on('request', (r) => {
        const url = new URL(r.url());
        requests.push({
          path: url.protocol === 'blob:' ? 'blob:local-image' : url.origin + url.pathname,
          type: r.resourceType(),
        });
      });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('websocket', (ws) => forbidden.push('WebSocket:' + new URL(ws.url()).pathname));
      await context.addInitScript(() => {
        Object.assign(window, { __boundaryViolations: [] as string[] });
        document.addEventListener('securitypolicyviolation', (e) => {
          if (['connect-src', 'form-action', 'font-src'].includes(e.violatedDirective))
            (window as unknown as { __boundaryViolations: string[] }).__boundaryViolations.push(
              e.violatedDirective,
            );
        });
      });
      await use();
      const csp = await page
        .evaluate(
          () =>
            (window as unknown as { __boundaryViolations?: string[] }).__boundaryViolations ?? [],
        )
        .catch(() => []);
      const evidence = {
        test: testInfo.title,
        browser: browser.version(),
        requests,
        forbidden,
        cspViolations: csp,
        pageErrors: errors,
        apiRequests: requests.filter((r) => r.path.includes('/api/')).length,
        serviceWorkers: context.serviceWorkers().length,
      };
      const id = createHash('sha256')
        .update(testInfo.project.name + testInfo.title)
        .digest('hex')
        .slice(0, 12);
      await mkdir('docs/evidence/network', { recursive: true });
      await writeFile(`docs/evidence/network/${id}.json`, JSON.stringify(evidence, null, 2) + '\n');
      expect(forbidden, 'forbidden network attempts').toEqual([]);
      expect(csp, 'CSP network/form violations').toEqual([]);
      expect(errors, 'browser exceptions').toEqual([]);
      expect(evidence.apiRequests).toBe(0);
      expect(evidence.serviceWorkers).toBe(0);
    },
    { auto: true },
  ],
});
export { expect };
export async function login(page: Page, account = 'demo_a', path = '/activities') {
  await page.goto('/#' + path);
  await page.getByPlaceholder('请输入演示账号').fill(account);
  await page.getByPlaceholder('请输入演示密码').fill('demo-only');
  await page.getByRole('button', { name: '演示登录', exact: true }).click();
  await expect(page).not.toHaveURL(/#\/login/);
  await expect(page.getByPlaceholder('请输入演示密码')).toHaveCount(0);
}
export async function confirm(page: Page) {
  await page.locator('.van-dialog__confirm').click();
}
export async function panel(page: Page) {
  await page.getByRole('button', { name: '打开演示场景面板' }).click();
}
export async function scenario(page: Page, id: string) {
  await panel(page);
  await page.getByLabel('选择场景').selectOption(id);
  await page.getByRole('button', { name: '应用场景', exact: true }).click();
}
export async function switchAccount(page: Page, account: string) {
  await panel(page);
  await page.getByLabel('切换演示身份', { exact: true }).selectOption(account);
  await page.getByRole('button', { name: '切换身份并清理当前上下文' }).click();
  await expect(page.locator('.dev-panel')).toBeHidden();
}
export async function registerSimple(page: Page) {
  await page.getByLabel('参加本场次').check();
  await page.getByLabel('明确确认').check();
  await page.getByRole('button', { name: '核对并提交报名' }).click();
  await confirm(page);
  await expect(page.getByText('报名已提交（演示）', { exact: true })).toBeVisible();
}
