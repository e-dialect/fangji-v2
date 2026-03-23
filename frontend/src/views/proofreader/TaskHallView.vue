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
      </div>
    </div>

    <!-- My claimed tasks -->
    <div v-if="activeTab === 'mine'">
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
const activeTab = ref('all')
const tabs = [
  { key: 'all', label: '全部待校对任务' },
  { key: 'mine', label: '我的任务' }
]

const pendingPages = ref([])
const myPages = ref([])

onMounted(async () => {
  await loadTasks()
})

async function loadTasks() {
  loading.value = true
  try {
    const [pending, mine] = await Promise.all([
      pb.collection('pages').getFullList({
        filter: 'status="pending"',
        sort: 'page_number',
        expand: 'project'
      }),
      pb.collection('pages').getFullList({
        filter: `proofreader="${auth.user.id}"`,
        sort: '-updated',
        expand: 'project'
      })
    ])
    pendingPages.value = pending
    myPages.value = mine
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function claimTask(page) {
  claiming.value = page.id
  try {
    await pb.collection('pages').update(page.id, {
      status: 'claimed',
      proofreader: auth.user.id
    })
    await loadTasks()
  } catch (e) {
    alert('认领失败：' + (e?.response?.message || e.message))
  } finally {
    claiming.value = null
  }
}

function statusLabel(s) {
  const map = { pending: '待校对', claimed: '已认领', proofreading: '校对中', proofread: '已提交待审核', reviewing: '审核中', approved: '已通过', rejected: '已打回' }
  return map[s] || s
}
</script>
