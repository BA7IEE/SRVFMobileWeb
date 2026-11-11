
export class AppManagedMyResponsibilityDto {
  @ApiProperty({ enum: ['owner', 'collaborator'] })
  responsibilityType!: string;

  @ApiProperty()
  canManageRegistrations!: boolean;

  @ApiProperty()
  canManageAttendance!: boolean;
}
export class AppManagedActivityDetailDto {
  @ApiProperty({ type: AppManagedActivityProjectionDto })
  activity!: AppManagedActivityProjectionDto;

  @ApiPropertyOptional({ type: AppManagedMemberSummaryDto, nullable: true })
  initiator!: AppManagedMemberSummaryDto | null;

  @ApiPropertyOptional({ type: AppManagedMemberSummaryDto, nullable: true })
  owner!: AppManagedMemberSummaryDto | null;

  @ApiPropertyOptional({ type: AppManagedMyResponsibilityDto, nullable: true })
  myResponsibility!: AppManagedMyResponsibilityDto | null;

  @ApiProperty({ type: AppManagedPublishReviewSummaryDto })
  publishReview!: AppManagedPublishReviewSummaryDto;

  @ApiProperty({ type: AppManagedActivityCountsDto })
  counts!: AppManagedActivityCountsDto;

  @ApiProperty({ type: AppManagedActivityClosureDto })
  closure!: AppManagedActivityClosureDto;
}

export class AppManagedActivityListItemDto {
  @ApiProperty()
  activityId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  statusCode!: string;

  @ApiProperty()
  startAt!: Date;

  @ApiProperty()
  endAt!: Date;

  @ApiProperty({ enum: ['initiator', 'owner', 'collaborator'] })
  relationship!: 'initiator' | 'owner' | 'collaborator';

  @ApiProperty()
  pendingRegistrations!: number;

  @ApiProperty()
  unresolvedAttendanceSheets!: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  nextAction!: string | null;

  // AC-004「长期未处理草稿在工作台提示」。后端只给事实位,徽标怎么画是前端的事。
  // 非 draft 恒 false —— 「陈旧」这个概念只对草稿成立。
  @ApiProperty({ description: '是否为长期无人处理的草稿(可归档提示;非草稿恒 false)' })
  staleDraft!: boolean;
}

export class AppCollaboratorOptionDto extends AppManagedMemberSummaryDto {
  @ApiProperty({ enum: ['participant', 'organization-member'] })
  eligibilitySource!: 'participant' | 'organization-member';
