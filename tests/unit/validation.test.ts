import { describe, it, expect } from 'vitest';
import {
  validDate,
  loginErrors,
  passwordError,
  insuranceErrors,
  questionError,
  preferenceError,
  fileError,
  safeField,
} from '../../src/shared/validation';
import { safeTarget } from '../../src/app/router/safe-target';
import { beijing, decimal } from '../../src/shared/time';
import { IntentRegistry } from '../../src/shared/composables/intent';
import { readMock, writeMock } from '../../src/shared/storage';
describe('输入、日期与返回目标', () => {
  it.each([
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['2026-04-31', false],
    ['2026-11-15', true],
    ['2026-1-1', false],
  ])('date %s', (value, result) => expect(validDate(value)).toBe(result));
  it('登录按已核对 DTO，密码不 trim、不套注册规则', () => {
    expect(loginErrors(' abc_123- ', ' ')).toEqual({ account: '', password: '' });
    expect(loginErrors('a', '')).toMatchObject({ account: expect.any(String) });
    expect(loginErrors('abc@x.com', 'test').account).not.toBe('');
    expect(passwordError('old', 'abcd1234', 'abcd1234')).toBe('');
    expect(passwordError('old', 'abcd1234', 'abcd1235')).not.toBe('');
  });
  it('保险可空起保、保单允许字母，日期前后与上限受控', () => {
    expect(
      insuranceErrors({ insurer: '演示', policy: 'ABC-中文', start: null, end: '2026-12-31' }),
    ).toEqual({});
    expect(
      insuranceErrors({
        insurer: 'x'.repeat(129),
        policy: '',
        start: '2026-12-01',
        end: '2026-11-30',
      }),
    ).toHaveProperty('end');
  });
  it.each([
    'https://other.test',
    '//other.test',
    '/%2f%2fother.test',
    '/activities?token=x',
    '/unknown',
    '/activities/../../my',
    '/activities\\x',
    '/login',
  ])('拒绝非法返回 %s', (value) => expect(safeTarget(value)).toBe('/activities'));
  it('允许已知站内深链接；权限仍由守卫判断', () =>
    expect(safeTarget('/activities/act-open/register')).toBe('/activities/act-open/register'));
  it('北京时间与 null/zero 不混淆', () => {
    expect(beijing('2026-11-14T18:00:00Z')).toContain('15');
    expect(decimal(null, '小时')).toBe('待认定');
    expect(decimal('0.00', '小时')).toBe('0.00 小时');
  });
  it('拒绝原型键', () => {
    expect(safeField('__proto__')).toBe(false);
    expect(safeField('constructor')).toBe(false);
    expect(safeField('field_1')).toBe(true);
  });
  it('八类题边界不把零和 false 当空值', () => {
    expect(
      questionError({ code: 'a', type: 'number', label: '', required: true, min: 0, max: 10 }, 0),
    ).toBe('');
    expect(
      questionError({ code: 'a', type: 'number', label: '', required: true }, Infinity),
    ).not.toBe('');
    expect(
      questionError({ code: 'a', type: 'confirmation', label: '', required: false }, false),
    ).toBe('');
    expect(
      questionError({ code: 'a', type: 'confirmation', label: '', required: true }, false),
    ).not.toBe('');
    expect(
      questionError(
        { code: 'a', type: 'multi_choice', label: '', required: true, options: ['a'], max: 2 },
        ['a', 'a'],
      ),
    ).not.toBe('');
    expect(
      questionError(
        { code: 'a', type: 'single_choice', label: '', required: true, options: ['a'] },
        'z',
      ),
    ).not.toBe('');
    expect(
      questionError({ code: 'a', type: 'short_text', label: '', required: true, min: 2 }, 'x'),
    ).not.toBe('');
    expect(
      questionError({ code: 'a', type: 'long_text', label: '', required: false, max: 2 }, 'abc'),
    ).not.toBe('');
    expect(
      questionError({ code: 'a', type: 'unsupported', label: '', required: false }, ''),
    ).not.toBe('');
  });
  it('文件空、超限、MIME/后缀无效均拒绝', () => {
    expect(fileError(new File([], 'x.pdf', { type: 'application/pdf' }))).not.toBe('');
    expect(
      fileError(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'x.pdf', { type: 'application/pdf' }),
      ),
    ).not.toBe('');
    expect(fileError(new File(['a'], 'x.exe', { type: 'image/png' }))).not.toBe('');
    expect(fileError(new File(['a'], 'x.pdf', { type: 'application/pdf' }))).toBe('');
  });
  it('不能重复场次或跨场次岗位', () => {
    const sessions = [
      {
        id: 'session-a',
        name: '',
        startAt: '',
        endAt: '',
        locationRequired: false,
        positions: [{ id: 'position-a', name: '' }],
      },
    ];
    expect(
      preferenceError([{ sessionId: 'session-a', positionIds: ['position-b'] }], sessions),
    ).not.toBe('');
    expect(
      preferenceError([{ sessionId: 'session-a', positionIds: ['position-a'] }], sessions),
    ).toBe('');
  });
  it('版本、过期及损坏的演示存储', () => {
    writeMock('x', { id: 1 });
    expect(
      readMock('x', (x): x is { id: number } => typeof x === 'object' && x !== null && 'id' in x),
    ).toEqual({ id: 1 });
    sessionStorage.setItem('srvf:mock:v1:x', '{broken');
    expect(readMock('x', (x): x is object => typeof x === 'object')).toBeNull();
    sessionStorage.setItem(
      'srvf:mock:v1:x',
      JSON.stringify({ v: 9, expires: Date.now() + 1000, value: {} }),
    );
    expect(readMock('x', (x): x is object => typeof x === 'object')).toBeNull();
  });
});
describe('操作防重', () => {
  it('更换本地File即使同名同大小也不能冒充原载荷', async () => {
    const r = new IntentRegistry();
    const first = new File(['1'], 'same.pdf', { type: 'application/pdf' });
    await r.execute('file-key', { file: first }, async () => 1);
    await expect(
      r.execute(
        'file-key',
        { file: new File(['2'], 'same.pdf', { type: 'application/pdf' }) },
        async () => 2,
      ),
    ).rejects.toHaveProperty('kind', 'conflict');
  });
  it('同键同体共享结果，异体不重放', async () => {
    const r = new IntentRegistry();
    let count = 0;
    const fn = async () => ++count;
    expect(
      await Promise.all([r.execute('key', { x: 1 }, fn), r.execute('key', { x: 1 }, fn)]),
    ).toEqual([1, 1]);
    await expect(r.execute('key', { x: 2 }, fn)).rejects.toHaveProperty('kind', 'conflict');
    expect(count).toBe(1);
  });
});
