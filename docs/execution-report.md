# SRVFMobileWeb FRONTEND-FOUNDATION 执行报告

> 本文保留首次交付的版本与数量。`fad130f8` 审查后确认两项会话缺陷、活动岗位投影遗漏和截图证据不足，后续结论与准确验证结果以 [审查整改报告](review-remediation.md) 为准。旧版 47 份契约、61/45/48 项测试和保险加载中截图不再作为当前整改完成的证据。

本阶段前端基础工程与模拟交互完成，经过整体 review 和回归。已存在契约的离线验证范围列于下方；核心后端读取缺口保持独立记录，没有伪装成可用接口。

## 基线与版本

- 日期：2026-11-12，Asia/Shanghai。
- 工作目录：当前 SRVFMobileWeb 仓库；原始目录为空，没有已有Git仓库或修改被覆盖。
- 原始SHA：不存在（空目录）。已审查和验证的工程提交：`b73e67c70ebef4aad1feb521a2cd85a306e6fb86`。
- 本报告后的交付提交仅补充验收与公开交付文档；当前远端HEAD在交付消息中核对。
- 源码/构建指纹：`48debb3dcb0f85a6a5e1f51b3316b1151bf9551103e29bdc54470549456edecc`，两种构建均与该源码指纹匹配。
- Node 22.22.3，pnpm 10.14.0；Vue 3.5.45、Vant 4.10.2、Vite 7.3.8、Pinia 3.0.4、Vue Router 4.6.4、TypeScript 5.9.3。全部解析版本见锁文件和 evidence/toolchain.json。
- 浏览器：Chromium 158.0.8127.18、桌面WebKit 27.2。
- 后端：BA7IEE/srvf-nest-api@fcf4e5d5802c42a1503b205751f737e3badd6ffc，本轮GitHub只读复核main为同一SHA。
- 品牌：srvf-admin-web@eaed861acae8fe18b1d12b093c9077060815678b；token blob 7295d168e2a15e140c5a522456246a6a4736f88d。
- 契约采用源码DTO/controller相关切片，不是OpenAPI生成客户端；47份来源切片、37项Port/能力映射均有本地摘要与固定来源。

## 已完成

13个主页面和必要子流程：登录、活动列表/详情/报名、我的活动、逐场考勤、参与记录、统保/自购保险、我的、负责人活动、报名管理、现场工作台、人员核验/异常。保险CRUD、密码模拟、成员码、签到/签退码、取消确认、帮助、演示隐私、系统状态页和mock组件预览均可操作。

登录包含恢复、七种会话状态、并发续期合并、错误/限流/准入失败、过期、退出、账号切换与复制标签页独立family。活动职责按资源和模块判断，未知不放行；普通队员不出现保险审核或复杂认定入口。

表单有八类题、0/false边界、日期、选择白名单、岗位志愿排序、本地文件、草稿和离开提醒。保险登记/实质修改回待审；返回报名保留安全上下文并重读资格。未知回执先查原结果，刷新后缺原始载荷时不生成替代意图。

现场区分活动/场次、成员码/场次码、签到/签退、版本/撤销/到期。代签确认永久身份和原因，批量操作逐项显示。二维码由本地合成图片生成且实际解码；无真实签名。相机晚到流、取消/离页、定位拒绝/超时有模拟或替身证据，后台恢复先重验身份再重读。

样式按品牌token→移动语义→Vant全局映射。真实计算样式覆盖按钮、Tab、输入焦点、模态和全屏弹层；颜色不单独承担状态。包内字体fallback外链已移除。40张矩阵截图加2张人工视觉审查图均只使用合成数据。

## 实际验证

