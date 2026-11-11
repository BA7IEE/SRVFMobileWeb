import { fail } from '../../shared/errors';
import type { ErrorKind } from '../models';
export type WireRequest = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  accept: 'application/json' | 'image/svg+xml';
  retry: 'safe-read' | 'operation-key' | 'event-key' | 'version-only' | 'none';
};
export type WireResponse = { status: number; contentType: string; body: unknown };
export interface Transport {
  send(request: WireRequest, signal?: AbortSignal): Promise<WireResponse>;
}
/** No fetch, base URL, credentials, or runtime network implementation. */
export class FakeTransport implements Transport {
  readonly requests: WireRequest[] = [];
  constructor(
    private replies: (WireResponse | Error | ((r: WireRequest) => Promise<WireResponse>))[],
  ) {}
  async send(request: WireRequest, signal?: AbortSignal) {
    if (signal?.aborted) throw fail('cancelled', '请求已取消');
    this.requests.push(request);
    const reply = this.replies.shift();
    if (!reply) throw fail('contract-mismatch', '未提供离线响应');
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(request) : reply;
  }
}
export class DeliveryError extends Error {
  constructor(public delivery: 'not-sent' | 'unknown') {
    super('传输未取得回执');
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw fail('contract-mismatch', '响应对象不符合契约');
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length)
    throw fail('contract-mismatch', '缺少有效字符串字段');
  return value;
}
export function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw fail('contract-mismatch', '数字超出契约范围');
  return value;
}
export function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw fail('contract-mismatch', '数字无效');
  return value;
}
export function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw fail('contract-mismatch', '布尔字段缺失');
  return value;
}
export function enumValue<const T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value))
    throw fail('contract-mismatch', '未知业务状态，操作已停止');
  return value;
}
export function iso(value: unknown): string {
  const v = text(value);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v.slice(0, 10)
  )
    throw fail('contract-mismatch', '时间格式不符合契约');
  return v;
}
export function decimalString(value: unknown): string {
  const v = text(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(v)) throw fail('contract-mismatch', 'Decimal 字符串无效');
  return v;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw fail('contract-mismatch', '响应列表缺失');
  return value;
}
export function pathId(id: string) {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) throw fail('validation', '路径标识不符合契约');
  return encodeURIComponent(id);
}
export function key(value: string) {
  if (value.length < 1 || value.length > 128) throw fail('validation', '操作键不符合契约');
  return value;
}
export function query(input: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) if (v !== undefined) params.set(k, String(v));
  const s = params.toString();
  return s ? '?' + s : '';
}
export function page<T>(value: unknown, mapper: (item: unknown) => T) {
  const o = object(value);
  return {
    items: array(o.items).map(mapper),
    total: integer(o.total),
    page: integer(o.page, 1),
    pageSize: integer(o.pageSize, 1, 100),
  };
}
// All numeric mappings are from the pinned backend BizCode; unknown codes do not imply refresh.
const known: Record<number, { kind: ErrorKind; message: string }> = {
  40000: { kind: 'validation', message: '请求参数不符合要求' },
  40100: { kind: 'unauthenticated', message: '当前会话失效' },
  40300: { kind: 'forbidden', message: '当前操作未获授权' },
  40400: { kind: 'not-found', message: '记录不存在或不可访问' },
  42900: { kind: 'rate-limited', message: '操作频繁，请稍后重试' },
  50300: { kind: 'service-unavailable', message: '服务暂不可用' },
  10004: { kind: 'unauthenticated', message: '账号或密码错误' },
  10007: { kind: 'unauthenticated', message: '续期凭证失效，请重新登录' },
  26011: { kind: 'conflict', message: '保险版本已变化，请刷新核对' },
};
export function envelope(response: WireResponse): unknown {
  if (!response.contentType.toLowerCase().startsWith('application/json'))
    throw fail('contract-mismatch', '预期 JSON 响应');
  const o = object(response.body);
  const code = integer(o.code);
  text(o.message);
  if (code !== 0) {
    const entry = known[code];
    throw fail(
      entry?.kind ?? 'business-rejected',
      entry?.message ?? '服务拒绝当前操作，请重新核对状态',
    );
  }
  if (response.status < 200 || response.status >= 300 || !('data' in o))
    throw fail('contract-mismatch', '响应状态或信封缺失');
  return o.data;
}
export function svg(response: WireResponse): Blob {
  if (response.contentType.toLowerCase().startsWith('application/json')) {
    envelope(response);
    throw fail('contract-mismatch', '二维码未返回图像');
  }
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !response.contentType.toLowerCase().startsWith('image/svg+xml') ||
    typeof response.body !== 'string' ||
    !response.body.includes('<svg')
  )
    throw fail('contract-mismatch', '二维码图像响应无效');
  // Display only via image Blob; do not inject markup into the document.
  return new Blob([response.body], { type: 'image/svg+xml' });
}
