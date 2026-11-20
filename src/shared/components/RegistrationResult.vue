<script setup lang="ts">
import type { RegistrationResult } from '../../data/models';
import StatusBadge from './StatusBadge.vue';
defineProps<{ result: RegistrationResult; links?: boolean }>();
const statuses = {
  pending: '待审核',
  pass: '已通过',
  reject: '已拒绝',
  cancelled: '报名已取消',
  waitlisted: '候补中',
};
const names = { confirmed: '场次通过（演示）', waitlisted: '候补中', pending: '待分配' };
</script>
<template>
  <section class="panel">
    <div class="panel-heading">
      <h2>报名与场次结果</h2>
      <status-badge :tone="result.status === 'cancelled' ? 'neutral' : 'pending'">{{
        result.serverStatus
          ? statuses[result.serverStatus]
          : result.status === 'cancelled'
            ? '报名已取消'
            : '报名已提交（演示）'
      }}</status-badge>
    </div>
    <p v-if="result.serverStatus && !result.sessions.length" class="help">
      报名接口未提供逐场次分配结果。
    </p>
    <div v-for="s in result.sessions" :key="s.id" class="session-row">
      <strong>{{ s.name }}</strong>
      <p>{{ names[s.result] }}</p>
      <p class="muted">岗位：{{ s.position ?? '待确认' }}</p>
      <router-link
        v-if="
          links &&
          result.status !== 'cancelled' &&
          s.result === 'confirmed' &&
          result.phase !== 'ended'
        "
        :to="{ name: 'attendance', params: { activityId: result.activityId, sessionId: s.id } }"
        class="text-button"
        >进入本场次考勤</router-link
      >
    </div>
  </section>
</template>
