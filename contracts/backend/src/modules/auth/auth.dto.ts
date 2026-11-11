// 登录入参严格按 ARCHITECTURE.md §6 / §7.6:仅 username + password,
// 不支持 email / 手机号 / 验证码登录。
//
// username 校验策略:
// - DTO 层做格式与长度校验(3-32,字母/数字/下划线/中横线),允许大小写
// - service 内部统一 trim() + toLowerCase() 后用于查询
//
// password 校验策略:
// - 仅 @IsString + @IsNotEmpty,不做 @MinLength
// - 登录阶段不应通过密码长度规则区分失败原因(防泄漏密码强度规则)
export class LoginDto {
  @ApiProperty({
    description:
      '用户名(允许字母 / 数字 / 下划线 / 中横线,长度 3-32);' +
      'service 内部统一 trim + lowercase 后用于查询',
    example: 'admin',
    minLength: 3,
    maxLength: 32,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'username 只允许字母 / 数字 / 下划线 / 中横线',
  })
  username!: string;

  @ApiProperty({
    description: '密码(明文,服务端用 bcrypt 比对);此接口刻意不做长度规则校验',
    example: 'YourPassword123',
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

// P0-E PR-3(2026-05-18):LoginResponseDto 扩展 refreshToken + refreshExpiresAt 2 字段
// (向后兼容;旧前端忽略未知字段;字段集恰好 5 项;扩展后禁止再增字段)。
// 沿 docs/first-release-p0e-refresh-token-review.md §3.1 D-1。
export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token,前端拼 Authorization: Bearer <token>' })
  accessToken!: string;

  @ApiProperty({ description: 'token 类型', example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({
    description: '过期时间,原样回传 JWT_EXPIRES_IN 配置值',
    example: '15m',
  })
  expiresIn!: string;

  // P0-E PR-3:refresh token(opaque random 256bit base64url;不是 JWT)。
  // 客户端不应也不能解析其中信息;明文绝不入日志 / audit / OpenAPI 示例 / 测试快照。
  // 前端调 POST /api/auth/v1/refresh 用此 token 换取新的 access + refresh(rotation always)。
  @ApiProperty({
    description: 'refresh token(opaque random;不是 JWT);用于 POST /api/auth/v1/refresh 换 access',
  })
  refreshToken!: string;

  // P0-E PR-3:refresh token family absolute expiration 时刻
  // (ISO 8601 UTC 字符串;new Date(...).toISOString() 格式)。
  // rotation 后所有新 refresh token 继承同一个 refreshExpiresAt,不延长;
  // 达到此时刻后必须重新登录(POST /api/auth/v1/login);refresh 接口对已过期 family
  // 返 REFRESH_TOKEN_INVALID=10007。客户端无需信任本地时钟做 now + TTL 计算。
  @ApiProperty({
    description:
      'refresh token family absolute expiration 时刻(ISO 8601 UTC);rotation 后新 token 继承同一时刻;' +
      '达到此时刻后必须重新登录;客户端读此字段即知 family 何时过期,无需本地时钟参与',
    example: '2026-08-16T00:00:00.000Z',
  })
  refreshExpiresAt!: string;
}

// P0-E PR-3:POST /api/auth/v1/refresh 入参(沿评审稿 §4.2;严格白名单 1 字段)。
export class RefreshTokenDto {
  @ApiProperty({
    description: 'refresh token 明文(login / 上一次 refresh 接口响应里拿到的 data.refreshToken)',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

// P0-E PR-3:POST /api/auth/v1/logout 入参(沿评审稿 §4.3;严格白名单 1 字段)。
// 与 RefreshTokenDto 字段结构相同;独立类型用于 OpenAPI 区分 + 未来分化可能。
export class LogoutDto {
  @ApiProperty({
    description:
      '用于定位 refresh family 的 token 明文;撤销该 family 全部未过期且未撤销 token;' +
      '幂等(不存在 / 已撤销 / 已过期 → 仍返 200)',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

// P0-E PR-3:POST /api/auth/v1/logout-all 响应 data(沿评审稿 §4.4)。
export class LogoutAllResponseDto {
  @ApiProperty({
    description: '本次撤销的 refresh token 行数(未过期且未撤销的总数)',
    example: 3,
  })
  revokedCount!: number;
}

export enum StepUpAction {
  PHONE_BIND = 'PHONE_BIND',
  WECHAT_BIND = 'WECHAT_BIND',
  // 企业微信接入 T3(2026-08-02;冻结稿 §7.4)。
  // ⚠️ 只新增 **action**,**不**新增 `IdentityStepUpFactor.WECOM` ——
  // 用户仍用现有 PASSWORD / SMS / WECHAT 因子证明"当前账号控制权"。
  // 拿企业微信本身当因子会绕成一个圈:正要绑的东西不能同时充当"我已经是这个人"的证据。
  WECOM_BIND = 'WECOM_BIND',
  // P1-32 PR 5(2026-08-24;冻结稿 §12.2 逐字的 action 名)。
  //
  // ⚠️ **这一条不是"身份绑定"** —— 前三条都是「本人绑手机 / 微信 / 企微」,
  //    这一条是管理端的高风险配置变更。共用同一套 step-up 机制是刻意的
  //    (冻结稿 §12.2 末句「实际接入必须沿用 auth 模块现有 step-up 机制」),
  //    但它的 proof **额外绑定**一个 (roleId, expectedRevision, payloadHash) 三元组,
  //    见下方 `StepUpRolePermissionSetDto`。
  //
  // ⚠️ 因子仍是 PASSWORD / SMS / WECHAT 三选一。**默认走密码** ——
  //    微信因子依赖企微/微信通道,而企微卡在备案(current-state §4 P0),
  //    默认走它会让整条路在上线前根本走不通。
  RBAC_ROLE_PERMISSION_SET_REPLACE = 'RBAC_ROLE_PERMISSION_SET_REPLACE',
}

/**
 * `RBAC_ROLE_PERMISSION_SET_REPLACE` 的绑定三元组(P1-32 PR 5;冻结稿 §12.2)。
