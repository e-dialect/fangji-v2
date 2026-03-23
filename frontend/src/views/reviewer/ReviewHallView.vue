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
                <th>页码</th>
                <th>所属项目</th>
                <th>校对员</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pg in pendingReview" :key="pg.id">
                <td>第 {{ pg.page_number }} 页</td>
                <td class="text-sm">{{ pg.expand?.project?.name || pg.project }}</td>
                <td class="text-sm text-muted">{{ pg.expand?.proofreader?.name || '—' }}</td>
                <td><span class="badge badge-proofread">待审核</span></td>
                <td>
                  <RouterLink :to="`/review/${pg.id}`" class="btn btn-primary btn-sm">开始审核</RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- My reviewed tasks -->
    <div v-if="activeTab === 'mine'">
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
                <th>页码</th>
                <th>所属项目</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pg in myReviewed" :key="pg.id">
                <td>第 {{ pg.page_number }} 页</td>
                <td class="text-sm">{{ pg.expand?.project?.name || pg.project }}</td>
                <td><span :class="`badge badge-${pg.status}`">{{ statusLabel(pg.status) }}</span></td>
                <td>
                  <RouterLink :to="`/review/${pg.id}`" class="btn btn-secondary btn-sm">查看</RouterLink>
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
const activeTab = ref('all')
const tabs = [
  { key: 'all', label: '全部待审核任务' },
  { key: 'mine', label: '我审核过的' }
]

const pendingReview = ref([])
const myReviewed = ref([])

onMounted(async () => {
  await loadTasks()
})

async function loadTasks() {
  loading.value = true
  try {
    const [pending, mine] = await Promise.all([
      pb.collection('pages').getFullList({
        filter: 'status="proofread"',
        sort: 'page_number',
        expand: 'project,proofreader'
      }),
      pb.collection('pages').getFullList({
        filter: `reviewer="${auth.user.id}"`,
        sort: '-updated',
        expand: 'project'
      })
    ])
    pendingReview.value = pending
    myReviewed.value = mine
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function statusLabel(s) {
  const map = { approved: '已通过', rejected: '已打回', reviewing: '审核中' }
  return map[s] || s
}
</script>
