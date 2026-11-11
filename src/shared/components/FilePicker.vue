<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { fileError } from '../validation';
import { onSessionCleanup } from '../storage';
const props = defineProps<{ modelValue?: File; id: string }>();
const emit = defineEmits<{ 'update:modelValue': [File | undefined] }>();
const error = ref('');
const preview = ref<string>();
const fileInput = ref<HTMLInputElement>();
function release() {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = undefined;
}
watch(
  () => props.modelValue,
  (file) => {
    release();
    if (file?.type.startsWith('image/')) preview.value = URL.createObjectURL(file);
  },
  { immediate: true },
);
function select(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  error.value = fileError(file);
  if (!error.value) emit('update:modelValue', file);
  input.value = '';
}
const unregister = onSessionCleanup(release);
onUnmounted(() => {
  release();
  unregister();
});
</script>
<template>
  <div class="stack">
    <input
      ref="fileInput"
      :id="id"
      class="visually-hidden"
      type="file"
      accept="image/jpeg,image/png,image/webp,application/pdf"
      :aria-describedby="id + '-help'"
      @change="select"
    />
    <button type="button" class="text-button file-choose" @click="fileInput?.click()">
      {{ modelValue ? '重新选择本地文件' : '选择本地文件' }}
    </button>
    <p :id="id + '-help'" class="help">
      仅本地选择，尚未上传；JPEG、PNG、WebP、PDF，最多 10 MiB。请勿使用真实资料。
    </p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <template v-if="modelValue"
      ><p class="long-text">
        {{ modelValue.name }} · {{ (modelValue.size / 1024).toFixed(1) }} KiB
      </p>
      <img v-if="preview" :src="preview" alt="本地演示附件预览" class="preview-image" /><button
        type="button"
        class="text-button danger-button"
        @click="emit('update:modelValue', undefined)"
      >
        移除文件
      </button></template
    >
  </div>
</template>
