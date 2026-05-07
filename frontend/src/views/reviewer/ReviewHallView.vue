<template>
  <div class="container page">
    <h2 class="font-bold mb-6" style="font-size:1.5rem">🔍 审核大厅</h2>

    <!-- Tabs -->
    <div class="flex gap-3 mb-6" style="border-bottom:1px solid var(--gray-200);padding-bottom:.75rem">
      <button
        v-for="tab in tabs" :key="tab.key"
        class="btn btn-sm"
        :class="activeTab === tab.key ? 'btn-primary' : 'btn-secondary'"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <!-- All proofread tasks waiting for review -->
    <div v-if="activeTab === 'all'">
      <div v-if="reviewLimitReached" class="alert alert-error mb-3">
        当前已接取 {{ myActiveReviewingCount }} / {{ MAX_ACTIVE_TASKS }} 个审核任务，请先完成部分任务后再继续接取。
      </div>
      <div v-if="error" class="alert alert-error mb-3">{{ error }}</div>
      <div v-if="loading" class="text-muted">加载中...</div>
      <div v-else-if="pendingReview.length === 0" class="empty-state">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-text">暂无待审核任务</div>
      </div>
      <div v-else class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>PDF页码</th>
                <th>任务序号</th>
                <th>所属项目</th>
                <th>校对员</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pg in pendingReview" :key="pg.id">
                <td>{{ formatPdfPage(pg) }}</td>
                <td>第 {{ pg.page_number }} 条</td>
                <td class="text-sm">{{ pg.expand?.project?.name || pg.project }}</td>
                <td class="text-sm text-muted">{{ pg.expand?.proofreader?.name || '—' }}</td>
                <td><span class="badge badge-proofread">待审核</span></td>
                <td>
                  <RouterLink
                    v-if="!reviewLimitReached"
                    :to="`/review/${pg.id}`"
                    class="btn btn-primary btn-sm"
                  >开始审核</RouterLink>
                  <span v-else class="text-sm text-muted">已达上限</span>
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

    <!-- My reviewed tasks -->
    <div v-if="activeTab === 'mine'">
      <div v-if="error" class="alert alert-error mb-3">{{ error }}</div>
      <div v-if="loading" class="text-muted">加载中...</div>
      <div v-else-if="myReviewed.length === 0" class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">暂无审核过的任务</div>
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
              <tr v-for="pg in myReviewed" :key="pg.id">
                <td>{{ formatPdfPage(pg) }}</td>
                <td>第 {{ pg.page_number }} 条</td>
                <td class="text-sm">{{ pg.expand?.project?.name || pg.project }}</td>
                <td><span :class="`badge badge-${pg.status}`">{{ statusLabel(pg.status) }}</span></td>
                <td>
                  <RouterLink :to="`/review/${pg.id}`" class="btn btn-secondary btn-sm">查看</RouterLink>
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
  countActiveReviewerTasks,
  listPendingReviewTasks,
  listReviewerTasks
} from '@/services/pagesService'
import { MAX_ACTIVE_TASKS, statusLabel } from '@/constants/pageStatus'
import { formatPbError } from '@/utils/pbErrors'

const auth = useAuthStore()
const loading = ref(true)
const error = ref('')
const activeTab = ref('all')
const tabs = [
  { key: 'all', label: '全部待审核任务' },
  { key: 'mine', label: '我审核过的' }
]

const pendingReview = ref([])
const myReviewed = ref([])
const pendingPage = ref(1)
const pendingTotalPages = ref(1)
const myPage = ref(1)
const myTotalPages = ref(1)
const PAGE_SIZE = 50
const myActiveReviewingCount = ref(0)
const reviewLimitReached = ref(false)

onMounted(async () => {
  await loadTasks()
})

async function loadTasks() {
  loading.value = true
  error.value = ''
  try {
    const userId = currentUserId(auth.user)

    const pendingPromise = listPendingReviewTasks(pendingPage.value, PAGE_SIZE)

    const minePromise = userId
      ? listReviewerTasks(userId, myPage.value, PAGE_SIZE)
      : Promise.resolve({ items: [], totalPages: 1 })

    const activeReviewingPromise = userId
      ? countActiveReviewerTasks(userId)
      : Promise.resolve(0)

    const [pendingResult, mineResult, activeReviewingResult] = await Promise.allSettled([pendingPromise, minePromise, activeReviewingPromise])

    if (pendingResult.status === 'fulfilled') {
      pendingReview.value = pendingResult.value.items
      pendingTotalPages.value = pendingResult.value.totalPages
    } else {
      pendingReview.value = []
      pendingTotalPages.value = 1
      error.value = formatPbError('加载待审核任务失败', pendingResult.reason)
    }

    if (mineResult.status === 'fulfilled') {
      myReviewed.value = mineResult.value.items
      myTotalPages.value = mineResult.value.totalPages
    } else {
      myReviewed.value = []
      myTotalPages.value = 1
      if (!error.value) {
        error.value = formatPbError('加载我的审核任务失败', mineResult.reason)
      }
    }

    if (activeReviewingResult.status === 'fulfilled') {
      myActiveReviewingCount.value = Number(activeReviewingResult.value || 0)
      reviewLimitReached.value = myActiveReviewingCount.value >= MAX_ACTIVE_TASKS
    } else {
      myActiveReviewingCount.value = 0
      reviewLimitReached.value = false
    }
  } catch (e) {
    error.value = formatPbError('加载审核任务失败', e)
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

function formatPdfPage(page) {
  const pageNo = Number(page?.pdf_page)
  if (Number.isInteger(pageNo) && pageNo > 0) return `第 ${pageNo} 页`
  return '未设置'
}
</script>
