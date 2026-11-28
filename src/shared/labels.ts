const roster: Record<string, string> = {
  pass: '已通过',
  pending: '待录取',
  reject: '已拒绝',
  cancelled: '已取消',
  waitlisted: '候补中',
};
const work: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  cancelled: '已取消',
  completed: '已完成',
};
const attendance: Record<string, string> = {
  present: '正常到场',
  late: '迟到',
  early_leave: '早退',
};
const certificate: Record<string, string> = {
  pending: '待核验',
  verified: '已核验',
  expired: '已过期',
  rejected: '未通过',
};
const teamJoin: Record<string, string> = {
  joining: '入队办理中',
  pending_evaluation: '待综合评估',
  approved: '已通过评估',
  joined: '已入队',
  rejected: '未通过',
};
const gates: Record<string, string> = {
  fitness: '基础体能',
  'first-aid-training': '初级救援培训',
  military: '军训',
  psych: '心理测试',
  interview: '部门面试',
  'dept-assessment': '部门考核',
  'entry-exam': '入队普考',
  'intermediate-outdoor': '中级户外资质',
  'team-water': '水域救援队',
  'team-urban': '城市搜救队',
  'team-mountain': '山地救援队',
  'team-high': '高空救援队',
};

export function rosterStatusLabel(status: string) {
  return roster[status] ?? '状态待确认';
}
export function activityWorkStatus(status: string, review: string | null) {
  if (review === 'pending') return '待发布审核';
  return work[status] ?? '状态待确认';
}
export function attendanceStatusLabel(status: string) {
  return attendance[status] ?? '状态待确认';
}
export function certificateStatusLabel(status: string) {
  return certificate[status] ?? '状态待确认';
}
export function teamJoinStatusLabel(status: string) {
  return teamJoin[status] ?? '进度待确认';
}
export function teamJoinGateLabel(code: string) {
  return gates[code] ?? '未列入说明的门槛';
}
export function noticeKindLabel(code: string) {
  if (code === 'general') return '一般通知';
  if (code === 'emergency') return '紧急通知';
  return '通知';
}
