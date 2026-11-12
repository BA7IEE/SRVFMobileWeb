<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton, showConfirmDialog } from 'vant';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import { appError } from '../../../shared/errors';
import { beijing } from '../../../shared/time';
import { LocationAdapter } from '../../../platform/location';
import type { LocationResult } from '../../../platform/location';
import type { PunchReceipt, PunchIntent } from '../../../data/models';
import PageState from '../../../shared/components/PageState.vue';
import ScannerPanel from '../../../shared/components/ScannerPanel.vue';
import CredentialPopup from '../../../shared/components/CredentialPopup.vue';
import { onSessionCleanup, onBackgroundCleanup } from '../../../shared/storage';
const route = useRoute();
const id = String(route.params.activityId);
const sessionId = String(route.params.sessionId);
const { data, loading, error, load } = useResource(async () => {
  const activity = await getData().activities.getDetail(id);
  const session = activity.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error('unknown session');
  return { activity, session, state: await getData().attendance.getMyState(id, sessionId) };
});
const busy = ref(false);
const message = ref('');
const receipt = ref<PunchReceipt>();
const show = ref(false);
const memberCode = ref<string>();
const location = ref<LocationResult>();
const locator = new LocationAdapter();
const intent = ref<PunchIntent>();
const unknown = ref(false);
const locating = ref(false);
const memberLoading = ref(false);
let active = true;
let deviceGeneration = 0;
let punchInFlight = false;
const actionName = computed(() => (data.value?.state.next === 'check_out' ? '签退' : '签到'));
const wait = computed(() =>
  Boolean(
    data.value?.state.checkOutAllowedAt &&
    Date.parse(data.value.state.serverTime) < Date.parse(data.value.state.checkOutAllowedAt),
  ),
);
onMounted(() => void load());
const unregister = onSessionCleanup(() => {
  active = false;
  deviceGeneration++;
  locator.cancel();
  intent.value = undefined;
  memberCode.value = undefined;
});
const unregisterBackground = onBackgroundCleanup(() => {
  if (punchInFlight) unknown.value = true;
  deviceGeneration++;
  locator.cancel();
  locating.value = false;
  memberLoading.value = false;
  memberCode.value = undefined;
  show.value = false;
  location.value = undefined;
});
onUnmounted(() => {
  active = false;
  deviceGeneration++;
  locator.cancel();
  unregister();
  unregisterBackground();
});
async function requestLocation() {
  if (locating.value || busy.value || data.value?.session.locationRequired !== true) return;
  locating.value = true;
  const generation = deviceGeneration;
  message.value = '正在获取位置…';
  const mode = getData().controls?.deviceScenario('location');
  const result: LocationResult =
    mode === 'denied' || mode === 'timeout' || mode === 'unavailable'
      ? { state: mode }
      : await locator.get(true);
  if (!active || generation !== deviceGeneration) return;
  locating.value = false;
  location.value = result;
  message.value = (
    {
      success: '定位已获取，仅用于本次本地测试，不会上报',
      denied: '定位权限被拒绝，请联系现场负责人',
      timeout: '定位超时，请重试或联系现场负责人',
      unavailable: '定位不可用',
      cancelled: '定位已取消',
      'not-required': '本场次不要求定位',
    } as Record<string, string>
  )[location.value.state]!;
}
async function scan(credential: string) {
  if (busy.value || !data.value || unknown.value) return;
  busy.value = true;
  message.value = '';
  const snapshot = data.value;
  const generation = deviceGeneration;
  const action = snapshot.state.next;
  try {
    await showConfirmDialog({
      title: `确认本场次${actionName.value}（演示）`,
      message: `${snapshot.activity.title}\n${snapshot.session.name}\n不会产生正式时长或贡献。`,
    });
  } catch {
    busy.value = false;
    return;
  }
  if (!active) return;
  if (generation !== deviceGeneration) {
    busy.value = false;
    message.value = '页面状态已变化，请重新读取考勤状态后再核对';
    return;
  }
  if (snapshot.session.locationRequired === null) {
    message.value = '场次定位策略未知，请联系负责人';
    busy.value = false;
    return;
  }
  if (snapshot.session.locationRequired && location.value?.state !== 'success') {
    message.value = '需先取得本次位置，不能伪造坐标';
    busy.value = false;
    return;
  }
  intent.value = {
    activityId: id,
    sessionId,
    key: crypto.randomUUID(),
    credential,
    action,
    ...(snapshot.session.locationRequired && location.value?.state === 'success'
      ? { location: location.value.coords }
      : {}),
  };
  punchInFlight = true;
  try {
    const result = await getData().attendance.submitPunch(intent.value);
    if (!active || generation !== deviceGeneration) return;
    receipt.value = result;
    intent.value = undefined;
    location.value = undefined;
    await load();
  } catch (e) {
    if (!active) return;
    const err = appError(e);
    message.value = err.message;
    unknown.value = err.kind === 'result-unknown';
  } finally {
    punchInFlight = false;
    busy.value = false;
  }
}
async function member() {
  if (memberLoading.value) return;
  memberLoading.value = true;
  const generation = deviceGeneration;
  try {
    const code = await getData().attendance.getMemberCredential();
    if (active && generation === deviceGeneration) {
      memberCode.value = code;
      show.value = true;
    }
  } catch (e) {
    if (active && generation === deviceGeneration) message.value = appError(e).message;
  } finally {
    if (active && generation === deviceGeneration) memberLoading.value = false;
  }
}
const example = __MOCK__
  ? () => getData().controls!.scanExample(id, sessionId, data.value!.state.next)
  : undefined;
