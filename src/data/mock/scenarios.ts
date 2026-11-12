import type { Scenario } from '../models';
export const scenarios: Scenario[] = [
  {
    id: 'AUTH-RESTORE-ONCE',
    label: '首次身份读取失败后恢复',
    description: '已有演示会话刷新页面，显式重试后重新读取身份',
  },
  {
    id: 'INS-LAYOUT',
    label: '保险完成态长文案多记录',
    description: '两条统保、三条自购合成记录，仅验证排版',
  },
  { id: 'INS-SLOW', label: '保险加载中', description: '保险读取延迟两秒后完成' },
  { id: 'INS-EMPTY', label: '保险空记录', description: '统保、自购均为空，不等于活动资格不满足' },
  { id: 'INS-ERROR', label: '保险读取失败', description: '独立服务错误，不展示过期记录' },
  { id: 'INS-FORBIDDEN', label: '保险读取无权限', description: '明确权限拒绝，不当成空记录' },
  {
    id: 'AUTH-01',
    label: '深链接未登录',
    description: '登录后回到允许的原活动',
  },
  {
    id: 'AUTH-02',
    label: '会话恢复中',
    description: '不闪现其他人的数据或登录页',
  },
  {
    id: 'AUTH-03',
    label: '错误演示密码',
    description: '显示错误，不创建登录态',
  },
  {
    id: 'AUTH-04',
    label: '模拟会话过期',
    description: '清理后提示重新登录',
  },
  {
    id: 'AUTH-05',
    label: '并发续期',
    description: '只执行一次续期',
  },
  {
    id: 'AUTH-06',
    label: '退出后旧响应返回',
    description: '不恢复旧身份',
  },
  {
    id: 'AUTH-07',
    label: '未绑定／停用成员',
    description: '准入说明，不空白、不假登录',
  },
  {
    id: 'AUTH-08',
    label: '非法返回地址',
    description: '拒绝并回安全路由',
  },
  {
    id: 'INS-01',
    label: '自购已审核且覆盖活动',
    description: '可以继续保险条件检查后的报名',
  },
  {
    id: 'INS-02',
    label: '仅团队统保',
    description: '不要求重复登记自购保险',
  },
  {
    id: 'INS-03',
    label: '自购待审核',
    description: '明确待审核，不允许自行通过',
  },
  {
    id: 'INS-04',
    label: '已拒绝／已过期／未生效',
    description: '各有独立提示',
  },
  {
    id: 'INS-05',
    label: '只覆盖活动部分日期',
    description: '显示不满足本次活动要求',
  },
  {
    id: 'INS-06',
    label: '资格读取失败',
    description: '显示未知和重试，不判无保险',
  },
  {
    id: 'INS-07',
    label: '修改审核通过的自购资料',
    description: '回待审核，返回报名后重新核对',
  },
  {
    id: 'INS-08',
    label: '同时编辑版本冲突',
    description: '提醒刷新，不强制覆盖',
  },
  {
    id: 'REG-01',
    label: '8 类动态题',
    description: '渲染与边界验证正确',
  },
  {
    id: 'REG-02',
    label: '多场次、多岗位志愿',
    description: '顺序保留，不能重复或跨场次混用',
  },
  {
    id: 'REG-03',
    label: '提交后部分通过／候补',
    description: '按场次呈现，不显示全部通过',
  },
  {
    id: 'REG-04',
    label: '表单版本变化',
    description: '提示核对，不丢失全部安全输入',
  },
  {
    id: 'REG-05',
    label: '重复点击与同键重试',
    description: '只有一个模拟提交结果',
  },
  {
    id: 'REG-06',
    label: '已提交但回执丢失',
    description: '进入结果未知，先查询',
  },
  {
    id: 'REG-07',
    label: '保险页返回报名',
    description: '恢复当前会话草稿并重验资格',
  },
  {
    id: 'PUNCH-01',
    label: '正常签到与签退',
    description: '当前状态和回执一致，均标演示',
  },
  {
    id: 'PUNCH-02',
    label: '签到码扫到签退流程／错误场次',
    description: '明确拒绝，不擅自换动作',
  },
  {
    id: 'PUNCH-03',
    label: '过期／撤销／重签后的旧码',
    description: '不再接受旧凭证',
  },
  {
    id: 'PUNCH-04',
    label: '重复扫描同一码',
    description: '不重复记事件',
  },
  {
    id: 'PUNCH-05',
    label: '未到允许签退时间',
    description: '显示等待，时间到后重新读取',
  },
  {
    id: 'PUNCH-06',
    label: '定位拒绝／超时／不需要定位',
    description: '分别处理，不伪造坐标',
  },
  {
    id: 'PUNCH-07',
    label: '相机拒绝／不可用',
    description: '有操作指引，不死循环申请',
  },
  {
    id: 'PUNCH-08',
    label: '当前不在场但有历史服务段',
    description: '不误报“从未签到”',
  },
  {
    id: 'STAFF-01',
    label: '普通成员访问负责人路径',
    description: '拒绝访问',
  },
  {
    id: 'STAFF-02',
    label: '报名协办访问考勤',
    description: '拒绝；反向也测试',
  },
  {
    id: 'STAFF-03',
    label: 'A 活动负责人访问 B 活动',
    description: '拒绝',
  },
  {
    id: 'STAFF-04',
    label: '受控代签未填原因',
    description: '前端阻止提交',
  },
  {
    id: 'STAFF-05',
    label: '批量操作部分失败',
    description: '展示逐项结果，不报全部成功',
  },
  {
    id: 'STAFF-06',
    label: '页面打开后撤销职责',
    description: '终止操作并清理受限内容',
  },
  {
    id: 'RECORD-01',
    label: '未认定／认定为零／已认定',
    description: '三种状态区分',
  },
  {
    id: 'RECORD-02',
    label: '历史活动普通详情不可读',
    description: '安全摘要可展示，不整页崩溃',
  },
  {
    id: 'SYSTEM-01',
    label: '断网提示／慢响应／服务失败',
    description: '可恢复，无无限 spinner',
  },
  {
    id: 'SYSTEM-02',
    label: '普通 unconfigured 构建',
    description: '无 mock 登录或业务写操作',
  },
  {
    id: 'SYSTEM-03',
    label: '切换账号与浏览器后退',
    description: '无跨账号数据残留',
  },
  {
    id: 'SYSTEM-04',
    label: '全流程网络检查',
    description: '没有真实业务流量',
  },
  {
    id: 'BRAND-01',
    label: '页面、Tab、模态／全屏弹层',
    description: '计算样式均采用 SRVF token，不出现 scoped 主题失效',
  },
  {
    id: 'BRAND-02',
    label: '小字号状态与金色装饰',
    description: '重要正文对比度合格，颜色并非唯一信息',
  },
  {
    id: 'BRAND-03',
    label: '未定义变量／写死品牌色',
    description: '检查失败定位文件；背景和正文可追到语义 token',
  },
  {
    id: 'WIRE-01',
    label: '已知请求序列化',
    description: '没有 UI-only 字段、未批准操作键或 Admin 参数',
  },
  {
    id: 'WIRE-02',
    label: 'JSON 信封错误／缺字段',
    description: '不当空列表或零，不显示提交成功',
  },
  {
    id: 'WIRE-03',
    label: 'SVG 成功、JSON 拒绝',
    description: '正确分流、无 token 日志、释放 Blob URL',
  },
  {
    id: 'WIRE-04',
    label: '附件会话／本地文件',
    description: '本地预览不被当已上传，白名单与一次性语义保留',
  },
  {
    id: 'WIRE-05',
    label: '无键创建响应丢失',
    description: '不通过生成 key 自动重提；查证无端点时明确阻塞',
  },
  {
    id: 'WIRE-06',
    label: '保险 expectedVersion 冲突',
    description: '刷新比对，不把版本当幂等键，不强制覆盖',
  },
  {
    id: 'WIRE-07',
    label: '同 eventKey 换坐标／凭证',
    description: '离线测试拒绝改变原意图，不能重采样后自动重发',
  },
  {
    id: 'WIRE-08',
    label: '契约快照漂移',
    description: '本地摘要和字段差异被识别，未批准快照不静默覆盖',
  },
  {
    id: 'AUTH-09',
    label: '登录响应不含人员资料',
    description: '独立 me／capabilities 完成前不进入完整业务',
  },
  {
    id: 'AUTH-10',
    label: '刷新成功、拒绝、取消',
    description: '所有等待者结束；最多一个刷新执行者',
  },
  {
    id: 'AUTH-11',
    label: '刷新已执行但响应丢失',
    description: '不反复使用旧 refresh；受控重新认证',
  },
  {
    id: 'AUTH-12',
    label: '标签页复制／另一页退出',
    description: '不发生凭证轮换竞争，旧页不自动复活',
  },
  {
    id: 'RECOVERY-01',
    label: '已发送写命令后刷新',
    description: '缺原始载荷时不造新意图、不伪造可重放状态',
  },
  {
    id: 'RECOVERY-02',
    label: 'BFCache／后台恢复',
    description: '必要身份与资格重新检查，无旧账号闪现',
  },
  {
    id: 'DEVICE-01',
    label: '授权一直未选择／晚到相机流',
    description: '可退出；离页后晚到轨道被停止',
  },
  {
    id: 'DEVICE-02',
    label: '外部微信扫码非网页凭证',
    description: '不宣称能自动直达签到，H5 内扫码流程明确',
  },
  {
    id: 'RELEASE-01',
    label: '普通产物传参强开 mock',
    description: '构建／运行均拒绝，无演示身份和数据',
  },
  {
    id: 'RELEASE-02',
    label: '资源 chunk 失效',
    description: '有可恢复页面；不丢未知操作后无限 reload',
  },
  {
    id: 'RELEASE-03',
    label: '切换真实数据模式失败',
    description: '不回退模拟数据，不显示假的成功记录',
  },
  {
    id: 'DEFAULT',
    label: '正常演示',
    description: '正常演示',
  },
  {
    id: 'INS-MISSING',
    label: '未登记保障',
    description: '未登记保障',
  },
  {
    id: 'INS-EXPIRED',
    label: '保障已到期',
    description: '保障已到期',
  },
  {
    id: 'INS-FUTURE',
    label: '保障尚未生效',
    description: '保障尚未生效',
  },
  {
    id: 'LIST-EMPTY',
    label: '活动列表为空',
    description: '活动列表为空',
  },
  {
    id: 'RECORD-EMPTY',
    label: '暂无参与记录',
    description: '暂无参与记录',
  },
  {
    id: 'AUTH-RATE',
    label: '登录限流',
    description: '登录限流',
  },
  {
    id: 'AUTH-UNAVAILABLE',
    label: '续期临时不可用',
    description: '续期临时不可用',
  },
  {
    id: 'ACT-CANCELLED',
    label: '活动已取消',
    description: '活动已取消',
  },
  {
    id: 'ACTION-UNKNOWN',
    label: '当前动作资格未知',
    description: '当前动作资格未知',
  },
  {
    id: 'CAMERA-UNAVAILABLE',
    label: '模拟无摄像头',
    description: '不调用真实设备，演练不可用指引',
  },
  { id: 'LOCATION-TIMEOUT', label: '模拟定位超时', description: '不伪造坐标，超时后联系负责人' },
  { id: 'FILE-FAIL', label: '模拟附件接收失败', description: '保留本地文件，不自动重发' },
];
