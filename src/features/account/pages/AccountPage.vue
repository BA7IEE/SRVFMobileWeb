<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Button as VanButton, showConfirmDialog, showDialog } from 'vant';
import { useAuth } from '../../auth/store';
import { router } from '../../../app/router';
import { getData } from '../../../data';
import { passwordError } from '../../../shared/validation';
import { appError } from '../../../shared/errors';
import type { SelfProfile } from '../../../data/models';
import CredentialPopup from '../../../shared/components/CredentialPopup.vue';
import { onBackgroundCleanup, onSessionCleanup } from '../../../shared/storage';
const mock = __MOCK__;
const auth = useAuth();
const home = getData().memberHome;
const profile = ref<SelfProfile>();
const profileNote = ref('');
const avatarUrl = ref('');
const unread = ref<number>();
const nickname = ref('');
const nicknameMessage = ref('');
const nicknameTone = ref<'error' | 'success'>('error');
const nicknameBusy = ref(false);
const settings = ref(false);
const old = ref('');
const next = ref('');
const repeat = ref('');
const message = ref('');
const messageTone = ref<'error' | 'success'>('error');
const busy = ref(false);
const show = ref(false);
const credential = ref<string>();
const codeBusy = ref(false);
const codeError = ref('');
let codeGeneration = 0;
let active = true;
function clearCode() {
  codeGeneration++;
  credential.value = undefined;
  show.value = false;
  codeBusy.value = false;
}
const unregisterBackground = onBackgroundCleanup(clearCode);
const unregisterSession = onSessionCleanup(() => {
  active = false;
  clearCode();
});
onMounted(() => {
  if (!home) return;
  void home
    .getProfile()
    .then((value) => {
      profile.value = value;
      nickname.value = value.nickname ?? '';
    })
    .catch((e) => {
      profileNote.value = appError(e).message;
    });
  void home
    .getAvatar()
    .then((value) => {
      if (!value?.accessUrl?.startsWith('https://')) return;
      if (value.expiresAt && Date.parse(value.expiresAt) <= Date.now()) return;
      avatarUrl.value = value.accessUrl;
    })
    .catch(() => {
      avatarUrl.value = '';
    });
  void home.unreadCount().then(
    (value) => {
      unread.value = value;
    },
    () => {
      unread.value = undefined;
    },
  );
});
async function saveNickname() {
  if (!home || nicknameBusy.value) return;
  nicknameBusy.value = true;
  nicknameMessage.value = '';
  try {
    profile.value = await home.updateNickname(nickname.value);
    nickname.value = profile.value.nickname ?? '';
    nicknameTone.value = 'success';
    nicknameMessage.value = '昵称已保存。';
  } catch (e) {
    nicknameTone.value = 'error';
    nicknameMessage.value = appError(e).message;
  } finally {
    nicknameBusy.value = false;
  }
}
onUnmounted(() => {
  active = false;
  clearCode();
  unregisterBackground();
  unregisterSession();
});
async function logout() {
  try {
    await showConfirmDialog({
      title: mock ? '退出当前演示账号？' : '退出当前账号？',
      message:
        '将清理当前账号的临时资料、草稿、二维码与设备资源。未确认操作需重新登录后从原记录核对。',
    });
  } catch {
    return;
  }
  try {
    await auth.logout();
  } catch {
    await showDialog({ message: '本机已退出，服务器撤销回执未收到。下次登录时会再次确认退出。' });
  }
  await router.replace('/login');
}
async function change() {
  if (busy.value) return;
  message.value = passwordError(old.value, next.value, repeat.value);
  messageTone.value = 'error';
  if (message.value) return;
  busy.value = true;
  try {
    await getData().auth.changePassword(old.value, next.value);
    old.value = '';
    next.value = '';
    repeat.value = '';
    if (!mock) {
      await auth.logout();
      await router.replace('/login');
      return;
    }
    messageTone.value = 'success';
    message.value = '密码修改流程已演示，不会更改真实账号或固定演示密码。';
  } catch (e) {
    messageTone.value = 'error';
    message.value = appError(e).message;
  } finally {
    busy.value = false;
  }
}
async function memberCode() {
  if (codeBusy.value) return;
  codeBusy.value = true;
  codeError.value = '';
  const generation = codeGeneration;
  try {
    const value = await getData().attendance.getMemberCredential();
    if (active && generation === codeGeneration) {
      credential.value = value;
      show.value = true;
    }
  } catch (e) {
    if (active && generation === codeGeneration) codeError.value = appError(e).message;
  } finally {
    if (active && generation === codeGeneration) codeBusy.value = false;
  }
}
</script>
<template>
  <div class="page">
    <section class="panel account-summary">
      <img v-if="avatarUrl" class="avatar avatar-photo" :src="avatarUrl" alt="" />
      <span v-else class="avatar">{{ auth.member?.name?.slice(-1) ?? '队' }}</span>
      <h1>{{ auth.member?.name ?? '未提供' }}</h1>
      <p>队员编号：{{ auth.member?.number ?? '未提供' }}</p>
      <p v-if="profile" class="muted">昵称：{{ profile.nickname ?? '未设置' }}</p>
      <p v-else-if="profileNote" class="muted">{{ profileNote }}</p>
      <p class="muted">{{ auth.member?.identity ?? '未提供' }}</p>
    </section>
    <section class="panel account-links">
      <router-link to="/my/insurance">我的保险</router-link
      ><router-link to="/my/participation">参与记录</router-link
      ><router-link v-if="home" to="/my/certificates">我的证书</router-link
      ><router-link v-if="home" to="/my/notices"
        >通知{{ unread === undefined ? '' : `（未读 ${unread}）` }}</router-link
      ><router-link v-if="home" to="/my/contents">队内内容</router-link
      ><router-link v-if="home" to="/my/team-join">入队进度</router-link
      ><router-link v-if="auth.member?.managed && getData().ordinaryActivities" to="/managed/work"
        >活动办理</router-link
      ><router-link v-if="auth.member?.managed" to="/managed/activities">我负责的活动</router-link
      ><button class="text-button" :disabled="codeBusy" @click="memberCode">
        {{ codeBusy ? '正在读取成员码…' : '本人成员码' }}</button
      ><button class="text-button" :aria-expanded="settings" @click="settings = !settings">
        账户设置</button
      ><button
        class="text-button"
        @click="
          showDialog({
            title: '使用帮助',
            message: mock
              ? '活动按场次报名和考勤。保险登记后需等待审核，现场操作后正式结果待认定。此版本只做合成演示，真实业务问题请联系管理员。'
              : '活动按场次报名和考勤，现场回执与正式认定分别展示。',
          })
        "
      >
        帮助</button
      ><router-link to="/privacy">隐私说明{{ mock ? '（演示稿）' : '' }}</router-link>
    </section>
    <p v-if="codeError" role="alert" class="error">{{ codeError }}，请重新点击本人成员码重试。</p>
    <form v-if="settings" class="panel" @submit.prevent="change">
      <h2>修改密码{{ mock ? '（仅模拟）' : '' }}</h2>
      <p class="help">请勿填写真实密码。</p>
      <label class="field"
        >{{ mock ? '原演示密码' : '原密码'
        }}<input v-model="old" type="password" autocomplete="off" /></label
      ><label class="field"
        >{{ mock ? '新演示密码' : '新密码'
        }}<input v-model="next" type="password" autocomplete="off" /></label
      ><label class="field"
        >再次输入新密码<input v-model="repeat" type="password" autocomplete="off"
      /></label>
      <p
        v-if="message"
        :class="messageTone === 'success' ? 'success' : 'error'"
        :role="messageTone === 'success' ? 'status' : 'alert'"
      >
        {{ message }}
      </p>
      <van-button type="primary" native-type="submit" :loading="busy">{{
        mock ? '演示修改密码' : '修改密码'
      }}</van-button>
    </form>
    <form v-if="settings && home" class="panel" @submit.prevent="saveNickname">
      <h2>昵称</h2>
      <label class="field"
        >昵称<input v-model="nickname" maxlength="50" autocomplete="nickname"
      /></label>
      <p
        v-if="nicknameMessage"
        :class="nicknameTone === 'success' ? 'success' : 'error'"
        :role="nicknameTone === 'success' ? 'status' : 'alert'"
      >
        {{ nicknameMessage }}
      </p>
      <van-button type="primary" native-type="submit" :loading="nicknameBusy">保存昵称</van-button>
      <p class="help">
        头像上传和删除使用文件接口。当前队员传输只发送 JSON
        和考勤二维码，这里不能更换或删除头像。没有可用头像时仍显示姓名字。
      </p>
    </form>
    <van-button plain @click="logout">退出 / 切换账号</van-button
    ><credential-popup
      v-model:show="show"
      :payload="credential"
      :official="!mock"
      title="本人成员码"
      :description="
        mock ? '仅供本地演示现场核验，不可用于真实考勤。' : '请只交给本场负责人核验，不要转发截图。'
      "
    />
  </div>
