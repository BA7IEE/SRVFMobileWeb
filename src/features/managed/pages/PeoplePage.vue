<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton, showConfirmDialog } from 'vant';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import type { PunchAction, PunchReceipt } from '../../../data/models';
import { appError } from '../../../shared/errors';
import PageState from '../../../shared/components/PageState.vue';
import ScannerPanel from '../../../shared/components/ScannerPanel.vue';
const route = useRoute();
const id = String(route.params.activityId);
const sessionId = ref(String(route.query.session ?? 'session-am'));
const action = ref<PunchAction>('check_in');
const personId = ref('');
const reason = ref('');
const message = ref('');
const receipt = ref<PunchReceipt>();
const busy = ref(false);
const { data, loading, error, load } = useResource(async () => ({
  activity: await getData().activities.getDetail(id),
  overview: await getData().managed.getOnsiteOverview(id, sessionId.value),
}));
onMounted(() => void load());
const selected = computed(() =>
  data.value?.overview.people.find((p) => p.identityId === personId.value),
);
async function confirm(label: string) {
  try {
    await showConfirmDialog({
      title: `确认${action.value === 'check_in' ? '代签' : '代退'}（演示）`,
      message: `活动：${data.value?.activity.title}\n场次：${data.value?.activity.sessions.find((s) => s.id === sessionId.value)?.name}\n人员：${label}\n原因：${reason.value.trim() || '现场扫描核验'}\n不产生正式时长或贡献。`,
    });
    return true;
  } catch {
    return false;
  }
}
async function proxy() {
  if (busy.value) return;
  if (!selected.value) {
    message.value = '请选择永久参与身份，不能仅靠姓名匹配';
    return;
  }
  if (!reason.value.trim()) {
    message.value = '请填写代签 / 代退原因';
    return;
  }
  busy.value = true;
  if (!(await confirm(selected.value.label))) {
    busy.value = false;
    return;
  }
  try {
    receipt.value = await getData().managed.proxyPunch(
      id,
      sessionId.value,
      personId.value,
      action.value,
      reason.value,
      crypto.randomUUID(),
    );
    reason.value = '';
    await load();
  } catch (e) {
    message.value = appError(e).message;
    if (appError(e).kind === 'forbidden') data.value = undefined;
  } finally {
    busy.value = false;
  }
}
async function scan(code: string) {
  if (busy.value) return;
  if (!selected.value) {
    message.value = '请先从本场次名单选择人员，核对后再扫描其成员码';
    return;
  }
  const target = selected.value.identityId;
  busy.value = true;
  if (!(await confirm(selected.value.label))) {
    busy.value = false;
    return;
  }
  try {
    receipt.value = await getData().managed.staffScan(
      id,
      sessionId.value,
      code,
      action.value,
      crypto.randomUUID(),
      target,
    );
    await load();
  } catch (e) {
    message.value = appError(e).message;
  } finally {
    busy.value = false;
  }
}
const example = __MOCK__
  ? () => getData().controls!.scanExample(id, sessionId.value, 'member')
  : undefined;
</script>
<template>
  <div class="page">
    <page-state :loading="loading" :error="error" @retry="load"
      ><template v-if="data"
        ><h1>人员核验与异常</h1>
        <p>{{ data.activity.title }}</p>
        <section class="panel">
          <label class="field"
            >场次<select
              v-model="sessionId"
              @change="
                personId = '';
                reason = '';
                load();
              "
            >
              <option v-for="s in data.activity.sessions" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select></label
          >
          <h2>本场次人员摘要</h2>
          <div v-for="p in data.overview.people" :key="p.identityId" class="session-row">
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
            >核验目标<select v-model="personId">
              <option value="">选择本场次人员</option>
              <option v-for="p in data.overview.people" :key="p.identityId" :value="p.identityId">
                {{ p.label }}
              </option>
            </select></label
          ><label class="field"
            >现场动作<select v-model="action">
              <option value="check_in">代签</option>
              <option value="check_out">代退</option>
            </select></label
          ><label class="field"
            >核验原因<textarea
              v-model="reason"
              maxlength="500"
              placeholder="说明现场核验方式与代办原因"
            ></textarea></label
          ><van-button type="primary" :loading="busy" @click="proxy">核对并执行受控操作</van-button>
        </section>
        <scanner-panel
          :simulation="getData().controls?.deviceScenario('camera')"
          label="工作人员扫描成员码"
          :demo-code="example"
          :disabled="busy"
          @recognized="scan"
        />
        <p v-if="message" role="alert" class="error-box">{{ message }}</p>
        <section v-if="receipt" role="status" class="panel">
          <h2>现场操作已记录（演示）</h2>
          <p>{{ receipt.message }}</p>
        </section></template
      ></page-state
    >
  </div>
</template>
