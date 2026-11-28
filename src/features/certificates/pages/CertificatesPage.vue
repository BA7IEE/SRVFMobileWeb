<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Button as VanButton } from 'vant';
import { getData } from '../../../data';
import type { AppError, CertificateRecord } from '../../../data/models';
import { appError, fail } from '../../../shared/errors';
import { certificateStatusLabel } from '../../../shared/labels';
import { beijing } from '../../../shared/time';
import PageState from '../../../shared/components/PageState.vue';
import StatusBadge from '../../../shared/components/StatusBadge.vue';
const items = ref<CertificateRecord[]>([]);
const loading = ref(false);
const error = ref<AppError>();
const hasMore = ref(false);
const page = ref(1);
const loaded = ref(false);
async function load(more = false) {
  const home = getData().memberHome;
  if (!home) {
    error.value = fail('not-configured', '当前客户端未接通证书服务');
    return;
  }
  loading.value = true;
  if (!more) error.value = undefined;
  try {
    const next = await home.listCertificates(more ? page.value + 1 : 1);
    items.value = more ? [...items.value, ...next.items] : next.items;
    page.value = next.page;
    hasMore.value = next.hasMore;
    loaded.value = true;
  } catch (e) {
    if (!more) error.value = appError(e);
  } finally {
    loading.value = false;
  }
}
onMounted(() => void load());
</script>
<template>
  <div class="page">
    <div class="page-intro">
      <h1>我的证书</h1>
      <p class="muted">核验状态以服务端持久结果为准，到期日为空表示长期有效。</p>
    </div>
    <page-state
      :loading="loading && !items.length"
      :error="items.length ? undefined : error"
      :empty="loaded && !items.length"
      empty-text="暂无证书"
      @retry="load()"
    >
      <section v-for="item in items" :key="item.id" class="panel">
        <div class="panel-heading">
          <h2>{{ item.name }}</h2>
          <status-badge
            :tone="
              item.status === 'verified'
                ? 'success'
                : item.status === 'rejected'
                  ? 'error'
                  : 'pending'
            "
            >{{ certificateStatusLabel(item.status) }}</status-badge
          >
        </div>
        <p>{{ item.issuer }}</p>
        <p v-if="item.number" class="muted">证书编号：{{ item.number }}</p>
        <p class="muted">颁发：{{ beijing(item.issuedAt) }}</p>
        <p class="muted">到期：{{ item.expiredAt ? beijing(item.expiredAt) : '长期有效' }}</p>
        <p v-if="item.note">审核备注：{{ item.note }}</p>
      </section>
    </page-state>
    <van-button v-if="hasMore" plain :loading="loading" @click="load(true)">加载更多</van-button>
  </div>
</template>
