<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton } from 'vant';
import { getData } from '../../../data';
import { useManagedResource } from '../access';
import ManagedAccessDenied from '../components/ManagedAccessDenied.vue';
import type { PunchAction, QrCredential } from '../../../data/models';
import { appError, fail } from '../../../shared/errors';
import { beijing } from '../../../shared/time';
import { onSessionCleanup, onBackgroundCleanup } from '../../../shared/storage';
import PageState from '../../../shared/components/PageState.vue';
import CredentialPopup from '../../../shared/components/CredentialPopup.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
const id = String(useRoute().params.activityId);
const sessionId = ref('');
const action = ref<PunchAction>('check_in');
const qr = ref<QrCredential | null>();
const show = ref(false);
const busy = ref(false);
const qrLoading = ref(false);
const qrError = ref('');
const message = ref('');
const unknown = ref(false);
let active = true;
let qrGeneration = 0;
let writeInFlight = false;
const access = useManagedResource(
  async (currentAccess) => {
    const activity = await getData().activities.getDetail(id);
    if (!currentAccess()) throw fail('cancelled', '当前权限状态已变化');
    if (!sessionId.value) sessionId.value = activity.sessions[0]?.id ?? '';
    const current = sessionId.value;
    if (!activity.sessions.some((s) => s.id === current)) throw new Error('无法确认当前场次');
    return { activity, overview: await getData().managed.getOnsiteOverview(id, current) };
  },
  () => {
    writeInFlight = false;
    clearCredential();
    sessionId.value = '';
    action.value = 'check_in';
    qrLoading.value = false;
    qrError.value = '';
    message.value = '';
    unknown.value = false;
    busy.value = false;
  },
);
const { data, loading, error, load, denied, retrying } = access;
async function read(revalidate = false) {
  if (!active || !sessionId.value || (denied.value && !revalidate)) return false;
  const currentAccess = access.snapshot();
  const generation = ++qrGeneration;
  const current = sessionId.value;
  const currentAction = action.value;
  show.value = false;
  qr.value = undefined;
  qrLoading.value = true;
  qrError.value = '';
  try {
    const next = await getData().managed.getQr(id, current, currentAction, 'read');
    if (!active || !currentAccess() || generation !== qrGeneration) return false;
    qr.value = next;
    return true;
  } catch (e) {
    if (active && currentAccess() && generation === qrGeneration) {
      qrError.value = appError(e).message;
      if (appError(e).kind === 'forbidden') access.revoke(appError(e));
    }
    return false;
  } finally {
    if (active && generation === qrGeneration) qrLoading.value = false;
  }
}
function resumeRead() {
  void read();
}
onMounted(() => {
  void load();
  window.addEventListener('srvf:resume', resumeRead);
});
watch([sessionId, action], ([current], [previous]) => {
  show.value = false;
  qr.value = undefined;
  message.value = '';
  if (previous && current !== previous) void load();
  void read();
});
function clearCredential() {
  if (writeInFlight) unknown.value = true;
  qrGeneration++;
  show.value = false;
  qr.value = undefined;
}
const unregister = onSessionCleanup(() => {
  active = false;
  access.cancel();
  clearCredential();
});
const unregisterBackground = onBackgroundCleanup(clearCredential);
onUnmounted(() => {
  active = false;
  clearCredential();
  window.removeEventListener('srvf:resume', resumeRead);
  unregister();
  unregisterBackground();
});
async function operate(op: 'issue' | 'revoke') {
  if (
    busy.value ||
    qrLoading.value ||
    qrError.value ||
    unknown.value ||
    denied.value ||
    !data.value
  )
    return;
  const currentAccess = access.snapshot();
  busy.value = true;
  const snapshot = { session: sessionId.value, action: action.value };
  try {
    await access.confirm({
      title: op === 'issue' ? '生成 / 重签演示码' : '撤销本场次演示码',
      message: `当前活动：${data.value.activity.title}\n场次：${data.value.activity.sessions.find((s) => s.id === snapshot.session)?.name}\n动作：${snapshot.action === 'check_in' ? '签到' : '签退'}。重签或撤销后旧码不再使用。`,
    });
  } catch {
    if (active && currentAccess()) busy.value = false;
    return;
  }
  if (!active || !currentAccess()) return;
  message.value = '';
  const generation = ++qrGeneration;
  writeInFlight = true;
  try {
    const result = await getData().managed.getQr(
      id,
      snapshot.session,
      snapshot.action,
      op,
      crypto.randomUUID(),
    );
    if (!active || !currentAccess() || generation !== qrGeneration) return;
    qr.value = result;
    show.value = op === 'issue';
  } catch (e) {
    if (!active || !currentAccess() || generation !== qrGeneration) return;
    message.value = appError(e).message;
    unknown.value = appError(e).kind === 'result-unknown';
    if (appError(e).kind === 'forbidden') access.revoke(appError(e));
  } finally {
    if (active && currentAccess()) {
      writeInFlight = false;
      busy.value = false;
    }
  }
}
</script>
<template>
  <div class="page">
    <managed-access-denied
      v-if="denied"
      :message="denied.message"
      :loading="retrying"
      @retry="access.retry(() => read(true))"
    />
    <page-state v-else :loading="loading" :error="error" @retry="load"
      ><template v-if="data"
        ><div class="page-intro">
          <h1>{{ data.activity.title }}</h1>
          <p class="muted">职责：本活动现场考勤。现场操作与正式认定分别处理。</p>
        </div>
        <section class="panel">
          <label class="field"
            >当前场次<select v-model="sessionId" :disabled="busy">
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
            <button
              :aria-pressed="action === 'check_in'"
              :disabled="busy"
              @click="action = 'check_in'"
            >
              签到码</button
            ><button
              :aria-pressed="action === 'check_out'"
              :disabled="busy"
              @click="action = 'check_out'"
            >
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
          <p v-else-if="qrLoading" role="status">正在读取当前场次考勤码…</p>
          <p v-else-if="qrError" class="error" role="alert">
            考勤码读取失败：{{ qrError }}。请刷新二维码状态后再操作。
          </p>
          <p v-else class="muted">
            此场次尚未生成{{ action === 'check_in' ? '签到' : '签退' }}码。
          </p>
          <van-button
            type="primary"
            :loading="busy"
            :disabled="busy || qrLoading || !!qrError || unknown"
            @click="operate('issue')"
            >{{ qr ? '重签演示码' : '生成演示码' }}</van-button><van-button
            v-if="qr?.status === 'active'"
            plain
            :disabled="busy || qrLoading || !!qrError || unknown"
            @click="operate('revoke')"
            >撤销当前码</van-button
          >
          <p v-if="unknown" class="notice">
            操作结果尚未确认，请读取二维码状态并联系负责人核对，勿重复生成或撤销。
          </p>
          <button class="text-button" :disabled="busy || qrLoading" @click="read()">
            刷新二维码状态
          </button>
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
