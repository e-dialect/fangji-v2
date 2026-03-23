<template>
  <div class="container page">
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-bold" style="font-size:1.5rem">管理员控制台</h2>
      <RouterLink to="/admin/projects/new" class="btn btn-primary">＋ 创建新项目</RouterLink>
    </div>

    <!-- Stats -->
    <div class="grid-3 mb-6">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总项目数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.pages }}</div>
        <div class="stat-label">总页面数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.approved }}</div>
        <div class="stat-label">已审核通过</div>
      </div>
    </div>

    <!-- Projects list -->
    <div class="card">
      <div class="card-title">我的项目</div>
      <div v-if="loading" class="text-muted text-sm">加载中...</div>
      <div v-else-if="projects.length === 0" class="empty-state">
        <div class="empty-state-icon">📂</div>
        <div class="empty-state-text">暂无项目，点击右上角创建第一个项目</div>
      </div>
      <div v-else class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>项目名称</th>
              <th>简介</th>
              <th>页面总数</th>
              <th>进度</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in projects" :key="p.id">
              <td>
                <RouterLink :to="`/admin/projects/${p.id}`" class="font-semibold">{{ p.name }}</RouterLink>
              </td>
              <td class="text-muted text-sm">{{ p.description || '—' }}</td>
              <td>{{ pageCountByProject[p.id] ?? '—' }}</td>
              <td style="min-width:150px">
                <div class="progress" style="margin-bottom:.25rem">
                  <div class="progress-bar" :style="{ width: progressPct(p.id) + '%' }"></div>
                </div>
                <span class="text-sm text-muted">{{ progressPct(p.id) }}% 已审核</span>
              </td>
              <td class="text-sm text-muted">{{ formatDate(p.created) }}</td>
              <td>
                <RouterLink :to="`/admin/projects/${p.id}`" class="btn btn-secondary btn-sm">详情</RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import pb from '@/lib/pocketbase'

const projects = ref([])
const loading = ref(true)
const pageCountByProject = ref({})
const approvedByProject = ref({})

const stats = ref({ total: 0, pages: 0, approved: 0 })

onMounted(async () => {
  try {
    const list = await pb.collection('projects').getFullList({ sort: '-created' })
    projects.value = list
    stats.value.total = list.length

    // Fetch page counts for all projects in parallel to avoid N+1 queries
    await Promise.all(list.map(async (p) => {
      const [allPages, approvedPages] = await Promise.all([
        pb.collection('pages').getList(1, 1, {
          filter: `project="${p.id}"`,
          skipTotal: false
        }),
        pb.collection('pages').getList(1, 1, {
          filter: `project="${p.id}" && status="approved"`,
          skipTotal: false
        })
      ])
      pageCountByProject.value[p.id] = allPages.totalItems
      approvedByProject.value[p.id] = approvedPages.totalItems
    }))

    stats.value.pages = Object.values(pageCountByProject.value).reduce((a, b) => a + b, 0)
    stats.value.approved = Object.values(approvedByProject.value).reduce((a, b) => a + b, 0)
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})

function progressPct(projectId) {
  const total = pageCountByProject.value[projectId] || 0
  const approved = approvedByProject.value[projectId] || 0
  if (!total) return 0
  return Math.round((approved / total) * 100)
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('zh-CN') : ''
}
</script>
