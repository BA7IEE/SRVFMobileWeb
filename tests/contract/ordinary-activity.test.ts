import { describe, expect, it } from 'vitest';
import { FakeTransport } from '../../src/data/wire/core';
import { ordinaryActivities } from '../../src/data/wire/ordinary-activity';

const act = 'cworkactivity001';
const reg = 'cworkregister001';
function reply(data: unknown) {
  return { status: 200, contentType: 'application/json', body: { code: 0, message: 'OK', data } };
}
describe('ordinary activity operator', () => {
  it('binds single registration acceptance to the selected activity and receipt', async () => {
    const t = new FakeTransport([
      reply({ activityId: act, registrationId: reg, statusCode: 'pass' }),
      reply({ activityId: act + '2', registrationId: reg, statusCode: 'pass' }),
    ]);
    const api = ordinaryActivities(t);
    await api.admit(act, reg);
    expect(t.requests[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/app/v1/my/managed-activities/' + act + '/registrations/' + reg + '/approve',
      body: {},
      retry: 'none',
    });
    await expect(api.admit(act, reg)).rejects.toThrow();
    expect(t.requests).toHaveLength(2);
  });
  it('sends revision and key only for the explicit no-metric decision', async () => {
    const t = new FakeTransport([
      reply({ activityId: act, metricRequirementCode: 'not_required' }),
    ]);
    await ordinaryActivities(t).noMetric(act, 2, 'fixed-test-key');
    expect(t.requests[0]).toMatchObject({
      method: 'PUT',
      retry: 'none',
      body: {
        operationKey: 'fixed-test-key',
        expectedRevision: 2,
        metricSelection: { metricSetPointer: null, metricRequirementCode: 'not_required' },
      },
    });
  });
  it('uses the authorized list and includes the second page', async () => {
    const row = {
      activityId: act,
      title: '本次草稿',
      relationship: 'initiator',
      statusCode: 'draft',
    };
    const t = new FakeTransport([
      reply({ items: Array(20).fill(row), page: 1, pageSize: 20, total: 21 }),
      reply({ items: [{ ...row, activityId: act + '2' }], page: 2, pageSize: 20, total: 21 }),
    ]);
    const list = await ordinaryActivities(t).activities();
    expect(list).toHaveLength(21);
    expect(list[20].id).toBe(act + '2');
    expect(t.requests.map((r) => r.path)).toEqual(
      [1, 2].map((i) => '/api/app/v1/my/managed-activities?page=' + i + '&pageSize=20'),
    );
  });
});
