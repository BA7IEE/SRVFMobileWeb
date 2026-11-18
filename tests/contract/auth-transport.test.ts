import { expect, it, vi } from 'vitest';
import { createSameOriginAuthTransport } from '../../src/data/wire/auth-transport';
import { envelope } from '../../src/data/wire/core';

const read = {
  path: '/api/app/v1/me',
  method: 'GET',
  headers: { Authorization: 'Bearer SYNTHETIC_ACCESS' },
  accept: 'application/json',
  retry: 'safe-read',
} as const;
const refresh = {
  path: '/api/auth/v1/refresh',
  method: 'POST',
  body: { refreshToken: 'SYNTHETIC_REFRESH' },
  accept: 'application/json',
  retry: 'none',
} as const;

it('passes only relative auth paths with no cookies, redirects or HTTP cache', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ code: 0, message: 'ok', data: null }));
  const transport = createSameOriginAuthTransport(request);
  expect(envelope(await transport.send(read))).toBeNull();
  expect(envelope(await transport.send(refresh))).toBeNull();
  expect(request.mock.calls.map(([path]) => path)).toEqual([read.path, refresh.path]);
  for (const [, init] of request.mock.calls) {
    expect(init).toMatchObject({
      mode: 'same-origin',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  }
  expect(new Headers(request.mock.calls[0]![1]?.headers).get('Authorization')).toBe(
    read.headers.Authorization,
  );
  expect(JSON.parse(String(request.mock.calls[1]![1]?.body))).toEqual(refresh.body);
  await expect(
    transport.send({ ...read, path: '//outside.invalid/api/app/v1/me' }),
  ).rejects.toHaveProperty('kind', 'validation');
  expect(request).toHaveBeenCalledTimes(2);
});

it('rejects a non-JSON response or network failure without retry or fixture fallback', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('<html>not an API</html>'))
    .mockRejectedValueOnce(new Error('offline'));
  const transport = createSameOriginAuthTransport(request);
  await expect(transport.send(read)).rejects.toHaveProperty('kind', 'contract-mismatch');
  await expect(transport.send(refresh)).rejects.toHaveProperty('delivery', 'unknown');
  expect(request).toHaveBeenCalledTimes(2);
});
