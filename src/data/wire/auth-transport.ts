import { fail } from '../../shared/errors';
import { DeliveryError, type Transport } from './core';

const authPaths = new Map([
  ['/api/auth/v1/login', 'POST'],
  ['/api/auth/v1/refresh', 'POST'],
  ['/api/auth/v1/logout', 'POST'],
  ['/api/app/v1/me', 'GET'],
  ['/api/app/v1/me/capabilities', 'GET'],
]);

/** Legacy JSON transport for the offline contract suite. The H5 build uses the Cookie adapter. */
export function createSameOriginAuthTransport(request: typeof fetch): Transport {
  return {
    async send(input, signal) {
      if (authPaths.get(input.path) !== input.method || input.accept !== 'application/json')
        throw fail('validation', '不支持此认证请求');
      if (signal?.aborted) throw new DeliveryError('not-sent');

      const headers = new Headers({ Accept: 'application/json' });
      const authorization = input.headers?.Authorization;
      if (input.method === 'GET' && authorization) headers.set('Authorization', authorization);
      const body = input.body === undefined ? undefined : JSON.stringify(input.body);
      if (body !== undefined) headers.set('Content-Type', 'application/json');

      let response: Response;
      try {
        response = await request(input.path, {
          method: input.method,
          mode: 'same-origin',
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          headers,
          body,
          signal,
        });
      } catch {
        if (input.method === 'POST') throw new DeliveryError('unknown');
        throw fail('network', '无法连接认证服务');
      }

      const contentType = response.headers.get('Content-Type') ?? '';
      if (!contentType.toLowerCase().startsWith('application/json'))
        throw fail('contract-mismatch', '认证服务未返回 JSON');
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw fail('contract-mismatch', '认证服务返回了无效 JSON');
      }
      return { status: response.status, contentType, body: data };
    },
  };
}
