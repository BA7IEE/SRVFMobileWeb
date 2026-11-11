  BAD_REQUEST: { code: 40000, message: '请求参数错误', httpStatus: HttpStatus.BAD_REQUEST },
  UNAUTHORIZED: { code: 40100, message: '未登录或登录已失效', httpStatus: HttpStatus.UNAUTHORIZED },
  FORBIDDEN: { code: 40300, message: '无权限访问', httpStatus: HttpStatus.FORBIDDEN },
  NOT_FOUND: { code: 40400, message: '资源不存在', httpStatus: HttpStatus.NOT_FOUND },
  SERVICE_UNAVAILABLE: {
    code: 50300,
    message: '服务暂不可用，请稍后再试',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
  },
  // docs/reference/response-pagination-errors.md §5:登录接口限流命中。
  // 落 4xxxx 通用 HTTP 段(429),
  // 不占用业务模块 100xx / 110xx 段。message 故意不暴露阈值数字、剩余配额、
  // 重置时间(防止攻击者反推限流参数)。
  TOO_MANY_REQUESTS: {
    code: 42900,
    message: '请求过于频繁，请稍后再试',
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
  },
  // M3(并发复审 P1,2026-08-01):有界锁等待。
  USER_NOT_FOUND: { code: 10001, message: '用户不存在', httpStatus: HttpStatus.NOT_FOUND },
  USERNAME_ALREADY_EXISTS: {
    code: 10002,
    message: 'username 已存在',
    httpStatus: HttpStatus.CONFLICT,
  },
  EMAIL_ALREADY_EXISTS: {
    code: 10003,
    message: 'email 已存在',
    httpStatus: HttpStatus.CONFLICT,
  },
  LOGIN_FAILED: {
    code: 10004,
    message: '账号或密码错误',
    httpStatus: HttpStatus.UNAUTHORIZED,
  },

  // P0-D 本人自助改密(2026-05-17 引入;详见 docs/first-release-p0d-change-my-password-review.md §5.3)。
  // 段位归属:沿 100xx users 模块业务级;10005 / 10006 为 LOGIN_FAILED(10004)之后下两个可用号位。
  // - 10005 OLD_PASSWORD_INVALID:本人改密 oldPassword 错(本人接口,无账号枚举攻击面,
  //   不复用 LOGIN_FAILED;前端可精确提示"当前密码不正确")
  // - 10006 NEW_PASSWORD_SAME_AS_OLD:newPassword === oldPassword(业务级语义校验,不复用 BAD_REQUEST)
  OLD_PASSWORD_INVALID: {
    code: 10005,
    message: '当前密码不正确',
    httpStatus: HttpStatus.UNAUTHORIZED,
  },
  NEW_PASSWORD_SAME_AS_OLD: {
    code: 10006,
    message: '新密码不能与当前密码相同',
    httpStatus: HttpStatus.BAD_REQUEST,
  },

  // P0-E PR-3(2026-05-18):refresh token 接口失败统一码(沿
  // docs/first-release-p0e-refresh-token-review.md §5.7 + §6.5)。
  // 段位归属:沿 docs/reference/response-pagination-errors.md §5 BizCode 编码段:
  // 100xx 为 users 模块业务级(含 auth);
  // 已用 10001-10006(LOGIN_FAILED=10004 / OLD_PASSWORD_INVALID=10005 /
  // NEW_PASSWORD_SAME_AS_OLD=10006),10007 为下一可用号位。
  //
  // **不**拆 REFRESH_TOKEN_EXPIRED / REVOKED / REPLAY
  // (沿评审稿 D-6 + docs/reference/auth-jwt-refresh.md §8 防账号枚举):
  // refresh 失败的 4 种子原因(不存在 / 已撤销 / 已过期 / 重放命中)统一返 10007,
  // 响应体 / HTTP status / message 完全一致(防止攻击者据错误码反推 token 状态)。
  REFRESH_TOKEN_INVALID: {
    code: 10007,
    message: 'refresh token 无效或已过期',
    httpStatus: HttpStatus.UNAUTHORIZED,
  },
  STEP_UP_PROOF_INVALID: {
    message: '报名记录不存在',
    httpStatus: HttpStatus.NOT_FOUND,
  },
  ACTIVITY_REGISTRATION_ALREADY_EXISTS: {
    code: 21002,
    message: '同一活动同一队员已有有效报名',
    httpStatus: HttpStatus.CONFLICT,
  },
  ACTIVITY_REGISTRATION_OPERATION_KEY_CONFLICT: {
    code: 21003,
    message: '报名操作键与首次请求不一致',
    httpStatus: HttpStatus.CONFLICT,
  },
  ACTIVITY_REGISTRATION_STATUS_INVALID: {
    code: 21030,
    message: '报名记录当前状态不允许此操作',
    httpStatus: HttpStatus.CONFLICT,
  },
  ACTIVITY_CAPACITY_EXCEEDED: {
    code: 21032,
    message: '活动名额已满',
    httpStatus: HttpStatus.CONFLICT,
  },
  // 参与域生命周期收口⑦(v0.40.0):已考勤报名禁取消。报名已有未软删考勤记录
  // (AttendanceRecord.registrationId 反向引用)→ cancelAdmin / cancelMy 两路均拒。
  // 不做贡献值回滚(贡献值属考勤域;要撤销参与先走考勤面处理记录,报名取消自然解锁)。
  ACTIVITY_REGISTRATION_HAS_ATTENDANCE: {
    code: 21033,
    message: '报名已有考勤记录,不可取消',
    httpStatus: HttpStatus.CONFLICT,
  },
  ACTIVITY_REGISTRATION_GENDER_MISMATCH: {
    code: 21034,
    message: '报名者性别不符合活动要求',
    httpStatus: HttpStatus.CONFLICT,
  },
  ACTIVITY_POSITION_REQUIRED: {
    code: 21035,
    message: '该活动报名必须选择活动岗位',
    httpStatus: HttpStatus.CONFLICT,
  },
  REGISTRATION_FORM_VERSION_INVALID: {
    code: 21036,
    message: '报名表版本不匹配或已失效',
    httpStatus: HttpStatus.CONFLICT,
  },
  REGISTRATION_FORM_ANSWER_INVALID: {
    code: 21037,
    message: '报名表答案不合法',
    httpStatus: HttpStatus.BAD_REQUEST,
  },
  ACTIVITY_REGISTRATION_V11_FLOW_REQUIRED: {
    code: 21038,
    message: '该活动必须使用报名主链提交',
    httpStatus: HttpStatus.CONFLICT,
  },
  // 现场 Form 尚未接通时保持 fail-closed；合法资格 RuleSet 由统一 evaluator 处理。
  ACTIVITY_ONSITE_REQUIREMENTS_UNAVAILABLE: {
    code: 21039,
    message: '活动现场临时参加条件暂无法安全判定',
    httpStatus: HttpStatus.CONFLICT,
  },
  ACTIVITY_QUALIFICATION_NOT_MET: {
    code: 21040,
    message: '报名者未满足活动资格条件',
    httpStatus: HttpStatus.CONFLICT,
  },
  ACTIVITY_QUALIFICATION_CONFIGURATION_INVALID: {

  // 终态 scoped-authz PR9 引入(2026-07-02;冻结稿 §5.3 ActionConstraint 域不变量,首个 authz 消费者)。
  //
  // 两码 = AuthzService 约束否决(self_approval_forbidden / same_reviewer_forbidden)的对外映射,
  // 语义是「数据完整性不变量,对 SUPER_ADMIN 也生效」,**不是**权限不足 —— 权限不足维持 30100
  // RBAC_FORBIDDEN(22044 FINAL_REVIEW_FORBIDDEN 继续不开,沿 D-S2 决议)。
  // 段位:沿 22xxx attendances 顺延取 22074/22075(22050-22099 原规划 Record 实体级,
  // 22074 起两枚终审判权约束例外借用,就近登记于终审 2204x 块之后)。
  // 活动责任闭环起 same_reviewer 与自审均为严格不变量；兼容 env 不再影响运行时。
  ATTENDANCE_SELF_FINAL_REVIEW_FORBIDDEN: {
    code: 22074,
    message: '不能终审自己提交的考勤单据',
    httpStatus: HttpStatus.FORBIDDEN,
  },
  ATTENDANCE_SAME_REVIEWER_FORBIDDEN: {
    code: 22075,
    message: '一级审核人不得再终审同一张考勤单据',
    httpStatus: HttpStatus.FORBIDDEN,
  },
  ATTENDANCE_SELF_FIRST_REVIEW_FORBIDDEN: {
    code: 22081,
    message: '不能一审自己提交或重提的考勤单',
    httpStatus: HttpStatus.FORBIDDEN,
  },
  ATTENDANCE_RETURN_NOTE_REQUIRED: {
    code: 22082,
    message: '退回修改必须填写原因',
    httpStatus: HttpStatus.BAD_REQUEST,
  },
  ATTENDANCE_SHEET_RESUBMIT_STATUS_INVALID: {
    code: 22083,
    message: '只有退回修改的考勤单可以重新提交',
    httpStatus: HttpStatus.CONFLICT,
  },
  // 活动 v1.1 第 5 批：二维码与追加式现场打卡。22084–22096 由维护者补充合同 v1
  // 明确授权；每个码对应一个可恢复的客户端动作，不把签名、坐标或凭证内部细节写进 message。
  ATTENDANCE_QR_NOT_FOUND: {
    code: 22084,
    message: '二维码凭证不存在或无效',
    httpStatus: HttpStatus.NOT_FOUND,
  },
  ATTENDANCE_QR_REVOKED: {
    code: 22085,
    message: '二维码凭证已作废',
    httpStatus: HttpStatus.CONFLICT,
  },
  ATTENDANCE_QR_ACTION_MISMATCH: {
    code: 22086,
    message: '二维码动作与当前打卡动作不匹配',
    httpStatus: HttpStatus.CONFLICT,
  },
  ATTENDANCE_QR_VERSION_CONFLICT: {
    code: 22087,
    message: '二维码版本或操作键与当前请求冲突',
    httpStatus: HttpStatus.CONFLICT,
  },
  ATTENDANCE_PUNCH_IDEMPOTENCY_CONFLICT: {
    code: 22088,
    message: '打卡防重键已用于不同请求',
    httpStatus: HttpStatus.CONFLICT,
  },
  ATTENDANCE_PUNCH_OUTSIDE_WINDOW: {
    code: 22089,
    message: '当前不在该场次对应的打卡时间窗内',
    httpStatus: HttpStatus.CONFLICT,
  },
  ATTENDANCE_PUNCH_LOCATION_REQUIRED: {
    code: 22090,
    message: '该场次要求提供有效定位',
    httpStatus: HttpStatus.BAD_REQUEST,
  },
  ATTENDANCE_PUNCH_LOCATION_OUT_OF_RANGE: {
    code: 22091,
    message: '当前位置未通过场次范围校验',
    httpStatus: HttpStatus.BAD_REQUEST,
  },
  ATTENDANCE_PUNCH_OPEN_SEGMENT_EXISTS: {
    code: 22092,
    message: '当前已有未闭合服务段，不能重复签到',
    httpStatus: HttpStatus.CONFLICT,
  },
  ATTENDANCE_PUNCH_CHECK_OUT_REQUIRES_OPEN_SEGMENT: {
    code: 22093,
    message: '请先完成签到再签退或特殊闭合',
    httpStatus: HttpStatus.CONFLICT,
  },
  ATTENDANCE_PUNCH_MIN_DURATION_NOT_REACHED: {
    code: 22094,
    message: '普通签退距签到不足30分钟',
    httpStatus: HttpStatus.CONFLICT,
  },
  // - 26011-26012:自购保险 CAS / 审核状态冲突(D-INSURANCE v3 PR2)
  // - 26030:活动报名门槛(INSURANCE_REQUIRED)
  // - 26031:Team Join final join 门槛(TEAM_JOIN_INSURANCE_REQUIRED)
  //
  // 不开的码(评审稿 §3.3 明确):
  // - 261xx FORBIDDEN_*:权限拒绝走通用 30100 / 40100 / 40300(RBAC_MAP §6 规则 5)
  // - 过期 vs 无保险不细分:同 26030(前端提示价值无差,评审稿 E-8)
  MEMBER_INSURANCE_NOT_FOUND: {
    code: 26001,
    message: '保险记录不存在',
    httpStatus: HttpStatus.NOT_FOUND,
  },
  TEAM_INSURANCE_POLICY_NOT_FOUND: {
    code: 26002,
    message: '队保单不存在',
    httpStatus: HttpStatus.NOT_FOUND,
  },
  TEAM_INSURANCE_COVERAGE_NOT_FOUND: {
    code: 26003,
    message: '该队员不在本保单覆盖名单内',
    httpStatus: HttpStatus.NOT_FOUND,
  },
  TEAM_INSURANCE_COVERAGE_ALREADY_EXISTS: {
    code: 26004,
    message: '该队员已在本保单覆盖名单内',
    httpStatus: HttpStatus.CONFLICT,
  },
  INSURANCE_COVERAGE_DATE_RANGE_INVALID: {
    code: 26010,
    message: '起保日期不得晚于到期日期',
    httpStatus: HttpStatus.BAD_REQUEST,
  },
  MEMBER_INSURANCE_VERSION_CONFLICT: {
    code: 26011,
    message: '保险记录已更新,请刷新后重试',
    httpStatus: HttpStatus.CONFLICT,
  },
  MEMBER_INSURANCE_REVIEW_STATE_INVALID: {
    code: 26012,
    message: '当前保险审核状态不允许重复审核',
    httpStatus: HttpStatus.CONFLICT,
  },
  // T3 报名门槛(评审稿 §3.3 落点表;过期与无保险不细分,前端提示价值无差,E-8;
  // 409 沿 20120/21030 报名业务态冲突家族;requiresInsurance=false 活动零查询不触发)。
  INSURANCE_REQUIRED: {
    code: 26030,
    message: '该活动要求保险,当前队员无覆盖活动日期的有效保险,不可报名',
    httpStatus: HttpStatus.CONFLICT,
  },
