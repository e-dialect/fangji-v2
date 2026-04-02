import { createRouter, createWebHistory } from 'vue-router'
import pb from '@/lib/pocketbase'

// 获取当前登录状态（直接读 PocketBase，避免时序问题）
function getAuthState() {
  const isLoggedIn = pb.authStore.isValid
  const role = pb.authStore.model?.role || null

  return {
    isLoggedIn,
    role,
    isAdmin: role === 'admin',
    isProofreader: role === 'proofreader',
    isReviewer: role === 'reviewer'
  }
}

// 登录后该去哪里
function getHomePath() {
  const auth = getAuthState()

  if (!auth.isLoggedIn) return '/login'
  if (auth.isAdmin) return '/admin'
  if (auth.isProofreader) return '/tasks'
  if (auth.isReviewer) return '/review'
  return '/login'
}

const routes = [
  {
    path: '/',
    redirect: () => getHomePath()
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

// ✅ 修复核心：直接用 pb.authStore 判断（不是 store）
router.beforeEach((to) => {
  const auth = getAuthState()

  if (to.meta.guest && auth.isLoggedIn) {
    return getHomePath()
  }

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return `/login?redirect=${encodeURIComponent(to.fullPath)}`
  }

  if (to.meta.role && auth.role !== to.meta.role) {
    return getHomePath()
  }
})

export default router