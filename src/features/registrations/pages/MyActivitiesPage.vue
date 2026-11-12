<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import RegistrationResult from '../../../shared/components/RegistrationResult.vue';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
const view = ref('recent');
const phaseLabels = {
  open: '报名阶段',
  closed: '报名已截止',
  ended: '历史活动',
  cancelled: '活动已取消',
};
const { data, loading, error, load } = useResource(() => getData().registrations.getMyActivities());
const shown = computed(
  () => data.value?.filter((r) => view.value === 'all' || r.phase !== 'ended') ?? [],
);
onMounted(() => void load());
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>我的活动</h1>
      <p class="muted">报名状态与各场次安排，一眼确认。</p>
    </div>
    <div class="pill-filter">
      <button :aria-pressed="view === 'recent'" @click="view = 'recent'">近期</button
      ><button :aria-pressed="view === 'all'" @click="view = 'all'">全部</button>
    </div>
    <page-state
      :loading="loading"
      :error="error"
      :empty="!shown.length"
      empty-text="暂无报名关联的活动"
      @retry="load"
      ><div v-for="r in shown" :key="r.id" class="stack">
        <div class="panel-heading">
          <router-link :to="{ name: 'activity', params: { activityId: r.activityId } }"
            ><h2>{{ r.title }}</h2></router-link
          ><status-badge>{{ phaseLabels[r.phase] }}</status-badge>
        </div>
        <registration-result :result="r" links /></div
    ></page-state>
    <p class="safety-note">此列表展示报名关联，不代表完整出勤历史。临时参与请到参与记录核对。</p>
  </div>
</template>
