<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Button as VanButton } from 'vant';
import { getData } from '../../../data';
import type { NoticeDetail, NoticeSummary } from '../../../data/models';
import { appError, fail } from '../../../shared/errors';
import { beijing } from '../../../shared/time';
import PageState from '../../../shared/components/PageState.vue';
const items = ref<NoticeSummary[]>([]);
const loading = ref(false);
const error = ref<ReturnType<typeof appError>>();
const hasMore = ref(false);
const page = ref(1);
const loaded = ref(false);
const detail = ref<NoticeDetail>();
const detailError = ref('');
const marking = ref(false);
async function load(more = false) {
  const home = getData().memberHome;
  if (!home) {
    error.value = fail('not-configured', '当前客户端未接通通知服务');
    return;
  }
  loading.value = true;
  if (!more) error.value = undefined;
  try {
    const next = await home.listNotices(more ? page.value + 1 : 1);
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
async function open(id: string) {
  const home = getData().memberHome;
  if (!home) return;
  detailError.value = '';
  try {
    detail.value = await home.getNotice(id);
  } catch (e) {
    detail.value = undefined;
    detailError.value = appError(e).message;
  }
}
async function mark() {
  const home = getData().memberHome;
  const current = detail.value;
  if (!home || !current || marking.value || current.read) return;
  marking.value = true;
  detailError.value = '';
  try {
    await home.markNoticeRead(current.id);
    current.read = true;
    const row = items.value.find((item) => item.id === current.id);
    if (row) row.read = true;
  } catch (e) {
    const app = appError(e);
    detailError.value =
      app.kind === 'result-unknown'
        ? app.message + '请重新打开通知核对，不要自动重发。'
        : app.message;
  } finally {
    marking.value = false;
  }
}
onMounted(() => void load());
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>通知</h1>
      <p class="muted">打开通知不会自动标成已读。微信订阅需要官方模板编号，这里不能代为订阅。</p>
    </div>
    <page-state
      :loading="loading && !items.length"
      :error="items.length ? undefined : error"
      :empty="loaded && !items.length"
      empty-text="暂无通知"
      @retry="load()"
    >
      <section class="panel">
        <button v-for="item in items" :key="item.id" class="text-button" @click="open(item.id)">
          {{ item.pinned ? '置顶 · ' : '' }}{{ item.title }} · {{ item.read ? '已读' : '未读' }}
        </button>
      </section>
    </page-state>
    <van-button v-if="hasMore" plain :loading="loading" @click="load(true)">加载更多</van-button>
    <section v-if="detail" class="panel">
      <h2>{{ detail.title }}</h2>
      <p class="muted">
        {{ detail.kind }}<span v-if="detail.publishedAt"> · {{ beijing(detail.publishedAt) }}</span>
      </p>
      <p class="long-text">{{ detail.body }}</p>
      <van-button v-if="!detail.read" type="primary" :loading="marking" @click="mark"
        >标为已读</van-button
      >
      <p v-else class="success" role="status">已读</p>
    </section>
    <p v-if="detailError" class="error" role="alert">{{ detailError }}</p>
  </div>
</template>
