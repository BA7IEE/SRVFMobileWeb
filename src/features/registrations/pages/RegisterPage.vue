<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import { Button as VanButton, Form as VanForm, showConfirmDialog } from 'vant';
import { getData } from '../../../data';
import { useAuth } from '../../auth/store';
import { useResource } from '../../../shared/composables/resource';
import type { Preferences, RegistrationResult as Result } from '../../../data/models';
import { questionError, preferenceError, safeField } from '../../../shared/validation';
import { qualificationAllowsSelection, qualificationMessage } from '../../../shared/qualification';
import { appError } from '../../../shared/errors';
import { beijing } from '../../../shared/time';
import { getDraft, saveDraft, clearDraft } from '../drafts';
import PageState from '../../../shared/components/PageState.vue';
import DynamicQuestions from '../../../shared/components/DynamicQuestions.vue';
import SessionPositionSelector from '../../../shared/components/SessionPositionSelector.vue';
import InsuranceRequirementCard from '../../../shared/components/InsuranceRequirementCard.vue';
import RegistrationResult from '../../../shared/components/RegistrationResult.vue';
const auth = useAuth();
const id = String(useRoute().params.activityId);
const actorId = auth.member?.id;
let formLoad = 0;
let active = true;
const answers = ref<Record<string, unknown>>({});
const preferences = ref<Preferences>([]);
const errors = ref<Record<string, string>>({});
const errorMessage = ref('');
const busy = ref(false);
const unknown = ref(false);
const result = ref<Result>();
const dirty = ref(false);
const key = ref(crypto.randomUUID());
let draftKey = '';
let baseline = '';
const { data, loading, error, load } = useResource(async () => {
  const generation = ++formLoad;
  const [activity, form, insurance, existing] = await Promise.all([
    getData().activities.getDetail(id),
    getData().registrations.getForm(id),
    getData().insurance.getEligibilityForActivity(id),
    getData().registrations.getResult(id),
  ]);
  if (generation !== formLoad) return { activity, form, insurance, existing };
  draftKey = `${actorId}:${id}:${form.version}`;
  const draft = getDraft(draftKey);
  answers.value = draft.answers;
  preferences.value = draft.preferences;
  baseline = JSON.stringify({ answers: answers.value, preferences: preferences.value });
  dirty.value = false;
  if (existing?.status === 'submitted') result.value = existing;
  return { activity, form, insurance, existing };
});
onMounted(() => void load());
const canSubmit = computed(
  () =>
    data.value?.activity.registration.state === 'allowed' &&
    qualificationAllowsSelection(data.value?.form.qualification) &&
    data.value.insurance.status === 'eligible' &&
    !unknown.value &&
    !busy.value,
);
const summary = computed(() =>
  preferences.value.map((preference) => {
    const session = data.value?.form.sessions.find((item) => item.id === preference.sessionId);
    if (!session) return '场次已变化，请重新选择';
    const positions = preference.positionIds.map(
      (positionId, index) =>
        `第 ${index + 1} 志愿：${session.positions.find((item) => item.id === positionId)?.name ?? '岗位已变化'}`,
    );
    return `${session.name} · ${beijing(session.startAt)} 至 ${beijing(session.endAt)}\n${positions.length ? positions.join('；') : session.positions.length ? '请选择岗位志愿' : '本场次不分岗位'}`;
  }),
);
async function focusError() {
  await nextTick();
  if (!active) return;
  const element = errors.value.sessions
    ? document.getElementById('registration-sessions')
    : document.getElementById('field-' + Object.keys(errors.value)[0]);
  element?.scrollIntoView({ block: 'center' });
  const control = errors.value.sessions
    ? undefined
    : element?.querySelector<HTMLElement>(
        'input:not([type="file"]):not(:disabled), textarea, select, button',
      );
  (control ?? element)?.focus({ preventScroll: true });
}
function edited() {
  dirty.value =
    JSON.stringify({ answers: answers.value, preferences: preferences.value }) !== baseline;
  saveDraft(draftKey, { answers: answers.value, preferences: preferences.value });
}
function updateAnswers(next: Record<string, unknown>) {
  const previous = answers.value;
  answers.value = next;
  for (const question of data.value?.form.questions ?? []) {
    if (
      Object.hasOwn(errors.value, question.code) &&
      previous[question.code] !== next[question.code]
    ) {
      errors.value[question.code] = questionError(question, next[question.code]);
    }
  }
  edited();
}
async function submit() {
  if (!canSubmit.value || !data.value) return;
  errors.value = {};
  errorMessage.value = '';
  for (const q of data.value.form.questions) {
    const e = questionError(q, answers.value[q.code]);
    if (e) errors.value[q.code] = e;
  }
  const p = preferenceError(preferences.value, data.value.form.sessions);
  if (p) errors.value.sessions = p;
  if (Object.keys(errors.value).length) {
    await focusError();
    return;
  }
  busy.value = true;
  try {
    await showConfirmDialog({
      title: '确认提交报名',
      message: `${data.value.activity.title}\n${summary.value.join('\n\n')}\n\n提交只表示已收到，具体结果按场次展示。所有数据均为演示。`,
    });
  } catch {
    busy.value = false;
    return;
  }
  if (!active || !auth.ready || auth.member?.id !== actorId) return;
  try {
    const received = await getData().registrations.submit({
      activityId: id,
      key: key.value,
      formVersion: data.value.form.version,
      answers: answers.value,
      preferences: preferences.value,
    });
    if (!active) return;
    result.value = received;
    dirty.value = false;
    clearDraft(draftKey);
  } catch (e) {
    if (!active) return;
    const err = appError(e);
    errorMessage.value = err.message;
    if (err.fieldErrors) {
      const fields = new Set(data.value.form.questions.map((question) => question.code));
      errors.value = Object.fromEntries(
        Object.entries(err.fieldErrors).filter(
          ([code, message]) =>
            safeField(code) &&
            fields.has(code) &&
            typeof message === 'string' &&
            message.length > 0,
        ),
      );
      if (Object.keys(errors.value).length) await focusError();
    }
    if (err.kind === 'result-unknown') unknown.value = true;
    if (err.kind === 'conflict') {
      saveDraft(draftKey, { answers: answers.value, preferences: preferences.value });
    }
  } finally {
    busy.value = false;
  }
}
async function query() {
  if (busy.value) return;
  busy.value = true;
  try {
    const existing = await getData().registrations.getResult(id);
    if (!active) return;
    if (existing) {
      result.value = existing;
      unknown.value = false;
      dirty.value = false;
      clearDraft(draftKey);
    } else errorMessage.value = '暂无可确认的原结果，请联系负责人，勿重复提交';
  } catch (e) {
    errorMessage.value = appError(e).message;
  } finally {
    busy.value = false;
  }
}
async function reload() {
  const oldAnswers = answers.value;
  const oldPreferences = preferences.value;
  await load();
  if (error.value || !data.value) return;
  answers.value = oldAnswers;
  preferences.value = oldPreferences;
  errorMessage.value = '已获取当前定义，请核对题目与场次后再次确认。';
  key.value = crypto.randomUUID();
}
function startEditing() {
  result.value = undefined;
  key.value = crypto.randomUUID();
}
onBeforeRouteLeave(async (to) => {
  if (!auth.ready) return true;
  if (to.name === 'insurance' && to.query.fromActivity === id) {
    saveDraft(draftKey, { answers: answers.value, preferences: preferences.value });
    return true;
  }
  if (unknown.value) {
    try {
      await showConfirmDialog({
        title: '结果尚未确认',
        message: '离开后请从我的活动查询，不能另建一次报名。是否离开？',
      });
      return true;
    } catch {
      return false;
    }
  }
  if (!dirty.value) return true;
  try {
    await showConfirmDialog({
      title: '保留演示草稿并离开？',
      message: '当前会话可恢复输入；刷新后敏感答案与附件需重新填写。',
    });
    saveDraft(draftKey, { answers: answers.value, preferences: preferences.value });
    return true;
  } catch {
    return false;
  }
});
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value || unknown.value) {
    e.preventDefault();
    e.returnValue = '';
  }
}
window.addEventListener('beforeunload', beforeUnload);
onUnmounted(() => {
  active = false;
  formLoad++;
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>
<template>
  <div class="page">
    <page-state :loading="loading" :error="error" @retry="load"
      ><template v-if="data"
        ><div class="page-intro">
          <h1>{{ data.activity.title }}</h1>
          <p class="muted">按场次报名，提交后查看各场次结果。</p>
        </div>
        <template v-if="result"
          ><registration-result :result="result" links /><van-button
            v-if="result.canEdit"
            plain
            @click="startEditing"
            >开始修改当前报名</van-button
          ></template
        >
        <template v-else
          ><insurance-requirement-card :eligibility="data.insurance" :activity-id="id" />
          <p class="notice">
            只填写合成演示资料。场次选择保留在当前会话；敏感答案与本地附件刷新后需重新填写。
          </p>
          <van-form class="panel" novalidate :show-error-message="false" @submit="submit"
            ><h2>选择场次与岗位</h2>
            <p v-if="data.form.qualification?.result !== 'pass'" class="notice">
              {{ qualificationMessage(data.form.qualification) }}
            </p>
            <div
              id="registration-sessions"
              tabindex="-1"
              :aria-invalid="Boolean(errors.sessions)"
              :aria-describedby="errors.sessions ? 'registration-sessions-error' : undefined"
            >
              <session-position-selector
                v-model="preferences"
                :sessions="data.form.sessions"
                @update:model-value="edited"
              />
              <p
                v-if="errors.sessions"
                id="registration-sessions-error"
                role="alert"
                class="field-error"
              >
                {{ errors.sessions }}
              </p>
            </div>
            <h2>报名信息</h2>
            <dynamic-questions
              :model-value="answers"
              :questions="data.form.questions"
              :errors="errors"
              @update:model-value="updateAnswers"
            />
            <div v-if="errorMessage" role="alert" class="error-box">
              <p>{{ errorMessage }}</p>
              <van-button v-if="unknown" plain :loading="busy" @click="query"
                >查询原报名结果</van-button
              ><van-button v-else-if="errorMessage.includes('更新')" plain @click="reload"
                >刷新定义并核对</van-button
              >
            </div>
            <section v-if="summary.length" class="stack" aria-label="报名摘要">
              <h3>本次报名摘要</h3>
              <p v-for="(line, index) in summary" :key="index" class="long-text">{{ line }}</p>
              <p class="help">提交表示已收到报名，各场次结果需另行查看。</p>
            </section>
            <van-button
              native-type="submit"
              type="primary"
              block
              :disabled="!canSubmit"
              :loading="busy"
              >核对并提交报名</van-button
            >
            <p v-if="!canSubmit && !busy && !unknown" class="help">
              报名条件尚未满足，请先核对活动和保险。
            </p>
          </van-form></template
        >
      </template></page-state
    >
  </div>
</template>
