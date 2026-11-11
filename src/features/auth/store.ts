import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { getData } from '../../data';
import type { CurrentMember, Session } from '../../data/models';
import { appError, fail } from '../../shared/errors';
import { cleanupSession } from '../../shared/storage';
export type AuthState =
  | 'initializing'
  | 'anonymous'
  | 'authenticated'
  | 'refreshing'
  | 'expired'
  | 'blocked'
  | 'unavailable';
export const useAuth = defineStore('auth', () => {
  const state = ref<AuthState>('initializing');
  const member = shallowRef<CurrentMember>();
  const session = shallowRef<Session>();
  const message = ref('');
  const epoch = ref(0);
  const revision = ref(0);
  let restore: Promise<void> | undefined;
  let refreshing: Promise<void> | undefined;
  const ready = computed(
    () =>
      ['authenticated', 'refreshing'].includes(state.value) && member.value?.admission === 'active',
  );
  function clear() {
    epoch.value++;
    cleanupSession();
    member.value = undefined;
    session.value = undefined;
    refreshing = undefined;
    revision.value++;
  }
  async function identify(s: Session, id: number) {
    const m = await getData().auth.getCurrentMember(s);
    const cap = await getData().auth.getCapabilities(s);
    if (id !== epoch.value) return;
    if (m.admission !== 'active') {
      clear();
      member.value = { ...m, managed: false };
      state.value = 'blocked';
      await getData().auth.logout();
      return;
    }
    session.value = s;
    member.value = { ...m, managed: cap.managed };
    state.value = m.admission === 'active' ? 'authenticated' : 'blocked';
  }
  function handle(error: unknown) {
    const e = appError(error);
    message.value = e.message;
    if (['network', 'service-unavailable', 'cancelled'].includes(e.kind)) {
      state.value = 'unavailable';
    } else {
      clear();
      state.value = 'expired';
      void getData().auth.logout();
    }
  }
  function restoreSession() {
    if (restore) return restore;
    const id = epoch.value;
    restore = (async () => {
      try {
        const s = await getData().auth.restoreSession();
        if (id !== epoch.value) return;
        if (!s) {
          state.value = 'anonymous';
          return;
        }
        await identify(s, id);
      } catch (e) {
        if (id === epoch.value) handle(e);
      }
    })();
    return restore;
  }
  async function login(account: string, password: string) {
    clear();
    state.value = 'anonymous';
    message.value = '';
    const id = epoch.value;
    try {
      const s = await getData().auth.login(account, password);
      await identify(s, id);
    } catch (e) {
      if (id === epoch.value) {
        state.value = 'anonymous';
        message.value = appError(e).message;
      }
      throw e;
    }
  }
  async function logout() {
    clear();
    state.value = 'anonymous';
    message.value = '';
    await getData().auth.logout();
  }
  function refresh() {
    if (refreshing) return refreshing;
    if (!session.value) return Promise.reject(fail('unauthenticated', '请重新登录'));
    const id = epoch.value;
    const s = session.value;
    state.value = 'refreshing';
    refreshing = (async () => {
      try {
        const next = await getData().auth.refreshSession(s);
        if (id !== epoch.value) return;
        await identify(next, id);
      } catch (e) {
        if (id === epoch.value) handle(e);
        throw e;
      } finally {
        if (id === epoch.value) refreshing = undefined;
      }
    })();
    return refreshing;
  }
  async function ensureSession() {
    if (!session.value) return;
    if (
      session.value.expiresAt <= Date.parse(getData().controls?.now() ?? new Date().toISOString())
    )
      await refresh();
  }
  async function revalidate() {
    if (!session.value) return;
    const id = epoch.value;
    try {
      await ensureSession();
      if (session.value) await identify(session.value, id);
    } catch (e) {
      if (id === epoch.value) handle(e);
    }
  }
  function rerender() {
    revision.value++;
  }
  return {
    state,
    member,
    session,
    message,
    epoch,
    revision,
    ready,
    restoreSession,
    login,
    logout,
    refresh,
    ensureSession,
    revalidate,
    rerender,
  };
});