</template>
<style scoped>
.account-summary {
  grid-template-columns: 56px minmax(0, 1fr);
  column-gap: var(--srvf-space-md);
  row-gap: 2px;
  align-items: center;
  padding: var(--srvf-space-lg) var(--srvf-space-md);
  box-shadow:
    inset 0 4px 0 var(--srvf-red),
    var(--srvf-shadow-card);
}
.account-summary > :not(.avatar) {
  grid-column: 2;
}
.account-summary h1 {
  font-size: var(--srvf-text-lg);
}
.account-summary p {
  font-size: var(--srvf-text-sm);
  font-variant-numeric: tabular-nums;
}
.avatar {
  grid-row: 1 / span 4;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  background: var(--srvf-navy-tint);
  color: var(--srvf-navy);
  border-radius: 50%;
  font-size: 22px;
  font-weight: 700;
}
.avatar-photo {
  object-fit: cover;
}
.account-links {
  gap: 0;
  padding: var(--srvf-space-xxs) var(--srvf-space-md);
}
.account-links > a,
.account-links > button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  justify-self: stretch;
  width: 100%;
  min-height: 52px;
  padding: 12px 0;
  color: var(--srvf-fg-default);
  font-size: var(--srvf-text-base);
  font-weight: 500;
  text-align: left;
  border-bottom: var(--srvf-hairline) solid var(--srvf-border-default);
  border-radius: 0;
}
.account-links > :last-child {
  border-bottom: 0;
}
.account-links > a::after,
.account-links > button::after {
  content: '';
  width: 8px;
  height: 8px;
  margin-right: 4px;
  border-top: 1.5px solid var(--srvf-fg-muted);
  border-right: 1.5px solid var(--srvf-fg-muted);
  transform: rotate(45deg);
  flex-shrink: 0;
}
.account-links > button[aria-expanded='true']::after {
  transform: rotate(135deg);
}
.account-links > button:disabled {
  color: var(--srvf-fg-muted);
}
</style>
