<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { Button as VanButton, Icon as VanIcon } from 'vant';
import { getData } from '../../../data';
import { useAuth } from '../../auth/store';
import type { ActivityListItem, AppError } from '../../../data/models';
import { appError } from '../../../shared/errors';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
import { beijing } from '../../../shared/time';
const auth = useAuth();
const key = 'srvf:ui:activities:' + auth.member?.id;
const epoch = auth.epoch;
let saved: {
  keyword?: string;
  type?: string;
  available?: boolean;
  page?: number;
  scroll?: number;
} = {};
try {
  const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? '{}');
  if (raw && typeof raw === 'object') saved = raw as typeof saved;
} catch {
  /* 存储不可用或偏好损坏时使用默认值 */
}
const keyword = ref(typeof saved.keyword === 'string' ? saved.keyword : '');
const type = ref(['培训', '演练', '服务'].includes(saved.type ?? '') ? saved.type! : '');
const available = ref(saved.available === true);
const items = ref<ActivityListItem[]>([]);
const error = ref<AppError>();
const loading = ref(false);
const page = ref(1);
const hasMore = ref(false);
const total = ref(0);
let sequence = 0;
let controller: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const restorePages = Number.isInteger(saved.page) ? Math.min(50, Math.max(1, saved.page!)) : 1;
const restoreScroll =
  typeof saved.scroll === 'number' && Number.isFinite(saved.scroll) ? Math.max(0, saved.scroll) : 0;
function persist(scroll = window.scrollY) {
  if (!auth.ready || auth.epoch !== epoch) return;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        keyword: keyword.value,
        type: type.value,
        available: available.value,
        page: page.value,
        scroll,
      }),
    );
  } catch {
    /* 偏好写入失败不阻断浏览 */
  }
}
async function load(more = false, pages = 1, scroll?: number) {
  const id = ++sequence;
  controller?.abort();
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = undefined;
  if (!more) {
    page.value = 1;
    items.value = [];
  }
  try {
    let nextPage = more ? page.value + 1 : 1;
    do {
      const next = await getData().activities.list(
        { keyword: keyword.value, type: type.value, available: available.value, page: nextPage },
        request.signal,
      );
      if (id !== sequence) return;
      items.value = [...new Map([...items.value, ...next.items].map((x) => [x.id, x])).values()];
      page.value = next.page;
      total.value = next.total;
      hasMore.value = next.hasMore;
      nextPage++;
    } while (!more && hasMore.value && nextPage <= pages);
    if (scroll !== undefined) {
      await nextTick();
      if (id === sequence) window.scrollTo({ top: scroll, behavior: 'instant' });
    }
  } catch (e) {
    if (id === sequence && appError(e).kind !== 'cancelled') error.value = appError(e);
  } finally {
    if (id === sequence) loading.value = false;
  }
}
watch(
  [keyword, type, available],
  () => {
    clearTimeout(timer);
    sequence++;
    controller?.abort();
    items.value = [];
    page.value = 1;
    loading.value = true;
    error.value = undefined;
    persist(0);
    timer = setTimeout(() => void load(), 250);
  },
  { flush: 'sync' },
);
const resume = () => void load(false, page.value);
onMounted(() => {
  void load(false, restorePages, restoreScroll);
  window.addEventListener('srvf:resume', resume);
});
onBeforeRouteLeave(() => persist());
onUnmounted(() => {
  controller?.abort();
  clearTimeout(timer);
  sequence++;
  window.removeEventListener('srvf:resume', resume);
});
const phases = { open: '开放报名', closed: '报名截止', ended: '已结束', cancelled: '已取消' };
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>一起行动</h1>
      <p class="muted">找到适合你的活动，按场次参与。</p>
    </div>
    <div class="field">
      <label for="activity-search" class="section-label">搜索活动</label
      ><input id="activity-search" v-model="keyword" type="search" placeholder="活动名称" />
    </div>
    <div class="pill-filter" aria-label="活动类型">
      <button
        v-for="t in ['', '培训', '演练', '服务']"
        :key="t"
        :aria-pressed="type === t"
        @click="type = t"
      >
        {{ t || '全部' }}
      </button>
    </div>
    <label class="check-label"><input v-model="available" type="checkbox" />只看可报名活动</label>
    <page-state
      :loading="loading && !items.length"
      :error="items.length ? undefined : error"
      :empty="!loading && !items.length"
      empty-text="没有符合条件的活动"
      @retry="load()"
    >
      <section class="panel">
        <div class="panel-heading">
          <h2>活动日程</h2>
          <span class="muted">共 {{ total }} 项</span>
        </div>
        <router-link
          v-for="a in items"
          :key="a.id"
          :to="{ name: 'activity', params: { activityId: a.id } }"
          class="activity-card"
          ><div class="panel-heading">
            <span class="date-block">{{ beijing(a.startAt) }}</span><status-badge
              :tone="a.phase === 'open' ? 'success' : 'neutral'"
              >{{ phases[a.phase] }}</status-badge
            >
          </div>
          <h2>{{ a.title }}</h2>
          <p class="muted">{{ a.summary }}</p>
          <p class="activity-meta"><van-icon name="location-o" />{{ a.location }}</p>
          <p class="activity-meta">
            <van-icon name="label-o" />{{ a.type }}{{ a.invitation ? ' · 受邀可见' : '' }}
          </p></router-link
        >
        <div v-if="error && items.length" class="error-box" role="alert">
          <p>{{ error.message }}，已读取的活动仍保留。</p>
          <van-button plain :loading="loading" @click="load(true)">重试加载更多</van-button>
        </div>
        <van-button
          v-else-if="hasMore"
          plain
          :loading="loading"
          :disabled="loading"
          @click="load(true)"
          >加载更多</van-button
        >
        <p v-else class="safety-note">已显示当前筛选的全部结果</p>
      </section>
    </page-state>
  </div>
</template>
