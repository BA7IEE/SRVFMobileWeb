import { fail } from '../../shared/errors';
import type { WireResponse } from '../wire/core';

// Keep cookies off Bearer requests. Only the three H5 session actions use the cookie.
export async function request(path: string, init: RequestInit): Promise<WireResponse> {
  const url = new URL(path, location.origin);
  if (
    !isSecureContext ||
    url.protocol !== 'https:' ||
    url.origin !== location.origin ||
    !path.startsWith('/api/') ||
    url.pathname !== path.split('?')[0]
  )
    throw fail('not-configured', '队员端需要同源 HTTPS');
  const cookieAction = /^\/api\/auth\/v1\/h5\/(login|refresh|logout)$/.test(url.pathname);
  if (!(cookieAction && init.method === 'POST') && !url.pathname.startsWith('/api/app/v1/'))
    throw fail('not-configured', '接口未接通');
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      mode: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      credentials: cookieAction ? 'same-origin' : 'omit',
    });
  } catch {
    throw fail(
      init.method === 'GET' ? 'network' : 'result-unknown',
      '未收到服务回执，请重新核对状态',
    );
  }
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json'))
    throw fail('contract-mismatch', '队员接口未返回 JSON');
  return { status: response.status, contentType, body: await response.json() };
}
