<script setup lang="ts">
import type { SessionInfo, Preferences } from '../../data/models';
import { beijing } from '../time';
const props = defineProps<{ sessions: SessionInfo[]; modelValue: Preferences }>();
const emit = defineEmits<{ 'update:modelValue': [Preferences] }>();
function toggle(id: string, on: boolean) {
  emit(
    'update:modelValue',
    on
      ? [...props.modelValue, { sessionId: id, positionIds: [] }]
      : props.modelValue.filter((x) => x.sessionId !== id),
  );
}
function position(sessionId: string, id: string, on: boolean) {
  emit(
    'update:modelValue',
    props.modelValue.map((p) =>
      p.sessionId !== sessionId
        ? p
        : {
            ...p,
            positionIds: on ? [...p.positionIds, id] : p.positionIds.filter((x) => x !== id),
          },
    ),
  );
}
function move(sessionId: string, index: number) {
  const copy = props.modelValue.map((p) => ({ ...p, positionIds: [...p.positionIds] }));
  const p = copy.find((p) => p.sessionId === sessionId)!;
  [p.positionIds[index - 1], p.positionIds[index]] = [
    p.positionIds[index]!,
    p.positionIds[index - 1]!,
  ];
  emit('update:modelValue', copy);
}
</script>
<template>
  <div class="stack">
    <fieldset v-for="s in sessions" :key="s.id">
      <legend>{{ s.name }}</legend>
      <label class="check-label"
        ><input
          type="checkbox"
          :checked="modelValue.some((p) => p.sessionId === s.id)"
          @change="toggle(s.id, ($event.target as HTMLInputElement).checked)"
        />参加本场次</label
      >
      <p class="help">{{ beijing(s.startAt) }} 至 {{ beijing(s.endAt) }}</p>
      <template v-if="modelValue.some((p) => p.sessionId === s.id) && s.positions.length"
        ><p class="muted">按勾选顺序排列岗位志愿，也可上移调整。</p>
        <label v-for="p in s.positions" :key="p.id" class="check-label"
          ><input
            type="checkbox"
            :checked="modelValue.find((x) => x.sessionId === s.id)!.positionIds.includes(p.id)"
            @change="position(s.id, p.id, ($event.target as HTMLInputElement).checked)"
          />{{ p.name }}</label
        >
        <div
          v-for="(p, index) in modelValue.find((x) => x.sessionId === s.id)!.positionIds"
          :key="p"
          class="row"
        >
          <span>第 {{ index + 1 }} 志愿 · {{ s.positions.find((x) => x.id === p)?.name }}</span
          ><button v-if="index > 0" type="button" class="text-button" @click="move(s.id, index)">
            上移
          </button>
        </div></template
      >
    </fieldset>
  </div>
</template>
