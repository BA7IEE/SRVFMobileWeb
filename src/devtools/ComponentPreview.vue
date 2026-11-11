<script setup lang="ts">
import { ref } from 'vue';
import { Button as VanButton, Field as VanField, Form as VanForm, showConfirmDialog } from 'vant';
import StatusBadge from '../shared/components/StatusBadge.vue';
import PageState from '../shared/components/PageState.vue';
import CredentialPopup from '../shared/components/CredentialPopup.vue';
import InsuranceRequirementCard from '../shared/components/InsuranceRequirementCard.vue';
import DynamicQuestions from '../shared/components/DynamicQuestions.vue';
import { questions } from '../data/mock/fixtures';
import { fail } from '../shared/errors';
const text = ref('');
const show = ref(false);
const answers = ref<Record<string, unknown>>({});
</script>
<template>
  <div class="page">
    <h1>SRVF 本地组件预览</h1>
    <section class="panel">
      <h2>操作与输入</h2>
      <van-button data-testid="theme-primary" type="primary">主要操作</van-button
      ><van-button plain>次要操作</van-button
      ><van-button type="primary" disabled>当前不可操作</van-button
      ><van-button type="primary" loading>提交中</van-button
      ><van-form
        ><van-field
          v-model="text"
          label="输入"
          placeholder="焦点样式"
          error-message="示例：请核对输入" /></van-form
      ><status-badge tone="success">当前在场</status-badge
      ><status-badge tone="pending">待审核</status-badge
      ><status-badge tone="error">资料需处理</status-badge
      ><van-button
        @click="
          showConfirmDialog({
            title: '确认本次操作',
            message: '这是用于检查主题、焦点与键盘的本地模态确认。',
          })
        "
        >打开确认弹层</van-button
      ><van-button @click="show = true">展示全屏码</van-button>
    </section>
    <insurance-requirement-card activity-id="act-open" />
    <section class="panel">
      <h2>长表单</h2>
      <dynamic-questions v-model="answers" :questions="questions" :errors="{}" />
    </section>
    <page-state empty /><page-state :error="fail('result-unknown', '结果待查询，不自动重发')" />
    <div class="action-bar"><van-button type="primary">底部操作栏</van-button></div>
    <credential-popup
      v-model:show="show"
      payload="SRVF-DEMO:member:member-a"
      title="演示成员码"
      description="全屏弹层与 Blob 图片检查"
    />
  </div>
</template>
