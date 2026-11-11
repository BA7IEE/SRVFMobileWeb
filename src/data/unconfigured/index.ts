import type { Ports } from '../ports';
import { fail } from '../../shared/errors';
export function createUnconfiguredPorts(): Ports {
  const deny = async () => {
    throw fail('not-configured', '服务尚未接通');
  };
  return {
    auth: {
      restoreSession: async () => null,
      login: deny,
      refreshSession: deny,
      logout: async () => {},
      getCurrentMember: deny,
      getCapabilities: deny,
      getLoginOptions: () => [],
      changePassword: deny,
    },
    activities: { list: deny, getDetail: deny, getMyParticipationContext: deny },
    registrations: {
      getForm: deny,
      submit: deny,
      getResult: deny,
      cancel: deny,
      getMyActivities: deny,
    },
    insurance: {
      getMyOverview: deny,
      getEligibilityForActivity: deny,
      createSelf: deny,
      updateSelf: deny,
      deleteSelf: deny,
    },
    attendance: { getMyState: deny, submitPunch: deny, getMemberCredential: deny },
    managed: {
      listActivities: deny,
      getScope: deny,
      listRegistrations: deny,
      executeAllowedReview: deny,
      getOnsiteOverview: deny,
      getQr: deny,
      staffScan: deny,
      proxyPunch: deny,
    },
    participation: { getSummary: deny, listRecords: deny, getRecordDetail: deny },
  };
}
