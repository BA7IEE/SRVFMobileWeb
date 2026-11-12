<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton } from 'vant';
import { getData } from '../../../data';
import { useManagedResource } from '../access';
import ManagedAccessDenied from '../components/ManagedAccessDenied.vue';
import type { PunchAction, PunchReceipt } from '../../../data/models';
import { appError, fail } from '../../../shared/errors';
import { onSessionCleanup } from '../../../shared/storage';
import PageState from '../../../shared/components/PageState.vue';
import ScannerPanel from '../../../shared/components/ScannerPanel.vue';
const route = useRoute();
const id = String(route.params.activityId);
const sessionId = ref(String(route.query.session ?? ''));
const action = ref<PunchAction>('check_in');
const personId = ref('');
const keyword = ref('');
const reason = ref('');
const message = ref('');
const receipt = ref<PunchReceipt>();
const receiptTarget = ref('');
const busy = ref(false);
const unknown = ref(false);
let active = true;
const access = useManagedResource(
  async (currentAccess) => {
    const activity = await getData().activities.getDetail(id);
    if (!currentAccess()) throw fail('cancelled', '当前权限状态已变化');
    const current = activity.sessions.find((s) => s.id === sessionId.value) ?? activity.sessions[0];
    if (!current) throw new Error('本活动暂无可核验的场次');
    if (!sessionId.value) sessionId.value = current.id;
    if (current.id !== sessionId.value) throw new Error('无法确认当前场次，请返回活动重新选择');
    return { activity, overview: await getData().managed.getOnsiteOverview(id, current.id) };
  },
  () => {
    personId.value = '';
    reason.value = '';
    keyword.value = '';
    sessionId.value = '';
    receipt.value = undefined;
    receiptTarget.value = '';
    message.value = '';
    unknown.value = false;
    busy.value = false;
  },
);
const { data, loading, error, load, denied, retrying } = access;
onMounted(() => void load());
const unregister = onSessionCleanup(() => {
  active = false;
  access.cancel();
  personId.value = '';
  reason.value = '';
  receipt.value = undefined;
});
onUnmounted(() => {
  active = false;
  unregister();
});
watch([sessionId, personId, action, keyword], () => {
  receipt.value = undefined;
  receiptTarget.value = '';
  message.value = '';
});
function changeSession() {
  personId.value = '';
  reason.value = '';
  keyword.value = '';
  void load();
}
watch(keyword, () => {
  personId.value = '';
});
const visible = computed(
  () =>
    data.value?.overview.people.filter((p) =>
      p.label.toLocaleLowerCase().includes(keyword.value.trim().toLocaleLowerCase()),
    ) ?? [],
);
const selected = computed(() => visible.value.find((p) => p.identityId === personId.value));
async function execute(code?: string) {
  if (busy.value || unknown.value || denied.value) return;
  const current = access.snapshot();
  const target = selected.value;
  if (!target) {
    message.value = code
      ? '请先从本场次名单选择人员，核对后再扫描其成员码'
      : '请选择永久参与身份，不能仅靠姓名匹配';
    return;
  }
  if (!code && !reason.value.trim()) {
    message.value = '请填写代签 / 代退原因';
    return;
  }
  const snapshot = {
    sessionId: sessionId.value,
    action: action.value,
    reason: reason.value.trim(),
    target,
  };
  busy.value = true;
  message.value = '';
  receipt.value = undefined;
  try {
    await access.confirm({
      title: `确认${snapshot.action === 'check_in' ? '代签' : '代退'}（演示）`,
      message: `活动：${data.value?.activity.title}\n场次：${data.value?.activity.sessions.find((s) => s.id === snapshot.sessionId)?.name}\n人员：${target.label}\n参与身份：${target.identityId}\n原因：${snapshot.reason || '现场扫描核验'}\n不产生正式时长或贡献。`,
    });
  } catch {
    if (active && current()) busy.value = false;
    return;
  }
  if (!active || !current()) return;
  try {
    const result = code
      ? await getData().managed.staffScan(
          id,
          snapshot.sessionId,
          code,
          snapshot.action,
          crypto.randomUUID(),
          target.identityId,
        )
      : await getData().managed.proxyPunch(
          id,
          snapshot.sessionId,
          target.identityId,
          snapshot.action,
          snapshot.reason,
          crypto.randomUUID(),
        );
    if (!active || !current()) return;
    receipt.value = result;
    receiptTarget.value = `${target.label} · ${snapshot.action === 'check_in' ? '代签' : '代退'}`;
    reason.value = '';
    await load();
  } catch (e) {
    if (!active || !current()) return;
    const err = appError(e);
    message.value = err.message;
    unknown.value = err.kind === 'result-unknown';
    if (err.kind === 'forbidden') access.revoke(err);
  } finally {
    if (active && current()) busy.value = false;
  }
}
const example = __MOCK__
  ? () => getData().controls!.scanExample(id, sessionId.value, 'member')
  : undefined;
