<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton, showConfirmDialog, showDialog } from 'vant';
import { getData } from '../../../data';
import { useAuth } from '../../auth/store';
import { useResource } from '../../../shared/composables/resource';
import PageState from '../../../shared/components/PageState.vue';
import InsuranceRequirementCard from '../../../shared/components/InsuranceRequirementCard.vue';
import RegistrationResult from '../../../shared/components/RegistrationResult.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
import { beijing } from '../../../shared/time';
import { appError } from '../../../shared/errors';
const id = String(useRoute().params.activityId);
const auth = useAuth();
let active = true;
onUnmounted(() => {
  active = false;
});
const actionError = ref('');
const pending = ref(false);
const { data, loading, error, load } = useResource(async () => {
  const [activity, result, insurance] = await Promise.all([
    getData().activities.getDetail(id),
    getData().activities.getMyParticipationContext(id),
    getData().insurance.getEligibilityForActivity(id),
  ]);
  return { activity, result, insurance };
});
onMounted(() => void load());
async function cancel() {
  if (pending.value) return;
  pending.value = true;
  actionError.value = '';
  const epoch = auth.epoch;
  try {
    await showConfirmDialog({
      title: '取消本次报名',
      message: '取消后仍保留历史结果。请核对活动与场次，确定取消本次演示报名？',
    });
  } catch {
    pending.value = false;
    return;
  }
  if (!active || !auth.ready || auth.epoch !== epoch) {
    pending.value = false;
    return;
  }
  try {
    await getData().registrations.cancel(id);
    if (!active || auth.epoch !== epoch) return;
    await load();
  } catch (e) {
    if (!active || auth.epoch !== epoch) return;
    actionError.value = appError(e).message;
  } finally {
    pending.value = false;
  }
}
function share() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '/activities/' + encodeURIComponent(id);
  void showDialog({ title: '本站活动链接', message: url.toString() });
}
</script>
<template>
  <div class="page">
    <page-state :loading="loading" :error="error" @retry="load"
      ><template v-if="data">
        <section class="detail-hero">
          <div class="panel-heading">
            <span class="section-label">{{ data.activity.type }}</span><status-badge>{{
              { open: '开放报名', closed: '报名截止', ended: '已结束', cancelled: '已取消' }[
                data.activity.phase
              ]
            }}</status-badge>
          </div>
          <h1>{{ data.activity.title }}</h1>
          <p>{{ data.activity.summary }}</p>
          <div class="stack muted">
            <p>
              活动时间：{{ beijing(data.activity.startAt) }} 至 {{ beijing(data.activity.endAt) }}
            </p>
            <p>活动地点：{{ data.activity.location }}</p>
          </div>
        </section>
        <p v-if="data.activity.historical" class="notice">
          普通活动详情受限，当前展示本人历史安全摘要。活动结束不等于已完成正式认定。
        </p>
        <registration-result v-if="data.result" :result="data.result" links />
        <section class="panel">
          <h2>场次与岗位</h2>
          <div v-for="s in data.activity.sessions" :key="s.id" class="session-row">
            <h3>{{ s.name }}</h3>
            <p class="muted">场次时间：{{ beijing(s.startAt) }} 至 {{ beijing(s.endAt) }}</p>
            <p v-if="s.location" class="muted">场次地点：{{ s.location }}</p>
            <p>
              {{
                s.positions.length ? s.positions.map((x) => x.name).join('、') : '本场次不分岗位'
              }}
            </p>
          </div>
        </section>
        <insurance-requirement-card :eligibility="data.insurance" :activity-id="id" />
        <section class="panel">
          <h2>参与要求</h2>
          <p class="long-text">{{ data.activity.description }}</p>
          <button class="text-button" @click="share">查看本站分享链接</button>
        </section>
        <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
        <p v-if="data.activity.registration.state !== 'allowed'" class="notice">
          {{ data.activity.registration.reason }}
        </p>
        <p v-else-if="data.insurance.status !== 'eligible'" class="notice">
          请先处理上方保险条件，再继续报名。
        </p>
        <div class="action-bar">
          <template v-if="data.result?.status === 'submitted'"
            ><van-button type="primary" to="/my/activities">查看我的活动</van-button
            ><van-button
              v-if="data.result.canEdit"
              :to="{ name: 'register', params: { activityId: id } }"
              >修改报名</van-button
            ><button
              v-if="data.result.canCancel"
              class="text-button danger-button"
              :disabled="pending"
              @click="cancel"
            >
              {{ pending ? '正在取消…' : '取消报名' }}
            </button></template
          ><template v-else
            ><van-button
              type="primary"
              :disabled="
                data.activity.registration.state !== 'allowed' ||
                data.insurance.status !== 'eligible'
              "
              :to="{ name: 'register', params: { activityId: id } }"
              >报名参加</van-button
            ></template
          >
        </div>
      </template></page-state
    >
  </div>
</template>
