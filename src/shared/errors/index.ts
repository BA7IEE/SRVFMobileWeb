import type { AppError, ErrorKind } from '../../data/models';
export class RegistrationFormVersionError extends Error {
  readonly kind = 'conflict';
  constructor() {
    super('表单已更新，请刷新后重新核对');
  }
}
export function fail(kind: ErrorKind, message: string): AppError {
  return Object.assign(new Error(message), { kind });
}
export function appError(error: unknown): AppError {
  return error instanceof Error && 'kind' in error
    ? (error as AppError)
    : fail('service-unavailable', '暂时无法读取，请重试');
}
