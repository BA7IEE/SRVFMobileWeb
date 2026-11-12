<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useAuth } from '../../features/auth/store';
import { router } from '../../app/router';
import { Button as VanButton, Icon as VanIcon } from 'vant';
const route = useRoute();
const auth = useAuth();
const reasons: Record<string, { title: string; message: string }> = {
  'not-configured': {
    title: '服务尚未接通',
    message: '当前为未接线版本。活动、保险、报名与考勤服务尚未开放。',
  },
  forbidden: {
    title: '暂无此活动的操作权限',
    message: '活动职责按范围授予，请返回本人可使用的页面。',
  },
  'not-found': {
    title: '页面暂不可访问',
    message: '页面不存在或当前不可读，请从活动列表重新进入。',
  },
  blocked: { title: '当前成员无法准入', message: '成员未绑定、停用或暂不可用，请联系管理员确认。' },
  unavailable: {
    title: '暂时无法确认身份',
    message: '会话读取暂不可用，请重试。此状态不表示已经退出或已经授权。',
  },
};
const info = reasons[String(route.params.reason)] ?? reasons['not-found']!;
async function retry() {
  await auth.revalidate();
  if (auth.ready) void router.replace('/activities');
  else if (auth.state === 'blocked') void router.replace('/system/blocked');
  else if (auth.state === 'anonymous' || auth.state === 'expired') void router.replace('/login');
}
</script>
<template>
  <div class="page">
    <section class="panel empty-state">
      <van-icon name="shield-o" />
      <h1>{{ info.title }}</h1>
      <p>{{ info.message }}</p>
      <van-button v-if="route.params.reason === 'unavailable'" type="primary" @click="retry"
        >重新确认身份</van-button
      ><router-link
        v-if="route.params.reason !== 'not-configured'"
        to="/activities"
        class="text-button"
        >返回活动</router-link
      ><button
        v-if="auth.member"
        class="text-button"
        @click="auth.logout().then(() => router.replace('/login'))"
      >
        退出当前账号</button
      ><router-link to="/privacy">隐私说明（演示稿）</router-link>
    </section>
  </div>
</template>
