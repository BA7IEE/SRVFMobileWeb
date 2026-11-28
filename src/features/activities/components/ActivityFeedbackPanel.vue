<script setup lang="ts">
import { ref } from 'vue';
import { Button as VanButton } from 'vant';
import { getData } from '../../../data';
import type { ActivityFeedbackState } from '../../../data/models';
import { appError } from '../../../shared/errors';
import { beijing } from '../../../shared/time';
const props = defineProps<{ activityId: string }>();
const home = getData().memberHome;
const opened = ref(false);
const state = ref<ActivityFeedbackState>();
const error = ref('');
const blocked = ref(false);
const loading = ref(false);
const rating = ref(0);
const comment = ref('');
const busy = ref(false);
const saved = ref('');
async function load() {
  if (!home || loading.value) return;
  opened.value = true;
  loading.value = true;
  error.value = '';
  blocked.value = false;
  saved.value = '';
  try {
    const next = await home.getFeedback(props.activityId);
    state.value = next;
    rating.value = next.rating ?? 0;
    comment.value = next.comment ?? '';
  } catch (e) {
    state.value = undefined;
    const app = appError(e);
    blocked.value = app.message === '活动尚未完结，暂不能评价';
    if (!blocked.value) error.value = app.message;
  } finally {
    loading.value = false;
  }
}
async function submit() {
  if (!home || busy.value || !state.value?.canSubmit || rating.value < 1) return;
  busy.value = true;
  error.value = '';
  saved.value = '';
  try {
    const next = await home.submitFeedback(
      props.activityId,
      rating.value,
      comment.value.trim() ? comment.value.trim() : null,
    );
    state.value = next;
    saved.value = '评价已保存。需要修改时，请在窗口关闭前再次提交。';
  } catch (e) {
    const app = appError(e);
    if (app.message === '活动尚未完结，暂不能评价') {
      blocked.value = true;
      state.value = undefined;
    } else if (app.kind === 'result-unknown') {
      error.value = app.message + '请重新读取评价，不要自动重发。';
    } else error.value = app.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div v-if="home" class="feedback">
    <button class="text-button" :disabled="loading" @click="load">
      {{ loading ? '正在读取评价条件…' : '查看评价条件' }}
    </button>
    <section v-if="opened" class="panel">
      <h3>活动评价</h3>
      <p v-if="loading" role="status">正在读取…</p>
      <template v-else-if="blocked">
        <p>活动尚未完结，暂不能评价。</p>
        <p class="help">
          需要活动状态为已完成，并且存在有效的结算关账。结束时间已过，不能评价，也不能在这里查看结算。
        </p>
      </template>
      <p v-else-if="error" class="error" role="alert">{{ error }}</p>
      <template v-else-if="state">
        <p v-if="state.rating">
          已保存 {{ state.rating }} 星<span v-if="state.comment">：{{ state.comment }}</span>
        </p>
        <p v-if="state.eligibilityCorrected" class="notice">
          最新结算已调整评价资格，历史评价仍保留。
        </p>
        <p v-if="state.canSubmit" class="help">评价窗口关闭：{{ beijing(state.windowClosesAt) }}</p>
        <p v-else class="help">
          当前不能提交或修改。窗口已关闭，或没有审核通过的到场记录时，都不能新写评价。
        </p>
        <template v-if="state.canSubmit">
          <div class="pill-filter" role="group" aria-label="评分">
            <button
              v-for="n in 5"
              :key="n"
              type="button"
              :aria-pressed="rating === n"
              :disabled="busy"
              @click="rating = n"
            >
              {{ n }} 星
            </button>
          </div>
          <label class="field"
            >评价文字（可不填）<textarea v-model="comment" maxlength="500" rows="3"></textarea>
          </label>
          <van-button type="primary" :disabled="busy || rating < 1" :loading="busy" @click="submit"
            >提交评价</van-button
          >
          <p v-if="saved" class="success" role="status">{{ saved }}</p>
        </template>
      </template>
    </section>
  </div>
</template>
