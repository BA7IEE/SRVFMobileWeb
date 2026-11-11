<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Icon as VanIcon, Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';
import { useAuth } from './features/auth/store';
import { router } from './app/router';
import { cleanupDevices } from './shared/storage';
const auth = useAuth();
const route = useRoute();
const chunkError = ref(false);
const recovering = ref(false);
const MockPanel = __MOCK__
  ? defineAsyncComponent(() => import('./devtools/ScenarioPanel.vue'))
  : undefined;
const mock = __MOCK__;
const tabs = computed(() => Boolean(route.meta.tab) && auth.ready);
const viewKey = computed(() =>
  route.name === 'login' ? 'login' : `${auth.epoch}:${auth.revision}:${route.fullPath}`,
);
watch(
  () => auth.state,
  (state) => {
    if (route.meta.public) return;
    if (state === 'expired' || state === 'anonymous') void router.replace('/login');
    else if (state === 'blocked') void router.replace('/system/blocked');
    else if (state === 'unavailable') void router.replace('/system/unavailable');
  },
);
async function recover() {
  if (!auth.session) return;
  recovering.value = true;
  try {
    await auth.revalidate();
    if (auth.ready) window.dispatchEvent(new Event('srvf:resume'));
  } finally {
    recovering.value = false;
  }
}
function resume() {
  if (document.visibilityState === 'visible') void recover();
  else cleanupDevices();
}
function pageShow(event: PageTransitionEvent) {
  if (event.persisted) void recover();
}
function failed(event: Event) {
  event.preventDefault();
  chunkError.value = true;
}
onMounted(() => {
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', pageShow);
  window.addEventListener('vite:preloadError', failed);
});
onUnmounted(() => {
  document.removeEventListener('visibilitychange', resume);
  window.removeEventListener('pageshow', pageShow);
  window.removeEventListener('vite:preloadError', failed);
});
</script>
<template>
  <div class="app-shell" :class="{ 'has-tabs': tabs }">
    <div v-if="mock" class="mock-banner" role="status">
      <van-icon name="info-o" /> 演示模式 · 数据不是真实记录
    </div>
    <header class="app-header">
      <button
        v-if="!route.meta.tab && route.name !== 'login'"
        class="icon-button"
        aria-label="返回"
        @click="router.back()"
      >
        <van-icon name="arrow-left" />
      </button>
      <span v-else class="brand-wordmark">SRVF<span>队员端</span></span>
      <strong v-if="!route.meta.tab && route.name !== 'login'">{{ route.meta.title }}</strong>
      <span class="header-right">{{ route.meta.tab ? '深圳公益救援队' : 'SRVF' }}</span>
    </header>
    <p v-if="recovering" class="panel" role="status">正在重新确认身份与页面状态…</p>
    <main v-show="!recovering" id="main" :aria-busy="auth.state === 'initializing'">
      <div v-if="chunkError" class="panel">
        <h1>页面资源已更新</h1>
        <p>请先核对未确认的操作与未保存内容，再刷新页面。不会自动重复提交。</p>
        <button class="text-button" @click="router.go(0)">重新加载</button>
      </div>
      <div v-else-if="auth.state === 'initializing'" class="panel">正在确认身份…</div>
      <router-view v-else :key="viewKey" />
    </main>
    <van-tabbar v-if="tabs" route safe-area-inset-bottom class="bottom-tabs">
      <van-tabbar-item replace to="/activities" icon="calendar-o">活动</van-tabbar-item>
      <van-tabbar-item replace to="/my/activities" icon="todo-list-o">我的活动</van-tabbar-item>
      <van-tabbar-item replace to="/my" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
    <component :is="MockPanel" v-if="MockPanel" />
  </div>
</template>
