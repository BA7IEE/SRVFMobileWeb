import type { Question, InsuranceInput, Preferences, SessionInfo } from '../../data/models';
import { qualificationAllowsSelection } from '../qualification';
export const FILE_LIMIT = 10 * 1024 * 1024;
export const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function loginErrors(account: string, password: string) {
  return {
    account: /^[a-zA-Z0-9_-]{3,32}$/.test(account.trim())
      ? ''
      : '账号为 3—32 位字母、数字、下划线或中横线',
    password: password.length ? '' : '请输入密码',
  };
}
export function passwordError(old: string, next: string, repeat: string) {
  if (!old) return '请输入原密码';
  if (next.length < 8 || next.length > 128 || !/[a-zA-Z]/.test(next) || !/\d/.test(next))
    return '新密码须为 8—128 位，包含字母和数字';
  if (next !== repeat) return '两次新密码不一致';
  return '';
}
export function insuranceErrors(input: InsuranceInput) {
  const errors: Record<string, string> = {};
  if (!input.insurer.trim() || input.insurer.trim().length > 128)
    errors.insurer = '请填写保险公司，不超过 128 字';
  if (!input.policy.trim() || input.policy.trim().length > 128)
    errors.policy = '请填写保单号，不超过 128 字';
  if (input.start && !validDate(input.start)) errors.start = '起保日期无效';
  if (!validDate(input.end)) errors.end = '请填写有效到期日期';
  if (input.start && validDate(input.start) && validDate(input.end) && input.start > input.end)
    errors.end = '到期日期不能早于起保日期';
  return errors;
}
export function fileError(file: File): string {
  if (file.size === 0) return '不能选择空文件';
  if (file.size > FILE_LIMIT) return '单文件不能超过 10 MiB';
  if (!FILE_TYPES.includes(file.type) || !/\.(jpe?g|png|webp|pdf)$/i.test(file.name))
    return '请选择 JPEG、PNG、WebP 或 PDF';
  return '';
}
export function safeField(code: string) {
  return (
    /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(code) &&
    !['__proto__', 'constructor', 'prototype'].includes(code)
  );
}
export function questionError(q: Question, v: unknown): string {
  if (!safeField(q.code) || q.type === 'unsupported') return '此题暂不支持，请联系负责人';
  const empty =
    v === undefined ||
    v === null ||
    v === '' ||
    (typeof v === 'string' && !v.trim()) ||
    (Array.isArray(v) && !v.length);
  if (empty) return q.required ? '请填写此项' : '';
  switch (q.type) {
    case 'short_text':
    case 'long_text':
      return typeof v !== 'string' ||
        v.trim().length < (q.min ?? 0) ||
        v.trim().length > (q.max ?? 2000)
        ? '字数不符合要求'
        : '';
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
      return !Number.isFinite(n) || n < (q.min ?? -Infinity) || n > (q.max ?? Infinity)
        ? '请输入范围内的有效数字'
        : '';
    }
    case 'date':
      return validDate(v) ? '' : '请输入有效日期';
    case 'single_choice':
      return typeof v === 'string' && q.options?.includes(v) ? '' : '请选择给定选项';
    case 'multi_choice':
      return Array.isArray(v) &&
        new Set(v).size === v.length &&
        v.every((x) => typeof x === 'string' && q.options?.includes(x)) &&
        v.length <= (q.max ?? Infinity) &&
        v.length >= (q.min ?? 0)
        ? ''
        : '选项重复、无效或数量不符合要求';
    case 'file':
      return v instanceof File ? fileError(v) : '请重新选择本地文件';
    case 'confirmation':
      return v === true || (!q.required && v === false) ? '' : '请明确勾选确认';
  }
}
export function preferenceError(preferences: Preferences, sessions: SessionInfo[]) {
  if (!preferences.length) return '至少选择一个场次';
  if (new Set(preferences.map((x) => x.sessionId)).size !== preferences.length)
    return '场次不能重复';
  for (const p of preferences) {
    const s = sessions.find((s) => s.id === p.sessionId);
    if (
      !s ||
      new Set(p.positionIds).size !== p.positionIds.length ||
      p.positionIds.some((id) => !s.positions.some((x) => x.id === id)) ||
      (s.positions.length && !p.positionIds.length)
    )
      return '请核对场次和岗位志愿';
    if (
      !qualificationAllowsSelection(s.qualification) ||
      s.positions.some(
        (position) =>
          p.positionIds.includes(position.id) &&
          !qualificationAllowsSelection(position.qualification),
      )
    )
      return '所选场次或岗位的资格已变化，请重新核对';
  }
  return '';
}
