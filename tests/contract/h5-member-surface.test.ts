// @vitest-environment-options {"url":"https://h5.example.test/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createH5Ports } from '../../src/data/h5';

const at = '2099-05-01T00:00:00.000Z';
const fetchFixture = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>();
let ports: ReturnType<typeof createH5Ports>;
function reply(data: unknown, status = 200, code = 0) {
  return new Response(JSON.stringify({ data, code, message: 'fixture' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const registration = {
  id: 'registration-one',
  activityId: 'activity-one',
  activityTitle: '合成活动',
  activityStartAt: at,
  activityEndAt: at,
  statusCode: 'pending',
  waitlistPosition: null,
  registeredAt: at,
  cancelledAt: null,
};
const page = (items: unknown[], total = items.length) => ({
  items,
  total,
  page: 1,
  pageSize: 20,
});

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

describe('H5 已有契约的队员表面', () => {
  it('取消报名先按活动找到可取消记录，再以报名编号提交且不自动重发', async () => {
    fetchFixture
      .mockResolvedValueOnce(reply(page([registration])))
      .mockResolvedValueOnce(reply({ ...registration, statusCode: 'cancelled', cancelledAt: at }));
    await ports.registrations.cancel('activity-one');
    expect(calls()).toEqual([
      ['GET', '/api/app/v1/my/registrations?page=1&pageSize=20', undefined],
      ['PATCH', '/api/app/v1/my/registrations/registration-one/cancel', {}],
    ]);
    fetchFixture.mockReset();
    fetchFixture
      .mockResolvedValueOnce(reply(page([registration])))
      .mockRejectedValueOnce(new Error('offline'));
    await expect(ports.registrations.cancel('activity-one')).rejects.toHaveProperty(
      'kind',
      'result-unknown',
    );
    expect(fetchFixture).toHaveBeenCalledTimes(2);
  });

  it('没有可取消报名时不发送取消', async () => {
    fetchFixture.mockResolvedValueOnce(reply(page([{ ...registration, statusCode: 'reject' }])));
    await expect(ports.registrations.cancel('activity-one')).rejects.toMatchObject({
      kind: 'business-rejected',
      message: '当前不能取消报名',
    });
    expect(calls()).toEqual([
      ['GET', '/api/app/v1/my/registrations?page=1&pageSize=20', undefined],
    ]);
  });

  it('只看可报名走 available，不把搜索和类型拼进查询', async () => {
    fetchFixture.mockResolvedValueOnce(
      reply(
        page([
          {
            id: 'activity-one',
            title: '合成活动',
            activityTypeCode: 'training',
            statusCode: 'published',
            startAt: at,
            endAt: '2099-05-02T00:00:00.000Z',
            location: '合成地点',
          },
        ]),
      ),
    );
    const listed = await ports.activities.list({
      keyword: '忽略',
      type: '培训',
      available: true,
      page: 1,
    });
    expect(listed.items[0]).toMatchObject({ id: 'activity-one', invitation: false });
    expect(calls()).toEqual([
      ['GET', '/api/app/v1/activities/available?page=1&pageSize=20', undefined],
    ]);
  });

  it('我的活动使用本人活动列表，已完成活动保留完成状态', async () => {
    fetchFixture.mockResolvedValueOnce(
      reply(
        page([
          {
            activityId: 'activity-one',
            title: '合成活动',
            statusCode: 'completed',
            startAt: at,
            endAt: at,
            location: '合成地点',
            myRegistrationId: 'registration-one',
            myRegistrationStatusCode: 'pass',
            myRegisteredAt: at,
          },
        ]),
      ),
    );
    const rows = await ports.registrations.getMyActivities();
    expect(rows[0]).toMatchObject({
      id: 'registration-one',
      phase: 'ended',
      activityStatusCode: 'completed',
      serverStatus: 'pass',
      canCancel: true,
    });
    expect(calls()[0]?.[1]).toBe('/api/app/v1/my/activities?page=1&pageSize=20');
  });

  it('成员码只接受正式 SVG，并交给图像地址展示', async () => {
    fetchFixture.mockResolvedValueOnce(
      new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' },
      }),
    );
    const blobs: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:https://h5.example.test/synthetic-member';
      },
    });
    const url = await ports.attendance.getMemberCredential();
    expect(url).toBe('blob:https://h5.example.test/synthetic-member');
    expect(blobs[0]).toBeInstanceOf(Blob);
    const [target, init] = fetchFixture.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(target.pathname).toBe('/api/app/v1/my/attendance-member-credential/render');
    expect(new Headers(init.headers).get('Accept')).toBe('image/svg+xml');
    expect(init.body).toBeUndefined();
  });

  it('没有在途入队申请时 28202 表示空，有申请时门槛译成中文', async () => {
    fetchFixture.mockResolvedValueOnce(reply(null, 404, 28202));
    expect(await ports.memberHome!.getTeamJoin()).toBeNull();
    fetchFixture.mockResolvedValueOnce(
      reply({
        id: 'join-one',
        cycleName: '合成轮次',
        cycleYear: 2026,
        statusCode: 'joining',
        contributionPoints: '5.00',
        contributionSatisfied: true,
        generalGatesSatisfied: false,
        gates: [
          { code: 'fitness', satisfied: true, professional: false },
          { code: 'not-listed', satisfied: false, professional: true },
        ],
      }),
    );
    const progress = await ports.memberHome!.getTeamJoin();
    expect(progress).toMatchObject({ status: 'joining', points: '5.00' });
    expect(progress?.gates.map((gate) => gate.label)).toEqual(['基础体能', '未列入说明的门槛']);
  });

  it('评价在活动未完结时保持 35030，不把结束时间当成可评价', async () => {
    fetchFixture.mockResolvedValueOnce(reply(null, 409, 35030));
    await expect(ports.memberHome!.getFeedback('activity-one')).rejects.toMatchObject({
      kind: 'conflict',
      message: '活动尚未完结，暂不能评价',
    });
    expect(calls()).toEqual([
      ['GET', '/api/app/v1/my/activities/activity-one/feedback', undefined],
    ]);
  });

  it('队内内容无权时是拒绝，不是空列表', async () => {
    fetchFixture.mockResolvedValueOnce(reply(null, 403, 40300));
    await expect(ports.memberHome!.listContents()).rejects.toHaveProperty('kind', 'forbidden');
  });

  it('通知详情不自动已读，已读是单独提交', async () => {
    fetchFixture.mockResolvedValueOnce(
      reply({
        id: 'notice-one',
        title: '合成通知',
        body: '正文',
        notificationTypeCode: 'general',
        pinned: false,
        read: false,
        publishedAt: at,
      }),
    );
    const notice = await ports.memberHome!.getNotice('notice-one');
    expect(notice).toMatchObject({ kind: '一般通知', read: false, body: '正文' });
    fetchFixture.mockResolvedValueOnce(reply({ read: true }));
    await ports.memberHome!.markNoticeRead('notice-one');
    expect(calls()[1]).toEqual(['POST', '/api/app/v1/notifications/notice-one/read', undefined]);
  });

  it('昵称只提交 nickname，头像缺少记录时保持空', async () => {
    fetchFixture.mockResolvedValueOnce(
      reply({
        username: 'synthetic',
        nickname: '合成昵称',
        memberNo: 'M-1',
        realName: '合成队员',
        memberLabel: 'M-1 · 合成队员',
      }),
    );
    await ports.memberHome!.updateNickname(' 合成昵称 ');
    expect(calls()).toEqual([['PATCH', '/api/app/v1/me/profile', { nickname: '合成昵称' }]]);
    fetchFixture.mockResolvedValueOnce(reply(null));
    expect(await ports.memberHome!.getAvatar()).toBeNull();
  });
});
