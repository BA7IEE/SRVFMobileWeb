<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Icon as VanIcon, Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';
import { useAuth } from './features/auth/store';
import { router } from './app/router';
import { cleanupDevices } from './shared/storage';
import { parentTarget, safeTarget } from './app/router/safe-target';
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
    const query = { returnTo: safeTarget(route.path) };
    if (state === 'expired' || state === 'anonymous')
      void router.replace({ path: '/login', query });
    else if (state === 'blocked') void router.replace('/system/blocked');
    else if (state === 'unavailable') void router.replace({ path: '/system/unavailable', query });
  },
);
async function recover() {
  if (!auth.session || recovering.value) return;
  recovering.value = true;
  try {
    await auth.revalidate();
    if (auth.ready) window.dispatchEvent(new Event('srvf:resume'));
  } finally {
    recovering.value = false;
  }
}
function back() {
  const previous = router.options.history.state.back;
  if (typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('/login'))
    router.back();
  else void router.replace(parentTarget(route.path));
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
      <span><van-icon name="info-o" /> 演示模式 · 数据不是真实记录</span>
      <component :is="MockPanel" v-if="MockPanel" />
    </div>
    <header class="app-header">
      <button
        v-if="!route.meta.tab && route.name !== 'login'"
        class="icon-button"
        aria-label="返回"
        @click="back"
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
      <van-tabbar-item replace to="/activities" icon="calendar-o" aria-label="活动"
        >活动</van-tabbar-item
      >
      <van-tabbar-item replace to="/my/activities" icon="todo-list-o" aria-label="我的活动"
        >我的活动</van-tabbar-item
      >
      <van-tabbar-item replace to="/my" icon="user-o" aria-label="我的">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>
