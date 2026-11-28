import { describe, expect, it } from 'vitest';
import {
  activityWorkStatus,
  attendanceStatusLabel,
  certificateStatusLabel,
  noticeKindLabel,
  rosterStatusLabel,
  teamJoinGateLabel,
  teamJoinStatusLabel,
} from '../../src/shared/labels';

describe('状态中文', () => {
  it('名单和办理页不回显原始状态码', () => {
    expect(rosterStatusLabel('reject')).toBe('已拒绝');
    expect(rosterStatusLabel('cancelled')).toBe('已取消');
    expect(rosterStatusLabel('waitlisted')).toBe('候补中');
    expect(rosterStatusLabel('unknown-code')).toBe('状态待确认');
    expect(activityWorkStatus('completed', null)).toBe('已完成');
    expect(activityWorkStatus('published', 'pending')).toBe('待发布审核');
    expect(attendanceStatusLabel('early_leave')).toBe('早退');
    expect(certificateStatusLabel('verified')).toBe('已核验');
  });
  it('入队门槛和通知类型使用说明，未知项不回显原码', () => {
    expect(teamJoinStatusLabel('pending_evaluation')).toBe('待综合评估');
    expect(teamJoinStatusLabel('mystery')).toBe('进度待确认');
    expect(teamJoinGateLabel('first-aid-training')).toBe('初级救援培训');
    expect(teamJoinGateLabel('not-listed')).toBe('未列入说明的门槛');
    expect(noticeKindLabel('emergency')).toBe('紧急通知');
    expect(noticeKindLabel('custom')).toBe('通知');
  });
});
