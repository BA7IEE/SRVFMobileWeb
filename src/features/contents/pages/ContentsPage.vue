<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Button as VanButton } from 'vant';
import { getData } from '../../../data';
import type { ContentSummary } from '../../../data/models';
import { appError, fail } from '../../../shared/errors';
import { beijing } from '../../../shared/time';
import PageState from '../../../shared/components/PageState.vue';
const items = ref<ContentSummary[]>([]);
const loading = ref(false);
const error = ref<ReturnType<typeof appError>>();
const hasMore = ref(false);
const page = ref(1);
const loaded = ref(false);
async function load(more = false) {
  const home = getData().memberHome;
  if (!home) {
    error.value = fail('not-configured', '当前客户端未接通队内内容');
    return;
  }
  loading.value = true;
  if (!more) error.value = undefined;
  try {
    const next = await home.listContents(more ? page.value + 1 : 1);
    items.value = more ? [...items.value, ...next.items] : next.items;
    page.value = next.page;
    hasMore.value = next.hasMore;
    loaded.value = true;
  } catch (e) {
    if (!more) error.value = appError(e);
  } finally {
    loading.value = false;
  }
}
onMounted(() => void load());
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>队内内容</h1>
      <p class="muted">
        只显示当前身份可见的已发布内容。没有阅读权限时会停在拒绝，不会当成空列表。
      </p>
    </div>
    <page-state
      :loading="loading && !items.length"
      :error="items.length ? undefined : error"
      :empty="loaded && !items.length"
      empty-text="暂无可见内容"
      @retry="load()"
    >
      <router-link
        v-for="item in items"
        :key="item.id"
        class="panel activity-card"
        :to="{ name: 'content', params: { contentId: item.id } }"
      >
        <h2>{{ item.pinned ? '置顶 · ' : '' }}{{ item.title }}</h2>
        <p v-if="item.summary" class="muted">{{ item.summary }}</p>
        <p v-if="item.publishedAt" class="muted">{{ beijing(item.publishedAt) }}</p>
      </router-link>
    </page-state>
    <van-button v-if="hasMore" plain :loading="loading" @click="load(true)">加载更多</van-button>
  </div>
</template>
