<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import { Button as VanButton } from 'vant';
import { CameraAdapter } from '../../platform/camera';
import { decodeFile, decodePixels } from '../../platform/scanner';
import { appError } from '../errors';
import { onSessionCleanup } from '../storage';
const props = defineProps<{
  demoCode?: () => string;
  disabled?: boolean;
  label: string;
  simulation?: 'default' | 'denied' | 'unavailable' | 'timeout' | 'ignored';
}>();
const emit = defineEmits<{ recognized: [string] }>();
const camera = new CameraAdapter();
const state = ref('idle');
const error = ref('');
const video = ref<HTMLVideoElement>();
let frame = 0;
let epoch = 0;
function stop() {
  epoch++;
  camera.stop();
  cancelAnimationFrame(frame);
  if (video.value) video.value.srcObject = null;
  state.value = 'idle';
}
function recognized(code: string) {
  stop();
  state.value = 'recognized';
  emit('recognized', code);
}
async function start() {
  if (props.disabled || state.value === 'requesting' || state.value === 'scanning') return;
  error.value = '';
  state.value = 'requesting';
  if (props.simulation === 'ignored') return;
  if (props.simulation === 'denied' || props.simulation === 'unavailable') {
    state.value = props.simulation;
    error.value =
      props.simulation === 'denied'
        ? '模拟相机权限被拒绝，请开启权限或联系现场负责人'
        : '模拟相机不可用，请联系现场负责人';
    return;
  }
  const id = epoch;
  try {
    const stream = await camera.start();
    if (id !== epoch) return;
    await nextTick();
    if (!video.value) {
      camera.stop();
      return;
    }
    video.value.srcObject = stream;
    await video.value.play();
    if (id !== epoch) return;
    state.value = 'scanning';
    scan(id);
  } catch (e) {
    if (id === epoch) {
      stop();
      state.value = 'unavailable';
      error.value = appError(e).message;
    }
  }
}
function scan(id: number) {
  if (id !== epoch || !video.value) return;
  const v = video.value;
  if (v.readyState >= 2) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(v.videoWidth, 640);
    canvas.height = Math.round((v.videoHeight * canvas.width) / v.videoWidth);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      void decodePixels(ctx.getImageData(0, 0, canvas.width, canvas.height))
        .then((code) => {
          if (id === epoch) recognized(code);
        })
        .catch(() => {
          if (id === epoch) frame = requestAnimationFrame(() => scan(id));
        });
      return;
    }
  }
  frame = requestAnimationFrame(() => scan(id));
}
async function file(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = input.files?.[0];
  input.value = '';
  if (!selected || props.disabled) return;
  stop();
  error.value = '';
  const id = epoch;
  try {
    const code = await decodeFile(selected);
    if (id === epoch) recognized(code);
  } catch (e) {
    if (id === epoch) error.value = appError(e).message;
  }
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) stop();
  },
);
function visibility() {
  if (document.hidden) stop();
}
document.addEventListener('visibilitychange', visibility);
const unregister = onSessionCleanup(stop);
onUnmounted(() => {
  stop();
  document.removeEventListener('visibilitychange', visibility);
  unregister();
});
</script>
<template>
  <section class="panel">
    <h2>{{ label }}</h2>
    <p class="help">先进入本页，再点击扫一扫。解码不代表凭证已通过业务核验，不会打开码中的网址。</p>
    <video
      ref="video"
      playsinline
      muted
      :hidden="state !== 'scanning'"
      aria-label="本地相机画面"
    ></video>
    <p v-if="state === 'requesting'" role="status">
      等待相机授权，可随时取消。未选择授权时不会自动提交。
    </p>
    <van-button
      type="primary"
      :disabled="disabled || state === 'requesting' || state === 'scanning'"
      @click="start"
      >扫一扫 / 测试相机</van-button
    ><van-button v-if="state === 'requesting' || state === 'scanning'" plain @click="stop"
      >停止并关闭相机</van-button
    ><label class="field"
      >识别本地二维码图片<input
        type="file"
        accept="image/*"
        :disabled="disabled"
        @change="file" /></label
    ><van-button v-if="demoCode" plain :disabled="disabled" @click="recognized(demoCode!())"
      >使用预置演示码</van-button
    >
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p class="safety-note">
      无设备权限时请联系现场考勤负责人核验。电脑图片识别不能代替手机微信实测。
    </p>
  </section>
</template>
