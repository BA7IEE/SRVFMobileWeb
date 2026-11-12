import { describe, expect, it } from 'vitest';
import type { Qualification, SessionInfo } from '../../src/data/models';
import { getDraft } from '../../src/features/registrations/drafts';
import { writeMock } from '../../src/shared/storage';
import { preferenceError } from '../../src/shared/validation';

const qualified = (result: 'pass' | 'warn'): Qualification => ({ result, unmetRules: [] });
function session(): SessionInfo {
  return {
    id: 'session-draft',
    name: '合成草稿场次',
    startAt: '2026-11-15T00:00:00Z',
    endAt: '2026-11-15T02:00:00Z',
    locationRequired: false,
    qualification: qualified('pass'),
    positions: [
      { id: 'position-selected', name: '合成已选岗位', qualification: qualified('pass') },
    ],
  };
}
// Deliberately malformed local data: normal wire parsing already rejects these values.
const invalid = [
  { reason: '资格缺失', value: undefined },
  { reason: '资格为空', value: null },
  { reason: '资格未通过', value: { result: 'fail', unmetRules: [] } },
  { reason: '资格状态未知', value: { result: 'unknown', unmetRules: [] } },
];
describe('旧草稿的已选场次和岗位资格', () => {
  it.each(
    invalid.flatMap((item) => ['session', 'position'].map((target) => ({ ...item, target }))),
  )('$target $reason时，最终校验要求重新核对', ({ value, target }) => {
    const current = session();
    const qualification = value as Qualification | undefined;
    if (target === 'session') current.qualification = qualification;
    else current.positions[0]!.qualification = qualification;
    const preferences = [{ sessionId: current.id, positionIds: ['position-selected'] }];
    writeMock('draft:qualification-regression', { preferences });
    const draft = getDraft('qualification-regression');
    expect(draft.preferences).toEqual(preferences);
    expect(preferenceError(draft.preferences, [current])).toBe(
      '所选场次或岗位的资格已变化，请重新核对',
    );
  });
  it.each(
    (['pass', 'warn'] as const).flatMap((s) => (['pass', 'warn'] as const).map((p) => ({ s, p }))),
  )('场次$s、岗位$p仍允许提交', ({ s, p }) => {
    const current = session();
    current.qualification = qualified(s);
    current.positions[0]!.qualification = qualified(p);
    expect(
      preferenceError([{ sessionId: current.id, positionIds: ['position-selected'] }], [current]),
    ).toBe('');
  });
  it('未选场次和未选岗位的未知资格不影响有效志愿', () => {
    const current = session();
    current.positions.push({ id: 'position-unselected', name: '合成未选岗位' });
    const unselected = { ...session(), id: 'session-unselected', qualification: undefined };
    expect(
      preferenceError(
        [{ sessionId: current.id, positionIds: ['position-selected'] }],
        [current, unselected],
      ),
    ).toBe('');
  });
});
