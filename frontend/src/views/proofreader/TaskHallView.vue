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
                <th>页码</th>
                <th>所属项目</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pg in pendingPages" :key="pg.id">
                <td>第 {{ pg.page_number }} 页</td>
                <td class="text-sm">{{ pg.expand?.project?.name || pg.project }}</td>
                <td><span class="badge badge-pending">待校对</span></td>
                <td>
                  <button class="btn btn-primary btn-sm" @click="claimTask(pg)" :disabled="claiming === pg.id">
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
                <th>页码</th>
                <th>所属项目</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pg in myPages" :key="pg.id">
                <td>第 {{ pg.page_number }} 页</td>
                <td class="text-sm">{{ pg.expand?.project?.name || pg.project }}</td>
                <td><span :class="`badge badge-${pg.status}`">{{ statusLabel(pg.status) }}</span></td>
                <td>
                  <RouterLink
                    v-if="['claimed', 'proofreading', 'rejected'].includes(pg.status)"
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
import pb from '@/lib/pocketbase'
import { useAuthStore } from '@/stores/auth'

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

onMounted(async () => {
  await loadTasks()
})

async function loadTasks() {
  loading.value = true
  error.value = ''
  try {
    const userId = pb.authStore.model?.id || auth.user?.id || null

    const pendingPromise = fetchPageListWithFallback({
      page: pendingPage.value,
      perPage: PAGE_SIZE,
      filter: 'status="pending"',
      sort: 'page_number',
      expand: 'project'
    })

    const minePromise = userId
      ? fetchPageListWithFallback({
          page: myPage.value,
          perPage: PAGE_SIZE,
          filter: `proofreader="${userId}"`,
          sort: '-updated',
          expand: 'project'
        })
      : Promise.resolve({ items: [], totalPages: 1 })

    const [pendingResult, mineResult] = await Promise.allSettled([pendingPromise, minePromise])

    if (pendingResult.status === 'fulfilled') {
      pendingPages.value = pendingResult.value.items
      pendingTotalPages.value = pendingResult.value.totalPages
    } else {
      pendingPages.value = []
      pendingTotalPages.value = 1
      error.value = formatLoadError('加载待校对任务失败', pendingResult.reason)
    }

    if (mineResult.status === 'fulfilled') {
      myPages.value = mineResult.value.items
      myTotalPages.value = mineResult.value.totalPages
    } else {
      myPages.value = []
      myTotalPages.value = 1
      if (!error.value) {
        error.value = formatLoadError('加载我的任务失败', mineResult.reason)
      }
    }
  } catch (e) {
    error.value = formatLoadError('加载任务失败', e)
  } finally {
    loading.value = false
  }
}

async function fetchPageListWithFallback(params) {
  try {
    return await pb.collection('pages').getList(params.page, params.perPage, {
      filter: params.filter,
      sort: params.sort,
      expand: params.expand,
      // Avoid PocketBase JS SDK auto-cancel when multiple list requests fire in parallel.
      requestKey: null
    })
  } catch (firstErr) {
    try {
      // Fallback: retry without relation expansion to avoid expand-related failures.
      return await pb.collection('pages').getList(params.page, params.perPage, {
        filter: params.filter,
        sort: params.sort,
        requestKey: null
      })
    } catch (secondErr) {
      throw secondErr || firstErr
    }
  }
}

function formatLoadError(prefix, err) {
  const status = err?.status || err?.response?.status
  const msg = err?.response?.message || err?.message || ''
  if (status) {
    return `${prefix}（${status}）：${msg || '请求失败'}`
  }
  return msg ? `${prefix}：${msg}` : `${prefix}，请稍后重试`
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
  claiming.value = page.id
  error.value = ''
  try {
    const userId = pb.authStore.model?.id || auth.user?.id
    if (!userId) {
      throw new Error('登录状态已失效，请重新登录')
    }

    await pb.collection('pages').update(page.id, {
      status: 'claimed',
      proofreader: userId
    }, {
      requestKey: null
    })
    await loadTasks()
  } catch (e) {
    error.value = '认领失败：' + (e?.response?.message || e.message)
    await loadTasks()
  } finally {
    claiming.value = null
  }
}

function statusLabel(s) {
  const map = { pending: '待校对', claimed: '已认领', proofreading: '校对中', proofread: '已提交待审核', reviewing: '审核中', approved: '已通过', rejected: '已打回' }
  return map[s] || s
}
</script>
