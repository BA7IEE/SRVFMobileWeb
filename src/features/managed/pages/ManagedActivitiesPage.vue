<script setup lang="ts">
import { onMounted } from 'vue';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import PageState from '../../../shared/components/PageState.vue';
const { data, loading, error, load } = useResource(async () => {
  const activities = await getData().managed.listActivities();
  return Promise.all(
    activities.map(async (a) => ({ activity: a, scope: await getData().managed.getScope(a.id) })),
  );
});
onMounted(() => void load());
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>我负责的活动</h1>
      <p class="muted">按本活动职责工作，无需切换管理员账号。</p>
    </div>
    <page-state
      :loading="loading"
      :error="error"
      :empty="!data?.length"
      empty-text="当前没有可管理的活动"
      @retry="load"
      ><section v-for="item in data" :key="item.activity.id" class="panel">
        <h2>{{ item.activity.title }}</h2>
        <p class="muted">{{ item.activity.location }}</p>
        <router-link
          v-if="item.scope.registration.state === 'allowed'"
          :to="{ name: 'manage-registrations', params: { activityId: item.activity.id } }"
          class="text-button"
          >报名管理</router-link
        ><router-link
          v-if="item.scope.attendance.state === 'allowed'"
          :to="{ name: 'onsite', params: { activityId: item.activity.id } }"
          class="text-button"
          >现场考勤工作台</router-link
        >
      </section></page-state
    >
  </div>
</template>
