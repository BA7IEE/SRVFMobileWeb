<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton, showConfirmDialog } from 'vant';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import type { PunchAction, QrCredential } from '../../../data/models';
import { appError } from '../../../shared/errors';
import { beijing } from '../../../shared/time';
import PageState from '../../../shared/components/PageState.vue';
import CredentialPopup from '../../../shared/components/CredentialPopup.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
const id = String(useRoute().params.activityId);
const sessionId = ref('session-am');
const action = ref<PunchAction>('check_in');
const qr = ref<QrCredential | null>();
const show = ref(false);
const busy = ref(false);
const message = ref('');
const { data, loading, error, load } = useResource(async () => ({
  activity: await getData().activities.getDetail(id),
  overview: await getData().managed.getOnsiteOverview(id, sessionId.value),
}));
async function read() {
  try {
    qr.value = await getData().managed.getQr(id, sessionId.value, action.value, 'read');
  } catch (e) {
    qr.value = undefined;
    message.value = appError(e).message;
  }
}
onMounted(async () => {
  await load();
  await read();
});
watch([sessionId, action], () => {
  show.value = false;
  qr.value = undefined;
  message.value = '';
  void load();
  void read();
});
async function operate(op: 'issue' | 'revoke') {
  if (busy.value) return;
  busy.value = true;
  try {
    await showConfirmDialog({
      title: op === 'issue' ? '生成 / 重签演示码' : '撤销本场次演示码',
      message: `当前活动：${data.value?.activity.title}\n场次：${data.value?.activity.sessions.find((s) => s.id === sessionId.value)?.name}\n动作：${action.value === 'check_in' ? '签到' : '签退'}。重签或撤销后旧码不再使用。`,
    });
  } catch {
    busy.value = false;
    return;
  }
  message.value = '';
  try {
    qr.value = await getData().managed.getQr(
      id,
      sessionId.value,
      action.value,
      op,
      crypto.randomUUID(),
    );
    show.value = op === 'issue';
  } catch (e) {
    message.value = appError(e).message;
    if (appError(e).kind === 'forbidden') {
      data.value = undefined;
      qr.value = undefined;
    }
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="page">
    <page-state :loading="loading" :error="error" @retry="load"
      ><template v-if="data"
        ><div class="page-intro">
          <h1>{{ data.activity.title }}</h1>
          <p class="muted">现场操作与正式认定分别处理。</p>
        </div>
        <section class="panel">
          <label class="field"
            >当前场次<select v-model="sessionId">
              <option v-for="s in data.activity.sessions" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select></label
          >
          <div class="metric-row">
            <div class="metric">
              <strong>{{ data.overview.total }}</strong><span>本场次参与人数</span>
            </div>
            <div class="metric">
              <strong>{{ data.overview.present }}</strong><span>当前在场</span>
            </div>
          </div>
          <p class="help">来自演示统计读面，非当前页人数加总。</p>
        </section>
        <section class="panel">
          <h2>场次考勤码</h2>
          <div class="pill-filter">
            <button :aria-pressed="action === 'check_in'" @click="action = 'check_in'">
              签到码</button
            ><button :aria-pressed="action === 'check_out'" @click="action = 'check_out'">
              签退码
            </button>
          </div>
          <template v-if="qr"
            ><status-badge :tone="qr.status === 'active' ? 'success' : 'error'">{{
              qr.status === 'active' ? '有效演示码' : qr.status === 'revoked' ? '已撤销' : '已失效'
            }}</status-badge>
            <p class="muted">第 {{ qr.version }} 版 · 有效至 {{ beijing(qr.validUntil) }}</p>
            <van-button v-if="qr.status === 'active'" plain @click="show = true"
              >展示当前{{ action === 'check_in' ? '签到' : '签退' }}码</van-button
            ></template
          >
          <p v-else class="muted">
            此场次尚未生成{{ action === 'check_in' ? '签到' : '签退' }}码。
          </p>
          <van-button type="primary" :loading="busy" @click="operate('issue')">{{
            qr ? '重签演示码' : '生成演示码'
          }}</van-button><van-button
            v-if="qr?.status === 'active'"
            plain
            :disabled="busy"
            @click="operate('revoke')"
            >撤销当前码</van-button
          ><button class="text-button" @click="read">刷新二维码状态</button>
        </section>
        <p v-if="message" role="alert" class="error">{{ message }}</p>
        <router-link
          :to="{ name: 'people', params: { activityId: id }, query: { session: sessionId } }"
          class="text-button"
          >人员核验与异常处理</router-link
        >
        <p class="notice">现场工作结束不表示正式结算完成。本页没有直接入账功能。</p>
        <credential-popup
          v-model:show="show"
          :payload="qr?.payload"
          :title="`${data.activity.sessions.find((s) => s.id === sessionId)?.name} · ${action === 'check_in' ? '签到码' : '签退码'}`"
          description="仅使用合成演示格式，不含真实签名或真实凭证。" /></template
    ></page-state>
  </div>
</template>
