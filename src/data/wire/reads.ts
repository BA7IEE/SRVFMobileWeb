import {
  array,
  bool,
  decimalString,
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
} from './core';
import { fail } from '../../shared/errors';
import { passwordError, validDate, safeField } from '../../shared/validation';
type Json = (request: Omit<WireRequest, 'accept'>) => Promise<unknown>;
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
    async getManagedResponsibility(id: string) {
      const o = object(
        await json({
          method: 'GET',
          path: '/api/app/v1/my/managed-activities/' + pathId(id),
          retry: 'safe-read',
        }),
      );
      if (o.myResponsibility === null)
        return {
          registration: { state: 'unknown' as const },
          attendance: { state: 'unknown' as const },
        };
      const r = object(o.myResponsibility);
      enumValue(r.responsibilityType, ['owner', 'collaborator']);
      return {
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
  };
}
