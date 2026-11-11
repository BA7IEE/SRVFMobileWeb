import { afterEach, vi } from 'vitest';
afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});
