import type { Ports } from '../ports';
import type * as M from '../models';
import { activities, members, DEMO_PASSWORD, questions, insuranceLayoutOverview } from './fixtures';
import { scenarios } from './scenarios';
import { fail } from '../../shared/errors';
import { readMock, writeMock, removeMock, cleanupSession } from '../../shared/storage';
import { insuranceErrors, preferenceError, questionError } from '../../shared/validation';
import { IntentRegistry } from '../../shared/composables/intent';

export function createMockPorts(): Ports {
  let authGeneration = 0;
  let actor: M.CurrentMember | undefined;
  let now = Date.parse('2026-11-15T00:00:00Z');
  let scene = 'DEFAULT';
  let refreshed = 0;
  let expired = false;
  let insuranceOverride: string | undefined;
  let failureUsed = false;
  let serial = 0;
  const replay = new IntentRegistry();
  const initialInsurance = (): M.SelfInsurance => ({
    id: 'insurance-a',
    insurer: '演示保障公司',
    policy: 'SYNTHETIC-ONLY',
    start: '2026-01-01',
    end: '2026-12-31',
    review: 'verified',
    version: 1,
  });
  const insurances: Record<string, M.SelfInsurance[]> = { 'member-a': [initialInsurance()] };
  const results: Record<string, M.RegistrationResult[]> = {};
  const reviewed = new Set<string>();
  const states: Record<string, M.PunchState> = {};
  const qr = new Map<string, M.QrCredential>();
  const staffPresence: Record<string, boolean> = {};
  function execute<T>(key: string, body: unknown, fn: () => Promise<T>): Promise<T> {
    const member = requireActor();
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const resource = String(record.activityId ?? record.id ?? 'current-member');
    const operation =
      'formVersion' in record
        ? 'registration'
        : 'personId' in record
          ? 'proxy-punch'
          : 'operation' in record
            ? 'qr-' + String(record.operation)
            : 'punch';
    return replay.execute(key, body, fn, {
      actor: member.id,
      epoch: authGeneration,
      operation,
      resource,
    });
  }
  const timestamp = () => new Date(now).toISOString();
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const sessionKey = 'session';
  function requireActor() {
    if (!actor) throw fail('unauthenticated', '请重新登录');
    if (actor.admission !== 'active') throw fail('forbidden', '当前成员无法使用此功能');
    return actor;
  }
  async function delay() {
    const generation = authGeneration;
    await new Promise((r) => setTimeout(r, scene === 'SYSTEM-01' ? 350 : 30));
    if (generation !== authGeneration) throw fail('cancelled', '身份已切换，旧请求已停止');
    if (scene === 'SYSTEM-01' && !failureUsed) {
      failureUsed = true;
      throw fail('service-unavailable', '模拟服务暂不可用，请重试');
    }
  }
  function detail(id: string) {
    const a = activities.find((a) => a.id === id);
    if (!a || (a.invitation && actor?.id !== 'member-volunteer'))
      throw fail('not-found', '活动不存在或暂不可访问');
    const result = clone(a);
    if (scene === 'ACT-CANCELLED') {
      result.phase = 'cancelled';
      result.registration = { state: 'denied', reason: '活动已取消' };
    }
    if (scene === 'ACTION-UNKNOWN')
      result.registration = { state: 'unknown', reason: '当前资格暂无法确认' };
    if (['PUNCH-06', 'LOCATION-TIMEOUT'].includes(scene))
      result.sessions.forEach((s) => (s.locationRequired = true));
    return result;
  }
  function myResults() {
    const m = requireActor();
    if (!results[m.id])
      results[m.id] =
        m.id === 'member-a'
          ? [
              {
                id: 'registration-multi',
                activityId: 'act-multi',
                title: activities[1]!.title,
                phase: 'open',
                status: 'submitted',
                canEdit: false,
                canCancel: true,
                sessions: [
                  { id: 'session-am', name: '上午场', result: 'confirmed', position: '救护协作' },
                  { id: 'session-pm', name: '下午场 · 次日', result: 'waitlisted', position: null },
                ],
              },
            ]
          : [];
    return results[m.id]!;
  }
  function saveResults() {
    if (actor) writeMock('results:' + actor.id, myResults());
  }
  function scope(id: string): M.ManagedActivityScope {
    const m = requireActor();
    const allow = id === 'act-open' && scene !== 'STAFF-06';
    const state = (ok: boolean): M.ActionAvailability =>
      ok ? { state: 'allowed' } : { state: 'denied', reason: '当前活动职责未授予或已撤销' };
    return {
      activityId: id,
      registration: state(allow && ['member-registration', 'member-both'].includes(m.id)),
      attendance: state(allow && ['member-attendance', 'member-both'].includes(m.id)),
    };
  }
  function assertScope(id: string, type: 'registration' | 'attendance') {
    if (scope(id)[type].state !== 'allowed') throw fail('forbidden', '当前活动职责未授予或已撤销');
  }
  function stateKey(a: string, s: string) {
    return `${requireActor().id}:${a}:${s}`;
  }
  function getState(a: string, s: string): M.PunchState {
    const key = stateKey(a, s);
    if (!states[key])
      states[key] = {
        present: false,
        hasHistory: scene === 'PUNCH-08',
        next: 'check_in',
        checkOutAllowedAt: null,
        serverTime: timestamp(),
      };
    return { ...states[key]!, serverTime: timestamp() };
  }
  function credential(a: string, s: string, action: M.PunchAction, version = 1) {
    return `SRVF-DEMO:session-${action === 'check_in' ? 'check-in' : 'check-out'}:${a}:${s}:${version}`;
  }
  async function eligibility(id: string): Promise<M.ActivityInsuranceEligibility> {
    const m = requireActor();
    await delay();
    let status: M.ActivityInsuranceEligibility['status'] = 'eligible';
    let explanation = '演示保障条件满足本次活动要求';
    let source: 'self' | 'team' = m.id === 'member-b' ? 'team' : 'self';
    const override = insuranceOverride;
    if (scene === 'INS-06') {
      status = 'unknown';
      explanation = '暂无法完整确认保障情况，请重试或联系管理员';
    } else if (override && override !== 'verified') {
      status = 'ineligible';
      explanation =
        (
          {
            pending: '自购保险待审核',
            rejected: '自购保险审核未通过',
            expired: '保障已到期',
            future: '保障尚未生效',
            partial: '保障仅覆盖部分活动日期',
            missing: '尚无满足本活动条件的保障',
          } as Record<string, string>
        )[override] ?? '保险条件待确认';
    } else if (
      m.id !== 'member-b' &&
      !(insurances[m.id] ?? []).some((x) => x.review === 'verified')
    ) {
      status = 'ineligible';
      explanation = '自购保险待审核或尚未登记，请确认本次活动保障';
    }
    if (m.id === 'member-b') source = 'team';
    return { activityId: id, required: true, status, explanation, source, checkedAt: timestamp() };
  }
  function storedSession(): M.Session | null {
    return readMock(
      sessionKey,
      (x): x is M.Session =>
        typeof x === 'object' &&
        x !== null &&
        'actor' in x &&
        typeof x.actor === 'string' &&
        'expiresAt' in x &&
        typeof x.expiresAt === 'number' &&
        'refreshExpiresAt' in x &&
        typeof x.refreshExpiresAt === 'number' &&
        'id' in x &&
        typeof x.id === 'string',
    );
  }
  const ports: Ports = {
    auth: {
      async restoreSession() {
        await delay();
        const old = storedSession();
        if (!old) return null;
        if (old.refreshExpiresAt <= now || expired) {
          removeMock(sessionKey);
          return null;
        }
        actor = members.find((m) => m.id === old.actor);
        if (!actor) return null;
        const session = { ...old, id: crypto.randomUUID() };
        writeMock(sessionKey, session);
        const prior = readMock(
          'results:' + actor.id,
          (x): x is M.RegistrationResult[] =>
            Array.isArray(x) &&
            x.every(
              (r) =>
                typeof r === 'object' &&
                r !== null &&
                'activityId' in r &&
                'sessions' in r &&
                Array.isArray(r.sessions),
            ),
        );
        if (prior) results[actor.id] = prior;
        return session;
      },
      async login(account, password) {
        const generation = ++authGeneration;
        actor = undefined;
        removeMock(sessionKey);
        replay.clear();
        await delay();
        if (generation !== authGeneration) throw fail('cancelled', '登录已取消');
        if (scene === 'AUTH-03' || password !== DEMO_PASSWORD)
          throw fail('unauthenticated', '演示账号或密码不正确');
        if (scene === 'AUTH-RATE')
          throw Object.assign(fail('rate-limited', '操作频繁，请稍后再试'), {
            retryAfterSeconds: 30,
          });
        actor = members.find((m) => m.account === account.trim().toLowerCase());
        if (!actor) throw fail('unauthenticated', '演示账号或密码不正确');
        expired = false;
        const session = {
          id: crypto.randomUUID(),
          actor: actor.id,
          expiresAt: now + 900000,
          refreshExpiresAt: now + 86400000,
        };
        writeMock(sessionKey, session);
        return session;
      },
      async refreshSession(s) {
        const generation = authGeneration;
        refreshed++;
        await new Promise((r) => setTimeout(r, 100));
        if (generation !== authGeneration) throw fail('cancelled', '会话已切换');
        if (['AUTH-04', 'AUTH-11'].includes(scene) || expired || s.refreshExpiresAt <= now)
          throw fail(
            'unauthenticated',
            scene === 'AUTH-11' ? '续期结果未确认，请重新登录' : '演示会话已过期',
          );
        if (scene === 'AUTH-10') throw fail('cancelled', '续期已取消，请重试');
        if (scene === 'AUTH-UNAVAILABLE') throw fail('network', '暂无法确认会话，请重试');
        const next = { ...s, id: crypto.randomUUID(), expiresAt: now + 900000 };
        writeMock(sessionKey, next);
        return next;
      },
      async logout() {
        authGeneration++;
        if (actor) removeMock('unresolved:' + actor.id + ':act-open');
        actor = undefined;
        removeMock(sessionKey);
        replay.clear();
      },
      async getCurrentMember(s) {
        await delay();
        if (scene === 'AUTH-RESTORE-ONCE' && !failureUsed) {
          failureUsed = true;
          throw fail('network', '合成场景：首次身份读取暂不可用，请重试');
        }
        const m = members.find((m) => m.id === s.actor);
        if (!m) throw fail('unauthenticated', '身份失效');
        return clone(m);
      },
      async getCapabilities(s) {
        await delay();
        return { managed: members.find((m) => m.id === s.actor)?.managed ?? false };
      },
      getLoginOptions: () =>
        members.map((m) => ({
          id: m.id,
          label: m.name!,
          account: m.account,
          password: DEMO_PASSWORD,
        })),
      async changePassword(old, next) {
        requireActor();
        await delay();
        if (old !== DEMO_PASSWORD) throw fail('validation', '原演示密码不正确');
        if (next === old) throw fail('validation', '新密码不能与原密码相同');
      },
    },
    activities: {
      async list(query, signal) {
        requireActor();
        await delay();
        if (signal?.aborted) throw fail('cancelled', '读取已取消');
        let all = activities
          .filter((a) => !a.invitation || actor?.id === 'member-volunteer')
          .filter(
            (a) =>
              (!query.keyword || a.title.includes(query.keyword)) &&
              (!query.type || a.type === query.type) &&
              (!query.available || a.phase === 'open'),
          );
        if (scene === 'LIST-EMPTY') all = [];
        const start = (query.page - 1) * 3;
        return {
          items: clone(all.slice(start, start + 3)),
          total: all.length,
          page: query.page,
          hasMore: start + 3 < all.length,
        };
      },
      async getDetail(id) {
        requireActor();
        await delay();
        const a = detail(id);
        if (scene === 'REG-04') a.canEdit = false;
        if (scene === 'ACT-CANCELLED') {
          a.phase = 'cancelled';
          a.registration = { state: 'denied', reason: '活动已取消' };
        }
        if (scene === 'ACTION-UNKNOWN')
          a.registration = { state: 'unknown', reason: '当前资格暂无法确认' };
        return a;
      },
      async getMyParticipationContext(id) {
        return ports.registrations.getResult(id);
      },
    },
    registrations: {
      async getForm(id) {
        requireActor();
        await delay();
        const a = detail(id);
        const version = scene === 'REG-04' ? (failureUsed ? 2 : 1) : 1;
        if (scene === 'REG-04') failureUsed = true;
        return {
          version,
          qualification: a.qualification,
          questions: id === 'act-position' ? clone(questions) : [clone(questions[7]!)],
          sessions: a.sessions,
        };
      },
      async submit(intent) {
        const m = requireActor();
        await delay();
        const a = detail(intent.activityId);
        if (
          readMock(
            'unresolved:' + m.id + ':' + a.id,
            (x): x is object => typeof x === 'object' && x !== null,
          )
        )
          throw fail('result-unknown', '原报名结果尚未查证，请先读取原结果');
        const existing = myResults().find((r) => r.activityId === a.id && r.status === 'submitted');
        if (existing && !existing.canEdit)
          throw fail('business-rejected', '当前报名不允许修改，请核对原场次结果');
        if (a.registration.state !== 'allowed') throw fail('business-rejected', '当前不允许报名');
        if ((await eligibility(a.id)).status !== 'eligible')
          throw fail('business-rejected', '请先核对本次活动保险条件');
        const form = await ports.registrations.getForm(a.id);
        if ((scene === 'REG-04' ? 2 : form.version) !== intent.formVersion)
          throw fail('conflict', '表单已更新，请刷新后重新核对');
        const invalid = form.questions.find((q) => questionError(q, intent.answers[q.code]));
        if (scene === 'FILE-FAIL')
          throw fail('service-unavailable', '演示附件接收失败，文件仍在本地，请重新核对后提交');
        if (invalid || preferenceError(intent.preferences, form.sessions))
          throw fail('validation', '请核对必填题目、场次和岗位');
        const result = await execute(`${m.id}:${intent.key}`, intent, async () => {
          const r: M.RegistrationResult = {
            id: 'registration-' + ++serial,
            activityId: a.id,
            title: a.title,
            phase: a.phase,
            status: 'submitted',
            canEdit: a.canEdit,
            canCancel: true,
            sessions: intent.preferences.map((p, i) => ({
              id: p.sessionId,
              name: a.sessions.find((s) => s.id === p.sessionId)!.name,
              result: i === 0 ? 'confirmed' : 'waitlisted',
              position:
                a.sessions
                  .find((s) => s.id === p.sessionId)!
                  .positions.find((x) => x.id === p.positionIds[0])?.name ?? null,
            })),
          };
          const list = myResults();
          const existing = list.findIndex((x) => x.activityId === a.id);
          if (existing >= 0) list[existing] = r;
          else list.push(r);
          saveResults();
          return r;
        });
        if (scene === 'REG-06' && !failureUsed) {
          failureUsed = true;
          writeMock('unresolved:' + m.id + ':' + a.id, {
            resource: a.id,
            key: intent.key,
            actor: m.id,
            epoch: authGeneration,
            operation: 'registration',
            phase: 'result-unknown',
          });
          throw fail('result-unknown', '暂未确认结果，请先查询报名记录');
        }
        removeMock('unresolved:' + m.id + ':' + a.id);
        return clone(result);
      },
      async getResult(id) {
        await delay();
        const result = myResults().find((x) => x.activityId === id) ?? null;
        if (result) removeMock('unresolved:' + requireActor().id + ':' + id);
        return clone(result);
      },
      async cancel(id) {
        requireActor();
        await delay();
        const r = myResults().find((x) => x.activityId === id);
        if (!r || !r.canCancel) throw fail('business-rejected', '当前不能取消报名');
        r.status = 'cancelled';
        r.canEdit = false;
        r.canCancel = false;
        saveResults();
      },
      async getMyActivities() {
        await delay();
        return clone(myResults());
      },
    },
    insurance: {
      async getMyOverview() {
        const m = requireActor();
        const generation = authGeneration;
        const currentScene = scene;
        await delay();
        if (currentScene === 'INS-SLOW') {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (generation !== authGeneration) throw fail('cancelled', '身份已切换');
        }
        if (currentScene === 'INS-ERROR')
          throw fail('service-unavailable', '合成场景：保险资料暂不可用，请重新读取');
        if (currentScene === 'INS-FORBIDDEN')
          throw fail('forbidden', '合成场景：当前身份无权读取保险资料，请联系管理员');
        if (currentScene === 'INS-EMPTY') return { self: [], team: [] };
        if (currentScene === 'INS-LAYOUT') return clone(insuranceLayoutOverview);
        const pending = readMock(
          'insurance-intent:' + m.id,
          (x): x is { id: string } =>
            typeof x === 'object' && x !== null && 'id' in x && typeof x.id === 'string',
        );
        const unresolvedCreate = Boolean(
          pending && !(insurances[m.id] ?? []).some((r) => r.id === pending.id),
        );
        if (pending && !unresolvedCreate) removeMock('insurance-intent:' + m.id);
        return {
          self: clone(insurances[m.id] ?? []),
          unresolvedCreate,
          team:
            scene === 'INS-06'
              ? null
              : m.id === 'member-b'
                ? [{ name: '演示队伍统一保障', start: '2026-01-01', end: '2026-12-31' }]
                : [],
        };
      },
      getEligibilityForActivity: eligibility,
      async createSelf(input) {
        const m = requireActor();
        await delay();
        if (
          readMock(
            'insurance-intent:' + m.id,
            (x): x is object => typeof x === 'object' && x !== null,
          )
        )
          throw fail('result-unknown', '上次登记结果待核实，请先查询，不重复新建');
        if (Object.keys(insuranceErrors(input)).length) throw fail('validation', '请核对保险资料');
        (insurances[m.id] ??= []).push({
          id: 'insurance-' + ++serial,
          ...input,
          review: 'pending',
          version: 1,
        });
        insuranceOverride = 'pending';
        if (scene === 'WIRE-05') {
          writeMock('insurance-intent:' + m.id, {
            id: 'insurance-' + serial,
            actor: m.id,
            epoch: authGeneration,
            operation: 'insurance-create',
            phase: 'result-unknown',
          });
          throw fail('result-unknown', '资料可能已登记，请返回列表核对，勿重复提交');
        }
      },
      async updateSelf(id, input, version) {
        const m = requireActor();
        await delay();
        const record = (insurances[m.id] ?? []).find((x) => x.id === id);
        if (!record) throw fail('not-found', '记录暂不可读');
        if (scene === 'INS-08' && !failureUsed) {
          failureUsed = true;
          record.version++;
          throw fail('conflict', '资料已发生变化，请刷新后核对');
        }
        if (record.version !== version) throw fail('conflict', '资料版本已更新，请刷新核对');
        if (Object.keys(insuranceErrors(input)).length) throw fail('validation', '请核对保险资料');
        Object.assign(record, input, { version: version + 1, review: 'pending' });
        insuranceOverride = 'pending';
      },
      async deleteSelf(id, version) {
        const m = requireActor();
        await delay();
        const record = (insurances[m.id] ?? []).find((x) => x.id === id);
        if (!record || record.version !== version) throw fail('conflict', '资料已变化，请刷新核对');
        insurances[m.id] = (insurances[m.id] ?? []).filter((x) => x.id !== id);
      },
    },
    attendance: {
      async getMyState(a, s) {
        await delay();
        const activity = detail(a);
        if (!activity.sessions.some((x) => x.id === s)) throw fail('not-found', '场次暂不可读');
        const registration = myResults().find(
          (x) => x.activityId === a && x.status === 'submitted',
        );
        if (!registration?.sessions.some((x) => x.id === s && x.result === 'confirmed'))
          throw fail('forbidden', '本场次尚无已确认的参与资格，请核对报名结果');
        return getState(a, s);
      },
      async submitPunch(intent) {
        requireActor();
        await delay();
        await ports.attendance.getMyState(intent.activityId, intent.sessionId);
        const current = getState(intent.activityId, intent.sessionId);
        const code = intent.credential.split(':');
        if (
          code[0] !== 'SRVF-DEMO' ||
          code[1] !== `session-${intent.action === 'check_in' ? 'check-in' : 'check-out'}` ||
          code[2] !== intent.activityId ||
          code[3] !== intent.sessionId
        )
          throw fail('validation', '二维码类型、活动或场次不符，请重新扫描');
        const live = qr.get(`${intent.activityId}:${intent.sessionId}:${intent.action}`);
        if (
          ['PUNCH-03'].includes(scene) ||
          Number(code[4]) !== (live?.version ?? 1) ||
          (live && (live.status !== 'active' || Date.parse(live.validUntil) <= now))
        )
          throw fail('business-rejected', '二维码已失效，请向现场负责人获取新码');
        if (scene === 'PUNCH-06') throw fail('business-rejected', '定位未就绪，请联系现场负责人');
        const receipt = await execute(intent.key, intent, async () => {
          if (current.next !== intent.action)
            throw fail('business-rejected', '当前动作已变化，请重新读取考勤状态');
          if (
            intent.action === 'check_out' &&
            current.checkOutAllowedAt &&
            now < Date.parse(current.checkOutAllowedAt)
          )
            throw fail('business-rejected', '未到允许签退时间，请稍后重新读取');
          const next = {
            ...current,
            present: intent.action === 'check_in',
            hasHistory: true,
            next: intent.action === 'check_in' ? ('check_out' as const) : ('check_in' as const),
            checkOutAllowedAt:
              intent.action === 'check_in' ? new Date(now + 1800000).toISOString() : null,
            serverTime: timestamp(),
          };
          states[stateKey(intent.activityId, intent.sessionId)] = next;
          return {
            id: 'event-' + ++serial,
            action: intent.action,
            at: timestamp(),
            message: '现场动作已记录（演示），正式结果待认定',
          };
        });
        return clone(receipt);
      },
      async getMemberCredential() {
        return `SRVF-DEMO:member:${requireActor().id}`;
      },
    },
    managed: {
      async listActivities() {
        requireActor();
        await delay();
        return activities
          .filter((a) => {
            const s = scope(a.id);
            return s.registration.state === 'allowed' || s.attendance.state === 'allowed';
          })
          .map(clone);
      },
      async getScope(id) {
        await delay();
        return scope(id);
      },
      async listRegistrations(id) {
        assertScope(id, 'registration');
        await delay();
        return [
          {
            id: 'reg-demo-a',
            memberLabel: 'DEMO-001 演示队员 A',
            status: reviewed.has('reg-demo-a') ? 'confirmed' : 'pending',
            sessions: '上午场 · 待核对',
            review: reviewed.has('reg-demo-a')
              ? { state: 'denied', reason: '已处理' }
              : { state: 'allowed' },
          },
          {
            id: 'reg-demo-b',
            memberLabel: 'DEMO-002 演示队员 B',
            status: 'waitlisted',
            sessions: '上午场 · 候补',
            review: { state: 'denied', reason: '需等待分配批次，不支持人工通过' },
          },
          {
            id: 'reg-demo-c',
            memberLabel: 'DEMO-003 演示队员 C',
            status: 'pending',
            sessions: '上午场 · 待复核',
            review: { state: 'allowed' },
          },
        ];
      },
      async executeAllowedReview(id, ids) {
        assertScope(id, 'registration');
        await delay();
        assertScope(id, 'registration');
        if (ids.includes('reg-demo-a')) reviewed.add('reg-demo-a');
        return ids.map((x) => ({
          id: x,
          success: x === 'reg-demo-a',
          message: x === 'reg-demo-a' ? '审核已记录（演示）' : '当前状态不支持此操作，已保留原结果',
        }));
      },
      async getOnsiteOverview(id, sessionId) {
        assertScope(id, 'attendance');
        await delay();
        assertScope(id, 'attendance');
        return {
          total: 24,
          present: 8 + Object.values(staffPresence).filter(Boolean).length,
          people: [
            {
              identityId: 'identity-member-a',
              label: 'DEMO-001 演示队员 A',
              present: staffPresence[sessionId + ':identity-member-a'] ?? false,
              note: scene === 'STAFF-EXCEPTION' ? '更正处理中' : null,
            },
            {
              identityId: 'identity-member-b',
              label: 'DEMO-002 演示队员 B',
              present: staffPresence[sessionId + ':identity-member-b'] ?? false,
              note: '提前离场需负责人核验',
            },
          ],
        };
      },
      async getQr(id, s, action, operation, key) {
        assertScope(id, 'attendance');
        await delay();
        const mapKey = `${id}:${s}:${action}`;
        if (operation === 'read') {
          const current = qr.get(mapKey);
          if (current && Date.parse(current.validUntil) <= now && current.status === 'active')
            current.status = 'expired';
          return clone(current ?? null);
        }
        if (!key) throw fail('validation', '缺少操作标识');
        return execute(key, { id, s, action, operation }, async () => {
          const old = qr.get(mapKey);
          const next: M.QrCredential = {
            id: 'qr-' + ++serial,
            sessionId: s,
            action,
            version: operation === 'issue' ? (old?.version ?? 0) + 1 : (old?.version ?? 1),
            status: operation === 'issue' ? 'active' : 'revoked',
            payload: credential(
              id,
              s,
              action,
              operation === 'issue' ? (old?.version ?? 0) + 1 : (old?.version ?? 1),
            ),
            validUntil: new Date(now + 3600000).toISOString(),
          };
          qr.set(mapKey, next);
          return clone(next);
        });
      },
      async staffScan(id, s, code, action, key, expectedIdentityId) {
        assertScope(id, 'attendance');
        const parts = code.split(':');
        if (
          parts[0] !== 'SRVF-DEMO' ||
          parts[1] !== 'member' ||
          !members.some((m) => m.id === parts[2])
        )
          throw fail('validation', '需要有效的演示成员码，场次码不可代替');
        if ('identity-' + parts[2] !== expectedIdentityId)
          throw fail('validation', '扫描成员与所选人员不一致，请重新核验');
        return ports.managed.proxyPunch(
          id,
          s,
          'identity-' + parts[2],
          action,
          '工作人员已现场扫描并核验成员码',
          key,
        );
      },
      async proxyPunch(id, s, personId, action, reason, key) {
        assertScope(id, 'attendance');
        if (!reason.trim() || reason.length > 500)
          throw fail('validation', '请填写 1—500 字的核验原因');
        if (!['identity-member-a', 'identity-member-b'].includes(personId))
          throw fail('not-found', '参与身份暂不可读');
        await delay();
        return execute(key, { id, s, personId, action, reason }, async () => {
          staffPresence[s + ':' + personId] = action === 'check_in';
          return {
            id: 'staff-event-' + ++serial,
            action,
            at: timestamp(),
            message: '受控现场操作已记录（演示），正式结果待认定',
          };
        });
      },
    },
    participation: {
      async getSummary() {
        requireActor();
        await delay();
        return {
          hours: scene === 'RECORD-EMPTY' ? null : '12.50',
          points: scene === 'RECORD-EMPTY' ? null : '6.25',
          source: '合成正式汇总读面（PROPOSED），未由页面加总',
        };
      },
      async listRecords() {
        requireActor();
        await delay();
        return scene === 'RECORD-EMPTY'
          ? []
          : [
              {
                id: 'record-pending',
                title: '周末应急救护公益培训',
                session: '上午场',
                status: 'pending',
                hours: null,
                points: null,
                historical: false,
              },
              {
                id: 'record-zero',
                title: '历史演示活动 · 未满足认定条件',
                session: '下午场',
                status: 'recognized',
                hours: '0.00',
                points: '0.00',
                historical: true,
              },
              {
                id: 'record-history',
                title: '秋季社区防灾宣传',
                session: '全天',
                status: 'corrected',
                hours: '12.50',
                points: '6.25',
                historical: true,
              },
            ];
      },
      async getRecordDetail(id) {
        const all = await ports.participation.listRecords();
        const r = all.find((x) => x.id === id);
        if (!r) throw fail('not-found', '记录暂不可读');
        return r;
      },
    },
    controls: {
      deviceScenario(kind) {
        if (kind === 'camera') {
          if (scene === 'PUNCH-07') return 'denied';
          if (scene === 'CAMERA-UNAVAILABLE') return 'unavailable';
          if (scene === 'DEVICE-01') return 'ignored';
        } else {
          if (scene === 'PUNCH-06') return 'denied';
          if (scene === 'LOCATION-TIMEOUT') return 'timeout';
        }
        return 'default';
      },
      scenarios,
      identities: members.map((m) => ({
        id: m.id,
        label: m.name!,
        account: m.account,
        password: DEMO_PASSWORD,
      })),
      apply(id) {
        scene = id;
        failureUsed = false;
        if (id === 'INS-03') insuranceOverride = 'pending';
        else if (id === 'INS-04') insuranceOverride = 'rejected';
        else if (id === 'INS-EXPIRED') insuranceOverride = 'expired';
        else if (id === 'INS-FUTURE') insuranceOverride = 'future';
        else if (id === 'INS-05') insuranceOverride = 'partial';
        else if (id === 'INS-MISSING') insuranceOverride = 'missing';
        else insuranceOverride = undefined;
        if (actor) {
          for (const record of insurances[actor.id] ?? []) {
            if (id === 'INS-03') record.review = 'pending';
            if (id === 'INS-04') record.review = 'rejected';
            if (id === 'INS-EXPIRED') record.end = '2026-11-01';
            if (id === 'INS-FUTURE') record.start = '2026-12-01';
            if (id === 'INS-05') record.end = '2026-11-16';
          }
        }
        if (['AUTH-04', 'AUTH-11'].includes(id)) expired = true;
        writeMock('scene', { id, now });
      },
      advance(minutes) {
        now += minutes * 60000;
        writeMock('scene', { id: scene, now });
      },
      reset() {
        cleanupSession();
        scene = 'DEFAULT';
        failureUsed = false;
        insuranceOverride = undefined;
        expired = false;
        now = Date.parse('2026-11-15T00:00:00Z');
        replay.clear();
        reviewed.clear();
        for (const key of Object.keys(sessionStorage))
          if (/^srvf:mock:v1:(insurance-intent:|unresolved:|scene$)/.test(key))
            sessionStorage.removeItem(key);
        for (const id of Object.keys(results)) {
          delete results[id];
          removeMock('results:' + id);
        }
        for (const id of Object.keys(states)) delete states[id];
        qr.clear();
        for (const id of Object.keys(insurances)) delete insurances[id];
        insurances['member-a'] = [initialInsurance()];
      },
      now: timestamp,
      getScenario: () => scene,
      setInsurance(review) {
        if (actor) {
          const records = insurances[actor.id] ?? [];
          records.forEach((r) => {
            r.review = review;
            r.version++;
          });
          if (!['expired', 'future', 'partial'].includes(insuranceOverride ?? ''))
            insuranceOverride = review;
        }
      },
      refreshCount: () => refreshed,
      expire() {
        expired = true;
      },
      scanExample(a, s, action) {
        if (action === 'member') return 'SRVF-DEMO:member:member-a';
        if (scene === 'PUNCH-02') return credential('act-other', s, action);
        return credential(a, s, action, qr.get(`${a}:${s}:${action}`)?.version ?? 1);
      },
    },
  };
  const saved = readMock(
    'scene',
    (x): x is { id: string; now: number } =>
      typeof x === 'object' &&
      x !== null &&
      'id' in x &&
      typeof x.id === 'string' &&
      'now' in x &&
      typeof x.now === 'number',
  );
  if (saved) {
    scene = saved.id;
    now = saved.now;
    ports.controls!.apply(scene);
  }
  return ports;
}
