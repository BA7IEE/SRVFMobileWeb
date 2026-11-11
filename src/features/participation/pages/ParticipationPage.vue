<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getData } from '../../../data';
import { useResource } from '../../../shared/composables/resource';
import { decimal } from '../../../shared/time';
import type { ParticipationRecord } from '../../../data/models';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
const { data, loading, error, load } = useResource(async () => ({
  summary: await getData().participation.getSummary(),
  records: await getData().participation.listRecords(),
}));
const detail = ref<ParticipationRecord>();
onMounted(() => void load());
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
          <h2>正式认定汇总（演示）</h2>
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
          <p class="safety-note">数据层提供汇总；页面不将打卡时间差或正向分录加总。</p>
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
              @click="
                getData()
                  .participation.getRecordDetail(r.id)
                  .then((x) => (detail = x))
              "
            >
              查看记录说明
            </button>
          </section></page-state
        >
        <section v-if="detail" class="panel">
          <h2>{{ detail.title }}</h2>
          <p>
            {{
              detail.status === 'pending'
                ? '正在处理，没有结果不表示零小时。'
                : '本结果来自合成认定读面。真实净额、单位、版本与来源需后端联调确认。'
            }}
          </p>
          <button class="text-button" @click="detail = undefined">关闭说明</button>
        </section></template
      ></page-state
    >
  </div>
</template>
