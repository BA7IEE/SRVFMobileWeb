<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getData } from '../../../data';
import { fail } from '../../../shared/errors';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
import { useResource } from '../../../shared/composables/resource';

const roles = { initiator: '发起人', owner: '负责人', collaborator: '协作者' };
const states: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  completed: '已结束',
  cancelled: '已取消',
  terminated: '已终止',
  archived: '已归档',
};
const pageNumber = ref(1);
const { data, loading, error, load } = useResource(async () => {
  const listPage = getData().managed.listPage;
  if (!listPage) throw fail('service-unavailable', '暂时无法读取负责活动');
  return listPage(pageNumber.value);
});
function go(page: number) {
  if (loading.value || page < 1) return;
  pageNumber.value = page;
  void load();
}
onMounted(() => void load());
</script>

<template>
  <div class="page">
    <h1>我负责的活动</h1>
    <page-state
      :loading="loading"
      :error="error"
      :empty="!data?.items.length"
      empty-text="当前没有可管理的活动"
      @retry="load"
    >
      <section v-for="row in data?.items" :key="row.activityId" class="panel">
        <h2>{{ row.title }}</h2>
        <p class="muted">{{ roles[row.relationship] }}</p>
        <status-badge>{{ states[row.statusCode] ?? '未知状态' }}</status-badge>
        <router-link
          v-if="row.canReadRoster"
          class="text-button"
          :to="{ name: 'manage-registrations', params: { activityId: row.activityId } }"
          >报名管理</router-link
        >
      </section>
    </page-state>
    <nav
      v-if="!error && (pageNumber > 1 || (data && data.total > data.pageSize))"
      aria-label="活动分页"
    >
      <button
        :disabled="loading || pageNumber === 1"
        aria-label="上一页"
        @click="go(pageNumber - 1)"
      >
        上一页
      </button>
      <span>第 {{ pageNumber }} 页</span>
      <button
        :disabled="loading || !data || pageNumber * data.pageSize >= data.total"
        aria-label="下一页"
        @click="go(pageNumber + 1)"
      >
        下一页
      </button>
    </nav>
  </div>
</template>
