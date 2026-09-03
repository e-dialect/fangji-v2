<template>
  <div class="container page">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="font-bold" style="font-size:1.5rem">个人主页</h2>
        <p class="text-sm text-muted mt-1">查看你的校对参与情况与当前排行</p>
      </div>
      <button class="btn btn-secondary btn-sm" @click="loadStats" :disabled="loading">
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </div>

    <div v-if="error" class="alert alert-error mb-4">{{ error }}</div>
    <div v-if="loading" class="text-muted">加载中...</div>

    <template v-else>
      <section class="profile-hero mb-6">
        <div>
          <div class="text-sm text-muted">账户名称</div>
          <div class="profile-name">{{ displayName }}</div>
        </div>
        <div class="profile-rank">
          <span>一致率排行</span>
          <strong>{{ rankLabel(stats.accuracyRank) }}</strong>
        </div>
        <div class="profile-rank">
          <span>条目排行</span>
          <strong>{{ rankLabel(stats.proofreadRank) }}</strong>
        </div>
      </section>

      <section class="profile-stats">
        <div class="stat-card">
          <div class="stat-value">{{ stats.projectCount }}</div>
          <div class="stat-label">参加项目数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.proofreadCount }}</div>
          <div class="stat-label">已校对条目</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ accuracyLabel }}</div>
          <div class="stat-label">结果一致率</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.correctCount }}</div>
          <div class="stat-label">结果一致的校对次数</div>
        </div>
      </section>

      <section v-if="providers.length" class="card mt-6">
        <div class="card-title">统一身份绑定</div>
        <p class="profile-note mb-4">绑定后可以使用外部账号登录方辑。方辑不会同步外部账号的姓名、邮箱或密码。</p>
        <div class="identity-list">
          <div v-for="provider in providers" :key="provider.id" class="identity-card">
            <div class="identity-heading">
              <strong>{{ provider.name }}</strong>
              <span class="identity-state" :class="{ bound: provider.bound }">{{ provider.bound ? '已绑定' : '未绑定' }}</span>
            </div>
            <template v-if="!provider.bound">
              <div class="identity-fields">
                <input
                  v-model.trim="credentials[provider.id].identity"
                  class="form-control"
                  type="text"
                  :placeholder="`${provider.name}账号`"
                  autocomplete="username"
                  :disabled="bindingProvider === provider.id"
                />
                <input
                  v-model="credentials[provider.id].password"
                  class="form-control"
                  type="password"
                  placeholder="密码"
                  autocomplete="current-password"
                  :disabled="bindingProvider === provider.id"
                />
                <button
                  class="btn btn-primary"
                  :disabled="bindingProvider === provider.id || !canBind(provider.id)"
                  @click="bindProvider(provider)"
                >{{ bindingProvider === provider.id ? '验证中...' : '验证并绑定' }}</button>
              </div>
              <div v-if="bindingError[provider.id]" class="alert alert-error mt-3">{{ bindingError[provider.id] }}</div>
            </template>
          </div>
        </div>
      </section>

      <div class="card mt-6">
        <div class="card-title">排行说明</div>
        <div class="profile-note">
          一致率按已完成系统比对的校对尝试计算；仍在等待其他独立结果的提交暂不进入分母。不一致记录会永久保留并计入统计。
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { bindExternalIdentity, currentUserId, listExternalProviders } from '@/services/authService'
import { getProofreaderProfileStats } from '@/services/proofreaderStatsService'
import { formatPbError } from '@/utils/pbErrors'

const auth = useAuthStore()
const loading = ref(true)
const error = ref('')
const providers = ref([])
const credentials = reactive({})
const bindingProvider = ref('')
const bindingError = reactive({})
const stats = ref({
  projectCount: 0,
  proofreadCount: 0,
  correctCount: 0,
  accuracy: 0,
  accuracyRank: null,
  proofreadRank: null
})

const displayName = computed(() => auth.user?.name || auth.user?.email || auth.user?.username || '校对员')
const accuracyLabel = computed(() => `${stats.value.accuracy}%`)

onMounted(async () => {
  await Promise.all([loadStats(), loadProviders()])
})

async function loadProviders() {
  try {
    providers.value = await listExternalProviders()
    for (const provider of providers.value) {
      credentials[provider.id] ||= { identity: '', password: '' }
      bindingError[provider.id] = ''
    }
  } catch {
    providers.value = []
  }
}

function canBind(providerId) {
  const entry = credentials[providerId]
  return Boolean(entry?.identity?.trim() && entry?.password)
}

async function bindProvider(provider) {
  if (!canBind(provider.id) || bindingProvider.value) return
  bindingProvider.value = provider.id
  bindingError[provider.id] = ''
  try {
    const entry = credentials[provider.id]
    await bindExternalIdentity(provider.id, entry.identity.trim(), entry.password)
    entry.identity = ''
    entry.password = ''
    provider.bound = true
  } catch (e) {
    bindingError[provider.id] = e?.response?.message || '绑定失败，请检查外部账号和密码'
  } finally {
    bindingProvider.value = ''
  }
}

async function loadStats() {
  loading.value = true
  error.value = ''
  try {
    const userId = currentUserId(auth.user)
    if (!userId) throw new Error('登录状态已失效，请重新登录')
    stats.value = await getProofreaderProfileStats(userId)
  } catch (e) {
    error.value = formatPbError('加载个人主页失败', e)
  } finally {
    loading.value = false
  }
}

function rankLabel(rank) {
  return rank ? `第 ${rank} 名` : '暂无'
}
</script>

<style scoped>
.profile-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 1rem;
  align-items: center;
  background: #fff;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.5rem;
}

.profile-name {
  margin-top: .35rem;
  font-size: 1.7rem;
  font-weight: 700;
  color: var(--gray-900);
  overflow-wrap: anywhere;
}

.profile-rank {
  min-width: 130px;
  padding: .85rem 1rem;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius);
  background: var(--gray-50);
}

.profile-rank span {
  display: block;
  font-size: .82rem;
  color: var(--gray-500);
  margin-bottom: .25rem;
}

.profile-rank strong {
  font-size: 1.15rem;
  color: var(--primary);
}

.profile-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.profile-note {
  color: var(--gray-600);
  line-height: 1.7;
}

.identity-list {
  display: grid;
  gap: 1rem;
}

.identity-card {
  padding: 1rem;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius);
  background: var(--gray-50);
}

.identity-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.identity-state {
  padding: .2rem .55rem;
  border-radius: 999px;
  color: var(--gray-600);
  background: var(--gray-200);
  font-size: .78rem;
}

.identity-state.bound {
  color: #166534;
  background: #dcfce7;
}

.identity-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: .75rem;
  margin-top: 1rem;
}

@media (max-width: 900px) {
  .profile-hero,
  .profile-stats {
    grid-template-columns: 1fr;
  }

  .identity-fields {
    grid-template-columns: 1fr;
  }
}
</style>
