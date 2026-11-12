import { array, bool, enumValue, finite, integer, iso, object, text } from './core';
import { readForm } from './reads';
import { fail } from '../../shared/errors';
import type { Qualification, RegistrationFormDefinition, Question } from '../models';

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw fail('contract-mismatch', '文本字段缺失');
  return value;
}
function capacity(value: unknown) {
  return value === null ? null : integer(value);
}
function timestamp(value: unknown) {
  return value === null ? null : iso(value);
}
export function qualification(value: unknown): Qualification {
  const o = object(value);
  return {
    result: enumValue(o.resultCode, ['pass', 'warn', 'fail']),
    unmetRules: array(o.unmetRules).map((value) => {
      const rule = object(value);
      return {
        id: text(rule.ruleId),
        enforcement: enumValue(rule.enforcementCode, ['block', 'warn']),
        result: enumValue(rule.resultCode, ['warn', 'fail']),
        message: nullableString(rule.message),
        warnScore: rule.warnScore === null ? null : finite(rule.warnScore),
      };
    }),
  };
}
export function activityDetail(value: unknown) {
  const o = object(value);
  return {
    id: text(o.id),
    title: text(o.title),
    description: nullableString(o.description),
    location: text(o.location),
    capacity: capacity(o.capacity),
    registrationNotes: nullableString(o.registrationNotes),
    requiresInsurance: bool(o.requiresInsurance),
    qualification: qualification(o.qualification),
    registrationForm: readForm(o.registrationForm),
    phase: enumValue(o.phase, ['upcoming', 'ongoing', 'ended']),
    formVersion: o.formVersion === null ? null : integer(o.formVersion, 1),
    sessions: array(o.sessions).map((value) => {
      const s = object(value);
      return {
        id: text(s.id),
        code: text(s.code),
        name: text(s.name),
        startAt: iso(s.startAt),
        endAt: iso(s.endAt),
        location: text(s.locationText),
        capacity: capacity(s.capacity),
        qualification: qualification(s.qualification),
        positions: array(s.positions).map((value) => {
          const p = object(value);
          return {
            id: text(p.id),
            code: text(p.code),
            name: text(p.name),
            attendanceRole: text(p.attendanceRoleCode),
            capacity: capacity(p.capacity),
            startAt: timestamp(p.startAt),
            endAt: timestamp(p.endAt),
            genderRequirement: nullableString(p.genderRequirementCode),
            description: nullableString(p.description),
            equipmentNotes: nullableString(p.equipmentNotes),
            sortOrder: integer(p.sortOrder, Number.MIN_SAFE_INTEGER),
            qualification: qualification(p.qualification),
          };
        }),
      };
    }),
  };
}
function bound(value: string | null) {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER)
    throw fail('contract-mismatch', '表单数值约束超出客户端范围');
  return parsed;
}
/** Known detail -> the same form model consumed by RegisterPage, without granting insurance/admission. */
export function activityRegistrationForm(
  detail: ReturnType<typeof activityDetail>,
): RegistrationFormDefinition {
  if ((detail.registrationForm?.version ?? null) !== detail.formVersion)
    throw fail('contract-mismatch', '表单版本与详情不一致');
  const questions: Question[] = (detail.registrationForm?.fields ?? []).map((f) => ({
    code: f.fieldCode,
    type: f.typeCode,
    label: f.label,
    required: f.required,
    min: f.typeCode === 'number' ? bound(f.minValue) : (f.minLength ?? undefined),
    max:
      f.typeCode === 'number'
        ? bound(f.maxValue)
        : f.typeCode === 'multi_choice'
          ? (f.maxSelections ?? undefined)
          : (f.maxLength ?? undefined),
    options: f.options?.map((o) => o.value),
    optionLabels: f.options
      ? Object.fromEntries(f.options.map((o) => [o.value, o.label]))
      : undefined,
  }));
  return {
    version: detail.formVersion,
    qualification: detail.qualification,
    questions,
    sessions: detail.sessions.map((s) => ({
      ...s,
      positions: [...s.positions].sort((a, b) => a.sortOrder - b.sortOrder),
      // The fixed App detail has no verified geolocation policy. Do not assume no location required.
      locationRequired: null,
    })),
  };
}
