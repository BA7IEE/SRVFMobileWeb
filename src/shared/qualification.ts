import type { Qualification } from '../data/models';
export function qualificationAllowsSelection(value?: Qualification) {
  return value?.result === 'pass' || value?.result === 'warn';
}
export function qualificationMessage(value?: Qualification) {
  if (!value) return '资格暂无法确认';
  const messages = value.unmetRules.map((r) => r.message).filter((v): v is string => Boolean(v));
  return (
    messages.join('；') ||
    (value.result === 'fail'
      ? '暂不满足本项资格'
      : value.result === 'warn'
        ? '资格附有提示，请核对参与要求'
        : '资格条件满足')
  );
}
