<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import { Button as VanButton, Form as VanForm, showConfirmDialog } from 'vant';
import { getData } from '../../../data';
import { useAuth } from '../../auth/store';
import { useResource } from '../../../shared/composables/resource';
import type { InsuranceInput, SelfInsurance } from '../../../data/models';
import { insuranceErrors } from '../../../shared/validation';
import { appError } from '../../../shared/errors';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
import InsuranceRequirementCard from '../../../shared/components/InsuranceRequirementCard.vue';
const route = useRoute();
const auth = useAuth();
const activityId =
  typeof route.query.fromActivity === 'string' && /^[a-zA-Z0-9_-]+$/.test(route.query.fromActivity)
    ? route.query.fromActivity
    : undefined;
const { data, loading, error, load } = useResource(async () => ({
  overview: await getData().insurance.getMyOverview(),
  eligibility: activityId
    ? await getData().insurance.getEligibilityForActivity(activityId)
    : undefined,
}));
const editing = ref(false);
const existing = ref<SelfInsurance>();
const form = ref<InsuranceInput>({ insurer: '', policy: '', start: null, end: '' });
const errors = ref<Record<string, string>>({});
const message = ref('');
const busy = ref(false);
const conflict = ref(false);
const unresolved = ref(false);
let original = '';
const dirty = computed(() => editing.value && JSON.stringify(form.value) !== original);
onMounted(() => void load());
function edit(record?: SelfInsurance) {
  existing.value = record;
  form.value = record
    ? { insurer: record.insurer, policy: record.policy, start: record.start, end: record.end }
    : { insurer: '', policy: '', start: null, end: '' };
  original = JSON.stringify(form.value);
  errors.value = {};
  message.value = '';
  conflict.value = false;
  unresolved.value = false;
  editing.value = true;
}
async function close() {
  if (dirty.value)
    try {
      await showConfirmDialog({
        title: '放弃未保存资料？',
        message: '保单内容不会持久保存，关闭后需重新填写。',
      });
    } catch {
      return;
    }
  editing.value = false;
}
async function save() {
  if (busy.value || conflict.value || unresolved.value) return;
  errors.value = insuranceErrors(form.value);
  if (Object.keys(errors.value).length) return;
  busy.value = true;
  message.value = '';
  try {
    const input = {
      ...form.value,
      insurer: form.value.insurer.trim(),
      policy: form.value.policy.trim(),
      start: form.value.start || null,
    };
    if (existing.value)
      await getData().insurance.updateSelf(existing.value.id, input, existing.value.version);
    else await getData().insurance.createSelf(input);
    editing.value = false;
    await load();
    message.value = '保险资料已登记（演示），等待审核。';
  } catch (e) {
    const err = appError(e);
    message.value = err.message;
    conflict.value = err.kind === 'conflict';
    unresolved.value = err.kind === 'result-unknown';
  } finally {
    busy.value = false;
  }
}
async function refreshConflict() {
  await load();
  const current = data.value?.overview.self.find((r) => r.id === existing.value?.id);
  if (current) existing.value = current;
  conflict.value = false;
  message.value = '已读取当前版本，原输入已保留。请对照列表重新核对后保存。';
}
async function remove(record: SelfInsurance) {
  if (busy.value) return;
  try {
    await showConfirmDialog({
      title: '删除自购保险登记？',
      message: '删除可能影响本活动报名条件，确定删除这条演示记录？',
    });
  } catch {
    return;
  }
  busy.value = true;
  try {
    await getData().insurance.deleteSelf(record.id, record.version);
    await load();
  } catch (e) {
    message.value = appError(e).message;
  } finally {
    busy.value = false;
  }
}
onBeforeRouteLeave(async () => {
  if (!auth.ready) return true;
  if (!dirty.value) return true;
  try {
    await showConfirmDialog({
      title: '离开未保存资料？',
      message: '保单号只保留在内存中，离开后将清除。',
    });
    return true;
  } catch {
    return false;
  }
});
const labels = { pending: '待审核', verified: '已审核（演示）', rejected: '审核未通过' };
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>我的保险</h1>
      <p class="muted">统保与自购分别查看，保障以本次活动条件为准。</p>
    </div>
    <p class="notice">请勿填写真实保单。登记不代表审核通过，不提供保险购买或自动投保。</p>
    <page-state :loading="loading" :error="error" @retry="load"
      ><template v-if="data">
        <insurance-requirement-card
          v-if="activityId"
          :eligibility="data.eligibility"
          :activity-id="activityId"
        />
        <section class="panel">
          <h2>队伍统一保险</h2>
          <p v-if="data.overview.team === null" class="muted">
            暂无法完整确认统保情况，请联系管理员。
          </p>
          <p v-else-if="!data.overview.team.length" class="muted">当前演示读面暂无本人统保记录。</p>
          <div v-for="(t, index) in data.overview.team" :key="index" class="stack">
            <h3>{{ t.name }}</h3>
            <status-badge tone="success">团队保障（演示）</status-badge>
            <p>{{ t.start }} 至 {{ t.end }}</p>
          </div>
        </section>
        <section class="panel">
          <div class="panel-heading">
            <h2>本人登记的自购保险</h2>
            <button class="text-button" :disabled="data.overview.unresolvedCreate" @click="edit()">
              新增登记
            </button>
          </div>
          <p v-if="data.overview.unresolvedCreate" role="alert" class="notice">
            上次登记结果待核实，原始资料未保留。请联系负责人核对，不能重复新建登记。
          </p>
          <p v-if="!data.overview.self.length" class="muted">暂无自购登记，不等于没有队伍统保。</p>
          <div v-for="record in data.overview.self" :key="record.id" class="stack">
            <h3>{{ record.insurer }}</h3>
            <status-badge :tone="record.review === 'verified' ? 'success' : 'pending'">{{
              labels[record.review]
            }}</status-badge>
            <p class="long-text">演示保单：{{ record.policy }}</p>
            <p>{{ record.start ?? '起保日未提供' }} 至 {{ record.end }}</p>
            <div class="row">
              <button class="text-button" @click="edit(record)">修改资料</button
              ><button class="text-button danger-button" :disabled="busy" @click="remove(record)">
                删除登记
              </button>
            </div>
            <hr class="separator" />
          </div>
        </section>
        <van-form v-if="editing" class="panel" :show-error-message="false" @submit="save"
          ><div class="panel-heading">
            <h2>{{ existing ? '修改自购保险' : '新增自购保险' }}</h2>
            <button type="button" class="text-button" @click="close">关闭</button>
          </div>
          <p class="help">修改已审核资料将重新进入待审核。</p>
          <div
            v-for="field in [
              { key: 'insurer', label: '保险公司', type: 'text' },
              { key: 'policy', label: '保单号', type: 'text' },
              { key: 'start', label: '起保日期（可不填）', type: 'date' },
              { key: 'end', label: '到期日期', type: 'date' },
            ] as const"
            :key="field.key"
            class="field"
          >
            <label :for="'insurance-' + field.key">{{ field.label }}</label><input
              :id="'insurance-' + field.key"
              v-model="form[field.key]"
              :type="field.type"
              :aria-invalid="Boolean(errors[field.key])"
              autocomplete="off"
            />
            <p v-if="errors[field.key]" role="alert" class="field-error">{{ errors[field.key] }}</p>
          </div>
          <p v-if="message" role="alert" class="error">{{ message }}</p>
          <van-button v-if="conflict" plain @click="refreshConflict">刷新当前资料并核对</van-button
          ><van-button
            v-else-if="unresolved"
            plain
            @click="
              editing = false;
              load();
            "
            >返回列表查证登记</van-button
          ><van-button
            type="primary"
            native-type="submit"
            :loading="busy"
            :disabled="conflict || unresolved"
            >保存资料（演示）</van-button
          ></van-form
        >
        <p v-if="message && !editing" role="status" class="notice">{{ message }}</p>
        <router-link
          v-if="activityId && !editing"
          :to="{ name: 'register', params: { activityId } }"
          class="text-button"
          >返回原活动报名并重新核对资格</router-link
        >
      </template></page-state
    >
  </div>
</template>
