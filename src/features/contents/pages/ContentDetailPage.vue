<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { getData } from '../../../data';
import { fail } from '../../../shared/errors';
import { useResource } from '../../../shared/composables/resource';
import { beijing } from '../../../shared/time';
import PageState from '../../../shared/components/PageState.vue';
const id = String(useRoute().params.contentId);
const { data, loading, error, load } = useResource(async () => {
  const home = getData().memberHome;
  if (!home) throw fail('not-configured', '当前客户端未接通队内内容');
  return home.getContent(id);
});
onMounted(() => void load());
</script>
<template>
  <div class="page">
    <page-state :loading="loading" :error="error" @retry="load">
      <article v-if="data" class="panel">
        <h1>{{ data.title }}</h1>
        <p v-if="data.summary" class="muted">{{ data.summary }}</p>
        <p v-if="data.publishedAt" class="muted">{{ beijing(data.publishedAt) }}</p>
        <p class="long-text">{{ data.body }}</p>
      </article>
    </page-state>
  </div>
</template>
