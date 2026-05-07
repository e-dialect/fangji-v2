<template>
  <div class="container page">
    <h2 class="font-bold mb-6" style="font-size:1.5rem">📋 任务大厅</h2>

    <!-- Tabs -->
    <div class="flex gap-3 mb-6" style="border-bottom:1px solid var(--gray-200);padding-bottom:.75rem">
      <button
        v-for="tab in tabs" :key="tab.key"
        class="btn btn-sm"
        :class="activeTab === tab.key ? 'btn-primary' : 'btn-secondary'"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <!-- All pending tasks -->
    <div v-if="activeTab === 'all'">
      <div v-if="claimLimitReached" class="alert alert-error mb-3">
        当前已接取 {{ myActiveClaimedCount }} / {{ MAX_ACTIVE_TASKS }} 个任务，请先完成部分任务后再继续认领。
      </div>
      <div v-if="error" class="alert alert-error mb-3">{{ error }}</div>
      <div v-if="loading" class="text-muted">加载中...</div>
      <div v-else-if="pendingPages.length === 0" class="empty-state">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-text">暂无待校对任务</div>
      </div>
      <div v-else class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>PDF页码</th>
                <th>任务序号</th>
                <th>所属项目</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pg in pendingPages" :key="pg.id">
                <td>{{ formatPdfPage(pg) }}</td>
                <td>第 {{ pg.page_number }} 条</td>
                <td class="text-sm">{{ pg.expand?.project?.name || pg.project }}</td>
                <td><span class="badge badge-pending">待校对</span></td>
                <td>
                  <button class="btn btn-primary btn-sm" @click="claimTask(pg)" :disabled="claiming === pg.id || claimLimitReached">
                    {{ claiming === pg.id ? '认领中...' : '认领任务' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="pendingTotalPages > 1" class="flex gap-2 mt-3 items-center">
          <button class="btn btn-secondary btn-sm" :disabled="pendingPage <= 1" @click="changePendingPage(pendingPage - 1)">上一页</button>
          <span class="text-sm text-muted">第 {{ pendingPage }} / {{ pendingTotalPages }} 页</span>
          <button class="btn btn-secondary btn-sm" :disabled="pendingPage >= pendingTotalPages" @click="changePendingPage(pendingPage + 1)">下一页</button>
        </div>
      </div>
    </div>

    <!-- My claimed tasks -->
    <div v-if="activeTab === 'mine'">
      <div v-if="error" class="alert alert-error mb-3">{{ error }}</div>
      <div v-if="loading" class="text-muted">加载中...</div>
      <div v-else-if="myPages.length === 0" class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">暂无已认领的任务</div>
      </div>
      <div v-else class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>PDF页码</th>
                <th>任务序号</th>
                <th>所属项目</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pg in myPages" :key="pg.id">
                <td>{{ formatPdfPage(pg) }}</td>
                <td>第 {{ pg.page_number }} 条</td>
                <td class="text-sm">{{ pg.expand?.project?.name || pg.project }}</td>
                <td><span :class="`badge badge-${pg.status}`">{{ statusLabel(pg.status) }}</span></td>
                <td>
                  <RouterLink
                    v-if="canEditProofreadTask(pg)"
                    :to="`/tasks/${pg.id}/edit`"
                    class="btn btn-primary btn-sm"
                  >进入校对</RouterLink>
                  <span v-else class="text-sm text-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="myTotalPages > 1" class="flex gap-2 mt-3 items-center">
          <button class="btn btn-secondary btn-sm" :disabled="myPage <= 1" @click="changeMyPage(myPage - 1)">上一页</button>
          <span class="text-sm text-muted">第 {{ myPage }} / {{ myTotalPages }} 页</span>
          <button class="btn btn-secondary btn-sm" :disabled="myPage >= myTotalPages" @click="changeMyPage(myPage + 1)">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { currentUserId } from '@/services/authService'
import {
  claimProofreadTask,
  countActiveProofreaderTasks,
  listPendingProofreadTasks,
  listProofreaderTasks
} from '@/services/pagesService'
import { MAX_ACTIVE_TASKS, PROOFREADER_ACTIVE_STATUSES, statusLabel } from '@/constants/pageStatus'
import { formatClaimConflict, formatPbError } from '@/utils/pbErrors'

const auth = useAuthStore()
const loading = ref(true)
const claiming = ref(null)
const error = ref('')
const activeTab = ref('all')
const tabs = [
  { key: 'all', label: '全部待校对任务' },
  { key: 'mine', label: '我的任务' }
]

const pendingPages = ref([])
const myPages = ref([])
const pendingPage = ref(1)
const pendingTotalPages = ref(1)
const myPage = ref(1)
const myTotalPages = ref(1)
const PAGE_SIZE = 50
const myActiveClaimedCount = ref(0)
const claimLimitReached = ref(false)

onMounted(async () => {
  await loadTasks()
})

async function loadTasks() {
  loading.value = true
  error.value = ''
  try {
    const userId = currentUserId(auth.user)

    const pendingPromise = listPendingProofreadTasks(pendingPage.value, PAGE_SIZE)

    const minePromise = userId
      ? listProofreaderTasks(userId, myPage.value, PAGE_SIZE)
      : Promise.resolve({ items: [], totalPages: 1 })

    const activeCountPromise = userId
      ? countActiveProofreaderTasks(userId)
      : Promise.resolve(0)

    const [pendingResult, mineResult, activeCountResult] = await Promise.allSettled([pendingPromise, minePromise, activeCountPromise])

    if (pendingResult.status === 'fulfilled') {
      pendingPages.value = pendingResult.value.items
      pendingTotalPages.value = pendingResult.value.totalPages
    } else {
      pendingPages.value = []
      pendingTotalPages.value = 1
      error.value = formatPbError('加载待校对任务失败', pendingResult.reason)
    }

    if (mineResult.status === 'fulfilled') {
      myPages.value = mineResult.value.items
      myTotalPages.value = mineResult.value.totalPages
    } else {
      myPages.value = []
      myTotalPages.value = 1
      if (!error.value) {
        error.value = formatPbError('加载我的任务失败', mineResult.reason)
      }
    }

    if (activeCountResult.status === 'fulfilled') {
      myActiveClaimedCount.value = Number(activeCountResult.value || 0)
      claimLimitReached.value = myActiveClaimedCount.value >= MAX_ACTIVE_TASKS
    } else {
      myActiveClaimedCount.value = 0
      claimLimitReached.value = false
    }
  } catch (e) {
    error.value = formatPbError('加载任务失败', e)
  } finally {
    loading.value = false
  }
}

async function changePendingPage(p) {
  pendingPage.value = p
  await loadTasks()
}

async function changeMyPage(p) {
  myPage.value = p
  await loadTasks()
}

async function claimTask(page) {
  if (claimLimitReached.value) {
    error.value = `最多只能同时接取 ${MAX_ACTIVE_TASKS} 个任务，请先完成已有任务`
    return
  }
  claiming.value = page.id
  error.value = ''
  try {
    const userId = currentUserId(auth.user)
    if (!userId) {
      throw new Error('登录状态已失效，请重新登录')
    }

    await claimProofreadTask(page.id, userId)
    await loadTasks()
  } catch (e) {
    error.value = `认领失败：${formatClaimConflict(e, '该任务可能已被其他校对员认领，请刷新后重试')}`
    await loadTasks()
  } finally {
    claiming.value = null
  }
}

function canEditProofreadTask(page) {
  return PROOFREADER_ACTIVE_STATUSES.includes(page?.status)
}

function formatPdfPage(page) {
  const pageNo = Number(page?.pdf_page)
  if (Number.isInteger(pageNo) && pageNo > 0) return `第 ${pageNo} 页`
  return '未设置'
}
</script>
