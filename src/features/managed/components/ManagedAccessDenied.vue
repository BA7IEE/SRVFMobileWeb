<script setup lang="ts">
import { Button as VanButton } from 'vant';
defineProps<{ message: string; loading: boolean }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <section class="panel" role="alert">
    <h2>当前活动的操作权限已失效</h2>
    <p>{{ message }}</p>
    <p class="help">已清除本页名单和操作状态。重新读取只核对权限与数据，不会重复提交操作。</p>
    <van-button plain :loading="loading" :disabled="loading" @click="$emit('retry')">
      重新读取权限与数据
    </van-button>
    <router-link to="/managed/activities" class="text-button">返回我负责的活动</router-link>
  </section>
</template>
