import { onUnmounted, ref, shallowRef } from 'vue';
import { closeDialog, showConfirmDialog, type DialogOptions } from 'vant';
import type { AppError } from '../../data/models';
import { useResource } from '../../shared/composables/resource';
import { appError, fail } from '../../shared/errors';

/** 本页失权后只允许显式只读恢复，并作废此前的读取、确认和写入回调。 */
export function useManagedResource<T>(
  loader: (current: () => boolean) => Promise<T>,
  clearSensitive: () => void,
) {
  const denied = shallowRef<AppError>();
  const retrying = ref(false);
  let version = 0;
  let readVersion = 0;
  let active = true;
  let confirmation: object | undefined;
  async function confirm(options: DialogOptions) {
    const token = {};
    confirmation = token;
    try {
      return await showConfirmDialog({ ...options, destroyOnClose: true });
    } finally {
      if (confirmation === token) confirmation = undefined;
    }
  }
  function snapshot() {
    const id = version;
    return () => active && id === version;
  }
  function canRead() {
    return active && (!denied.value || retrying.value);
  }
  const resource = useResource(async () => {
    if (!canRead()) throw fail('cancelled', '请显式重新读取当前权限');
    const id = ++readVersion;
    const sameAccess = snapshot();
    const current = () => sameAccess() && id === readVersion;
    try {
      const next = await loader(current);
      if (!current()) throw fail('cancelled', '当前权限状态已变化');
      return next;
    } catch (error) {
      const failure = appError(error);
      if (current() && failure.kind === 'forbidden') revoke(failure);
      throw error;
    }
  });
  function cancel() {
    version++;
    readVersion++;
    resource.cancel();
    if (confirmation) {
      confirmation = undefined;
      closeDialog();
    }
  }
  function revoke(failure: AppError) {
    denied.value = failure;
    cancel();
    clearSensitive();
  }
  async function retry(verify?: () => Promise<boolean>) {
    if (retrying.value || !active) return;
    retrying.value = true;
    const current = snapshot();
    try {
      await resource.load();
      if (
        current() &&
        resource.data.value !== undefined &&
        !resource.error.value &&
        (!verify || (await verify())) &&
        current()
      )
        denied.value = undefined;
    } finally {
      if (denied.value) {
        cancel();
        clearSensitive();
      }
      retrying.value = false;
    }
  }
  onUnmounted(() => {
    active = false;
    cancel();
  });
  return { ...resource, cancel, confirm, denied, retrying, retry, revoke, snapshot, canRead };
}
