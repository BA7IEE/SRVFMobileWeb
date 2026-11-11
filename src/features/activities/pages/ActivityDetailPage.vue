<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton, showConfirmDialog, showDialog } from 'vant';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import PageState from '../../../shared/components/PageState.vue';
import InsuranceRequirementCard from '../../../shared/components/InsuranceRequirementCard.vue';
import RegistrationResult from '../../../shared/components/RegistrationResult.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
import { beijing } from '../../../shared/time';
import { appError } from '../../../shared/errors';
const id = String(useRoute().params.activityId);
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
  try {
    await showConfirmDialog({
      title: '取消本次报名',
      message: '取消后仍保留历史结果。请核对活动与场次，确定取消本次演示报名？',
    });
  } catch {
    return;
  }
  pending.value = true;
  try {
    await getData().registrations.cancel(id);
    await load();
  } catch (e) {
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
            <p>{{ beijing(data.activity.startAt) }} 至 {{ beijing(data.activity.endAt) }}</p>
            <p>{{ data.activity.location }}</p>
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
            <p class="muted">{{ beijing(s.startAt) }} 至 {{ beijing(s.endAt) }}</p>
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
        <div class="action-bar">
          <template v-if="data.result?.status === 'submitted'"
            ><van-button
              v-if="data.result.canEdit"
              :to="{ name: 'register', params: { activityId: id } }"
              >修改报名</van-button
            ><van-button v-if="data.result.canCancel" plain :loading="pending" @click="cancel"
              >取消报名</van-button
            ></template
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
        <p v-if="data.activity.registration.state !== 'allowed'" class="muted">
          {{ data.activity.registration.reason }}
        </p>
        <p v-else-if="data.insurance.status !== 'eligible'" class="muted">
          请先处理上方保险条件，再继续报名。
        </p>
      </template></page-state
    >
  </div>
</template>
