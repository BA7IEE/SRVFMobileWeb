<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Button as VanButton, showConfirmDialog } from 'vant';
import { getData } from '../../../data';
import type { OrdinaryActivityPort } from '../../../data/wire/ordinary-activity';
import { appError, fail } from '../../../shared/errors';

const port = getData().ordinaryActivities;
type Output<K extends keyof OrdinaryActivityPort> = Awaited<ReturnType<OrdinaryActivityPort[K]>>;
const activities = ref<Output<'activities'>>([]),
  organizations = ref<Output<'options'>>([]);
const selected = ref<Output<'detail'>>(),
  metric = ref<Output<'metric'>>(),
  sessions = ref<Output<'sessions'>>([]);
const positions = ref<Record<string, Output<'positions'>>>({});
const registrations = ref<Output<'registrations'>>([]);
const currentActivityId = ref<string>();
const unconfirmedAdmissions = ref<{ activityId: string; registrationId: string; name: string }[]>(
  [],
);
const currentUnconfirmed = computed(() =>
  unconfirmedAdmissions.value.filter((entry) => entry.activityId === currentActivityId.value),
);
function needsAdmissionReadback(registrationId: string) {
  return currentUnconfirmed.value.some((entry) => entry.registrationId === registrationId);
}
const busy = ref(false),
  message = ref(''),
  needsReadback = ref(false),
  creating = ref(false);
