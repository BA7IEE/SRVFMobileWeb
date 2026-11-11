<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button as VanButton, Form as VanForm, Field as VanField, showDialog } from 'vant';
import { useAuth } from '../store';
import { getData } from '../../../data';
import { router } from '../../../app/router';
import { safeTarget } from '../../../app/router/safe-target';
import { loginErrors } from '../../../shared/validation';
import { appError } from '../../../shared/errors';
const route = useRoute();
const auth = useAuth();
const account = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);
const submitted = ref(false);
const composing = ref(false);
const error = ref('');
const errors = computed(() =>
  submitted.value ? loginErrors(account.value, password.value) : { account: '', password: '' },
);
const choices = getData().auth.getLoginOptions();
async function submit() {
  if (composing.value || loading.value) return;
  submitted.value = true;
  error.value = '';
  const e = loginErrors(account.value, password.value);
  if (e.account || e.password) return;
  loading.value = true;
  try {
    await auth.login(account.value.trim(), password.value);
    password.value = '';
    await router.replace(
      auth.state === 'blocked' ? '/system/blocked' : safeTarget(route.query.returnTo),
    );
  } catch (e) {
    error.value = appError(e).message;
  } finally {
    loading.value = false;
  }
}
function choose(value: (typeof choices)[number]) {
  account.value = value.account;
  password.value = value.password ?? '';
}
</script>
<template>
  <div class="page">
    <div class="login-mark">
      <strong>SRVF</strong>
      <h1>每一次行动，从这里开始</h1>
      <p class="muted">深圳公益救援队 · 队员移动端</p>
    </div>
    <div class="notice">仅演示账号，请勿输入真实密码。此处不连接真实认证服务。</div>
    <section class="panel">
      <h2>登录队员端</h2>
      <van-form
        :show-error-message="false"
        @submit="submit"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        ><van-field
          v-model="account"
          label="账号"
          name="account"
          autocomplete="off"
          placeholder="请输入演示账号"
          :error-message="errors.account"
          :show-error-message="true"
        /><van-field
          v-model="password"
          label="密码"
          name="password"
          autocomplete="off"
          :type="showPassword ? 'text' : 'password'"
          placeholder="请输入演示密码"
          :error-message="errors.password"
          :show-error-message="true"
        /><label class="check-label"
          ><input v-model="showPassword" type="checkbox" />显示密码</label
        >
        <p v-if="error || auth.message" role="alert" class="error">{{ error || auth.message }}</p>
        <van-button type="primary" native-type="submit" block :loading="loading" :disabled="loading"
          >演示登录</van-button
        ></van-form
      ><button
        class="text-button"
        @click="
          showDialog({
            title: '登录帮助',
            message:
              '仅可使用下方合成账号，选择后填入演示密码。正式登录方式待接线确认；本阶段不发送短信或重置真实密码。',
          })
        "
      >
        登录遇到问题
      </button>
    </section>
    <section v-if="choices.length" class="panel">
      <h2>选择演示身份</h2>
      <p class="help">选择后填入表单，再点击演示登录。密码为 {{ choices[0]?.password }}。</p>
      <div class="identity-grid">
        <button
          v-for="item in choices"
          :key="item.id"
          class="identity-option"
          @click="choose(item)"
        >
          <strong>{{ item.label }}</strong><span class="muted">{{ item.account }}</span>
        </button>
      </div>
    </section>
    <router-link to="/privacy" class="text-button">协议与隐私说明（演示稿）</router-link>
  </div>
</template>
<style scoped>
.identity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.identity-option {
  display: grid;
  gap: 4px;
  text-align: left;
  background: var(--srvf-bg-page);
  border: 1px solid var(--srvf-border-default);
  border-radius: 4px;
  min-height: 64px;
  padding: 12px;
}
.identity-option strong {
  font-size: 14px;
}
.identity-option span {
  font-size: 12px;
}
</style>
