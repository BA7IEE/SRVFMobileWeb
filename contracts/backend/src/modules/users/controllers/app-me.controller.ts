@Controller('app/v1/me')
export class AppMeController {
  constructor(
    private readonly appIdentity: AppIdentityResolver,
    private readonly appCapability: AppCapabilityService,
    private readonly appProfile: AppProfileService,
    private readonly appAvatar: AppAvatarService,
    private readonly usersService: UsersService,
    private readonly userWecomBinding: UserWecomBindingService,
  ) {}

  @Get()
  @LoginScoped({
    admission: 'app-member',
    require: 'all',
    scopes: ['self'],
    engine: 'authz-scoped',
  })
  @ApiOperation({ summary: 'App 视角本人 user + member 摘要(含 canUseApp 标志) [auth]' })
  @ApiWrappedOkResponse(AppMeResponseDto)
  @ApiBizErrorResponse(BizCode.UNAUTHORIZED, BizCode.INTERNAL_ERROR)
  async getMe(@CurrentUser() currentUser: CurrentUserPayload): Promise<AppMeResponseDto> {
    const [user, access] = await Promise.all([
      this.appIdentity.loadUserForApp(currentUser.id),
      this.appIdentity.resolve(currentUser),
    ]);

    // JwtStrategy 已挡;此处仅兜底并发软删窗口
    if (user === null) {
      throw new BizException(BizCode.UNAUTHORIZED);
    }

    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      status: user.status,
      memberId: user.memberId,
      memberNo: access.member?.memberNo ?? null,
      realName: access.member?.realName ?? null,
      memberLabel: access.member ? formatMemberLabel(access.member) : null,
      gradeCode: access.member?.gradeCode ?? null,
      memberStatus: access.member?.status ?? null,
      canUseApp: access.canUseApp,
      appAccessReason: access.reason,
    };
  }

  @Get('account')
  @LoginScoped({
    admission: 'app-member',
    require: 'all',
    scopes: ['self'],
    engine: 'authz-scoped',
  })
  @ApiOperation({
    summary: 'App 视角本人账号信息(username / status / lastLoginAt / canUseApp) [auth]',
  })
  @ApiWrappedOkResponse(AppMeAccountDto)
  @ApiBizErrorResponse(BizCode.UNAUTHORIZED, BizCode.INTERNAL_ERROR)
  async getMeAccount(@CurrentUser() currentUser: CurrentUserPayload): Promise<AppMeAccountDto> {
    const [user, access] = await Promise.all([
      this.appIdentity.loadUserForApp(currentUser.id),
      this.appIdentity.resolve(currentUser),
    ]);

    if (user === null) {
      throw new BizException(BizCode.UNAUTHORIZED);
    }

    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      status: user.status,
      lastLoginAt: user.lastLoginAt === null ? null : user.lastLoginAt.toISOString(),
      linkedMemberId: user.memberId,
      canUseApp: access.canUseApp,
      appAccessReason: access.reason,
    };
  }

  @Get('capabilities')
  @LoginScoped({
    admission: 'app-member',
    require: 'all',
    scopes: ['self'],
    engine: 'authz-scoped',
  })
  @ApiTags('Mobile - Capabilities')
  @ApiOperation({ summary: 'App 视角本人 capability map(product-level;非 raw RBAC code) [auth]' })
  @ApiWrappedOkResponse(AppCapabilityResponseDto)
  @ApiBizErrorResponse(BizCode.UNAUTHORIZED)
  async getMeCapabilities(
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<AppCapabilityResponseDto> {
    return this.appCapability.resolve(currentUser);
  }

  // Phase 2 P2-2:GET /me/profile(沿评审稿 §7.3 / §2.4 v0.1 字段集恰好 9 个)。
  // Phase 2 P2-3:PUT /me/password(沿评审稿 §1 + §9.2 + §15.1 + D-P2-3-1 = X)。
  // 复用 UsersService.changeMyPassword(P0-D + P0-E PR-3 全套行为继承):
  //   - bcrypt.compare(oldPassword) → OLD_PASSWORD_INVALID(10005)
  //   - 严格 === 比较 → NEW_PASSWORD_SAME_AS_OLD(10006)
  //   - tx: user.update(passwordHash) + refreshToken.updateMany(revokedReason='self-password-change') + auditLogs.log('password.change.self')
  //   - access token **不**主动吊销(沿 P0-D §5.7 + P0-E v1 D-4;15m 自然过期)
  // D-P2-3-1 = X 锁定:改密是账号级自助操作,**不**调 appIdentity.resolve + assertCanUseApp;
  // admin without member 允许使用(沿评审稿 §4.2.1 / §4.3 锁定理由 + §4.6 例外边界)。
  @PasswordChangeThrottle()
  @Put('password')
  @LoginScoped({
    admission: 'app-member',
    require: 'all',
    scopes: ['self'],
    engine: 'authz-scoped',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'App 视角本人自助改密(需 oldPassword;不主动吊销 access token;撤销全部 refresh) [auth]',
  })
  @ApiWrappedOkResponse(UserResponseDto)
  @ApiBizErrorResponse(
    BizCode.BAD_REQUEST,
    BizCode.UNAUTHORIZED,
    BizCode.USER_NOT_FOUND,
    BizCode.OLD_PASSWORD_INVALID,
    BizCode.NEW_PASSWORD_SAME_AS_OLD,
    BizCode.TOO_MANY_REQUESTS,
  )
  changeMyPassword(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Body() dto: ChangeMyPasswordDto,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    // 显式 safeDto 重组(沿评审稿 §9.4 + P2-2 §7.4 风险表 10.11a 范式):
    // **禁止**透传 raw body / `as` cast / `{ ...dto }` / `as unknown` 任一模式。
    const safeDto: ChangeMyPasswordDto = {
      oldPassword: dto.oldPassword,
      newPassword: dto.newPassword,
    };
    return this.usersService.changeMyPassword(currentUser, safeDto, this.buildAuditMeta(req));
  }

  // SMS 基础设施 T3(2026-06-10):POST /me/phone/send-code + PUT /me/phone(冻结评审稿
  // sms-verification-infra-review.md §3.2 ⑤⑥ / §4 / §7 / E-5)。
  // 准入沿 PUT /me/password 账号级豁免先例(E-5):User.phone 是账号级身份字段,
  // **不**调 appIdentity.resolve + assertCanUseApp,admin without member 允许使用;
  // 豁免仅限本两端点,禁止外溢(沿 P2-3 评审稿 §4.6 例外边界精神)。
  // 防刷三层:同号 60s 间隔 + 同号自然日上限(DB 层,SmsCodeService)+ 本层 IP throttler。
