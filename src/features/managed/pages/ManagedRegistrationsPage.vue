<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton, showConfirmDialog } from 'vant';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import { appError } from '../../../shared/errors';
import { onSessionCleanup } from '../../../shared/storage';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
const id = String(useRoute().params.activityId);
const filter = ref('');
const keyword = ref('');
let active = true;
onUnmounted(() => {
  active = false;
  unregister();
});
const selected = ref<string[]>([]);
const busy = ref(false);
const unknown = ref(false);
const message = ref('');
const outcomes = ref<{ id: string; success: boolean; message: string }[]>([]);
const { data, loading, error, load } = useResource(async () => {
  const [activity, registrations] = await Promise.all([
    getData().activities.getDetail(id),
    getData().managed.listRegistrations(id),
  ]);
  return { activity, registrations };
});
const unregister = onSessionCleanup(() => {
  active = false;
  data.value = undefined;
  selected.value = [];
  outcomes.value = [];
});
watch(error, (failure) => {
  if (failure?.kind === 'forbidden') {
    data.value = undefined;
    selected.value = [];
    outcomes.value = [];
  }
});
onMounted(() => void load());
watch([filter, keyword], () => {
  selected.value = [];
  outcomes.value = [];
});
const visible = computed(
  () =>
    data.value?.registrations.filter(
      (x) =>
        (!filter.value || x.status === filter.value) &&
        x.memberLabel.toLocaleLowerCase().includes(keyword.value.trim().toLocaleLowerCase()),
    ) ?? [],
);
async function review() {
  if (busy.value || unknown.value || !selected.value.length) return;
  busy.value = true;
  const ids = visible.value
    .filter((x) => selected.value.includes(x.id) && x.review.state === 'allowed')
    .map((x) => x.id);
  message.value = '';
  outcomes.value = [];
  try {
    await showConfirmDialog({
      title: '确认本次报名审核',
      message: `${data.value?.activity.title}\n已选：${visible.value
        .filter((x) => ids.includes(x.id))
        .map((x) => x.memberLabel)
        .join(
          '、',
        )}\n仅针对当前活动已选的 ${ids.length} 人。分配批次与抽签结果不由本页计算，逐项结果将分别显示。`,
    });
  } catch {
    busy.value = false;
    return;
  }
  if (!active) return;
  try {
    const results = await getData().managed.executeAllowedReview(id, ids);
    if (!active) return;
    outcomes.value = results;
    selected.value = [];
    await load();
  } catch (e) {
    if (!active) return;
    unknown.value = appError(e).kind === 'result-unknown';
    message.value = appError(e).message;
    if (appError(e).kind === 'forbidden') {
      data.value = undefined;
      selected.value = [];
    }
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>报名管理</h1>
      <p v-if="data">{{ data.activity.title }}</p>
      <p class="muted">职责：本活动报名管理</p>
    </div>
    <label class="field"
      >查找人员<input v-model="keyword" type="search" :disabled="busy" placeholder="成员编号或姓名"
    /></label>
    <label class="field"
      >报名状态<select v-model="filter" :disabled="busy">
        <option value="">全部状态</option>
        <option value="pending">待处理</option>
        <option value="confirmed">已确认</option>
        <option value="waitlisted">候补</option>
      </select></label
    ><page-state
      :loading="loading"
      :error="error"
      :empty="!visible.length"
      empty-text="没有符合条件的报名记录"
      @retry="load"
      ><section class="panel">
        <p class="help">当前显示 {{ visible.length }} 条报名记录</p>
        <div v-for="r in visible" :key="r.id" class="stack">
          <label class="check-label"
            ><input
              v-model="selected"
              type="checkbox"
              :value="r.id"
              :disabled="busy || r.review.state !== 'allowed'"
            />{{ r.memberLabel }}</label
          ><status-badge :tone="r.status === 'confirmed' ? 'success' : 'pending'">{{
            { pending: '待处理', confirmed: '已确认', waitlisted: '候补中' }[r.status]
          }}</status-badge>
          <p>{{ r.sessions }}</p>
          <p v-if="r.review.state !== 'allowed'" class="help">{{ r.review.reason }}</p>
          <hr class="separator" />
        </div>
        <van-button
          type="primary"
          :disabled="!selected.length || busy || unknown"
          :loading="busy"
          @click="review"
          >审核已选 {{ selected.length }} 人</van-button
        >
      </section></page-state
    >
    <section v-if="outcomes.length" class="panel" role="status">
      <h2>本次成功 {{ outcomes.filter((x) => x.success).length }} / {{ outcomes.length }}</h2>
      <p v-for="r in outcomes" :key="r.id">
        {{ data?.registrations.find((x) => x.id === r.id)?.memberLabel ?? r.id }}：{{
          r.success ? '成功' : '未完成'
        }}，{{ r.message }}
      </p>
    </section>
    <p v-if="unknown" class="notice">审核结果尚未确认，请重新读取并联系负责人核对，勿重复审核。</p>
    <p v-if="message" class="error" role="alert">{{ message }}</p>
    <p class="safety-note">没有保单号、精确位置或其他无关信息。真实审核能力与权限待联调。</p>
  </div>
</template>
