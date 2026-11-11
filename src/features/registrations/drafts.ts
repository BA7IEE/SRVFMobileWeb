import type { Preferences } from '../../data/models';
import { onSessionCleanup, readMock, writeMock, removeMock } from '../../shared/storage';
type Draft = { answers: Record<string, unknown>; preferences: Preferences };
const memory = new Map<string, Draft>();
const keys = new Set<string>();
onSessionCleanup(() => {
  memory.clear();
  for (const key of keys) removeMock('draft:' + key);
  keys.clear();
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('srvf:ui:')) sessionStorage.removeItem(key);
  } catch {
    /* 存储不可用 */
  }
});
export function getDraft(key: string): Draft {
  const old = memory.get(key);
  if (old) return old;
  const persisted = readMock(
    'draft:' + key,
    (x): x is { preferences: Preferences } =>
      typeof x === 'object' && x !== null && 'preferences' in x && Array.isArray(x.preferences),
  );
  return { answers: {}, preferences: persisted?.preferences ?? [] };
}
export function saveDraft(key: string, value: Draft) {
  memory.set(key, value);
  keys.add(key);
  writeMock('draft:' + key, { preferences: value.preferences });
}
export function clearDraft(key: string) {
  memory.delete(key);
  keys.delete(key);
  removeMock('draft:' + key);
}
