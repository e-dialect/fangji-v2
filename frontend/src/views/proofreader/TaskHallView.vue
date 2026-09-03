<template>
  <main class="container page workspace-page">
    <header class="page-heading">
      <div>
        <div class="page-eyebrow">校对工作台</div>
        <h1>从最需要你的项目开始</h1>
        <p>进行中的任务排在最前；领取前会标明本次是一校还是二校。</p>
      </div>
      <button class="btn btn-secondary" @click="loadProjects" :disabled="loading">
        <span aria-hidden="true">↻</span>
        {{ loading ? '正在刷新' : '刷新项目' }}
      </button>
    </header>

    <div v-if="error" class="alert alert-error" role="alert">
      <strong>项目暂时无法加载。</strong>
      <span>{{ error }}</span>
    </div>

    <section class="workspace-summary" aria-label="我的校对概况">
      <article class="workspace-stat workspace-stat--accent">
        <span>正在处理</span>
        <strong>{{ queueSummary.activeProjects }}</strong>
        <small>个项目有我的未提交任务</small>
      </article>
      <article class="workspace-stat">
        <span>现在可领取</span>
        <strong>{{ queueSummary.availableProjects }}</strong>
        <small>个项目有适合我的下一条</small>
      </article>
      <article class="workspace-stat">
        <span>整体已完成</span>
        <strong>{{ queueSummary.completedItems }}<em>/{{ queueSummary.totalItems }}</em></strong>
        <small>条已通过双校或仲裁</small>
      </article>
    </section>

    <section aria-labelledby="project-list-title">
      <div class="section-heading">
        <div>
          <h2 id="project-list-title">项目队列</h2>
          <p>系统会保留本地草稿；完成提交后自动领取同项目下一条。</p>
        </div>
        <span v-if="!loading" class="section-count">{{ projectQueues.length }} 个项目</span>
      </div>

      <div v-if="loading" class="project-card-grid" aria-label="正在加载项目">
        <div v-for="index in 3" :key="index" class="project-work-card skeleton-card" aria-hidden="true">
          <span class="skeleton-line skeleton-line--short"></span>
          <span class="skeleton-line"></span>
          <span class="skeleton-line"></span>
        </div>
      </div>

      <div v-else-if="projectQueues.length === 0" class="empty-state card">
        <div class="empty-state-mark" aria-hidden="true">✓</div>
        <div class="empty-state-text">当前没有需要你处理的项目</div>
        <p>可能是所有条目已经完成，或二校正在等待另一位校对员。</p>
      </div>

      <div v-else class="project-card-grid">
        <article
          v-for="queue in projectQueues"
          :key="queue.project.id"
          class="project-work-card"
          :class="`project-work-card--${queueAction(queue).tone}`"
        >
          <header class="project-work-card__header">
            <div>
              <span class="work-state" :class="`work-state--${queueAction(queue).tone}`">
                {{ queueAction(queue).label }}
              </span>
              <h3>{{ queue.project.name }}</h3>
            </div>
            <span class="project-progress-number">{{ progressPct(queue) }}%</span>
          </header>

          <p class="project-description">
            {{ queue.project.description || '该项目暂未填写简介。' }}
          </p>

          <div class="progress project-progress" role="progressbar" :aria-valuenow="progressPct(queue)" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar" :style="{ width: progressPct(queue) + '%' }"></div>
          </div>

          <dl class="queue-metrics">
            <div>
              <dt>一校待领</dt>
              <dd>{{ queue.firstPassPending }}</dd>
            </div>
            <div>
              <dt>二校待领</dt>
              <dd>{{ queue.secondPassPending }}</dd>
            </div>
            <div>
              <dt>我的进行中</dt>
              <dd>{{ queue.activeMine }}</dd>
            </div>
            <div>
              <dt>完成</dt>
              <dd>{{ queue.completed }} / {{ queue.total }}</dd>
            </div>
          </dl>

          <footer class="project-work-card__footer">
            <span>{{ queueAction(queue).detail }}</span>
            <button
              class="btn"
              :class="queueAction(queue).tone === 'active' ? 'btn-success' : 'btn-primary'"
              :disabled="claimingProject === queue.project.id || !queueAction(queue).canEnter"
              @click="enterProject(queue)"
            >
              {{ claimingProject === queue.project.id ? '正在打开…' : queueAction(queue).label }}
              <span v-if="queueAction(queue).canEnter" aria-hidden="true">→</span>
            </button>
          </footer>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { currentUserId } from '@/services/authService'
import { claimNextProjectPage, listProjectQueueSummaries } from '@/services/pagesService'
import { getProofreaderQueueAction, summarizeProofreaderQueues } from '@/lib/workspaceInsights'
import { formatClaimConflict, formatPbError } from '@/utils/pbErrors'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)
const claimingProject = ref('')
const error = ref('')
const projectQueues = ref([])
const queueSummary = computed(() => summarizeProofreaderQueues(projectQueues.value))

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
  if (!projectId || claimingProject.value || !queueAction(queue).canEnter) return
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

function queueAction(queue) {
  return getProofreaderQueueAction(queue)
}

function progressPct(queue) {
  if (!queue?.total) return 0
  return Math.round((queue.completed / queue.total) * 100)
}
</script>
