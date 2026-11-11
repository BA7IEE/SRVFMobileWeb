  }

  @Get(':activityId/ending-workbench')
  @RequiresPermission('activity.outcome.read', {
    admission: 'app-member',
    require: 'all',
    engine: 'authz-scoped',
    scopes: ['responsibility'],
  })
  @ApiOperation({ summary: '读取活动结束摘要，提示不代表操作权限 [rbac: activity.outcome.read]' })
  @ApiWrappedOkResponse(AppActivityEndingWorkbenchDto)
  @ApiBizErrorResponse(
    BizCode.BAD_REQUEST,
    BizCode.UNAUTHORIZED,
    BizCode.FORBIDDEN,
    BizCode.ACTIVITY_OUTCOME_REFERENCE_UNAVAILABLE,
  )
  getEndingWorkbench(
    @Param() params: AppActivityOutcomeParamsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.endingWorkbench.get(params.activityId, user);
  }

  @Get()
  @LoginScoped({
    admission: 'app-member',
    require: 'all',
    scopes: ['responsibility'],
    engine: 'authz-scoped',
  })
  @ApiOperation({ summary: 'App 我发起或承担责任的活动分页 [auth]' })
  @ApiWrappedPageResponse(AppManagedActivityListItemDto)
  @ApiBizErrorResponse(BizCode.BAD_REQUEST, BizCode.UNAUTHORIZED, BizCode.FORBIDDEN)
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: AppManagedActivitiesQueryDto,
  ) {
    return this.service.list(await this.resolveMemberId(user), query);
  }

  @Post()
  @LoginScoped({
    admission: 'app-member',
  @Get(':activityId')
  @LoginScoped({
    admission: 'app-member',
    require: 'all',
    scopes: ['responsibility'],
    engine: 'authz-scoped',
  })
  @ApiOperation({ summary: 'App 我管理的活动详情、责任、审核与待办摘要 [auth]' })
  @ApiWrappedOkResponse(AppManagedActivityDetailDto)
  @ApiBizErrorResponse(
    BizCode.BAD_REQUEST,
    BizCode.UNAUTHORIZED,
    BizCode.FORBIDDEN,
    BizCode.ACTIVITY_NOT_FOUND,
  )
  async detail(
    @CurrentUser() user: CurrentUserPayload,
    @Param() params: AppManagedActivityParamsDto,
  ): Promise<AppManagedActivityDetailDto> {
    return this.service.detail(params.activityId, await this.resolveMemberId(user), user);
  }

  @Patch(':activityId')
  @LoginScoped({
    admission: 'app-member',
    require: 'all',
    scopes: ['responsibility'],
    engine: 'authz-scoped',
  })
  @RequiresPermission('activity.create.cross-org')
  @ApiOperation({ summary: 'App 发起人修改 draft 活动 [auth]' })
  @ApiWrappedOkResponse(AppManagedActivityDetailDto)
