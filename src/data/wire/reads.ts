import {
  array,
  bool,
  decimalString,
  envelope,
  enumValue,
  integer,
  iso,
  nullableText,
  object,
  page,
  pathId,
  query,
  text,
  type WireRequest,
  type WireResponse,
} from './core';
import { fail } from '../../shared/errors';
import { noticeKindLabel, teamJoinGateLabel } from '../../shared/labels';
import { passwordError, validDate, safeField } from '../../shared/validation';
type Json = (
  request: Omit<WireRequest, 'accept'>,
  decode?: (response: WireResponse) => unknown,
) => Promise<unknown>;
export function ownRegistration(value: unknown) {
  const o = object(value);
  return {
    id: text(o.id),
    activityId: text(o.activityId),
    statusCode: enumValue(o.statusCode, ['pending', 'pass', 'reject', 'cancelled', 'waitlisted']),
    waitlistPosition: o.waitlistPosition === null ? null : integer(o.waitlistPosition, 1),
    registeredAt: iso(o.registeredAt),
    cancelledAt: o.cancelledAt === null ? null : iso(o.cancelledAt),
  };
}
export function readForm(value: unknown) {
  if (value === null) return null;
  const o = object(value);
  return {
    version: integer(o.version, 1),
    fields: array(o.fields).map((value) => {
      const f = object(value);
      if (!safeField(text(f.fieldCode))) throw fail('contract-mismatch', '题目标识无效');
      return {
        fieldCode: text(f.fieldCode),
        typeCode: enumValue(f.typeCode, [
          'short_text',
          'long_text',
          'number',
          'date',
          'single_choice',
          'multi_choice',
          'file',
          'confirmation',
        ]),
        label: text(f.label),
        required: bool(f.required),
        minValue: f.minValue === null ? null : decimalString(f.minValue),
        maxValue: f.maxValue === null ? null : decimalString(f.maxValue),
        minLength: f.minLength === null ? null : integer(f.minLength),
        maxLength: f.maxLength === null ? null : integer(f.maxLength),
        maxSelections: f.maxSelections === null ? null : integer(f.maxSelections, 1),
        options:
          f.options === null
            ? null
            : array(f.options).map((v) => {
                const option = object(v);
                return { value: text(option.value), label: text(option.label) };
              }),
      };
    }),
  };
}
export function ledgerTotals(value: unknown) {
  const o = object(value);
  return {
    committedServiceHours: decimalString(o.committedServiceHours),
    committedContributionPoints: decimalString(o.committedContributionPoints),
    inFlightServiceHours: decimalString(o.inFlightServiceHours),
    inFlightContributionPoints: decimalString(o.inFlightContributionPoints),
  };
}
export function createKnownReads(json: Json) {
  return {
    async listOwnRegistrations(pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path:
            '/api/app/v1/my/registrations' + query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          return {
            ...ownRegistration(o),
            title: text(o.activityTitle),
            startAt: iso(o.activityStartAt),
            endAt: iso(o.activityEndAt),
          };
        },
      );
    },
    async getOwnRegistration(id: string) {
      return ownRegistration(
        await json({
          method: 'GET',
          path: '/api/app/v1/my/registrations/' + pathId(id),
          retry: 'safe-read',
        }),
      );
    },
    async cancelOwnRegistration(id: string, reason?: string) {
      if (reason !== undefined && reason.length > 500) throw fail('validation', '取消原因过长');
      return ownRegistration(
        await json({
          method: 'PATCH',
          path: '/api/app/v1/my/registrations/' + pathId(id) + '/cancel',
          body: reason === undefined ? {} : { cancelReason: reason.trim() },
          retry: 'none',
        }),
      );
    },
    async changePassword(oldPassword: string, newPassword: string) {
      const error = passwordError(oldPassword, newPassword, newPassword);
      if (error) throw fail('validation', error);
      return object(
        await json({
          method: 'PUT',
          path: '/api/app/v1/me/password',
          body: { oldPassword, newPassword },
          retry: 'none',
        }),
      );
    },
    async listManagedActivities(pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path:
            '/api/app/v1/my/managed-activities' +
            query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          return {
            activityId: text(o.activityId),
            title: text(o.title),
            statusCode: text(o.statusCode),
            relationship: enumValue(o.relationship, ['initiator', 'owner', 'collaborator']),
            startAt: iso(o.startAt),
            endAt: iso(o.endAt),
            pendingRegistrations: integer(o.pendingRegistrations),
          };
        },
      );
    },
    async getManagedResponsibility(id: string, expected?: 'owner' | 'collaborator') {
      const o = object(
        await json({
          method: 'GET',
          path: '/api/app/v1/my/managed-activities/' + pathId(id),
          retry: 'safe-read',
        }),
      );
      const activity = object(o.activity);
      if (activity.id !== id) throw fail('contract-mismatch', '活动回执不一致');
      const title = text(activity.title);
      if (expected && o.myResponsibility === null)
        throw fail('forbidden', '本场职责已变化，请重新读取');
      if (o.myResponsibility === null)
        return {
          title,
          registration: { state: 'unknown' as const },
          attendance: { state: 'unknown' as const },
        };
      const r = object(o.myResponsibility);
      const type = enumValue(r.responsibilityType, ['owner', 'collaborator']);
      if (expected && type !== expected) throw fail('contract-mismatch', '本场职责与列表不一致');
      return {
        title,
        registration: {
          state: bool(r.canManageRegistrations) ? ('allowed' as const) : ('denied' as const),
        },
        attendance: {
          state: bool(r.canManageAttendance) ? ('allowed' as const) : ('denied' as const),
        },
      };
    },
    async listManagedRegistrations(id: string, pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path:
            '/api/app/v1/my/managed-activities/' +
            pathId(id) +
            '/registrations' +
            query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          const m = object(o.member);
          return {
            registrationId: text(o.registrationId),
            activityId: text(o.activityId),
            memberLabel: nullableText(m.label),
            statusCode: enumValue(o.statusCode, [
              'pending',
              'pass',
              'reject',
              'cancelled',
              'waitlisted',
            ]),
            waitlistPosition: o.waitlistPosition === null ? null : integer(o.waitlistPosition, 1),
          };
        },
      );
    },
    async bulkApprove(id: string, ids: string[]) {
      if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length)
        throw fail('validation', '本批需选择1—100条且不重复');
      const o = object(
        await json({
          method: 'PATCH',
          path: '/api/app/v1/my/managed-activities/' + pathId(id) + '/registrations/bulk-approve',
          body: { ids: ids.map(pathId) },
          retry: 'none',
        }),
      );
      const succeeded = array(o.succeeded).map(text);
      const failed = array(o.failed).map((v) => {
        const item = object(v);
        return { id: text(item.id), code: integer(item.code), message: text(item.message) };
      });
      const all = [...succeeded, ...failed.map((f) => f.id)];
      if (
        new Set(all).size !== all.length ||
        all.length !== ids.length ||
        all.some((v) => !ids.includes(v))
      )
        throw fail('contract-mismatch', '批量回执对象或数量与原请求不符');
      return { succeeded, failed };
    },
    async timeProof(dateFrom: string, dateTo: string) {
      if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo)
        throw fail('validation', '业务日期范围无效');
      const o = object(
        await json({
          method: 'GET',
          path:
            '/api/app/v1/my/participation-time-proof' +
            query({ dateFrom, dateTo, page: 1, pageSize: 20 }),
          retry: 'safe-read',
        }),
      );
      if (o.proofVersion !== 1) throw fail('contract-mismatch', '未知时长证明版本');
      return {
        proofVersion: 1,
        asOf: iso(o.asOf),
        eligibleServiceSeconds: integer(o.eligibleServiceSeconds),
        legacyRecognizedSeconds: integer(o.legacyRecognizedSeconds),
        volunteerServiceSeconds: integer(o.volunteerServiceSeconds),
        trainingSeconds: integer(o.trainingSeconds),
        organizationSeconds: integer(o.organizationSeconds),
        nonCreditableSeconds: integer(o.nonCreditableSeconds),
        total: integer(o.total),
        page: integer(o.page, 1),
        pageSize: integer(o.pageSize, 1, 100),
        items: array(o.items).map((value) => {
          const r = object(value);
          if (!validDate(r.ledgerDate)) throw fail('contract-mismatch', '业务日期无效');
          return {
            activityId: text(r.activityId),
            ledgerDate: r.ledgerDate,
            sourceCategoryCode: enumValue(r.sourceCategoryCode, [
              'legacy_recognized_service',
              'volunteer_service',
              'training',
              'organization',
              'non_creditable',
            ]),
            sourceMode: enumValue(r.sourceMode, ['legacy_ledger', 'classified_time_ledger']),
            recognizedSeconds: integer(r.recognizedSeconds),
          };
        }),
      };
    },
    async listAvailable(pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path:
            '/api/app/v1/activities/available' +
            query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          return {
            id: text(o.id),
            title: text(o.title),
            type: text(o.activityTypeCode),
            status: enumValue(o.statusCode, ['published']),
            startAt: iso(o.startAt),
            endAt: iso(o.endAt),
            location: text(o.location),
            registrationMode: null as string | null,
          };
        },
      );
    },
    async listMyActivities(pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path: '/api/app/v1/my/activities' + query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          return {
            activityId: text(o.activityId),
            title: text(o.title),
            statusCode: enumValue(o.statusCode, ['draft', 'published', 'cancelled', 'completed']),
            startAt: iso(o.startAt),
            endAt: iso(o.endAt),
            location: text(o.location),
            myRegistrationId: text(o.myRegistrationId),
            myRegistrationStatusCode: enumValue(o.myRegistrationStatusCode, [
              'pending',
              'pass',
              'reject',
              'cancelled',
              'waitlisted',
            ]),
            myRegisteredAt: iso(o.myRegisteredAt),
          };
        },
      );
    },
    async listCertificates(pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path:
            '/api/app/v1/my/certificates' + query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          return {
            id: text(o.id),
            name: text(o.standardName),
            issuer: text(o.issuingOrg),
            number: nullableText(o.certNumber),
            issuedAt: iso(o.issuedAt),
            expiredAt: o.expiredAt === null ? null : iso(o.expiredAt),
            status: enumValue(o.certStatusCode, ['pending', 'verified', 'expired', 'rejected']),
            note: nullableText(o.verifyNote),
          };
        },
      );
    },
    async listAttendanceRecords(pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path:
            '/api/app/v1/my/attendance-records' +
            query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          text(o.roleCode);
          return {
            id: text(o.id),
            activityId: text(o.activityId),
            title: text(o.activityTitle),
            checkInAt: iso(o.checkInAt),
            checkOutAt: iso(o.checkOutAt),
            hours: decimalString(o.serviceHours),
            points: o.contributionPoints === null ? null : decimalString(o.contributionPoints),
            status: enumValue(o.attendanceStatusCode, ['present', 'late', 'early_leave']),
            note: nullableText(o.note),
          };
        },
      );
    },
    async listNotices(pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path: '/api/app/v1/notifications' + query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          return {
            id: text(o.id),
            title: text(o.title),
            kind: noticeKindLabel(text(o.notificationTypeCode)),
            pinned: bool(o.pinned),
            read: bool(o.read),
            publishedAt: o.publishedAt === null ? null : iso(o.publishedAt),
          };
        },
      );
    },
    async getNotice(id: string) {
      const o = object(
        await json({
          method: 'GET',
          path: '/api/app/v1/notifications/' + pathId(id),
          retry: 'safe-read',
        }),
      );
      if (text(o.id) !== id) throw fail('contract-mismatch', '通知回执不一致');
      return {
        id,
        title: text(o.title),
        body: text(o.body),
        kind: noticeKindLabel(text(o.notificationTypeCode)),
        pinned: bool(o.pinned),
        read: bool(o.read),
        publishedAt: o.publishedAt === null ? null : iso(o.publishedAt),
      };
    },
    async markNoticeRead(id: string) {
      const o = object(
        await json({
          method: 'POST',
          path: '/api/app/v1/notifications/' + pathId(id) + '/read',
          retry: 'none',
        }),
      );
      if (o.read !== true) throw fail('contract-mismatch', '已读回执不一致');
    },
    async unreadCount() {
      const o = object(
        await json({
          method: 'GET',
          path: '/api/app/v1/notifications/unread-count',
          retry: 'safe-read',
        }),
      );
      return integer(o.unreadCount);
    },
    async listContents(pageNumber = 1) {
      return page(
        await json({
          method: 'GET',
          path: '/api/app/v1/contents' + query({ page: integer(pageNumber, 1), pageSize: 20 }),
          retry: 'safe-read',
        }),
        (item) => {
          const o = object(item);
          return {
            id: text(o.id),
            title: text(o.title),
            summary: nullableText(o.summary),
            pinned: bool(o.pinned),
            publishedAt: o.publishedAt === null ? null : iso(o.publishedAt),
          };
        },
      );
    },
    async getContent(id: string) {
      const o = object(
        await json({
          method: 'GET',
          path: '/api/app/v1/contents/' + pathId(id),
          retry: 'safe-read',
        }),
      );
      if (text(o.id) !== id) throw fail('contract-mismatch', '内容回执不一致');
      return {
        id,
        title: text(o.title),
        summary: nullableText(o.summary),
        body: text(o.body),
        pinned: bool(o.pinned),
        publishedAt: o.publishedAt === null ? null : iso(o.publishedAt),
      };
    },
    async getProfile() {
      return profile(
        await json({ method: 'GET', path: '/api/app/v1/me/profile', retry: 'safe-read' }),
      );
    },
    async updateNickname(nickname: string) {
      const value = nickname.trim();
      if (!value || value.length > 50) throw fail('validation', '昵称需为 1—50 字');
      return profile(
        await json({
          method: 'PATCH',
          path: '/api/app/v1/me/profile',
          body: { nickname: value },
          retry: 'none',
        }),
      );
    },
    async getAvatar() {
      const data = await json({
        method: 'GET',
        path: '/api/app/v1/me/avatar',
        retry: 'safe-read',
      });
      if (data === null) return null;
      const o = object(data);
      return {
        attachmentId: text(o.attachmentId),
        accessUrl: nullableText(o.accessUrl),
        expiresAt: o.expiresAt === null ? null : iso(o.expiresAt),
      };
    },
    async getTeamJoinCurrent() {
      const data = await json(
        {
          method: 'GET',
          path: '/api/app/v1/me/team-join/applications/current',
          retry: 'safe-read',
        },
        (response) => {
          if (
            response.status === 404 &&
            response.contentType.split(';')[0]?.trim().toLowerCase() === 'application/json'
          ) {
            const body = object(response.body);
            if (body.code === 28202 && body.data === null && text(body.message)) return null;
          }
          return envelope(response);
        },
      );
      if (data === null) return null;
      const o = object(data);
      return {
        id: text(o.id),
        cycleName: text(o.cycleName),
        year: integer(o.cycleYear, 1),
        status: text(o.statusCode),
        points: decimalString(o.contributionPoints),
        pointsMet: bool(o.contributionSatisfied),
        gatesMet: bool(o.generalGatesSatisfied),
        gates: array(o.gates).map((value) => {
          const gate = object(value);
          return {
            label: teamJoinGateLabel(text(gate.code)),
            satisfied: bool(gate.satisfied),
            professional: bool(gate.professional),
          };
        }),
      };
    },
    async getFeedback(activityId: string) {
      return feedback(
        await json({
          method: 'GET',
          path: '/api/app/v1/my/activities/' + pathId(activityId) + '/feedback',
          retry: 'safe-read',
        }),
      );
    },
    async submitFeedback(activityId: string, rating: number, comment: string | null) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        throw fail('validation', '请选择 1 到 5 星');
      if (comment !== null && comment.length > 500)
        throw fail('validation', '评价文字不超过 500 字');
      return feedback(
        await json({
          method: 'PUT',
          path: '/api/app/v1/my/activities/' + pathId(activityId) + '/feedback',
          body: { rating, comment },
          retry: 'none',
        }),
      );
    },
  };
}
function profile(value: unknown) {
  const o = object(value);
  return {
    username: text(o.username),
    nickname: nullableText(o.nickname),
    memberNo: text(o.memberNo),
    realName: text(o.realName),
    memberLabel: text(o.memberLabel),
  };
}
function feedback(value: unknown) {
  const o = object(value);
  const current = o.feedback === null ? null : object(o.feedback);
  return {
    rating: current ? integer(current.rating, 1, 5) : null,
    comment: current ? nullableText(current.comment) : null,
    updatedAt: current ? iso(current.updatedAt) : null,
    eligibilityCorrected: current ? bool(current.eligibilityCorrected) : false,
    canSubmit: bool(o.canSubmit),
    windowClosesAt: iso(o.windowClosesAt),
  };
}
