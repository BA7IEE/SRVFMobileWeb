// @vitest-environment-options {"url":"https://h5.example.test/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createH5Ports } from '../../src/data/h5';

const root = '/api/app/v1/me/insurances';
const at = '2099-05-01T00:00:00.000Z';
const record = {
  id: 'insurance-one',
  insurerName: '合成保险',
  policyNumber: 'EXAMPLE-1',
  coverageStart: null,
  coverageEnd: at,
  reviewStatusCode: 'pending',
  version: 3,
};
const input = { insurer: '合成保险', policy: 'EXAMPLE-1', start: null, end: '2099-05-01' };
const fetchFixture = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>();
let ports: ReturnType<typeof createH5Ports>;
function reply(data: unknown, status = 200, code = 0) {
  return new Response(JSON.stringify({ data, code, message: 'fixture' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(async () => {
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: (_: string, work: () => unknown) => work() },
  });
  fetchFixture.mockReset();
  fetchFixture.mockResolvedValueOnce(
    reply({ tokenType: 'Bearer', accessToken: 'synthetic', expiresIn: '15m' }),
  );
  vi.stubGlobal('fetch', fetchFixture);
  let marker = '';
  ports = createH5Ports(() => {}, {
    read: async () => marker,
    write: async (next) => {
      marker = next;
    },
    onChange: () => {},
  });
  await ports.auth.restoreSession();
  fetchFixture.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

function calls() {
  return fetchFixture.mock.calls.map(([url, init]) => [
    init.method,
    url.pathname + url.search,
    init.body === undefined ? undefined : JSON.parse(String(init.body)),
  ]);
}

describe('H5 本人自购保险', () => {
  it('读取完整分页，自购回执不会被当作队伍统保', async () => {
    const first = Array.from({ length: 20 }, (_, index) => ({
      ...record,
      id: 'insurance-' + index,
    }));
    fetchFixture
      .mockResolvedValueOnce(reply({ items: first, total: 21, page: 1, pageSize: 20 }))
      .mockResolvedValueOnce(reply({ items: [record], total: 21, page: 2, pageSize: 20 }));
    const overview = await ports.insurance.getMyOverview();
    expect(overview.team).toBeNull();
    expect(overview.self.map(({ id }) => id)).toEqual([...first.map(({ id }) => id), record.id]);
    expect(overview.self.at(-1)).toEqual({
      ...input,
      id: record.id,
      review: 'pending',
      version: 3,
    });
    await expect(ports.registrations.cancel('registration-one')).rejects.toHaveProperty(
      'kind',
      'not-configured',
    );
    expect(calls()).toEqual([
      ['GET', root + '?page=1&pageSize=20', undefined],
      ['GET', root + '?page=2&pageSize=20', undefined],
    ]);
  });

  it('拒绝错页回执', async () => {
    fetchFixture.mockResolvedValueOnce(reply({ items: [], total: 0, page: 2, pageSize: 20 }));
    await expect(ports.insurance.getMyOverview()).rejects.toHaveProperty(
      'kind',
      'contract-mismatch',
    );
  });

  it('创建、修改、删除走正式接口，更新与删除携带已有版本', async () => {
    fetchFixture
      .mockResolvedValueOnce(reply(record, 201))
      .mockResolvedValueOnce(reply({ ...record, version: 4 }))
      .mockResolvedValueOnce(reply({ ...record, version: 5 }));
    await ports.insurance.createSelf(input);
    await ports.insurance.updateSelf(record.id, input, 3);
    await ports.insurance.deleteSelf(record.id, 4);
    const body = { insurerName: input.insurer, policyNumber: input.policy, coverageEnd: input.end };
    expect(calls()).toEqual([
      ['POST', root, body],
      ['PATCH', root + '/' + record.id, { ...body, expectedVersion: 3 }],
      ['DELETE', root + '/' + record.id + '?expectedVersion=4', undefined],
    ]);
  });

  it('保留版本冲突和写入结果未知，传输失败不重发', async () => {
    fetchFixture.mockResolvedValueOnce(reply(null, 409, 26011)).mockRejectedValueOnce(Error());
    await expect(ports.insurance.updateSelf(record.id, input, 3)).rejects.toHaveProperty(
      'kind',
      'conflict',
    );
    await expect(ports.insurance.createSelf(input)).rejects.toHaveProperty(
      'kind',
      'result-unknown',
    );
    expect(fetchFixture).toHaveBeenCalledTimes(2);
  });
});
