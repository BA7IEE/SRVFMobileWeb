import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { appError } from '../errors';
import type { AppError } from '../../data/models';
export function useResource<T>(loader: () => Promise<T>) {
  const data = shallowRef<T>();
  const loading = ref(false);
  const error = shallowRef<AppError>();
  let generation = 0;
  async function load() {
    const id = ++generation;
    loading.value = true;
    error.value = undefined;
    try {
      const next = await loader();
      if (id === generation) data.value = next;
    } catch (e) {
      if (id === generation) error.value = appError(e);
    } finally {
      if (id === generation) loading.value = false;
    }
  }
  function cancel() {
    generation++;
    data.value = undefined;
    loading.value = false;
  }
  const resume = () => {
    void load();
  };
  onMounted(() => window.addEventListener('srvf:resume', resume));
  onUnmounted(() => {
    window.removeEventListener('srvf:resume', resume);
    cancel();
  });
  return { data, loading, error, load, cancel };
}
