export class AppManagedStaffScanManualConfirmationDto {
  @ApiProperty({ minLength: 8, maxLength: 64, description: '已核验的永久参与身份 ID' })
  @IsString()
  @Length(8, 64)
  participationIdentityId!: string;

  @ApiProperty({ minLength: 1, maxLength: 500, description: '未能扫码时的人工确认原因' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AppManagedOnsiteLocationDto {
  @ApiPropertyOptional({ minimum: -180, maximum: 180, description: 'WGS84 经度，按场次策略可选' })
  @OmittableOnly()
  @IsNumber({ maxDecimalPlaces: 7, allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ minimum: -90, maximum: 90, description: 'WGS84 纬度，按场次策略可选' })
  @OmittableOnly()
  @IsNumber({ maxDecimalPlaces: 7, allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 99_999_999.99, description: '定位精度(米)' })
  @OmittableOnly()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(99_999_999.99)
  accuracy?: number;
}

export class AppManagedStaffScanDto {
  @ApiProperty({ enum: ['check_in', 'check_out'], description: '工作人员执行的现场动作' })
  @IsIn(['check_in', 'check_out'])
  actionCode!: 'check_in' | 'check_out';

  @ApiProperty({ minLength: 1, maxLength: 128, description: '客户端生成的全局现场事件防重键' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  eventKey!: string;

  @ApiPropertyOptional({
    type: () => AppManagedStaffScanManualConfirmationDto,
    description: '可信成员码不可用时，由工作人员明确确认的目标身份；与 memberCredential 二选一',
  })
  @OmittableOnly()
  @ValidateNested()
  @Type(() => AppManagedStaffScanManualConfirmationDto)
  manualConfirmation?: AppManagedStaffScanManualConfirmationDto;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 4096,
    description: '从成员本人受保护二维码读取的短时签名凭证；与 manualConfirmation 二选一',
  })
  @OmittableOnly()
  @IsString()
  @Length(1, 4096)
  memberCredential?: string;

  @ApiPropertyOptional({
    type: () => AppManagedOnsiteLocationDto,
    description: '按场次策略可选的 WGS84 定位快照',
  })
  @OmittableOnly()
  @ValidateNested()
  @Type(() => AppManagedOnsiteLocationDto)
  location?: AppManagedOnsiteLocationDto;
}

export class AppManagedProxyPunchDto {
  @ApiProperty({ enum: ['check_in', 'check_out'], description: '负责人代为执行的现场动作' })
  @IsIn(['check_in', 'check_out'])
  actionCode!: 'check_in' | 'check_out';

  @ApiProperty({ minLength: 1, maxLength: 128, description: '客户端生成的全局现场事件防重键' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  eventKey!: string;

  @ApiProperty({ minLength: 8, maxLength: 64, description: '经现场工作台已核验的永久参与身份 ID' })
  @IsString()
  @Length(8, 64)
  participationIdentityId!: string;

  @ApiProperty({ minLength: 1, maxLength: 500, description: '单人代签或代退的明确原因' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    type: () => AppManagedOnsiteLocationDto,
    description: '按场次策略可选的 WGS84 定位快照',
  })
  @OmittableOnly()
  @ValidateNested()
  @Type(() => AppManagedOnsiteLocationDto)
  location?: AppManagedOnsiteLocationDto;
}

// AC-068「500/2000/10000 人不要求业务人员手工拆 200 人数组」。
//
// 这里**没有**把 500 改大 —— 合同追踪矩阵 I55 明写现有 200/500 人批量「当前合理，保留现有
// 正确方向」，开发文档 §11.5 也把「item 批次 100 至 500 条」定位成吞吐参数并明写它
// 「**不形成业务上限**」。数组上限该守的是单请求体积；不该由它逼业务人员手工分页。
//
// 于是走「传条件、不传 id 列表」：客户端提交本场次的选择条件，服务端在 SQL 里把它展开成
// 任务项（见 attendance-onsite-batch-job.service.ts 的 INSERT ... SELECT），绑定参数个数与
// 人数无关，一个 identity id 都不进应用内存（开发文档 §11.4）。既有 500 条 id 列表入口
// 原样保留，行为一字不改。
export class AppManagedBulkPunchSelectionDto {
  // ⚠️ 刻意**可省略**而不是必填。契约语义门(L6/R11,规则 B3 `request-required-added`)
  // 把「可选父对象下的必填叶子」也算作破坏性变更 —— 它不建模「只有传了 selection 才要求
  // mode」这层条件性。而这里客观上**没有任何老调用方会受影响**:selection 整个是新增的
  // 可选字段,老调用方一律走 participationIdentityIds。
  //
  // 两条出路里选了闸自己给的第 ① 条「用兼容写法让它变成 additive」,而不是第 ② 条申报破坏:
  // 申报一条并不存在的破坏,会往审计记录里写假事实,还要维护者为此点一次环境审批。
  // 当前闭集只有一个值,省略即取它;将来加第二种模式时,新值仍然要显式写。
