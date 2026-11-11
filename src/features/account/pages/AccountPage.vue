<script setup lang="ts">
import { ref } from 'vue';
import { Button as VanButton, showConfirmDialog, showDialog } from 'vant';
import { useAuth } from '../../auth/store';
import { router } from '../../../app/router';
import { getData } from '../../../data';
import { passwordError } from '../../../shared/validation';
import { appError } from '../../../shared/errors';
import CredentialPopup from '../../../shared/components/CredentialPopup.vue';
const auth = useAuth();
const settings = ref(false);
const old = ref('');
const next = ref('');
const repeat = ref('');
const message = ref('');
const busy = ref(false);
const show = ref(false);
const credential = ref<string>();
async function logout() {
  try {
    await showConfirmDialog({
      title: '退出当前演示账号？',
      message:
        '将清理当前账号的临时资料、草稿、二维码与设备资源。未确认操作需重新登录后从原记录核对。',
    });
  } catch {
    return;
  }
  await auth.logout();
  await router.replace('/login');
}
async function change() {
  if (busy.value) return;
  message.value = passwordError(old.value, next.value, repeat.value);
  if (message.value) return;
  busy.value = true;
  try {
    await getData().auth.changePassword(old.value, next.value);
    old.value = '';
    next.value = '';
    repeat.value = '';
    message.value = '密码修改流程已演示，不会更改真实账号或固定演示密码。';
  } catch (e) {
    message.value = appError(e).message;
  } finally {
    busy.value = false;
  }
}
async function memberCode() {
  credential.value = await getData().attendance.getMemberCredential();
  show.value = true;
}
</script>
<template>
  <div class="page">
    <section class="panel account-summary">
      <span class="avatar">{{ auth.member?.name?.slice(-1) ?? '队' }}</span>
      <h1>{{ auth.member?.name ?? '未提供' }}</h1>
      <p>队员编号：{{ auth.member?.number ?? '未提供' }}</p>
      <p class="muted">{{ auth.member?.identity ?? '未提供' }}</p>
    </section>
    <section class="panel account-links">
      <router-link to="/my/insurance">我的保险</router-link
      ><router-link to="/my/participation">参与记录</router-link
      ><router-link v-if="auth.member?.managed" to="/managed/activities">我负责的活动</router-link
      ><button class="text-button" @click="memberCode">本人成员码</button
      ><button class="text-button" @click="settings = !settings">账户设置</button
      ><button
        class="text-button"
        @click="
          showDialog({
            title: '使用帮助',
            message:
              '活动按场次报名和考勤。保险登记后需等待审核，现场操作后正式结果待认定。此版本只做合成演示，真实业务问题请联系管理员。',
          })
        "
      >
        帮助</button
      ><router-link to="/privacy">隐私说明（演示稿）</router-link>
    </section>
    <form v-if="settings" class="panel" @submit.prevent="change">
      <h2>修改密码（仅模拟）</h2>
      <p class="help">请勿填写真实密码。</p>
      <label class="field"
        >原演示密码<input v-model="old" type="password" autocomplete="off" /></label
      ><label class="field"
        >新演示密码<input v-model="next" type="password" autocomplete="off" /></label
      ><label class="field"
        >再次输入新密码<input v-model="repeat" type="password" autocomplete="off"
      /></label>
      <p v-if="message" class="error" role="status">{{ message }}</p>
      <van-button type="primary" native-type="submit" :loading="busy">演示修改密码</van-button>
    </form>
    <van-button plain @click="logout">退出 / 切换账号</van-button
    ><credential-popup
      v-model:show="show"
      :payload="credential"
      title="本人成员码"
      description="仅供本地演示现场核验，不可用于真实考勤。"
    />
  </div>
</template>
<style scoped>
.account-summary {
  border-top: 4px solid var(--srvf-red);
}
.avatar {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  background: var(--srvf-navy-tint);
  color: var(--srvf-navy);
  border-radius: 8px;
  font-size: 22px;
  font-weight: 700;
}
.account-links {
  gap: 0;
}
.account-links > a,
.account-links > button {
  min-height: 48px;
  padding: 12px 0;
  color: var(--srvf-fg-default);
  font-size: 16px;
  border-bottom: 1px solid var(--srvf-border-default);
}
</style>