</script>
<template>
  <div class="page">
    <page-state :loading="loading" :error="error" @retry="load"
      ><template v-if="data"
        ><div class="page-intro">
          <h1>{{ data.activity.title }}</h1>
          <p>{{ data.session.name }}</p>
        </div>
        <section class="panel">
          <h2>{{ data.state.present ? '当前在场（演示）' : '当前不在场' }}</h2>
          <p v-if="!data.state.present">
            {{
              data.state.hasHistory === true
                ? '已有历史现场服务段，不代表从未签到'
                : data.state.hasHistory === null
                  ? '历史服务段暂无法确认'
                  : '尚无演示现场记录'
            }}
          </p>
          <p>下一步：{{ actionName }}</p>
          <p v-if="wait" class="notice">
            最早签退时间
            {{ beijing(data.state.checkOutAllowedAt!) }}。到时请重新读取，不会自动签退。
          </p>
          <van-button plain :disabled="busy" @click="load">重新读取考勤状态</van-button>
          <p class="help">
            {{
              data.session.locationRequired === false
                ? '本场次不要求定位，不申请定位权限。'
                : data.session.locationRequired === null
                  ? '定位策略待确认'
                  : '本场次需要定位快照'
            }}
          </p>
          <van-button
            v-if="data.session.locationRequired === true"
            plain
            :loading="locating"
            :disabled="busy || locating"
            @click="requestLocation"
            >获取本次定位</van-button
          >
        </section>
        <scanner-panel
          :simulation="getData().controls?.deviceScenario('camera')"
          :demo-code="example"
          :disabled="busy || unknown"
          :label="`扫描场次${actionName}码`"
          @recognized="scan" />
        <p v-if="unknown" class="notice">
          打卡结果尚未确认，请重新读取考勤状态并联系负责人核对，勿重复扫码。
        </p>
        <p v-if="message" role="alert" class="error-box">{{ message }}</p>
        <div v-if="receipt" class="panel" role="status">
          <h2>{{ receipt.action === 'check_in' ? '签到' : '签退' }}已记录（演示）</h2>
          <p>{{ receipt.message }}</p>
          <p class="muted">{{ beijing(receipt.at) }}</p>
        </div>
        <button class="text-button" :disabled="memberLoading" @click="member">
          出示本人成员码
        </button>
        <p class="safety-note">
          本页不生成正式时长或贡献；权限、二维码、位置与时间窗仍需真实服务端验收。
        </p>
        <credential-popup
          v-model:show="show"
          :payload="memberCode"
          title="本人成员码"
          description="请仅交给本活动现场负责人核验，这是本地合成凭证。" /></template
    ></page-state>
  </div>
</template>
