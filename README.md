# SRVFMobileWeb

SRVF 队员移动端前端基础工程。使用 Vue 3、TypeScript、Vite、Vant 4、Pinia、Vue Router，按 Foundation V1.1 实现 13 个主页面和本地模拟流程。

**当前只运行合成演示数据。没有连接真实业务 API，没有正式保险审核、报名、考勤或贡献入账。** 普通构建停在“服务尚未接通”。公开源码不等于公开部署，也不代表可投入业务使用。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

开发服务只监听本机。选择演示身份后点击登录；演示密码为 `demo-only`。勿输入真实密码、保单或个人资料。

```sh
pnpm build:mock
pnpm preview:mock        # http://127.0.0.1:4173
pnpm build
pnpm preview             # http://127.0.0.1:4174，未接线版
pnpm check               # 完整质量检查，不发布
```

Node 22.22.3、pnpm 10.14.0 为本次实测环境。精确依赖见 package.json / pnpm-lock.yaml；包管理器仅使用仓库依赖，不修改机器级设置。WorkSSD 上可在安装时显式传 `--store-dir /Volumes/WorkSSD/Development/Stores/pnpm`，本机 `.npmrc` 不提交。

首次运行浏览器测试先执行 `pnpm exec playwright install chromium webkit`。Linux CI 使用 `--with-deps`。`pnpm test:e2e` 检查源码指纹，需要时构建两类产物，再启动本地预览执行 Chromium / WebKit。测试不访问业务服务。

演练顺序：登录 → 活动详情 → 保险 → 报名 → 我的活动逐场次结果 → 本场次扫码 → 我的参与记录。右侧“场景”只在模拟包出现，可换身份、推进时钟、注入异常、模拟保险审核与重置。负责人从“我的”进入“我负责的活动”。首发入口是先打开 H5 场次页，再点扫一扫。

工程分为页面模型、Ports、mock / unconfigured 数据源以及**只供离线测试**的 wire 适配。没有 NetworkTransport。`VITE_DATA_SOURCE=api` 立即报错；普通 build 拒绝外部变量强开 mock；真实传输失败不能回退演示。

说明与证据：

- [本轮移动端 UX/UI 与前端加固结果](docs/execution-report.md#2026-11-12-移动端-uxui-与前端加固本轮)，以及[准确验证汇总](docs/evidence/mobile-ux-20261112/summary.json)；下列审查报告保留历史数量。

- [fad130f8 审查整改与新增证据](docs/review-remediation.md)
- [执行报告](docs/execution-report.md)、[整体 review](docs/review.md)、[人工验收脚本](docs/acceptance.md)
- [路由清单](docs/route-map.md)、[65 个场景与测试映射](docs/scenario-catalog.md)、[验证规则](docs/validation-rules.md)
- [接口缺口与后端交接](docs/api-gap-register.md)、[接线准备](docs/integration-readiness.md)、[凭证 ADR](docs/adr-001-credentials.md)
- [固定契约摘要](contracts/manifest.json)、[37 项能力对照](contracts/capabilities.json)、[品牌出处](docs/design.md)
- [完整实施依据](docs/implementation.md)、[构建与网络证据](docs/evidence/)

截图均为合成数据，见 `docs/evidence/screenshots/`。执行报告区分前端、离线契约、真实联调和真机结果；未解决的核心读取缺口阻止整个系统标记 CONTRACT_READY。

不含后端修改、数据库、迁移、开关、真实上传、遥测、PWA / Service Worker、旧考勤兼容或生产部署。正式协议、凭证策略批准、HTTPS、真实权限与手机微信测试仍需下一阶段完成。
