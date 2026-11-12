import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import fixture from '../fixtures/activity-detail.v1.json';
import { createWire } from '../../src/data/wire/operations';
import { FakeTransport } from '../../src/data/wire/core';
import { activityRegistrationForm } from '../../src/data/wire/activity';
import SessionPositionSelector from '../../src/shared/components/SessionPositionSelector.vue';
import type { Preferences } from '../../src/data/models';
import { preferenceError } from '../../src/shared/validation';

describe('R3：原始响应到岗位选择再到报名命令', () => {
  it('保留场次、岗位、资格和志愿顺序，不用客户端mock填字段', async () => {
    const transport = new FakeTransport([
      { status: 200, contentType: 'application/json', body: fixture },
      {
        status: 201,
        contentType: 'application/json',
        body: {
          code: 0,
          message: 'ok',
          data: {
            registrationId: 'registration-wire',
            registrationRevisionId: 'revision-wire',
            revision: 1,
            submittedAt: '2026-11-12T00:00:00Z',
          },
        },
      },
    ]);
    const wire = createWire(transport, () => 'SYNTHETIC');
    const detail = await wire.getActivity('activity-wire');
    const model = activityRegistrationForm(detail);
    expect(detail.qualification.result).toBe('warn');
    expect(detail.registrationNotes).toBe('');
    expect(model.sessions[0]).toMatchObject({
      id: 'session-morning',
      location: '合成场地一',
      capacity: null,
      locationRequired: null,
    });
    expect(model.sessions[0]!.positions.map((p) => [p.id, p.name])).toEqual([
      ['position-logistics', '后勤保障'],
      ['position-aid', '救护协作'],
      ['position-blocked', '受限岗位'],
    ]);
    expect(model.sessions[0]!.positions[1]).toMatchObject({
      capacity: null,
      startAt: null,
      equipmentNotes: '自备合成演示装备',
      qualification: { result: 'warn', unmetRules: [{ warnScore: 0 }] },
    });
    let selected: Preferences = [];
    const wrapper = mount(SessionPositionSelector, {
      props: {
        sessions: model.sessions,
        modelValue: selected,
        'onUpdate:modelValue': (next: Preferences) => {
          selected = next;
          void wrapper.setProps({ modelValue: next });
        },
      },
    });
    try {
      const groups = wrapper.findAll('fieldset');
      expect(groups[1]!.find('input').attributes('disabled')).toBeDefined();
      await groups[0]!.find('input').setValue(true);
      const labels = groups[0]!.findAll('label');
      const input = (name: string) => labels.find((label) => label.text() === name)!.find('input');
      expect(input('受限岗位').attributes('disabled')).toBeDefined();
      expect(wrapper.text()).toContain('不满足本岗位资格');
      await input('救护协作').setValue(true);
      await input('后勤保障').setValue(true);
      await groups[0]!.find('button').trigger('click');
      await groups[2]!.find('input').setValue(true);
      expect(preferenceError(selected, model.sessions)).toBe('');
      await wire.register(detail.id, {
        operationKey: 'bridge-operation',
        formVersion: model.version,
        answers: [],
        preferences: selected,
      });
      expect(transport.requests[1]!.body).toEqual({
        operationKey: 'bridge-operation',
        formVersion: null,
        answers: [],
        preferences: [
          { sessionId: 'session-morning', positionIds: ['position-logistics', 'position-aid'] },
          { sessionId: 'session-no-position', positionIds: [] },
        ],
      });
      expect(transport.requests[1]!.body).not.toHaveProperty('qualification');
    } finally {
      wrapper.unmount();
    }
  });
  it('缺关键岗位字段或未知资格时停止，不默认为通过', async () => {
    const missing = structuredClone(fixture);
    delete (missing.data.sessions[0] as Partial<(typeof missing.data.sessions)[number]>).positions;
    const unknown = structuredClone(fixture);
    unknown.data.sessions[0]!.qualification.resultCode = 'unknown';
    for (const body of [missing, unknown])
      await expect(
        createWire(
          new FakeTransport([{ status: 200, contentType: 'application/json', body }]),
          () => 'SYNTHETIC',
        ).getActivity('activity-wire'),
      ).rejects.toHaveProperty('kind', 'contract-mismatch');
  });
});