</script>
<template>
  <div class="page">
    <managed-access-denied
      v-if="denied"
      :message="denied.message"
      :loading="retrying"
      @retry="access.retry()"
    />
    <page-state v-else :loading="loading" :error="error" @retry="load"
      ><template v-if="data"
        ><h1>人员核验与异常</h1>
        <p>{{ data.activity.title }}</p>
        <p class="muted">职责：本活动现场考勤</p>
        <section class="panel">
          <label class="field"
            >场次<select v-model="sessionId" :disabled="busy" @change="changeSession">
              <option v-for="s in data.activity.sessions" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select></label
          >
          <h2>本场次人员摘要</h2>
          <label class="field"
            >查找人员<input
              v-model="keyword"
              type="search"
              :disabled="busy"
              placeholder="成员编号或姓名"
          /></label>
          <p class="help">
            当前显示 {{ visible.length }} 人；本场次参与人数 {{ data.overview.total }} 人
          </p>
          <p v-if="!visible.length" class="notice">
            {{ keyword.trim() ? '没有匹配的人员，请调整关键词' : '当前名单暂无可核验人员' }}
          </p>
          <div v-for="p in visible" :key="p.identityId" class="session-row">
            <strong>{{ p.label }}</strong>
            <p>{{ p.present ? '当前在场（演示）' : '当前不在场' }}</p>
            <p v-if="p.note" class="muted">{{ p.note }}</p>
          </div>
          <p class="safety-note">
            场次名单、异常完整读面及永久身份来源待后端确认，不使用旧定位证据列表。
          </p>
        </section>
        <section class="panel">
          <h2>受控代签 / 代退</h2>
          <label class="field"
            >核验目标<select v-model="personId" :disabled="busy || unknown">
              <option value="">选择本场次人员</option>
              <option v-for="p in visible" :key="p.identityId" :value="p.identityId">
                {{ p.label }}
              </option>
            </select></label
          ><label class="field"
            >现场动作<select v-model="action" :disabled="busy || unknown">
              <option value="check_in">代签</option>
              <option value="check_out">代退</option>
            </select></label
          ><label class="field"
            >核验原因<textarea
              v-model="reason"
              :disabled="busy || unknown"
              maxlength="500"
              placeholder="说明现场核验方式与代办原因"
            ></textarea></label
          ><van-button type="primary" :loading="busy" :disabled="busy || unknown" @click="execute()"
            >核对并执行受控操作</van-button
          >
        </section>
        <scanner-panel
          :simulation="getData().controls?.deviceScenario('camera')"
          label="工作人员扫描成员码"
          :demo-code="example"
          :disabled="busy || unknown"
          @recognized="execute"
        />
        <p v-if="unknown" class="notice" role="status">
          操作结果尚未确认，请重新读取名单并联系负责人核对，勿重复代签或代退。
        </p>
        <button class="text-button" :disabled="busy" @click="load">重新读取本场次名单</button>
        <p v-if="message" role="alert" class="error-box">{{ message }}</p>
        <section v-if="receipt" role="status" class="panel">
          <h2>现场操作已记录（演示）</h2>
          <p>{{ receiptTarget }}</p>
          <p>{{ receipt.message }}</p>
        </section></template
      ></page-state
    >
  </div>
</template>
