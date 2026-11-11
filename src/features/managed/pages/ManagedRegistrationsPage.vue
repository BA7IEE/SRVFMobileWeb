<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton, showConfirmDialog } from 'vant';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import { appError } from '../../../shared/errors';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
const id = String(useRoute().params.activityId);
const filter = ref('');
const selected = ref<string[]>([]);
const busy = ref(false);
const message = ref('');
const outcomes = ref<{ id: string; success: boolean; message: string }[]>([]);
const { data, loading, error, load } = useResource(() => getData().managed.listRegistrations(id));
onMounted(() => void load());
watch(filter, () => {
  selected.value = [];
  outcomes.value = [];
});
const visible = computed(
  () => data.value?.filter((x) => !filter.value || x.status === filter.value) ?? [],
);
async function review() {
  if (busy.value || !selected.value.length) return;
  busy.value = true;
  const ids = [...selected.value];
  try {
    await showConfirmDialog({
      title: '确认本次报名审核',
      message: `仅针对当前活动已选的 ${ids.length} 人。分配批次与抽签结果不由本页计算，逐项结果将分别显示。`,
    });
  } catch {
    busy.value = false;
    return;
  }
  try {
    outcomes.value = await getData().managed.executeAllowedReview(id, ids);
    selected.value = [];
    await load();
  } catch (e) {
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
      <p class="muted">仅展示安全成员标签与必要报名摘要。</p>
    </div>
    <label class="field"
      >报名状态<select v-model="filter">
        <option value="">全部状态</option>
        <option value="pending">待处理</option>
        <option value="confirmed">已确认</option>
        <option value="waitlisted">候补</option>
      </select></label
    ><page-state :loading="loading" :error="error" :empty="!visible.length" @retry="load"
      ><section class="panel">
        <div v-for="r in visible" :key="r.id" class="stack">
          <label class="check-label"
            ><input
              v-model="selected"
              type="checkbox"
              :value="r.id"
              :disabled="r.review.state !== 'allowed'"
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
          :disabled="!selected.length || busy"
          :loading="busy"
          @click="review"
          >审核已选 {{ selected.length }} 人</van-button
        >
      </section></page-state
    >
    <section v-if="outcomes.length" class="panel" role="status">
      <h2>本次成功 {{ outcomes.filter((x) => x.success).length }} / {{ outcomes.length }}</h2>
      <p v-for="r in outcomes" :key="r.id">{{ r.id }}：{{ r.message }}</p>
    </section>
    <p v-if="message" class="error" role="alert">{{ message }}</p>
    <p class="safety-note">没有保单号、精确位置或其他无关信息。真实审核能力与权限待联调。</p>
  </div>
</template>
