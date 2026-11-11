import type { AppError, ErrorKind } from '../../data/models';
export function fail(kind: ErrorKind, message: string): AppError {
  return Object.assign(new Error(message), { kind });
}
export function appError(error: unknown): AppError {
  return error instanceof Error && 'kind' in error
    ? (error as AppError)
    : fail('service-unavailable', '暂时无法读取，请重试');
}
