<script setup lang="ts">
import type { ActivityInsuranceEligibility } from '../../data/models';
import StatusBadge from './StatusBadge.vue';
defineProps<{ eligibility?: ActivityInsuranceEligibility; activityId: string }>();
</script>
<template>
  <section class="panel" aria-label="本次活动保险条件">
    <div class="panel-heading">
      <h2>本次活动保险条件</h2>
      <status-badge :tone="eligibility?.status === 'eligible' ? 'success' : 'pending'">{{
        eligibility?.status === 'eligible'
          ? '满足演示条件'
          : eligibility?.status === 'ineligible'
            ? '需处理'
            : '待确认'
      }}</status-badge>
    </div>
    <p class="muted">{{ eligibility?.explanation ?? '正在核对，确认前不能提交报名' }}</p>
    <p v-if="eligibility?.source === 'team'" class="muted">
      来自队伍统一保障，无需重复登记自购保险。
    </p>
    <router-link
      :to="{ name: 'insurance', query: { fromActivity: activityId } }"
      class="text-button"
      >查看保障与登记资料</router-link
    >
    <p class="safety-note">演示结论仅用于流程演练，不代表实际承保或理赔。</p>
  </section>
</template>
