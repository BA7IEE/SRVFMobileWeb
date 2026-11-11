export type ErrorKind =
  | 'not-configured'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'conflict'
  | 'rate-limited'
  | 'network'
  | 'service-unavailable'
  | 'business-rejected'
  | 'result-unknown'
  | 'contract-mismatch'
  | 'cancelled';
export type AppError = Error & {
  kind: ErrorKind;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
};
export type ActionAvailability =
  { state: 'allowed' } | { state: 'denied' | 'unknown' | 'unavailable'; reason: string };
export type CurrentMember = {
  id: string;
  account: string;
  name: string | null;
  number: string | null;
  identity: string;
  admission: 'active' | 'unbound' | 'inactive';
  managed: boolean;
};
export type Session = { id: string; actor: string; expiresAt: number; refreshExpiresAt: number };
export type Position = { id: string; name: string };
export type SessionInfo = {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  positions: Position[];
  locationRequired: boolean | null;
};
export type ActivityListItem = {
  id: string;
  title: string;
  type: string;
  phase: 'open' | 'closed' | 'ended' | 'cancelled';
  startAt: string;
  endAt: string;
  location: string;
  invitation: boolean;
  summary: string;
};
export type ActivityDetail = ActivityListItem & {
  sessions: SessionInfo[];
  description: string;
  registration: ActionAvailability;
  canEdit: boolean;
  canCancel: boolean;
  historical: boolean;
};
export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'date'
  | 'single_choice'
  | 'multi_choice'
  | 'file'
  | 'confirmation';
export type Question = {
  code: string;
  type: QuestionType | 'unsupported';
  label: string;
  required: boolean;
  min?: number;
  max?: number;
  options?: string[];
};
export type RegistrationFormDefinition = {
  version: number | null;
  questions: Question[];
  sessions: SessionInfo[];
};
export type Preferences = { sessionId: string; positionIds: string[] }[];
export type RegistrationIntent = {
  activityId: string;
  key: string;
  formVersion: number | null;
  answers: Record<string, unknown>;
  preferences: Preferences;
};
export type RegistrationResult = {
  id: string;
  activityId: string;
  title: string;
  phase: ActivityListItem['phase'];
  status: 'submitted' | 'cancelled';
  sessions: {
    id: string;
    name: string;
    result: 'confirmed' | 'waitlisted' | 'pending';
    position: string | null;
  }[];
  canEdit: boolean;
  canCancel: boolean;
};
export type SelfInsurance = {
  id: string;
  insurer: string;
  policy: string;
  start: string | null;
  end: string;
  review: 'pending' | 'verified' | 'rejected';
  version: number;
};
export type InsuranceInput = Pick<SelfInsurance, 'insurer' | 'policy' | 'start' | 'end'>;
export type InsuranceOverview = {
  self: SelfInsurance[];
  team: { name: string; start: string; end: string }[] | null;
  unresolvedCreate?: boolean;
};
export type ActivityInsuranceEligibility = {
  activityId: string;
  required: boolean;
  status: 'eligible' | 'ineligible' | 'unknown' | 'unavailable';
  explanation: string;
  source?: 'team' | 'self';
  checkedAt: string;
};
export type PunchAction = 'check_in' | 'check_out';
export type PunchState = {
  present: boolean;
  hasHistory: boolean | null;
  next: PunchAction;
  checkOutAllowedAt: string | null;
  serverTime: string;
};
export type PunchReceipt = { id: string; action: PunchAction; at: string; message: string };
export type PunchIntent = {
  activityId: string;
  sessionId: string;
  key: string;
  action: PunchAction;
  credential: string;
  location?: { longitude: number; latitude: number; accuracy: number };
};
export type ManagedActivityScope = {
  activityId: string;
  registration: ActionAvailability;
  attendance: ActionAvailability;
};
export type ManagedRegistration = {
  id: string;
  memberLabel: string;
  status: 'pending' | 'confirmed' | 'waitlisted';
  sessions: string;
  review: ActionAvailability;
};
export type Person = { identityId: string; label: string; present: boolean; note: string | null };
export type OnsiteOverview = { total: number; present: number; people: Person[] };
export type QrCredential = {
  id: string;
  version: number;
  action: PunchAction;
  sessionId: string;
  status: 'active' | 'revoked' | 'expired';
  payload: string;
  validUntil: string;
};
export type ParticipationRecord = {
  id: string;
  title: string;
  session: string;
  status: 'pending' | 'recognized' | 'corrected';
  hours: string | null;
  points: string | null;
  historical: boolean;
};
export type ParticipationSummary = { hours: string | null; points: string | null; source: string };
export type PageResult<T> = { items: T[]; total: number; page: number; hasMore: boolean };
export type LoginOption = { id: string; label: string; account: string; password?: string };
export type Scenario = { id: string; label: string; description: string };
export type ScenarioControl = {
  deviceScenario(
    kind: 'camera' | 'location',
  ): 'default' | 'denied' | 'unavailable' | 'timeout' | 'ignored';
  scenarios: Scenario[];
  identities: LoginOption[];
  apply(id: string): void;
  advance(minutes: number): void;
  reset(): void;
  now(): string;
  getScenario(): string;
  setInsurance(review: 'verified' | 'pending'): void;
  refreshCount(): number;
  expire(): void;
  scanExample(activityId: string, sessionId: string, action: PunchAction | 'member'): string;
};
