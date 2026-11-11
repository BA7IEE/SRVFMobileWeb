@ApiBearerAuth()
@Controller('app/v1/my/managed-activities/:activityId/onsite')
export class AppManagedActivityOnsiteOperationsController {
  constructor(
    private readonly identity: AppIdentityResolver,
    private readonly command: AttendancePunchCommandService,
    private readonly batchJobs: AttendanceOnsiteBatchJobService,
    private readonly importPreviews: AttendanceImportPreviewService,
    private readonly offlinePackages: AttendanceOfflinePackageService,
  ) {}
  @Post('sessions/:sessionId/staff-scan')
  @LoginScoped({
    admission: 'app-member',
    require: 'all',
    scopes: ['responsibility'],
    engine: 'authz-scoped',
  })
  @ApiOperation({ summary: '考勤责任人以受控人工确认追加工作人员现场签到/签退事实 [auth]' })
  @ApiWrappedCreatedResponse(AppActivityPunchReceiptDto)
  @ApiBizErrorResponse(
    BizCode.BAD_REQUEST,
    BizCode.UNAUTHORIZED,
    BizCode.FORBIDDEN,
    BizCode.RBAC_FORBIDDEN,
    BizCode.ACTIVITY_NOT_FOUND,
    BizCode.ACTIVITY_STATUS_INVALID,
    BizCode.ATTENDANCE_REGISTRATION_INVALID,
    BizCode.ATTENDANCE_QR_NOT_FOUND,
    BizCode.ATTENDANCE_PUNCH_IDEMPOTENCY_CONFLICT,
    BizCode.ATTENDANCE_PUNCH_OUTSIDE_WINDOW,
    BizCode.ATTENDANCE_PUNCH_LOCATION_REQUIRED,
    BizCode.ATTENDANCE_PUNCH_LOCATION_OUT_OF_RANGE,
    BizCode.ATTENDANCE_PUNCH_OPEN_SEGMENT_EXISTS,
    BizCode.ATTENDANCE_PUNCH_CHECK_OUT_REQUIRES_OPEN_SEGMENT,
    BizCode.ATTENDANCE_PUNCH_MIN_DURATION_NOT_REACHED,
  )
  async staffScan(
    @Param() params: AppManagedOnsiteSessionParamsDto,
    @Body() dto: AppManagedStaffScanDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ): Promise<AppActivityPunchReceiptDto> {
    await this.assertAppAccess(user);
    const hasManualConfirmation = dto.manualConfirmation !== undefined;
    const hasMemberCredential = dto.memberCredential !== undefined;
    if (hasManualConfirmation === hasMemberCredential) throw new BizException(BizCode.BAD_REQUEST);
    return this.command.managedPunch({
      activityId: params.activityId,
      sessionId: params.sessionId,
      participationIdentityId: dto.manualConfirmation?.participationIdentityId ?? null,
      memberCredential: dto.memberCredential ?? null,
      actionCode: dto.actionCode,
      sourceCode: 'staff_scan',
      eventKey: dto.eventKey,
      reason: dto.manualConfirmation?.reason ?? null,
      deviceId: null,
      longitude: dto.location?.longitude ?? null,
      latitude: dto.location?.latitude ?? null,
      accuracy: dto.location?.accuracy ?? null,
      currentUser: user,
      auditMeta: this.auditMeta(req),
    });
  }

  @Post('sessions/:sessionId/proxy-punch')
  @LoginScoped({
    admission: 'app-member',
    require: 'all',
    scopes: ['responsibility'],
    engine: 'authz-scoped',
  })
  @ApiOperation({ summary: '考勤责任人以明确原因代为追加单人现场签到/签退事实 [auth]' })
  @ApiWrappedCreatedResponse(AppActivityPunchReceiptDto)
  @ApiBizErrorResponse(
    BizCode.BAD_REQUEST,
    BizCode.UNAUTHORIZED,
    BizCode.FORBIDDEN,
    BizCode.RBAC_FORBIDDEN,
    BizCode.ACTIVITY_NOT_FOUND,
    BizCode.ACTIVITY_STATUS_INVALID,
    BizCode.ATTENDANCE_REGISTRATION_INVALID,
    BizCode.ATTENDANCE_PUNCH_IDEMPOTENCY_CONFLICT,
    BizCode.ATTENDANCE_PUNCH_OUTSIDE_WINDOW,
    BizCode.ATTENDANCE_PUNCH_LOCATION_REQUIRED,
    BizCode.ATTENDANCE_PUNCH_LOCATION_OUT_OF_RANGE,
    BizCode.ATTENDANCE_PUNCH_OPEN_SEGMENT_EXISTS,
    BizCode.ATTENDANCE_PUNCH_CHECK_OUT_REQUIRES_OPEN_SEGMENT,
    BizCode.ATTENDANCE_PUNCH_MIN_DURATION_NOT_REACHED,
  )
  async proxyPunch(
    @Param() params: AppManagedOnsiteSessionParamsDto,
    @Body() dto: AppManagedProxyPunchDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ): Promise<AppActivityPunchReceiptDto> {
    await this.assertAppAccess(user);
    return this.command.managedPunch({
      activityId: params.activityId,
      sessionId: params.sessionId,
      participationIdentityId: dto.participationIdentityId,
      memberCredential: null,
      actionCode: dto.actionCode,
      sourceCode: 'proxy',
      eventKey: dto.eventKey,
      reason: dto.reason,
      deviceId: null,
      longitude: dto.location?.longitude ?? null,
      latitude: dto.location?.latitude ?? null,
      accuracy: dto.location?.accuracy ?? null,
      currentUser: user,
      auditMeta: this.auditMeta(req),
    });
  }
