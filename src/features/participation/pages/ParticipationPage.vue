<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { Button as VanButton } from 'vant';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import { beijing, decimal } from '../../../shared/time';
import type { ParticipationRecord, SheetAttendance } from '../../../data/models';
import { appError } from '../../../shared/errors';
import { attendanceStatusLabel } from '../../../shared/labels';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
const { data, loading, error, load } = useResource(async () => ({
  summary: await getData().participation.getSummary(),
  records: await getData().participation.listRecords(),
}));
const mock = __MOCK__;
const selected = ref<ParticipationRecord>();
const detail = useResource(() =>
  selected.value
    ? getData().participation.getRecordDetail(selected.value.id)
    : Promise.resolve(undefined),
);
const detailHeading = ref<HTMLElement>();
async function openDetail(record: ParticipationRecord) {
  detail.cancel();
  selected.value = record;
  void detail.load();
  await nextTick();
  detailHeading.value?.focus();
}
function closeDetail() {
  selected.value = undefined;
  detail.cancel();
}
const sheets = ref<SheetAttendance[]>([]);
const sheetLoading = ref(false);
const sheetError = ref<ReturnType<typeof appError>>();
const sheetPage = ref(1);
const sheetMore = ref(false);
const sheetLoaded = ref(false);
async function loadSheets(more = false) {
  const home = getData().memberHome;
  if (!home) return;
  sheetLoading.value = true;
  if (!more) sheetError.value = undefined;
  try {
    const next = await home.listAttendanceRecords(more ? sheetPage.value + 1 : 1);
    sheets.value = more ? [...sheets.value, ...next.items] : next.items;
    sheetPage.value = next.page;
    sheetMore.value = next.hasMore;
    sheetLoaded.value = true;
  } catch (e) {
    if (!more) sheetError.value = appError(e);
  } finally {
    sheetLoading.value = false;
  }
}
onMounted(() => {
  void load();
  void loadSheets();
});
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>我的参与记录</h1>
      <p class="muted">现场回执、处理中与正式认定分开查看。</p>
    </div>
    <page-state :loading="loading" :error="error" @retry="load"
      ><template v-if="data"
        ><section class="panel">
          <h2>正式认定汇总{{ mock ? '（演示）' : '' }}</h2>
          <div class="metric-row">
            <div>
              <strong>{{ decimal(data.summary.hours, '小时') }}</strong>
              <p class="help">正式时长</p>
            </div>
            <div>
              <strong>{{ decimal(data.summary.points, '分') }}</strong>
              <p class="help">贡献净额</p>
            </div>
          </div>
          <p class="help">打卡记录仍需认定，待认定不表示零小时。</p>
          <details v-if="mock" class="developer-details">
            <summary>演示数据说明</summary>
            <p class="help">数据层提供汇总；页面不将打卡时间差或正向分录加总。</p>
          </details>
        </section>
        <page-state :empty="!data.records.length" empty-text="暂无参与记录"
          ><section v-for="r in data.records" :key="r.id" class="panel">
            <h2>{{ r.title }}</h2>
            <p>{{ r.session }}</p>
            <status-badge :tone="r.status === 'pending' ? 'pending' : 'success'">{{
              r.status === 'pending' ? '待认定' : r.status === 'corrected' ? '更正后结果' : '已认定'
            }}</status-badge>
            <p>正式时长：{{ decimal(r.hours, '小时') }}</p>
            <p>贡献净额：{{ decimal(r.points, '分') }}</p>
            <p v-if="r.historical" class="help">历史活动信息受限，当前仅显示本人安全摘要。</p>
            <button
              class="text-button"
              :aria-expanded="selected?.id === r.id"
              aria-controls="participation-detail"
              @click="openDetail(r)"
            >
              查看记录说明
            </button>
          </section></page-state
        >
        <section v-if="selected" id="participation-detail" class="panel">
          <h2 ref="detailHeading" tabindex="-1">{{ selected.title }} · 记录说明</h2>
          <p>{{ selected.session }}</p>
          <page-state
            :loading="detail.loading.value"
            :error="detail.error.value"
            @retry="detail.load"
          >
            <p v-if="detail.data.value">
              {{
                detail.data.value.status === 'pending'
                  ? '正在处理，没有结果不表示零小时。'
                  : !mock
                    ? '本条来自本人已生效的账本分录。'
                    : '当前为演示认定结果，正式结果需以接通后的记录为准。'
              }}
            </p>
          </page-state>
          <button class="text-button" @click="closeDetail">关闭说明</button>
        </section></template
      ></page-state
    >
    <section v-if="getData().memberHome" class="panel">
      <h2>审核通过的考勤记录</h2>
      <p class="help">来自已通过的考勤单。这里的时长不会加进上方正式净额。</p>
      <page-state
        :loading="sheetLoading && !sheets.length"
        :error="sheets.length ? undefined : sheetError"
        :empty="sheetLoaded && !sheets.length"
        empty-text="暂无审核通过的考勤记录"
        @retry="loadSheets()"
      >
        <div v-for="row in sheets" :key="row.id" class="session-row">
          <h3>{{ row.title }}</h3>
          <status-badge>{{ attendanceStatusLabel(row.status) }}</status-badge>
          <p>签到 {{ beijing(row.checkInAt) }} · 签退 {{ beijing(row.checkOutAt) }}</p>
          <p>
            记录时长 {{ row.hours }} 小时<span v-if="row.points"> · 贡献 {{ row.points }}</span>
          </p>
          <p v-if="row.note" class="muted">{{ row.note }}</p>
        </div>
      </page-state>
      <van-button v-if="sheetMore" plain :loading="sheetLoading" @click="loadSheets(true)"
        >加载更多</van-button
      >
    </section>
  </div>
</template>
