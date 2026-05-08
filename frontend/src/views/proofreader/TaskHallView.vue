<template>
  <div class="container page">
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-bold" style="font-size:1.5rem">项目大厅</h2>
      <button class="btn btn-secondary btn-sm" @click="loadProjects" :disabled="loading">
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </div>

    <div v-if="error" class="alert alert-error mb-3">{{ error }}</div>
    <div v-if="loading" class="text-muted">加载中...</div>
    <div v-else-if="projectQueues.length === 0" class="empty-state">
      <div class="empty-state-icon">✅</div>
      <div class="empty-state-text">暂无可校对项目</div>
    </div>
    <div v-else class="card">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>项目</th>
              <th>总条目</th>
              <th>待处理</th>
              <th>我的进行中</th>
              <th>已完成</th>
              <th>不一致退回</th>
              <th>进度</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="queue in projectQueues" :key="queue.project.id">
              <td>
                <div class="font-semibold">{{ queue.project.name }}</div>
                <div v-if="queue.project.description" class="text-sm text-muted" style="max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  {{ queue.project.description }}
                </div>
              </td>
              <td>{{ queue.total }}</td>
              <td>{{ pendingCount(queue) }}</td>
              <td>{{ queue.activeMine }}</td>
              <td>{{ queue.completed }}</td>
              <td>{{ queue.mismatchCount }}</td>
              <td style="min-width:140px">
                <div class="progress">
                  <div class="progress-bar" :style="{ width: progressPct(queue) + '%' }"></div>
                </div>
                <span class="text-sm text-muted">{{ progressPct(queue) }}%</span>
              </td>
              <td>
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="claimingProject === queue.project.id || !canEnterProject(queue)"
                  @click="enterProject(queue)"
                >
                  {{ buttonLabel(queue) }}
                </button>
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
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { currentUserId } from '@/services/authService'
import { claimNextProjectPage, listProjectQueueSummaries } from '@/services/pagesService'
import { formatClaimConflict, formatPbError } from '@/utils/pbErrors'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)
const claimingProject = ref('')
const error = ref('')
const projectQueues = ref([])

onMounted(async () => {
  await loadProjects()
})

async function loadProjects() {
  loading.value = true
  error.value = ''
  try {
    const userId = currentUserId(auth.user)
    if (!userId) throw new Error('登录状态已失效，请重新登录')
    projectQueues.value = await listProjectQueueSummaries(userId)
  } catch (e) {
    error.value = formatPbError('加载项目大厅失败', e)
    projectQueues.value = []
  } finally {
    loading.value = false
  }
}

async function enterProject(queue) {
  const projectId = queue?.project?.id
  if (!projectId || claimingProject.value) return
  claimingProject.value = projectId
  error.value = ''
  try {
    const userId = currentUserId(auth.user)
    if (!userId) throw new Error('登录状态已失效，请重新登录')
    const page = await claimNextProjectPage(projectId, userId)
    if (!page?.id) {
      error.value = '该项目暂无你可处理的条目。'
      await loadProjects()
      return
    }
    await router.push(`/tasks/${page.id}/edit`)
  } catch (e) {
    error.value = `进入项目失败：${formatClaimConflict(e, '该项目的下一条任务可能已被其他校对员接取，请刷新后重试')}`
    await loadProjects()
  } finally {
    claimingProject.value = ''
  }
}

function canEnterProject(queue) {
  return Boolean(queue?.activeMine || queue?.nextPage)
}

function buttonLabel(queue) {
  if (claimingProject.value === queue.project.id) return '处理中...'
  if (queue.activeMine) return '继续校对'
  if (queue.nextPage) return '接取项目'
  return '暂无可处理'
}

function progressPct(queue) {
  if (!queue?.total) return 0
  return Math.round((queue.completed / queue.total) * 100)
}

function pendingCount(queue) {
  return Number(queue?.firstPassPending || 0) + Number(queue?.secondPassPending || 0)
}
</script>
