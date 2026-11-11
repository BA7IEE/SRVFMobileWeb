import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuth } from '../../features/auth/store';
import { getData } from '../../data';
import { safeTarget } from './safe-target';
export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/activities' },
    {
      path: '/login',
      name: 'login',
      component: () => import('../../features/auth/pages/LoginPage.vue'),
      meta: { title: '登录', public: true },
    },
    {
      path: '/activities',
      name: 'activities',
      component: () => import('../../features/activities/pages/ActivitiesPage.vue'),
      meta: { title: '活动', tab: 'activities' },
    },
    {
      path: '/activities/:activityId',
      name: 'activity',
      component: () => import('../../features/activities/pages/ActivityDetailPage.vue'),
      meta: { title: '活动详情' },
    },
    {
      path: '/activities/:activityId/register',
      name: 'register',
      component: () => import('../../features/registrations/pages/RegisterPage.vue'),
      meta: { title: '活动报名' },
    },
    {
      path: '/my/activities',
      name: 'my-activities',
      component: () => import('../../features/registrations/pages/MyActivitiesPage.vue'),
      meta: { title: '我的活动', tab: 'my-activities' },
    },
    {
      path: '/activities/:activityId/sessions/:sessionId/attendance',
      name: 'attendance',
      component: () => import('../../features/attendance/pages/AttendancePage.vue'),
      meta: { title: '场次考勤' },
    },
    {
      path: '/my/participation',
      name: 'participation',
      component: () => import('../../features/participation/pages/ParticipationPage.vue'),
      meta: { title: '我的参与记录' },
    },
    {
      path: '/my/insurance',
      name: 'insurance',
      component: () => import('../../features/insurance/pages/InsurancePage.vue'),
      meta: { title: '我的保险' },
    },
    {
      path: '/my',
      name: 'account',
      component: () => import('../../features/account/pages/AccountPage.vue'),
      meta: { title: '我的', tab: 'account' },
    },
    {
      path: '/managed/activities',
      name: 'managed',
      component: () => import('../../features/managed/pages/ManagedActivitiesPage.vue'),
      meta: { title: '我负责的活动', managed: true },
    },
    {
      path: '/managed/activities/:activityId/registrations',
      name: 'manage-registrations',
      component: () => import('../../features/managed/pages/ManagedRegistrationsPage.vue'),
      meta: { title: '报名管理', scope: 'registration' },
    },
    {
      path: '/managed/activities/:activityId/onsite',
      name: 'onsite',
      component: () => import('../../features/managed/pages/OnsitePage.vue'),
      meta: { title: '现场考勤工作台', scope: 'attendance' },
    },
    {
      path: '/managed/activities/:activityId/onsite/people',
      name: 'people',
      component: () => import('../../features/managed/pages/PeoplePage.vue'),
      meta: { title: '人员核验与异常', scope: 'attendance' },
    },
    {
      path: '/system/:reason',
      name: 'system',
      component: () => import('../../shared/components/SystemPage.vue'),
      meta: { title: '访问说明', public: true },
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../../shared/components/PrivacyPage.vue'),
      meta: { title: '演示隐私说明', public: true },
    },
    ...(__MOCK__
      ? [
          {
            path: '/dev/components',
            name: 'components',
            component: () => import('../../devtools/ComponentPreview.vue'),
            meta: { title: '本地组件预览', public: true },
          },
        ]
      : []),
    { path: '/:pathMatch(.*)*', redirect: '/system/not-found' },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.name === 'activities' && from.name === 'activity')
      return { top: Number(sessionStorage.getItem('srvf:ui:scroll') ?? 0) };
    return { top: 0 };
  },
});
router.beforeEach(async (to) => {
  if (!__MOCK__ && to.path !== '/system/not-configured' && to.path !== '/privacy')
    return '/system/not-configured';
  const auth = useAuth();
  await auth.restoreSession();
  if (to.name === 'login' && auth.ready) return safeTarget(to.query.returnTo);
  if (to.meta.public) return true;
  if (auth.state === 'unavailable') return '/system/unavailable';
  if (auth.state === 'blocked') return '/system/blocked';
  if (!auth.ready) return { name: 'login', query: { returnTo: safeTarget(to.path) } };
  try {
    await auth.ensureSession();
  } catch {
    return { name: 'login', query: { returnTo: safeTarget(to.path) } };
  }
  if (to.meta.managed && !auth.member?.managed) return '/system/forbidden';
  if (to.meta.scope) {
    try {
      const scope = await getData().managed.getScope(String(to.params.activityId));
      if (scope[to.meta.scope as 'registration' | 'attendance'].state !== 'allowed')
        return '/system/forbidden';
    } catch {
      return '/system/unavailable';
    }
  }
  return true;
});
