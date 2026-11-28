<script setup lang="ts">
import { onMounted } from 'vue';
import { getData } from '../../../data';
import { fail } from '../../../shared/errors';
import { teamJoinStatusLabel } from '../../../shared/labels';
import { useResource } from '../../../shared/composables/resource';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
const { data, loading, error, load } = useResource(async () => {
  const home = getData().memberHome;
  if (!home) throw fail('not-configured', '当前客户端未接通入队进度');
  return home.getTeamJoin();
});
onMounted(() => void load());
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>入队进度</h1>
      <p class="muted">没有在途申请时，服务端会返回找不到记录。这表示当前没有申请，不是故障。</p>
    </div>
    <page-state :loading="loading" :error="error" @retry="load">
      <section v-if="data" class="panel">
        <div class="panel-heading">
          <h2>{{ data.cycleName }}</h2>
          <status-badge>{{ teamJoinStatusLabel(data.status) }}</status-badge>
        </div>
        <p>{{ data.year }} 年入队轮</p>
        <p>贡献值：{{ data.points }}（{{ data.pointsMet ? '已达到 5 分' : '尚未达到 5 分' }}）</p>
        <p>通用门槛：{{ data.gatesMet ? '已满足' : '尚未全部满足' }}</p>
        <ul>
          <li v-for="(gate, index) in data.gates" :key="index">
            {{ gate.professional ? '专业队 · ' : '' }}{{ gate.label }}：{{
              gate.satisfied ? '已满足' : '未满足'
            }}
          </li>
        </ul>
      </section>
      <section v-else class="panel empty-state">
        <h2>当前没有在途入队申请</h2>
        <p class="muted">
          发起申请需要本轮开放的部门。队员端没有部门清单接口，这里不能代填部门，也不能编造申请。
        </p>
      </section>
    </page-state>
  </div>
</template>
