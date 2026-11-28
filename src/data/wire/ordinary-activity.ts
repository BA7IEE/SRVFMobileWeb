import { array, bool, enumValue, envelope, integer, object, page, pathId, text } from './core';
import type { Transport, WireRequest } from './core';
import { fail } from '../../shared/errors';

export type DraftInput = {
  title: string;
  organizationId: string;
  activityTypeCode: string;
  allocationModeCode: 'first_come' | 'qualification_rank';
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  location: string;
  capacity: number;
};
export type SessionInput = {
  code: string;
  name: string;
  locationText: string;
  startAt: string;
  endAt: string;
  checkInOpenAt: string;
  checkInCloseAt: string;
  checkOutOpenAt: string;
  checkOutCloseAt: string;
  locationRequired: boolean;
};
const root = '/api/app/v1/my/managed-activities';
function detail(value: unknown) {
  const entry = object(value),
    a = object(entry.activity),
    review = object(entry.publishReview);
  return {
    id: text(a.id),
    title: text(a.title),
    status: text(a.statusCode),
    mode: text(a.allocationModeCode),
    location: text(a.location),
    startAt: text(a.startAt),
    endAt: text(a.endAt),
    review: review.status === null ? null : text(review.status),
    canManage:
      entry.myResponsibility != null &&
      object(entry.myResponsibility).canManageRegistrations === true,
  };
}
export function ordinaryActivities(transport: Transport) {
  function send(method: WireRequest['method'], path: string, body?: unknown) {
    return transport.send({
      method,
      path,
      body,
      accept: 'application/json',
      retry: method === 'GET' ? 'safe-read' : 'none',
    });
  }
  async function call(method: WireRequest['method'], path: string, body?: unknown) {
    return envelope(await send(method, path, body));
  }
  async function list<T>(url: string, decode: (item: unknown) => T) {
    const rows: T[] = [];
    for (let i = 1; ; i++) {
      const p = page(await call('GET', url + '?page=' + i + '&pageSize=20'), decode);
      if (p.page !== i || p.pageSize !== 20) throw fail('contract-mismatch', '列表页码不匹配');
      rows.push(...p.items);
      if (i * p.pageSize >= p.total || !p.items.length) return rows;
    }
  }
  const at = (id: string) => root + '/' + pathId(id);
  async function readActivity(id: string, scope?: 'registration') {
    const response = await send('GET', at(id));
    if (
      scope === 'registration' &&
      response.status === 404 &&
      response.contentType.split(';')[0]?.trim().toLowerCase() === 'application/json'
    ) {
      const error = object(response.body);
      // The scoped detail query intentionally hides missing and inaccessible activities alike.
      if (error.code === 20001 && error.data === null && text(error.message))
        throw fail('forbidden', '没有本活动的报名管理职责');
      throw fail('not-found', '无法确认本场报名管理入口');
    }
    const entry = object(envelope(response));
    if (object(entry.activity).id !== id) throw fail('contract-mismatch', '活动回执不一致');
    return entry;
  }
  return {
    async options() {
      return array(await call('GET', root + '/organization-options')).map((v) => {
        const o = object(v);
        return { id: text(o.organizationId), name: text(o.pathLabel) };
      });
    },
    activities() {
      return list(root, (v) => {
        const o = object(v);
        return {
          id: text(o.activityId),
          title: text(o.title),
          relationship: text(o.relationship),
          status: text(o.statusCode),
        };
      });
    },
    async draft(input: DraftInput) {
      return detail(
        await call('POST', root, {
          ...input,
          registrationModeCode: 'open_apply',
          visibilityCode: 'internal',
        }),
      );
    },
    async detail(id: string) {
      return detail(await readActivity(id));
    },
    async registrationActivity(id: string) {
      const entry = await readActivity(id, 'registration');
      if (entry.myResponsibility === null) throw fail('forbidden', '没有本活动的报名管理职责');
      const duty = object(entry.myResponsibility);
      enumValue(duty.responsibilityType, ['owner', 'collaborator']);
      if (!bool(duty.canManageRegistrations)) throw fail('forbidden', '没有本活动的报名管理职责');
      return { title: text(object(entry.activity).title) };
    },
    async metric(id: string) {
      const m = object(await call('GET', at(id) + '/metric-selection'));
      if (m.activityId !== id) throw fail('contract-mismatch', '指标回执不一致');
      return { revision: integer(m.metricSelectionRevision), code: text(m.metricRequirementCode) };
    },
    async noMetric(id: string, revision: number, key: string) {
      const m = object(
        await call('PUT', at(id) + '/metric-selection', {
          operationKey: key,
          expectedRevision: revision,
          metricSelection: { metricRequirementCode: 'not_required', metricSetPointer: null },
        }),
      );
      if (m.activityId !== id || m.metricRequirementCode !== 'not_required')
        throw fail('contract-mismatch', '指标回执不一致');
    },
    sessions(id: string) {
      return list(at(id) + '/sessions', (v) => {
        const s = object(v);
        return { id: text(s.sessionId), name: text(s.name) };
      });
    },
    positions(id: string, sid: string) {
      return list(at(id) + '/sessions/' + pathId(sid) + '/positions', (v) => {
        const row = object(v);
        if (row.sessionId !== sid) throw fail('contract-mismatch', '岗位不属于当前场次');
        return { id: text(row.positionId), name: text(row.name) };
      });
    },
    async addSession(id: string, input: SessionInput) {
      const s = object(await call('POST', at(id) + '/sessions', input));
      return text(s.sessionId);
    },
    async addPosition(
      id: string,
      sid: string,
      input: { code: string; name: string; capacity: number; attendanceRoleCode: string },
    ) {
      const s = object(
        await call('POST', at(id) + '/sessions/' + pathId(sid) + '/positions', input),
      );
      return text(s.positionId);
    },
    async submit(id: string) {
      const d = detail(await call('POST', at(id) + '/direct-publish', {}));
      if (d.id !== id || d.review !== 'pending') throw fail('contract-mismatch', '未收到待审回执');
      return d;
    },
    registrations(id: string) {
      return list(at(id) + '/registrations', (v) => {
        const r = object(v),
          m = object(r.member);
        if (r.activityId !== id) throw fail('contract-mismatch', '报名不属于当前活动');
        return {
          id: text(r.registrationId),
          name:
            typeof m.label === 'string'
              ? m.label
              : typeof m.memberNo === 'string'
                ? m.memberNo
                : '队员',
          status: text(r.statusCode),
        };
      });
    },
    async admit(id: string, rid: string) {
      const r = object(
        await call('PATCH', at(id) + '/registrations/' + pathId(rid) + '/approve', {}),
      );
      if (r.activityId !== id || r.registrationId !== rid || r.statusCode !== 'pass')
        throw fail('contract-mismatch', '未取得本人负责活动的录取回执');
    },
  };
}
export type OrdinaryActivityPort = ReturnType<typeof ordinaryActivities>;
