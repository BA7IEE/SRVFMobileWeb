<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { Popup as VanPopup, Button as VanButton } from 'vant';
import { renderCredential } from '../../platform/scanner';
import { onSessionCleanup, onBackgroundCleanup } from '../storage';
const props = defineProps<{
  show: boolean;
  payload?: string;
  title: string;
  description: string;
}>();
const emit = defineEmits<{ 'update:show': [boolean] }>();
const url = ref<string>();
let epoch = 0;
function release() {
  epoch++;
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = undefined;
}
watch(
  () => [props.show, props.payload],
  async () => {
    release();
    if (!props.show || !props.payload) return;
    const id = epoch;
    const next = await renderCredential(props.payload);
    if (id !== epoch) URL.revokeObjectURL(next);
    else url.value = next;
  },
  { immediate: true },
);
const unregister = onSessionCleanup(() => {
  release();
  emit('update:show', false);
});
const unregisterBackground = onBackgroundCleanup(() => {
  release();
  emit('update:show', false);
});
onUnmounted(() => {
  release();
  unregister();
  unregisterBackground();
});
</script>
<template>
  <van-popup
    :show="show"
    position="bottom"
    teleport="body"
    :close-on-click-overlay="false"
    @update:show="emit('update:show', $event)"
    ><section class="full-popup" role="dialog" aria-modal="true" :aria-label="title">
      <h1>{{ title }}</h1>
      <p class="notice">仅用于演示，不可用于真实考勤</p>
      <img v-if="url" :src="url" :alt="title + '（演示）'" class="qr-image" />
      <p>{{ description }}</p>
      <van-button type="primary" autofocus @click="emit('update:show', false)"
        >关闭二维码</van-button
      >
    </section></van-popup
  >
</template>
