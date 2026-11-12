# 65 个场景定义与验收映射

此表逐项保留 Foundation V1.1 的43+22个定义，不把它等同于65个独立测试。自动化用例按行为组合；最终执行状态与数量以 execution-report 为准。测试路径默认从 tests/ 起算，scripts 项从项目根起算。

场景面板可切换条件、身份和时钟；定义涉及的返回、输入、权限或查询动作需在页面执行，选择一个ID不代表该场景已经通过。设备成功与拒绝使用本地替身；真机、微信和真实API始终 NOT_RUN。

审查整改增加 6 个定向测试控制，不改变上述 65 条基础验收定义：`AUTH-RESTORE-ONCE`（已有会话刷新后的首次身份读取失败）；`INS-LAYOUT`（两条统保、三条自购、128 字符保单号）；`INS-SLOW`（延迟两秒）；`INS-EMPTY`；`INS-ERROR`；`INS-FORBIDDEN`。对应 `e2e/review-regressions.spec.ts`、`e2e/layout.spec.ts`。会话组合的正式回归另见 `contract/auth-overlap.test.ts` 与 `unit/auth-restore-retry.test.ts`，不把场景面板数量当成测试数量。

| ID          | 场景                         | 必须观察到                                        | 自动化承载                                                                                             |
| ----------- | ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AUTH-01     | 深链接未登录                 | 登录后回到允许的原活动                            | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-02     | 会话恢复中                   | 不闪现其他人的数据或登录页                        | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-03     | 错误演示密码                 | 显示错误，不创建登录态                            | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-04     | 模拟会话过期                 | 清理后提示重新登录                                | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-05     | 并发续期                     | 只执行一次续期                                    | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-06     | 退出后旧响应返回             | 不恢复旧身份                                      | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-07     | 未绑定／停用成员             | 准入说明，不空白、不假登录                        | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-08     | 非法返回地址                 | 拒绝并回安全路由                                  | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| INS-01      | 自购已审核且覆盖活动         | 可以继续保险条件检查后的报名                      | unit/mock-flows.test.ts + e2e/flows.spec.ts                                                            |
| INS-02      | 仅团队统保                   | 不要求重复登记自购保险                            | unit/mock-flows.test.ts + e2e/flows.spec.ts                                                            |
| INS-03      | 自购待审核                   | 明确待审核，不允许自行通过                        | unit/mock-flows.test.ts + e2e/flows.spec.ts                                                            |
| INS-04      | 已拒绝／已过期／未生效       | 各有独立提示                                      | unit/mock-flows.test.ts + e2e/flows.spec.ts                                                            |
| INS-05      | 只覆盖活动部分日期           | 显示不满足本次活动要求                            | unit/mock-flows.test.ts + e2e/flows.spec.ts                                                            |
| INS-06      | 资格读取失败                 | 显示未知和重试，不判无保险                        | unit/mock-flows.test.ts + e2e/flows.spec.ts                                                            |
| INS-07      | 修改审核通过的自购资料       | 回待审核，返回报名后重新核对                      | unit/mock-flows.test.ts + e2e/flows.spec.ts                                                            |
| INS-08      | 同时编辑版本冲突             | 提醒刷新，不强制覆盖                              | unit/mock-flows.test.ts + e2e/flows.spec.ts                                                            |
| REG-01      | 8 类动态题                   | 渲染与边界验证正确                                | unit/validation.test.ts + unit/mock-flows.test.ts + components/components.test.ts + e2e/safety.spec.ts |
| REG-02      | 多场次、多岗位志愿           | 顺序保留，不能重复或跨场次混用                    | unit/validation.test.ts + unit/mock-flows.test.ts + components/components.test.ts + e2e/safety.spec.ts |
| REG-03      | 提交后部分通过／候补         | 按场次呈现，不显示全部通过                        | unit/validation.test.ts + unit/mock-flows.test.ts + components/components.test.ts + e2e/safety.spec.ts |
| REG-04      | 表单版本变化                 | 提示核对，不丢失全部安全输入                      | unit/validation.test.ts + unit/mock-flows.test.ts + components/components.test.ts + e2e/safety.spec.ts |
| REG-05      | 重复点击与同键重试           | 只有一个模拟提交结果                              | unit/validation.test.ts + unit/mock-flows.test.ts + components/components.test.ts + e2e/safety.spec.ts |
| REG-06      | 已提交但回执丢失             | 进入结果未知，先查询                              | unit/validation.test.ts + unit/mock-flows.test.ts + components/components.test.ts + e2e/safety.spec.ts |
| REG-07      | 保险页返回报名               | 恢复当前会话草稿并重验资格                        | unit/validation.test.ts + unit/mock-flows.test.ts + components/components.test.ts + e2e/safety.spec.ts |
| PUNCH-01    | 正常签到与签退               | 当前状态和回执一致，均标演示                      | unit/mock-flows.test.ts + unit/device.test.ts + e2e/flows.spec.ts                                      |
| PUNCH-02    | 签到码扫到签退流程／错误场次 | 明确拒绝，不擅自换动作                            | unit/mock-flows.test.ts + unit/device.test.ts + e2e/flows.spec.ts                                      |
| PUNCH-03    | 过期／撤销／重签后的旧码     | 不再接受旧凭证                                    | unit/mock-flows.test.ts + unit/device.test.ts + e2e/flows.spec.ts                                      |
| PUNCH-04    | 重复扫描同一码               | 不重复记事件                                      | unit/mock-flows.test.ts + unit/device.test.ts + e2e/flows.spec.ts                                      |
| PUNCH-05    | 未到允许签退时间             | 显示等待，时间到后重新读取                        | unit/mock-flows.test.ts + unit/device.test.ts + e2e/flows.spec.ts                                      |
| PUNCH-06    | 定位拒绝／超时／不需要定位   | 分别处理，不伪造坐标                              | unit/mock-flows.test.ts + unit/device.test.ts + e2e/flows.spec.ts                                      |
| PUNCH-07    | 相机拒绝／不可用             | 有操作指引，不死循环申请                          | unit/mock-flows.test.ts + unit/device.test.ts + e2e/flows.spec.ts                                      |
| PUNCH-08    | 当前不在场但有历史服务段     | 不误报“从未签到”                                  | unit/mock-flows.test.ts + unit/device.test.ts + e2e/flows.spec.ts                                      |
| STAFF-01    | 普通成员访问负责人路径       | 拒绝访问                                          | unit/mock-flows.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                                       |
| STAFF-02    | 报名协办访问考勤             | 拒绝；反向也测试                                  | unit/mock-flows.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                                       |
| STAFF-03    | A 活动负责人访问 B 活动      | 拒绝                                              | unit/mock-flows.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                                       |
| STAFF-04    | 受控代签未填原因             | 前端阻止提交                                      | unit/mock-flows.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                                       |
| STAFF-05    | 批量操作部分失败             | 展示逐项结果，不报全部成功                        | unit/mock-flows.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                                       |
| STAFF-06    | 页面打开后撤销职责           | 终止操作并清理受限内容                            | unit/mock-flows.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                                       |
| RECORD-01   | 未认定／认定为零／已认定     | 三种状态区分                                      | unit/mock-flows.test.ts + e2e/flows.spec.ts + e2e/layout.spec.ts                                       |
| RECORD-02   | 历史活动普通详情不可读       | 安全摘要可展示，不整页崩溃                        | unit/mock-flows.test.ts + e2e/flows.spec.ts + e2e/layout.spec.ts                                       |
| SYSTEM-01   | 断网提示／慢响应／服务失败   | 可恢复，无无限 spinner                            | e2e/flows.spec.ts + e2e/safety.spec.ts + e2e/fixtures.ts                                               |
| SYSTEM-02   | 普通 unconfigured 构建       | 无 mock 登录或业务写操作                          | e2e/flows.spec.ts + e2e/safety.spec.ts + e2e/fixtures.ts                                               |
| SYSTEM-03   | 切换账号与浏览器后退         | 无跨账号数据残留                                  | e2e/flows.spec.ts + e2e/safety.spec.ts + e2e/fixtures.ts                                               |
| SYSTEM-04   | 全流程网络检查               | 没有真实业务流量                                  | e2e/flows.spec.ts + e2e/safety.spec.ts + e2e/fixtures.ts                                               |
| BRAND-01    | 页面、Tab、模态／全屏弹层    | 计算样式均采用 SRVF token，不出现 scoped 主题失效 | scripts/check-tokens.mjs + e2e/tokens.spec.ts                                                          |
| BRAND-02    | 小字号状态与金色装饰         | 重要正文对比度合格，颜色并非唯一信息              | scripts/check-tokens.mjs + e2e/tokens.spec.ts                                                          |
| BRAND-03    | 未定义变量／写死品牌色       | 检查失败定位文件；背景和正文可追到语义 token      | scripts/check-tokens.mjs + e2e/tokens.spec.ts                                                          |
| WIRE-01     | 已知请求序列化               | 没有 UI-only 字段、未批准操作键或 Admin 参数      | contract/wire.test.ts + contract/reads.test.ts + scripts/check-contract.mjs                            |
| WIRE-02     | JSON 信封错误／缺字段        | 不当空列表或零，不显示提交成功                    | contract/wire.test.ts + contract/reads.test.ts + scripts/check-contract.mjs                            |
| WIRE-03     | SVG 成功、JSON 拒绝          | 正确分流、无 token 日志、释放 Blob URL            | contract/wire.test.ts + contract/reads.test.ts + scripts/check-contract.mjs                            |
| WIRE-04     | 附件会话／本地文件           | 本地预览不被当已上传，白名单与一次性语义保留      | contract/wire.test.ts + contract/reads.test.ts + scripts/check-contract.mjs                            |
| WIRE-05     | 无键创建响应丢失             | 不通过生成 key 自动重提；查证无端点时明确阻塞     | contract/wire.test.ts + contract/reads.test.ts + scripts/check-contract.mjs                            |
| WIRE-06     | 保险 expectedVersion 冲突    | 刷新比对，不把版本当幂等键，不强制覆盖            | contract/wire.test.ts + contract/reads.test.ts + scripts/check-contract.mjs                            |
| WIRE-07     | 同 eventKey 换坐标／凭证     | 离线测试拒绝改变原意图，不能重采样后自动重发      | contract/wire.test.ts + contract/reads.test.ts + scripts/check-contract.mjs                            |
| WIRE-08     | 契约快照漂移                 | 本地摘要和字段差异被识别，未批准快照不静默覆盖    | contract/wire.test.ts + contract/reads.test.ts + scripts/check-contract.mjs                            |
| AUTH-09     | 登录响应不含人员资料         | 独立 me／capabilities 完成前不进入完整业务        | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-10     | 刷新成功、拒绝、取消         | 所有等待者结束；最多一个刷新执行者                | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-11     | 刷新已执行但响应丢失         | 不反复使用旧 refresh；受控重新认证                | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| AUTH-12     | 标签页复制／另一页退出       | 不发生凭证轮换竞争，旧页不自动复活                | unit/auth.test.ts + contract/wire.test.ts + e2e/flows.spec.ts + e2e/safety.spec.ts                     |
| RECOVERY-01 | 已发送写命令后刷新           | 缺原始载荷时不造新意图、不伪造可重放状态          | unit/mock-flows.test.ts + e2e/safety.spec.ts                                                           |
| RECOVERY-02 | BFCache／后台恢复            | 必要身份与资格重新检查，无旧账号闪现              | unit/mock-flows.test.ts + e2e/safety.spec.ts                                                           |
| DEVICE-01   | 授权一直未选择／晚到相机流   | 可退出；离页后晚到轨道被停止                      | unit/device.test.ts + e2e/safety.spec.ts                                                               |
| DEVICE-02   | 外部微信扫码非网页凭证       | 不宣称能自动直达签到，H5 内扫码流程明确           | unit/device.test.ts + e2e/safety.spec.ts                                                               |
| RELEASE-01  | 普通产物传参强开 mock        | 构建／运行均拒绝，无演示身份和数据                | scripts/check-bundle.mjs + e2e/flows.spec.ts + e2e/safety.spec.ts                                      |
| RELEASE-02  | 资源 chunk 失效              | 有可恢复页面；不丢未知操作后无限 reload           | scripts/check-bundle.mjs + e2e/flows.spec.ts + e2e/safety.spec.ts                                      |
| RELEASE-03  | 切换真实数据模式失败         | 不回退模拟数据，不显示假的成功记录                | scripts/check-bundle.mjs + e2e/flows.spec.ts + e2e/safety.spec.ts                                      |

固定时钟为2026-11-15 08:00 Asia/Shanghai；8个合成身份，6个基础活动。A有自购、B仅统保、志愿者受邀、报名/考勤协办各独立、双职责、未绑定、停用；跨角色共享合成场景库，但本人缓存/草稿按actor隔离。

额外控制有正常、无保障、已到期、未生效、列表/记录为空、登录限流、续期临时不可用、活动取消、动作未知等。表单8题完整，单场、多日、多岗位、受邀、截止/满额、结束历史均有数据。

截图矩阵：Chromium/WebKit × 320/375/390/430 × 登录/详情/长报名表/保险/现场，共40张。电脑WebKit与图片识别不代表iPhone或微信验证。
