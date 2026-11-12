<script setup lang="ts">
import type { Question } from '../../data/models';
import FilePicker from './FilePicker.vue';
import { safeField } from '../validation';
const props = defineProps<{
  questions: Question[];
  modelValue: Record<string, unknown>;
  errors: Record<string, string>;
}>();
const emit = defineEmits<{ 'update:modelValue': [Record<string, unknown>]; blur: [string] }>();
function fileValue(code: string) {
  const value = props.modelValue[code];
  return value instanceof File ? value : undefined;
}
function hasError(code: string) {
  return safeField(code) && Object.hasOwn(props.errors, code);
}
function set(code: string, value: unknown) {
  if (safeField(code)) emit('update:modelValue', { ...props.modelValue, [code]: value });
}
function multi(code: string, value: string, checked: boolean) {
  const old = props.modelValue[code];
  const next = Array.isArray(old) ? (old.filter((x) => typeof x === 'string') as string[]) : [];
  set(code, checked ? [...new Set([...next, value])] : next.filter((x) => x !== value));
}
</script>
<template>
  <div v-for="q in questions" :key="q.code" class="field" :data-question="q.type">
    <label :for="'q-' + q.code"
      >{{ q.label }} <span v-if="q.required" class="error" aria-label="必填">*</span></label
    >
    <template v-if="safeField(q.code)">
      <input
        v-if="q.type === 'short_text' || q.type === 'number' || q.type === 'date'"
        :id="'q-' + q.code"
        :type="q.type === 'short_text' ? 'text' : q.type"
        :value="modelValue[q.code] ?? ''"
        :min="q.min"
        :max="q.max"
        :aria-invalid="Boolean(errors[q.code])"
        :aria-describedby="'err-' + q.code"
        @input="set(q.code, ($event.target as HTMLInputElement).value)"
        @blur="$emit('blur', q.code)"
      />
      <template v-else-if="q.type === 'long_text'">
        <textarea
          :id="'q-' + q.code"
          :value="String(modelValue[q.code] ?? '')"
          :aria-invalid="Boolean(errors[q.code])"
          @input="set(q.code, ($event.target as HTMLTextAreaElement).value)"
          @blur="$emit('blur', q.code)"
        ></textarea>
        <p class="help">
          {{ String(modelValue[q.code] ?? '').length }} / {{ q.max ?? 2000 }} 字
        </p></template
      >
      <select
        v-else-if="q.type === 'single_choice'"
        :id="'q-' + q.code"
        :value="modelValue[q.code] ?? ''"
        @change="set(q.code, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">请选择</option>
        <option v-for="o in q.options" :key="o" :value="o">{{ q.optionLabels?.[o] ?? o }}</option>
      </select>
      <fieldset v-else-if="q.type === 'multi_choice'">
        <legend>可多选</legend>
        <label v-for="o in q.options" :key="o" class="check-label"
          ><input
            type="checkbox"
            :checked="
              Array.isArray(modelValue[q.code]) && (modelValue[q.code] as string[]).includes(o)
            "
            @change="multi(q.code, o, ($event.target as HTMLInputElement).checked)"
          />{{ q.optionLabels?.[o] ?? o }}</label
        >
      </fieldset>
      <file-picker
        v-else-if="q.type === 'file'"
        :id="'q-' + q.code"
        :model-value="fileValue(q.code)"
        @update:model-value="set(q.code, $event)"
      />
      <label v-else-if="q.type === 'confirmation'" class="check-label"
        ><input
          :id="'q-' + q.code"
          type="checkbox"
          :checked="modelValue[q.code] === true"
          @change="set(q.code, ($event.target as HTMLInputElement).checked)"
        />明确确认</label
      >
      <p v-else role="alert" class="error">此题暂不支持，无法提交，请联系负责人。</p>
    </template>
    <p v-else role="alert" class="error">题目定义无效，无法继续提交。</p>
    <p
      v-if="hasError(q.code)"
      :id="'err-' + q.code"
      class="field-error"
      style="min-height: 21px"
      :role="errors[q.code] ? 'alert' : undefined"
    >
      {{ errors[q.code] }}
    </p>
  </div>
</template>
