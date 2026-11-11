import type * as M from '../models';
export type Ports = {
  auth: {
    restoreSession(): Promise<M.Session | null>;
    login(account: string, password: string): Promise<M.Session>;
    refreshSession(session: M.Session): Promise<M.Session>;
    logout(): Promise<void>;
    getCurrentMember(session: M.Session): Promise<M.CurrentMember>;
    getCapabilities(session: M.Session): Promise<{ managed: boolean }>;
    getLoginOptions(): M.LoginOption[];
    changePassword(oldPassword: string, newPassword: string): Promise<void>;
  };
  activities: {
    list(
      query: { keyword: string; type: string; available: boolean; page: number },
      signal?: AbortSignal,
    ): Promise<M.PageResult<M.ActivityListItem>>;
    getDetail(id: string): Promise<M.ActivityDetail>;
    getMyParticipationContext(id: string): Promise<M.RegistrationResult | null>;
  };
  registrations: {
    getForm(id: string): Promise<M.RegistrationFormDefinition>;
    submit(intent: M.RegistrationIntent): Promise<M.RegistrationResult>;
    getResult(id: string): Promise<M.RegistrationResult | null>;
    cancel(id: string): Promise<void>;
    getMyActivities(): Promise<M.RegistrationResult[]>;
  };
  insurance: {
    getMyOverview(): Promise<M.InsuranceOverview>;
    getEligibilityForActivity(id: string): Promise<M.ActivityInsuranceEligibility>;
    createSelf(input: M.InsuranceInput): Promise<void>;
    updateSelf(id: string, input: M.InsuranceInput, version: number): Promise<void>;
    deleteSelf(id: string, version: number): Promise<void>;
  };
  attendance: {
    getMyState(activityId: string, sessionId: string): Promise<M.PunchState>;
    submitPunch(intent: M.PunchIntent): Promise<M.PunchReceipt>;
    getMemberCredential(): Promise<string>;
  };
  managed: {
    listActivities(): Promise<M.ActivityListItem[]>;
    getScope(id: string): Promise<M.ManagedActivityScope>;
    listRegistrations(id: string): Promise<M.ManagedRegistration[]>;
    executeAllowedReview(
      id: string,
      ids: string[],
    ): Promise<{ id: string; success: boolean; message: string }[]>;
    getOnsiteOverview(id: string, sessionId: string): Promise<M.OnsiteOverview>;
    getQr(
      id: string,
      sessionId: string,
      action: M.PunchAction,
      operation: 'read' | 'issue' | 'revoke',
      key?: string,
    ): Promise<M.QrCredential | null>;
    staffScan(
      id: string,
      sessionId: string,
      credential: string,
      action: M.PunchAction,
      key: string,
      expectedIdentityId: string,
    ): Promise<M.PunchReceipt>;
    proxyPunch(
      id: string,
      sessionId: string,
      personId: string,
      action: M.PunchAction,
      reason: string,
      key: string,
    ): Promise<M.PunchReceipt>;
  };
  participation: {
    getSummary(): Promise<M.ParticipationSummary>;
    listRecords(): Promise<M.ParticipationRecord[]>;
    getRecordDetail(id: string): Promise<M.ParticipationRecord>;
  };
  controls?: M.ScenarioControl;
};