const form = reactive({
  title: '',
  organizationId: '',
  activityTypeCode: 'hiking',
  allocationModeCode: 'first_come' as 'first_come' | 'qualification_rank',
  capacity: 20,
  location: '',
  startAt: '',
  endAt: '',
  registrationDeadline: '',
});
const session = reactive({
  code: '',
  name: '',
  locationText: '',
  startAt: '',
  endAt: '',
  checkInOpenAt: '',
  checkInCloseAt: '',
  checkOutOpenAt: '',
  checkOutCloseAt: '',
  locationRequired: false,
});
const job = reactive({ sessionId: '', code: '', name: '', capacity: 1 });
const editable = computed(
  () => selected.value?.status === 'draft' && selected.value.review !== 'pending',
);
const locked = computed(() => busy.value || needsReadback.value);
function iso(s: string) {
  return new Date(s).toISOString();
}
function local(isoDate: string) {
  const d = new Date(isoDate);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function clearDetails() {
  selected.value = undefined;
  metric.value = undefined;
  sessions.value = [];
  positions.value = {};
  registrations.value = [];
  job.sessionId = '';
}
async function read(id?: string, manualRefresh = false) {
  if (!port) return;
  currentActivityId.value = id;
  clearDetails();
  const [list, opts] = await Promise.all([port.activities(), port.options()]);
  activities.value = list;
  organizations.value = opts;
  if (!opts.some((o) => o.id === form.organizationId)) form.organizationId = opts[0]?.id || '';
  if (!id) return;
  const d = await port.detail(id);
  if (d.status === 'draft') {
    const [m, ss] = await Promise.all([port.metric(id), port.sessions(id)]);
    metric.value = m;
    const bySession: Record<string, Output<'positions'>> = {};
    for (const s of ss) bySession[s.id] = await port.positions(id, s.id);
    sessions.value = ss;
    positions.value = bySession;
    job.sessionId = ss[0]?.id ?? '';
    session.startAt = local(d.startAt);
    session.endAt = local(d.endAt);
    session.locationText = d.location;
  } else if (d.canManage) {
    const rows = await port.registrations(id);
    const statuses = new Map(rows.map((row) => [row.id, row.status]));
    if (statuses.size !== rows.length)
      throw fail('contract-mismatch', '名单中有重复的报名记录，请刷新核对');
    registrations.value = rows;
    const canRetry = manualRefresh && d.status === 'published' && d.mode === 'qualification_rank';
    unconfirmedAdmissions.value = unconfirmedAdmissions.value.filter((entry) => {
      if (entry.activityId !== id) return true;
      const status = statuses.get(entry.registrationId);
      return status !== 'pass' && !(canRetry && status === 'pending');
    });
  }
  selected.value = d;
}
async function reload(id?: string) {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  try {
    await read(id, true);
    needsReadback.value = false;
  } catch (e) {
    message.value = appError(e).message;
  } finally {
    busy.value = false;
  }
}
async function command(send: () => Promise<string>, success: string, confirmed?: () => boolean) {
  if (locked.value || !port) return;
  busy.value = true;
  message.value = '';
  try {
    const id = await send();
    await read(id);
    if (!confirmed || confirmed()) message.value = success;
  } catch (e) {
    needsReadback.value = true;
    message.value = appError(e).message + '。请刷新核对当前记录后再办理。';
  } finally {
    busy.value = false;
  }
}
async function create() {
  if (!port) return;
  await command(async () => {
    const d = await port.draft({
      ...form,
      startAt: iso(form.startAt),
      endAt: iso(form.endAt),
      registrationDeadline: iso(form.registrationDeadline),
    });
    creating.value = false;
    form.title = '';
    return d.id;
  }, '草稿已创建');
}
async function chooseMetric() {
  const d = selected.value,
    m = metric.value;
  if (!port || !d || !m) return;
  await command(async () => {
    await port.noMetric(d.id, m.revision, crypto.randomUUID());
    return d.id;
  }, '已保存指标选择');
}
async function addSession() {
  const d = selected.value;
  if (!port || !d) return;
  await command(async () => {
    await port.addSession(d.id, {
      ...session,
      startAt: iso(session.startAt),
      endAt: iso(session.endAt),
      checkInOpenAt: iso(session.checkInOpenAt),
      checkInCloseAt: iso(session.checkInCloseAt),
      checkOutOpenAt: iso(session.checkOutOpenAt),
      checkOutCloseAt: iso(session.checkOutCloseAt),
    });
    session.code = '';
    session.name = '';
    return d.id;
  }, '场次已保存');
}
async function addJob() {
  const d = selected.value;
  if (!port || !d || !job.sessionId) return;
  await command(async () => {
    await port.addPosition(d.id, job.sessionId, {
      code: job.code,
      name: job.name,
      capacity: job.capacity,
      attendanceRoleCode: 'member',
    });
    job.code = '';
    job.name = '';
    return d.id;
  }, '场次岗位已保存');
}
async function submit() {
  const d = selected.value;
  if (!port || !d) return;
  try {
    await showConfirmDialog({ title: '提交发布审核', message: d.title });
  } catch {
    return;
  }
  await command(async () => {
    await port.submit(d.id);
    return d.id;
  }, '申请已提交，等待独立审核');
}
async function admit(r: Output<'registrations'>[number]) {
  const d = selected.value;
  if (
    locked.value ||
    needsAdmissionReadback(r.id) ||
    !port ||
    !d?.canManage ||
    d.mode !== 'qualification_rank' ||
    r.status !== 'pending'
  )
    return;
  try {
    await showConfirmDialog({ title: '确认录取', message: d.title + ' · ' + r.name });
  } catch {
    return;
  }
  if (selected.value !== d || !registrations.value.includes(r)) return;
  await command(
    async () => {
      await port.admit(d.id, r.id);
      unconfirmedAdmissions.value.push({ activityId: d.id, registrationId: r.id, name: r.name });
      return d.id;
    },
    currentUnconfirmed.value.length ? r.name + '已录取' : '已录取',
    () => !needsAdmissionReadback(r.id),
  );
}
onMounted(() => void reload());
</script>
<template>
  <main class="page">
    <div class="page-intro"><h1>活动办理</h1></div>
    <p v-if="!port" class="notice">当前客户端未配置活动办理。</p>
    <template v-else>
      <p v-if="message" role="status" class="notice">{{ message }}</p>
      <p
        v-for="entry in currentUnconfirmed"
        :key="entry.registrationId"
        role="status"
        class="notice"
      >
        {{ selected?.canManage ? entry.name + '的录取结果' : '录取结果' }}尚未确认，请刷新核对。
      </p>
      <div class="row">
        <button class="text-button" :disabled="busy" @click="reload(currentActivityId)">
          刷新记录
        </button>
        <button
          v-if="organizations.length"
          class="text-button"
          :disabled="locked"
          @click="creating = !creating"
        >
          {{ creating ? '收起草稿表单' : '创建活动' }}
        </button>
      </div>
      <form v-if="creating" class="panel stack" @submit.prevent="create">
        <h2>新活动草稿</h2>
        <label>标题<input v-model.trim="form.title" required maxlength="200" /></label>
        <label
          >承办组织<select v-model="form.organizationId" required>
            <option v-for="o in organizations" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select></label
        >
        <label>活动类型代码<input v-model.trim="form.activityTypeCode" required /></label>
        <label
          >录取方式<select v-model="form.allocationModeCode">
            <option value="first_come">先到先得</option>
            <option value="qualification_rank">资格排序</option>
          </select></label
        >
        <label>活动地点<input v-model.trim="form.location" required /></label>
        <label
          >活动名额<input v-model.number="form.capacity" type="number" min="1" step="1" required
        /></label>
        <label>活动开始<input v-model="form.startAt" type="datetime-local" required /></label>
        <label
          >活动结束<input v-model="form.endAt" type="datetime-local" :min="form.startAt" required
        /></label>
        <label
          >报名截止<input
            v-model="form.registrationDeadline"
            type="datetime-local"
            :max="form.startAt"
            required
        /></label>
        <van-button native-type="submit" type="primary" :disabled="locked">保存草稿</van-button>
      </form>
      <section class="panel stack">
        <h2>我办理的活动</h2>
        <p v-if="!activities.length && !busy">暂无活动</p>
        <button
          v-for="a in activities"
          :key="a.id"
          class="text-button"
          :disabled="busy"
          @click="reload(a.id)"
        >
          {{ a.title }}
        </button>
      </section>
      <section v-if="selected" class="panel stack">
        <h2>{{ selected.title }}</h2>
        <p>
          状态：{{
            selected.review === 'pending'
              ? '待发布审核'
              : selected.status === 'draft'
                ? '草稿'
                : selected.status === 'published'
                  ? '已发布'
                  : selected.status
          }}
        </p>
        <template v-if="editable">
          <details>
            <summary>指标设置</summary>
            <p>
              当前选择：{{
                metric?.code === 'not_required'
                  ? '无需指标'
                  : metric?.code === 'required'
                    ? '需要指标'
                    : '待设置'
              }}
            </p>
            <p>指标变更须有本活动有效的编辑任命。</p>
            <van-button
              :disabled="locked || !metric || metric.code !== 'unconfigured'"
              @click="chooseMetric"
              >设为无需指标</van-button
            >
          </details>
          <h3>场次</h3>
          <ul>
            <li v-for="s in sessions" :key="s.id">
              {{ s.name }}
              <ul v-if="positions[s.id]?.length">
                <li v-for="pos in positions[s.id]" :key="pos.id">{{ pos.name }}</li>
              </ul>
            </li>
          </ul>
          <details>
            <summary>增加场次</summary>
            <form class="stack" @submit.prevent="addSession">
              <label>场次编码<input v-model.trim="session.code" required /></label
              ><label>场次名称<input v-model.trim="session.name" required /></label>
              <label>集合地点<input v-model.trim="session.locationText" required /></label>
              <label
                >场次开始<input v-model="session.startAt" type="datetime-local" required /></label
              ><label
                >场次结束<input v-model="session.endAt" type="datetime-local" required
              /></label>
              <label
                >签到开始<input
                  v-model="session.checkInOpenAt"
                  type="datetime-local"
                  required /></label
              ><label
                >签到截止<input v-model="session.checkInCloseAt" type="datetime-local" required
              /></label>
              <label
                >签退开始<input
                  v-model="session.checkOutOpenAt"
                  type="datetime-local"
                  required /></label
              ><label
                >签退截止<input v-model="session.checkOutCloseAt" type="datetime-local" required
              /></label>
              <van-button native-type="submit" :disabled="locked">保存场次</van-button>
            </form>
          </details>
          <details v-if="sessions.length">
            <summary>增加场次队员岗位</summary>
            <form class="stack" @submit.prevent="addJob">
              <label
                >所属场次<select v-model="job.sessionId" required>
                  <option v-for="s in sessions" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select></label
              >
              <label>岗位编码<input v-model.trim="job.code" required /></label
              ><label>岗位名称<input v-model.trim="job.name" required /></label>
              <label
                >岗位名额<input
                  v-model.number="job.capacity"
                  type="number"
                  min="1"
                  step="1"
                  required
              /></label>
              <van-button native-type="submit" :disabled="locked">保存岗位</van-button>
            </form>
          </details>
          <van-button
            type="primary"
            :disabled="locked || !sessions.length || metric?.code === 'unconfigured'"
            @click="submit"
            >提交发布审核</van-button
          >
        </template>
        <template v-if="selected.status === 'published' && selected.canManage"
          ><h3>报名名单</h3>
          <p v-if="!registrations.length">暂无报名</p>
          <div v-for="r in registrations" :key="r.id" class="row">
            <span
              >{{ r.name }} ·
              {{
                r.status === 'pass' ? '已通过' : r.status === 'pending' ? '待录取' : r.status
              }}</span
            >
            <button
              v-if="selected.mode === 'qualification_rank' && r.status === 'pending'"
              class="text-button"
              :disabled="locked || needsAdmissionReadback(r.id)"
              @click="admit(r)"
            >
              录取
            </button>
          </div>
        </template>
      </section>
    </template>
  </main>
</template>
