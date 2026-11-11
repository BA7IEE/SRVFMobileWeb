import {
  array,
  bool,
  decimalString,
  DeliveryError,
  envelope,
  enumValue,
  finite,
  integer,
  iso,
  key,
  nullableText,
  object,
  page,
  pathId,
  query,
  svg,
  text,
  type Transport,
  type WireRequest,
} from './core';
import { fail } from '../../shared/errors';
import { fileError, insuranceErrors, safeField, validDate } from '../../shared/validation';
import type { InsuranceInput, PunchIntent, SelfInsurance } from '../models';
import { createKnownReads, ledgerTotals, readForm } from './reads';

export function insuranceBody(input: InsuranceInput, version?: number) {
  const errors = insuranceErrors(input);
  if (Object.keys(errors).length) throw fail('validation', '保险资料格式不符合要求');
  return {
    insurerName: input.insurer.trim(),
    policyNumber: input.policy.trim(),
    ...(input.start ? { coverageStart: input.start } : {}),
    coverageEnd: input.end,
    ...(version === undefined ? {} : { expectedVersion: integer(version) }),
  };
}
export function insurance(value: unknown): SelfInsurance {
  const o = object(value);
  return {
    id: text(o.id),
    insurer: text(o.insurerName),
    policy: text(o.policyNumber),
    start: o.coverageStart === null ? null : iso(o.coverageStart).slice(0, 10),
    end: iso(o.coverageEnd).slice(0, 10),
    review: enumValue(o.reviewStatusCode, ['pending', 'verified', 'rejected']),
    version: integer(o.version),
  };
}
export function directoryItem(value: unknown) {
  const o = object(value);
  return {
    id: text(o.id),
    title: text(o.title),
    type: text(o.activityTypeCode),
    status: enumValue(o.statusCode, ['published']),
    startAt: iso(o.startAt),
    endAt: iso(o.endAt),
    location: text(o.location),
    registrationMode: nullableText(o.registrationMode),
  };
}
export function punchState(value: unknown) {
  const o = object(value);
  return {
    present: bool(o.isPresent),
    hasHistory: null,
    checkInAt: o.checkInAt === null ? null : iso(o.checkInAt),
    checkOutAllowedAt: o.checkOutAllowedAt === null ? null : iso(o.checkOutAllowedAt),
    distanceMeters: o.distanceMeters === null ? null : decimalString(o.distanceMeters),
    geoVerified: bool(o.geoVerified),
    lowAccuracy: bool(o.lowAccuracy),
    serverTime: iso(o.serverTime),
    next: enumValue(o.nextAllowedAction, ['check_in', 'check_out']),
  };
}
export function punchReceipt(value: unknown) {
  const o = object(value);
  return {
    eventId: text(o.eventId),
    eventTypeCode: enumValue(o.eventTypeCode, [
      'check_in',
      'check_out',
      'early_departure_close',
      'void',
      'replace',
    ]),
    occurredAt: iso(o.occurredAt),
    segmentStatusCode: enumValue(o.segmentStatusCode, ['open', 'closed_valid', 'closed_zero']),
    serverTime: iso(o.serverTime),
    distanceMeters: o.distanceMeters === null ? null : decimalString(o.distanceMeters),
    geoVerified: bool(o.geoVerified),
    lowAccuracy: bool(o.lowAccuracy),
    nextAllowedAction: enumValue(o.nextAllowedAction, ['check_in', 'check_out']),
  };
}
export function punchBody(input: PunchIntent) {
  const position = input.location;
  if (
    position &&
    (!Number.isFinite(position.longitude) ||
      Math.abs(position.longitude) > 180 ||
      !Number.isFinite(position.latitude) ||
      Math.abs(position.latitude) > 90 ||
      !Number.isFinite(position.accuracy) ||
      position.accuracy < 0 ||
      position.accuracy > 99999999.99)
  )
    throw fail('validation', '定位快照无效');
  if (
    position &&
    (position.longitude !== Number(position.longitude.toFixed(7)) ||
      position.latitude !== Number(position.latitude.toFixed(7)) ||
      position.accuracy !== Number(position.accuracy.toFixed(2)))
  )
    throw fail('validation', '定位快照的小数位不符合契约');
  const token = text(input.credential);
  if (token.length > 4096) throw fail('validation', '扫码凭证过长');
  return {
    qrToken: token,
    eventKey: key(input.key),
    ...(position
      ? { longitude: position.longitude, latitude: position.latitude, accuracy: position.accuracy }
      : {}),
  };
}
export type RegistrationCommand = {
  operationKey: string;
  formVersion: number | null;
  answers: { fieldCode: string; value?: unknown; uploadSessionId?: string }[];
  preferences: { sessionId: string; positionIds: string[] }[];
};
function answerValue(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    value instanceof File ||
    (typeof value === 'string' && /^(blob:|data:)/.test(value))
  )
    throw fail('validation', '答案不能包含本地文件 URL 或未上传文件');
  if (typeof value === 'number' && !Number.isFinite(value))
    throw fail('validation', '答案数字无效');
  if (typeof value === 'object' && !Array.isArray(value))
    throw fail('validation', '当前移动端不接受自定义答案对象');
  if (Array.isArray(value)) return value.map(answerValue);
  if (!['number', 'string', 'boolean'].includes(typeof value))
    throw fail('validation', '答案类型无效');
  return value;
}
export function registrationBody(input: RegistrationCommand) {
  if (new Set(input.answers.map((a) => a.fieldCode)).size !== input.answers.length)
    throw fail('validation', '题目不能重复');
  if (new Set(input.preferences.map((p) => p.sessionId)).size !== input.preferences.length)
    throw fail('validation', '场次不能重复');
  return {
    operationKey: key(input.operationKey),
    formVersion: input.formVersion === null ? null : integer(input.formVersion, 1, 2147483647),
    answers: input.answers.map((a) => {
      if (!safeField(a.fieldCode)) throw fail('validation', '题目标识无效');
      if (a.uploadSessionId !== undefined) {
        if (a.value !== undefined) throw fail('validation', '附件题只能提交一次性会话');
        return { fieldCode: a.fieldCode, uploadSessionId: pathId(a.uploadSessionId) };
      }
      return { fieldCode: a.fieldCode, value: answerValue(a.value) };
    }),
    preferences: input.preferences.map((p) => {
      if (new Set(p.positionIds).size !== p.positionIds.length)
        throw fail('validation', '岗位不能重复');
      return { sessionId: pathId(p.sessionId), positionIds: p.positionIds.map(pathId) };
    }),
  };
}
export function registrationReceipt(value: unknown) {
  const o = object(value);
  return {
    registrationId: text(o.registrationId),
    registrationRevisionId: text(o.registrationRevisionId),
    revision: integer(o.revision, 1),
    submittedAt: iso(o.submittedAt),
  };
}
export function qrMetadata(value: unknown) {
  const o = object(value);
  return {
    credentialId: text(o.credentialId),
    activityId: text(o.activityId),
    sessionId: text(o.sessionId),
    actionCode: enumValue(o.actionCode, ['check_in', 'check_out']),
    credentialVersion: integer(o.credentialVersion, 1),
    statusCode: enumValue(o.statusCode, ['active', 'revoked', 'expired']),
    validFrom: iso(o.validFrom),
    validUntil: iso(o.validUntil),
    issuedAt: iso(o.issuedAt),
    revokedAt: o.revokedAt === null ? null : iso(o.revokedAt),
  };
}
export function createWire(
  transport: Transport,
  accessToken: () => string = () => {
    throw fail('unauthenticated', '尚未提供已确认的凭证');
  },
) {
  const headers = () => ({ Authorization: `Bearer ${text(accessToken())}` });
  const uploads = new Map<
    string,
    { activity: string; token: string; expiresAt: string; used: boolean }
  >();
  const json = async (request: Omit<WireRequest, 'accept'>) => {
    try {
      return envelope(
        await transport.send({ ...request, headers: headers(), accept: 'application/json' }),
      );
    } catch (e) {
      if (e instanceof DeliveryError)
        throw fail(
          e.delivery === 'unknown' && request.method !== 'GET' ? 'result-unknown' : 'network',
          e.delivery === 'unknown' && request.method !== 'GET'
            ? '结果暂未确认，请先查询原操作，不自动重发'
            : '暂时无法读取，请重试',
        );
      throw e;
    }
  };
  const base = (a: string) => '/api/app/v1/activities/' + pathId(a);
  const managed = (a: string) => '/api/app/v1/my/managed-activities/' + pathId(a);
  return {
    ...createKnownReads(json),
    async listActivities(input: { q?: string; type?: string; page: number; pageSize: number }) {
      return page(
        await json({
          method: 'GET',
          path:
            '/api/app/v1/activities' +
            query({
              q: input.q,
              type: input.type,
              page: integer(input.page, 1),
              pageSize: integer(input.pageSize, 1, 100),
            }),
          retry: 'safe-read',
        }),
        directoryItem,
      );
    },
    async getActivity(id: string) {
      const o = object(await json({ method: 'GET', path: base(id), retry: 'safe-read' }));
      directoryItem(o);
      return {
        id: text(o.id),
        title: text(o.title),
        description: nullableText(o.description),
        requiresInsurance: bool(o.requiresInsurance),
        registrationForm: readForm(o.registrationForm),
        phase: enumValue(o.phase, ['upcoming', 'ongoing', 'ended']),
        formVersion: o.formVersion === null ? null : integer(o.formVersion, 1),
        sessions: array(o.sessions).map((x) => {
          const s = object(x);
          return {
            id: text(s.id),
            name: text(s.name),
            startAt: iso(s.startAt),
            endAt: iso(s.endAt),
          };
        }),
      };
    },
    async listInsurances(pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path: '/api/app/v1/me/insurances' + query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        insurance,
      );
    },
    async createInsurance(input: InsuranceInput) {
      return insurance(
        await json({
          method: 'POST',
          path: '/api/app/v1/me/insurances',
          body: insuranceBody(input),
          retry: 'none',
        }),
      );
    },
    async updateInsurance(id: string, input: InsuranceInput, version: number) {
      return insurance(
        await json({
          method: 'PATCH',
          path: '/api/app/v1/me/insurances/' + pathId(id),
          body: insuranceBody(input, version),
          retry: 'version-only',
        }),
      );
    },
    async deleteInsurance(id: string, version: number) {
      return insurance(
        await json({
          method: 'DELETE',
          path:
            '/api/app/v1/me/insurances/' +
            pathId(id) +
            query({ expectedVersion: integer(version) }),
          retry: 'version-only',
        }),
      );
    },
    async register(id: string, input: RegistrationCommand) {
      return registrationReceipt(
        await json({
          method: 'POST',
          path: base(id) + '/registrations',
          body: registrationBody(input),
          retry: 'operation-key',
        }),
      );
    },
    async getPunchState(a: string, s: string) {
      return punchState(
        await json({
          method: 'GET',
          path: base(a) + '/sessions/' + pathId(s) + '/my-punch-state',
          retry: 'safe-read',
        }),
      );
    },
    async punch(intent: PunchIntent) {
      return punchReceipt(
        await json({
          method: 'POST',
          path:
            base(intent.activityId) +
            '/sessions/' +
            pathId(intent.sessionId) +
            '/punches/' +
            (intent.action === 'check_in' ? 'check-in' : 'check-out'),
          body: punchBody(intent),
          retry: 'event-key',
        }),
      );
    },
    async listQr(a: string, s: string) {
      return array(
        await json({
          method: 'GET',
          path: managed(a) + '/sessions/' + pathId(s) + '/qr-credentials',
          retry: 'safe-read',
        }),
      ).map(qrMetadata);
    },
    async issueQr(a: string, s: string, action: 'check-in' | 'check-out', operationKey: string) {
      return qrMetadata(
        await json({
          method: 'POST',
          path: managed(a) + '/sessions/' + pathId(s) + '/qr-credentials/' + action + '/issue',
          body: { operationKey: key(operationKey) },
          retry: 'operation-key',
        }),
      );
    },
    async revokeQr(a: string, id: string, operationKey: string, reason: string) {
      if (!reason.trim() || reason.length > 500) throw fail('validation', '撤销原因必填');
      return qrMetadata(
        await json({
          method: 'POST',
          path: managed(a) + '/qr-credentials/' + pathId(id) + '/revoke',
          body: { operationKey: key(operationKey), reason: reason.trim() },
          retry: 'operation-key',
        }),
      );
    },
    async renderQr(a: string, id: string) {
      return svg(
        await transport.send({
          method: 'POST',
          path: managed(a) + '/qr-credentials/' + pathId(id) + '/render',
          accept: 'image/svg+xml',
          headers: headers(),
          retry: 'none',
        }),
      );
    },
    async renderMember() {
      return svg(
        await transport.send({
          method: 'POST',
          path: '/api/app/v1/my/attendance-member-credential/render',
          accept: 'image/svg+xml',
          headers: headers(),
          retry: 'none',
        }),
      );
    },
    async proxy(
      a: string,
      s: string,
      input: {
        eventKey: string;
        actionCode: 'check_in' | 'check_out';
        participationIdentityId: string;
        reason: string;
      },
    ) {
      if (!input.reason.trim() || input.reason.length > 500)
        throw fail('validation', '核验原因必填');
      return punchReceipt(
        await json({
          method: 'POST',
          path: managed(a) + '/onsite/sessions/' + pathId(s) + '/proxy-punch',
          body: {
            eventKey: key(input.eventKey),
            actionCode: enumValue(input.actionCode, ['check_in', 'check_out']),
            participationIdentityId: pathId(input.participationIdentityId),
            reason: input.reason.trim(),
          },
          retry: 'event-key',
        }),
      );
    },
    async staffScan(
      a: string,
      s: string,
      input: { eventKey: string; actionCode: 'check_in' | 'check_out'; memberCredential: string },
    ) {
      return punchReceipt(
        await json({
          method: 'POST',
          path: managed(a) + '/onsite/sessions/' + pathId(s) + '/staff-scan',
          body: {
            eventKey: key(input.eventKey),
            actionCode: enumValue(input.actionCode, ['check_in', 'check_out']),
            memberCredential: text(input.memberCredential),
          },
          retry: 'event-key',
        }),
      );
    },
    async summary() {
      const o = object(
        await json({
          method: 'GET',
          path: '/api/app/v1/my/participation-summary',
          retry: 'safe-read',
        }),
      );
      return {
        totalServiceHours: decimalString(o.totalServiceHours),
        contributionPoints: decimalString(o.contributionPoints),
        activityCount: integer(o.activityCount),
        recordCount: integer(o.recordCount),
        ledgerTotals: ledgerTotals(o.ledgerTotals),
      };
    },
    async ledger(a?: string) {
      return page(
        await json({
          method: 'GET',
          path:
            '/api/app/v1/my/participation-ledger' + query({ activityId: a, page: 1, pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          if (!validDate(o.ledgerDate)) throw fail('contract-mismatch', '账本业务日无效');
          return {
            entryKey: text(o.entryKey),
            activityId: text(o.activityId),
            ledgerDate: o.ledgerDate,
            serviceHoursDelta: finite(o.serviceHoursDelta),
            recognizedPointsDelta: finite(o.recognizedPointsDelta),
            creditedPointsDelta: finite(o.creditedPointsDelta),
            cappedOutPointsDelta: finite(o.cappedOutPointsDelta),
          };
        },
      );
    },
    async createUploadSession(a: string) {
      const o = object(
        await json({
          method: 'POST',
          path: base(a) + '/registration-upload-sessions',
          retry: 'none',
        }),
      );
      const session = {
        id: text(o.id),
        token: text(o.token),
        expiresAt: iso(o.expiresAt),
        formVersion: integer(o.formVersion, 1),
      };
      uploads.set(session.id, {
        activity: a,
        token: session.token,
        expiresAt: session.expiresAt,
        used: false,
      });
      return session;
    },
    async upload(a: string, s: string, token: string, file: File) {
      const error = fileError(file);
      if (error) throw fail('validation', error);
      const session = uploads.get(s);
      if (
        !session ||
        session.activity !== a ||
        session.token !== token ||
        Date.parse(session.expiresAt) <= Date.now()
      )
        throw fail('validation', '附件会话不存在、已过期或不属于此活动');
      if (session.used) throw fail('result-unknown', '一次性附件会话已使用，请查证原操作');
      session.used = true;
      const body = new FormData();
      body.append('token', text(token));
      body.append('file', file);
      const o = object(
        await json({
          method: 'POST',
          path: base(a) + '/registration-upload-sessions/' + pathId(s) + '/files',
          body,
          retry: 'none',
        }),
      );
      return {
        attachmentId: text(o.attachmentId),
        originalName: text(o.originalName),
        mime: text(o.mime),
        size: integer(o.size, 1),
        createdAt: iso(o.createdAt),
      };
    },
  };
}
