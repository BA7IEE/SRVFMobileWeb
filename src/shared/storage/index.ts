const prefix = 'srvf:mock:v1:';
export function readMock<T>(key: string, validate: (value: unknown) => value is T): T | null {
  try {
    const raw = sessionStorage.getItem(prefix + key);
    if (!raw) return null;
    const box: unknown = JSON.parse(raw);
    if (
      typeof box !== 'object' ||
      box === null ||
      !('v' in box) ||
      box.v !== 1 ||
      !('expires' in box) ||
      typeof box.expires !== 'number' ||
      box.expires < Date.now() ||
      !('value' in box) ||
      !validate(box.value)
    ) {
      sessionStorage.removeItem(prefix + key);
      return null;
    }
    return box.value;
  } catch {
    return null;
  }
}
export function writeMock(key: string, value: unknown) {
  try {
    sessionStorage.setItem(
      prefix + key,
      JSON.stringify({ v: 1, expires: Date.now() + 86400000, value }),
    );
  } catch {
    /* 可继续使用内存 */
  }
}
export function removeMock(key: string) {
  try {
    sessionStorage.removeItem(prefix + key);
  } catch {
    /* 存储不可用 */
  }
}
const cleanups = new Set<() => void>();
const backgroundCleanups = new Set<() => void>();
export function onBackgroundCleanup(fn: () => void) {
  backgroundCleanups.add(fn);
  return () => backgroundCleanups.delete(fn);
}
export function cleanupDevices() {
  for (const fn of backgroundCleanups) fn();
}
export function onSessionCleanup(fn: () => void) {
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}
export function cleanupSession() {
  cleanupDevices();
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('srvf:ui:')) sessionStorage.removeItem(key);
  } catch {
    /* 存储不可用时仍清理内存和设备资源 */
  }
  for (const fn of cleanups) fn();
}
