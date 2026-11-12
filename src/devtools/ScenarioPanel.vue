<script setup lang="ts">
import { ref } from 'vue';
import { Popup as VanPopup, Button as VanButton } from 'vant';
import { getData } from '../data';
import { useAuth } from '../features/auth/store';
import { router } from '../app/router';
const controls = getData().controls!;
const auth = useAuth();
const show = ref(false);
const trigger = ref<HTMLButtonElement>();
const selected = ref(controls.getScenario());
const account = ref('demo_a');
const now = ref(controls.now());
const message = ref('');
function apply() {
  controls.apply(selected.value);
  auth.rerender();
  now.value = controls.now();
  show.value = false;
}
function advance() {
  controls.advance(30);
  auth.rerender();
  now.value = controls.now();
  show.value = false;
}
async function switchAccount() {
  await auth.logout();
  await auth.login(account.value, 'demo-only');
  show.value = false;
  await router.replace(auth.state === 'blocked' ? '/system/blocked' : '/activities');
}
async function refresh() {
  try {
    await Promise.all(Array.from({ length: 5 }, () => auth.refresh()));
    message.value = `5 个调用已结束，累计续期执行 ${controls.refreshCount()} 次`;
  } catch {
    message.value = '续期等待者已结束，请核对会话状态';
  }
}
function insurance() {
  controls.setInsurance('verified');
  auth.rerender();
  show.value = false;
}
</script>
<template>
  <button ref="trigger" class="dev-trigger" aria-label="打开演示场景面板" @click="show = true">
    场景</button
  ><van-popup
    v-model:show="show"
    position="bottom"
    teleport="body"
    round
    @closed="trigger?.focus({ preventScroll: true })"
    ><section class="dev-panel">
      <div class="panel-heading">
        <h2>本地演示控制</h2>
        <button class="text-button" @click="show = false">关闭</button>
      </div>
      <p class="help">只控制合成场景，不修改真实业务。部分场景需配合页面操作触发。</p>
      <label class="field"
        >切换演示身份<select v-model="account" aria-label="切换演示身份">
          <option v-for="i in controls.identities" :key="i.id" :value="i.account">
            {{ i.label }}
          </option>
        </select></label
      ><van-button plain @click="switchAccount">切换身份并清理当前上下文</van-button
      ><label class="field"
        >场景<select v-model="selected" aria-label="选择场景">
          <option v-for="s in controls.scenarios" :key="s.id" :value="s.id">
            {{ s.id }} · {{ s.label }}
          </option>
        </select></label
      ><van-button type="primary" @click="apply">应用场景</van-button>
      <p class="help">模拟时钟：{{ now }}</p>
      <van-button plain @click="advance">推进模拟时间 30 分钟</van-button
      ><van-button plain @click="insurance">测试控制：保险审核通过</van-button
      ><van-button plain @click="refresh">同时发起 5 次模拟续期</van-button
      ><van-button
        plain
        @click="
          controls.expire();
          refresh();
        "
        >模拟会话失效</van-button
      >
      <p v-if="message" role="status">{{ message }}</p>
      <router-link to="/dev/components" class="text-button" @click="show = false"
        >本地组件预览</router-link
      ><van-button
        plain
        @click="
          controls.reset();
          selected = 'DEFAULT';
          auth.rerender();
          show = false;
        "
        >重置合成数据与时钟</van-button
      >
    </section></van-popup
  >
</template>
<style scoped>
.dev-trigger {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--srvf-red-deep);
  color: var(--srvf-red-deep);
  border-radius: 4px;
  min-width: 44px;
  min-height: var(--srvf-touch);
  font-size: 14px;
}
.dev-panel {
  padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
  display: grid;
  gap: 12px;
  max-height: 85dvh;
  overflow-y: auto;
  width: min(560px, 100vw);
}
</style>
