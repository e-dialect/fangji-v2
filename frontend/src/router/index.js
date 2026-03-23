import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/',
    redirect: () => {
      const auth = useAuthStore()
      if (!auth.isLoggedIn) return '/login'
      if (auth.isAdmin) return '/admin'
      if (auth.isProofreader) return '/tasks'
      if (auth.isReviewer) return '/review'
      return '/login'
    }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { guest: true }
  },
  // Admin routes
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { requiresAuth: true, role: 'admin' },
    children: [
      {
        path: '',
        name: 'AdminDashboard',
        component: () => import('@/views/admin/DashboardView.vue')
      },
      {
        path: 'projects/new',
        name: 'NewProject',
        component: () => import('@/views/admin/NewProjectView.vue')
      },
      {
        path: 'projects/:id',
        name: 'ProjectDetail',
        component: () => import('@/views/admin/ProjectDetailView.vue')
      }
    ]
  },
  // Proofreader routes
  {
    path: '/tasks',
    component: () => import('@/views/proofreader/ProofreaderLayout.vue'),
    meta: { requiresAuth: true, role: 'proofreader' },
    children: [
      {
        path: '',
        name: 'TaskHall',
        component: () => import('@/views/proofreader/TaskHallView.vue')
      },
      {
        path: ':id/edit',
        name: 'ProofreadEditor',
        component: () => import('@/views/proofreader/ProofreadEditorView.vue')
      }
    ]
  },
  // Reviewer routes
  {
    path: '/review',
    component: () => import('@/views/reviewer/ReviewerLayout.vue'),
    meta: { requiresAuth: true, role: 'reviewer' },
    children: [
      {
        path: '',
        name: 'ReviewHall',
        component: () => import('@/views/reviewer/ReviewHallView.vue')
      },
      {
        path: ':id',
        name: 'ReviewEditor',
        component: () => import('@/views/reviewer/ReviewEditorView.vue')
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()

  if (to.meta.guest && auth.isLoggedIn) {
    if (auth.isAdmin) return next('/admin')
    if (auth.isProofreader) return next('/tasks')
    if (auth.isReviewer) return next('/review')
    return next('/')
  }

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return next('/login')
  }

  if (to.meta.role && auth.role !== to.meta.role) {
    if (!auth.isLoggedIn) return next('/login')
    if (auth.isAdmin) return next('/admin')
    if (auth.isProofreader) return next('/tasks')
    if (auth.isReviewer) return next('/review')
    return next('/login')
  }

  next()
})

export default router
