<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getData } from '../../../data';
import { fail } from '../../../shared/errors';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
import { useManagedResource } from '../access';
import ManagedAccessDenied from '../components/ManagedAccessDenied.vue';

const id = String(useRoute().params.activityId);
const search = ref('');
const status = ref('');
const labels: Record<string, string> = {
  pending: '待处理',
  pass: '已通过',
  reject: '已拒绝',
  cancelled: '报名已取消',
  waitlisted: '候补中',
};
const { data, denied, loading, error, load, retry, retrying } = useManagedResource(
  async (current) => {
    const port = getData().ordinaryActivities;
    if (!port) throw fail('service-unavailable', '暂时无法读取报名名单');
    const activity = await port.registrationActivity(id);
    if (!current()) throw fail('cancelled', '活动或身份已变化');
    return { activity, rows: await port.registrations(id) };
  },
  () => {
    search.value = '';
    status.value = '';
  },
);
const visible = computed(() =>
  (data.value?.rows ?? []).filter(
    (row) =>
      (!status.value || row.status === status.value) &&
      row.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()),
  ),
);
onMounted(() => void load());
</script>
<template>
  <div class="page">
    <h1>报名管理</h1>
    <managed-access-denied
      v-if="denied"
      :message="denied.message"
      :loading="retrying"
      @retry="retry()"
    />
    <page-state v-else :loading="loading" :error="error" @retry="load">
      <section v-if="data" class="panel">
        <h2>{{ data.activity.title }}</h2>
        <label class="field">查找人员<input v-model="search" type="search" /></label>
        <label class="field"
          >报名状态<select v-model="status">
            <option value="">全部状态</option>
            <option v-for="(label, code) in labels" :key="code" :value="code">{{ label }}</option>
          </select></label
        >
        <p v-if="visible.length">当前显示 {{ visible.length }} 条报名记录</p>
        <p v-else>没有符合条件的报名记录</p>
        <div v-for="row in visible" :key="row.id" class="stack">
          <span>{{ row.name }}</span>
          <status-badge :tone="row.status === 'pass' ? 'success' : 'neutral'">{{
            labels[row.status] ?? '未知状态'
          }}</status-badge>
        </div>
      </section>
    </page-state>
  </div>
</template>