| 检查                 | 命令/范围                                                                            | 结果                                               | 证据                                              |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------- |
| 类型检查             | pnpm typecheck                                                                       | PASS                                               | evidence/quality-check.txt                        |
| 静态检查             | pnpm lint                                                                            | PASS，1条不影响行为的Vue属性排序提示               | evidence/quality-check.txt                        |
| 格式                 | pnpm format:check                                                                    | PASS                                               | 完整check日志及交付前格式检查                     |
| 单元/组件            | pnpm test:unit                                                                       | PASS，61个用例                                     | evidence/quality-check.txt                        |
| 离线契约             | pnpm test:contract                                                                   | PASS，最终45个用例；含补充时长证明/改密边界        | evidence/quality-check.txt                        |
| 双浏览器             | pnpm test:e2e                                                                        | PASS，48个用例（24×2），无重试、无跳过             | evidence/network/、截图、validation-summary.json  |
| 12条主流程           | tests/e2e/flows.spec.ts                                                              | PASS，两浏览器各12条                               | 逐用例网络记录                                    |
| 契约来源/摘要        | pnpm check:contract                                                                  | PASS，47切片/37能力项；只读本地，不拉远程main      | contracts/manifest.json、capabilities.json        |
| SRVF token           | pnpm check:tokens                                                                    | PASS，值/引用/色对及实际计算样式                   | quality-check.txt、e2e/tokens.spec.ts             |
| 导入/网络边界        | pnpm check:boundaries                                                                | PASS，无页面网络/fixture直读、无Admin或旧考勤依赖  | quality-check.txt                                 |
| 模拟构建             | pnpm build:mock                                                                      | PASS，有持续演示标识                               | dist-mock、构建指纹                               |
| 普通构建             | pnpm build                                                                           | PASS，只显示未接线；无演示身份/密码/场景/码        | evidence/bundle.json、E2E11                       |
| 外部配置负例         | mock环境强开普通build、显式api                                                       | PASS，两项立即拒绝                                 | environment-guards.json、unit/environment.test.ts |
| 运行时零业务网络     | 48个全新context用例，禁用Service Worker，拦截其他origin/业务请求，记录WebSocket与CSP | PASS，业务请求0、外链尝试0、CSP违规0、浏览器异常0  | evidence/network/                                 |
| 四宽度排版           | 320/375/390/430，五类核心页，Chromium/WebKit                                         | PASS，无整页横滚，40张截图                         | evidence/screenshots/                             |
| 视觉审查             | Python Playwright真实渲染并查看登录、列表、320长表单、WebKit现场页截图               | PASS（桌面范围）                                   | visual-login.png、visual-activities.png及矩阵截图 |
| 公开内容检查         | Git候选清单、密钥模式、来源与合成内容人工审查                                        | PASS，无真实凭据/业务数据；本机与临时产物不纳入Git | public-content-audit.json                         |
| Android真机          | 未提供设备环境                                                                       | NOT_RUN                                            | 真机矩阵待补                                      |
| iPhone Safari真机    | 桌面WebKit不替代实机                                                                 | NOT_RUN                                            | 真机矩阵待补                                      |
| 手机微信             | 实际HTTPS入口/权限/扫码                                                              | NOT_RUN                                            | 真机矩阵待补                                      |
| 真实API与身份        | 本阶段禁止执行                                                                       | NOT_RUN                                            | 没有NetworkTransport                              |
| 生产站点/数据库/开关 | 本阶段未执行                                                                         | NOT_RUN                                            | 未部署、未修改后端                                |

48份网络证据记录本站静态资源；允许受控本站Blob图片，不把Blob当作HTTP业务请求。依赖安装和GitHub源码/仓库操作属于工具链，不包含在浏览器业务流量统计中。未声称操作系统完全没有网络。

## 体积

采用比首屏更保守的“全部JS+CSS gzip合计”统计。普通包为 213.48 KiB，排除延迟扫码解码器后 167.12 KiB；模拟包为 231.12 KiB，排除解码器后 184.77 KiB。均低于350KiB预算；扫码/Qrcode延迟加载，无远程字体、地图、统计或新UI库。

## 就绪级别与限制

| 级别              | 本次结论                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| UI_READY          | 本地前端与mock范围完成：13页、65个场景定义、实际自动化/品牌/资源生命周期/网络检查；未把场景定义数量当独立测试数              |
| CONTRACT_READY    | 总体BLOCKED。已知协议的请求白名单、解析、SVG、附件、认证轮换与逐操作恢复已有离线验证，但完整页面Port仍受G03—G08、G09—G10约束 |
| INTEGRATION_READY | BLOCKED，部署候选、真实存储批准、测试身份/数据、HTTPS/跨域及授权未齐                                                         |
| RELEASE_READY     | BLOCKED，真实链路、管理端认定结算、手机/微信与正式协议均未验收                                                               |

wire只接受注入传输，FakeTransport返回内存合成响应；没有模拟HTTP业务服务器、真实API开关或失败回退mock。现有端点的安全解析不等于完整新版页面投影已满足，特别是统保、保险资格、逐场回显、现场名单/异常、历史上下文、正式净额和进度。具体责任与最小验收例见api-gap-register，不能以相似路径或旧接口冒充已补齐。

CredentialStore保留可替换边界；mock与真实凭证命名空间/生命周期隔离。真实存储ADR尚未批准。内存意图摘要仅用于一致性校验，完整规范化载荷仍参与比较，摘要不是授权或后端事实。丢失原文件/二维码/位置后不承诺精确重放。

整体review的发现、修复与回归见review.md。没有留下已知阻塞本地模拟交付的P1/P2；真实服务安全性不在此结论内。

## 交付与边界

原srvf-h5未删除、覆盖或改造；后端仓库、数据库、迁移、权限配置和业务开关未修改。没有真实短信、微信授权、保险审核、报名、打卡、上传、认定或结算写入，没有公开站点部署或自动合并。

用户在实施过程中追加授权创建公开GitHub仓库并推送源码。将使用已登录的BA7IEE账号、noreply提交身份；公开内容包括新前端、锁文件、测试、合成截图、文档和同一账号已有公开仓库的相关契约切片。本机.npmrc、依赖、构建目录、原始完整抓取副本和临时trace不发布。仓库实际创建/推送与远端HEAD在交付时核对；GitHub Actions实时结果单独核验，不把本地PASS当作CI通过。
