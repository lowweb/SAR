import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true }
  },
  {
    path: '/',
    name: 'Equipment',
    component: () => import('../views/EquipmentList.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/equipment/:id',
    name: 'EquipmentDetail',
    component: () => import('../views/EquipmentDetail.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/history',
    name: 'History',
    component: () => import('../views/MovementHistory.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/cartridges',
    name: 'Cartridges',
    component: () => import('../views/CartridgeList.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/cartridges/:id',
    name: 'CartridgeDetail',
    component: () => import('../views/CartridgeDetail.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/users',
    name: 'AdminUsers',
    component: () => import('../views/admin/UsersManager.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/departments',
    name: 'AdminDepartments',
    component: () => import('../views/admin/DepartmentsManager.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/types',
    name: 'AdminTypes',
    component: () => import('../views/admin/TypesManager.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/statuses',
    name: 'AdminStatuses',
    component: () => import('../views/admin/StatusesManager.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/notify',
    name: 'AdminNotify',
    component: () => import('../views/admin/NotifySettings.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/statuses-equipment',
    redirect: '/admin/statuses'
  },
  {
    path: '/admin/statuses-cartridge',
    redirect: '/admin/statuses'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return next('/login');
  }
  if (to.meta.guest && auth.isAuthenticated) {
    return next('/');
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return next('/');
  }
  next();
});

export default router;
