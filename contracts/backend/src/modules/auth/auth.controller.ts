  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '用户名 + 密码登录,返回 JWT + refresh token(family absolute expiration) [public]',
  })
  @ApiWrappedOkResponse(LoginResponseDto)
  @ApiBizErrorResponse(BizCode.BAD_REQUEST, BizCode.LOGIN_FAILED, BizCode.TOO_MANY_REQUESTS)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponseDto> {
    return this.authService.login(dto, this.buildAuditMeta(req));
  }

  // P0-E PR-3:POST /api/auth/v1/refresh(沿评审稿 §4.2)。
  // @Public()(refresh 时 access token 通常已过期,不能走 JwtAuthGuard)。
  // @RefreshThrottle() → throttler 实例 'refresh'(30/60 IP;与 default / password-change 物理隔离)。
  // 失败(不存在 / 已撤销 / 已过期 / 重放)统一返 REFRESH_TOKEN_INVALID=10007(不区分子原因)。
  @Public()
  @RefreshThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'refresh access token(rotation always;family revoke;absolute expiration;返回新 access + 新 refresh) [public]',
  })
  @ApiWrappedOkResponse(LoginResponseDto)
  @ApiBizErrorResponse(
    BizCode.BAD_REQUEST,
    BizCode.REFRESH_TOKEN_INVALID,
    BizCode.TOO_MANY_REQUESTS,
  )
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<LoginResponseDto> {
    return this.authService.refresh(dto, this.buildAuditMeta(req));
  }

  // P0-E PR-3:POST /api/auth/v1/logout(沿评审稿 §4.3)。
  // @Public()(refresh token 自身即凭证;允许 access token 过期后 logout)。
  // 幂等:不存在 / 已撤销 / 已过期 → 仍返 200 + data:null。
  // 任一可识别且未过期 row 只用于定位 family；撤销该 family 全部 active 未过期 token。
  // 其他 family 不动；不吊销 access token。
  // **不限流**(刻意;避免攻击者吃光合法用户 logout 配额;沿评审稿 §3.7 D-7)。
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '撤销该 refresh family 内全部未过期且未撤销 token(幂等;不吊销 access) [public]',
  })
  @ApiWrappedNullResponse()
  @ApiBizErrorResponse(BizCode.BAD_REQUEST)
  logout(@Body() dto: LogoutDto, @Req() req: Request): Promise<null> {
    return this.authService.logout(dto, this.buildAuditMeta(req));
  }

  // P0-E PR-3:POST /api/auth/v1/logout-all(沿评审稿 §4.4)。
  // 走 JwtAuthGuard(需知道哪个 user;controller 不标 @Roles,任意登录用户可调)。
  // 复用 @PasswordChangeThrottle() throttler 'password-change' 5/60 IP(高危操作低频限流);
  // 不吊销 access token(沿 D-4);返 { revokedCount }。
  @PasswordChangeThrottle()
