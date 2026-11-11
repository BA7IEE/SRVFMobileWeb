<script setup lang="ts">
import { Button as VanButton, Icon as VanIcon, Loading as VanLoading } from 'vant';
import type { AppError } from '../../data/models';
defineProps<{ loading?: boolean; error?: AppError; empty?: boolean; emptyText?: string }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div v-if="loading" class="panel empty-state" role="status">
    <van-loading vertical>正在读取…</van-loading>
  </div>
  <div v-else-if="error" class="panel" role="alert">
    <h2>{{ error.kind === 'result-unknown' ? '结果暂未确认' : '暂时无法继续' }}</h2>
    <p>{{ error.message }}</p>
    <van-button plain @click="$emit('retry')">{{
      error.kind === 'result-unknown' ? '查询原结果' : '重新读取'
    }}</van-button>
  </div>
  <div v-else-if="empty" class="panel empty-state">
    <van-icon name="notes-o" />
    <h2>{{ emptyText ?? '暂无记录' }}</h2>
    <p class="muted">可调整筛选，或稍后再来查看。</p>
    <slot name="empty" />
  </div>
  <slot v-else />
</template>
