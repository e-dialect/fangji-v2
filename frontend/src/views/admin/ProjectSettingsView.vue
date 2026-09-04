<template>
  <main class="container page workspace-page">
    <header class="page-heading">
      <div>
        <RouterLink :to="`/admin/projects/${projectId}`" class="back-link">← 返回项目</RouterLink>
        <div class="page-eyebrow">项目配置</div>
        <h1>{{ project?.name || '项目设置' }}</h1>
        <p>访问方式影响新成员如何加入；已经加入的成员不会被自动移除。</p>
      </div>
    </header>
    <div v-if="error" class="alert alert-error">{{ error }}</div>
    <div v-if="success" class="alert alert-success">{{ success }}</div>
    <div v-if="loading" class="card text-muted">正在加载项目配置…</div>
    <template v-else-if="project">
      <section class="card project-settings-section mb-6">
        <div class="section-heading"><div><h2>项目与访问方式</h2><p>指定成员是默认且最严格的模式。</p></div></div>
        <form class="settings-form" @submit.prevent="saveSettings">
          <label class="form-group"><span class="form-label">项目名称</span><input v-model.trim="settings.name" class="form-control" required maxlength="500" /></label>
          <label class="form-group"><span class="form-label">项目简介</span><textarea v-model="settings.description" class="form-control" maxlength="2000"></textarea></label>
          <fieldset class="access-mode-grid">
            <legend class="form-label">新成员加入方式</legend>
            <label v-for="mode in accessModes" :key="mode.value" class="access-mode-option" :class="{ 'is-selected': settings.accessMode === mode.value }">
              <input v-model="settings.accessMode" type="radio" :value="mode.value" />
              <span><strong>{{ mode.label }}</strong><small>{{ mode.description }}</small></span>
            </label>
          </fieldset>
          <label v-if="settings.accessMode === 'password'" class="form-group">
            <span class="form-label">{{ project.access_mode === 'password' ? '更新项目口令（留空则保持不变）' : '设置项目口令' }}</span>
            <input v-model="settings.password" type="password" class="form-control" minlength="8" maxlength="72" autocomplete="new-password" placeholder="至少 8 个字符，UTF-8 编码最多 72 字节" />
          </label>
          <button class="btn btn-primary" :disabled="saving">{{ saving ? '保存中…' : '保存项目设置' }}</button>
        </form>
      </section>

      <section class="card project-settings-section mb-6">
        <div class="section-heading">
          <div><h2>项目成员</h2><p>同一成员在本项目内只能是管理员或校对员之一。</p></div>
          <span class="section-count">{{ members.length }} 人</span>
        </div>
        <form class="member-add-form" @submit.prevent="addMember">
          <select v-model="newMember.userId" class="form-control" required>
            <option value="">选择用户</option>
            <option v-for="candidate in availableCandidates" :key="candidate.id" :value="candidate.id">
              {{ candidate.name || candidate.username || candidate.email }} · {{ [candidate.username, candidate.email].filter(Boolean).join(' · ') }}
            </option>
          </select>
          <select v-model="newMember.role" class="form-control">
            <option value="proofreader">校对员</option>
            <option value="manager">项目管理员</option>
          </select>
          <button class="btn btn-primary" :disabled="savingMember">添加成员</button>
        </form>
        <div class="table-wrapper mt-3">
          <table>
            <thead><tr><th>成员</th><th>项目角色</th><th>加入方式</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="member in members" :key="member.id">
                <td><strong>{{ member.name || member.username || '未填写昵称' }}</strong><div class="text-sm text-muted">{{ [member.username, member.email].filter(Boolean).join(' · ') }}</div></td>
                <td>
                  <span v-if="member.role === 'owner'" class="badge badge-approved">所有者</span>
                  <select v-else :value="member.role" class="form-control member-role-select" @change="changeRole(member, $event.target.value)">
                    <option value="proofreader">校对员</option>
                    <option value="manager">项目管理员</option>
                  </select>
                </td>
                <td>{{ sourceLabel(member.source) }}</td>
                <td><button v-if="member.role !== 'owner'" class="btn btn-danger btn-sm" @click="removeMember(member)">移除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="project.capabilities.isOwner || project.capabilities.isPlatformAdmin" class="card project-settings-section danger-zone">
        <div class="section-heading"><div><h2>所有权与删除</h2><p>转移所有权后，你会保留为项目管理员；删除项目会释放创建额度。</p></div></div>
        <div class="danger-zone-actions">
          <div class="member-add-form">
            <select v-model="nextOwnerId" class="form-control">
              <option value="">选择新所有者</option>
              <option v-for="candidate in transferCandidates" :key="candidate.id" :value="candidate.id">{{ candidate.name || candidate.username || candidate.email }} · {{ [candidate.username, candidate.email].filter(Boolean).join(' · ') }}</option>
            </select>
            <button class="btn btn-secondary" :disabled="!nextOwnerId || transferring" @click="transferOwner">转移所有权</button>
          </div>
          <button class="btn btn-danger" :disabled="deleting" @click="removeProject">{{ deleting ? '删除中…' : '删除项目' }}</button>
        </div>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  deleteProject,
  getProject,
  listMemberCandidates,
  listProjectMembers,
  removeProjectMember,
  setProjectMember,
  transferProjectOwnership,
  updateProject
} from '@/services/projectsService'
import { useAuthStore } from '@/stores/auth'
import { getPbMessage } from '@/utils/pbErrors'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projectId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
const project = ref(null)
const members = ref([])
const candidates = ref([])
const loading = ref(true)
const saving = ref(false)
const savingMember = ref(false)
const transferring = ref(false)
const deleting = ref(false)
const error = ref('')
const success = ref('')
const nextOwnerId = ref('')
const settings = reactive({ name: '', description: '', accessMode: 'members_only', password: '' })
const newMember = reactive({ userId: '', role: 'proofreader' })
const accessModes = [
  { value: 'members_only', label: '指定成员', description: '只有所有者或项目管理员添加的用户可以进入。' },
  { value: 'public', label: '公开加入', description: '任意已登录用户可以直接成为校对员。' },
  { value: 'password', label: '口令加入', description: '验证项目口令后成为持久校对成员。' }
]
const memberIds = computed(() => new Set(members.value.map((item) => item.user)))
const availableCandidates = computed(() => candidates.value.filter((item) => !memberIds.value.has(item.id)))
const transferCandidates = computed(() => candidates.value.filter((item) => item.id !== project.value?.owner))

onMounted(load)

async function load() {
  loading.value = true
  error.value = ''
  try {
    project.value = await getProject(projectId)
    if (!project.value.capabilities.canManage) throw new Error('你没有管理该项目的权限。')
    settings.name = project.value.name
    settings.description = project.value.description || ''
    settings.accessMode = project.value.access_mode
    ;[members.value, candidates.value] = await Promise.all([
      listProjectMembers(projectId),
      listMemberCandidates(projectId)
    ])
  } catch (e) { error.value = getPbMessage(e, e.message || '项目配置加载失败。') }
  finally { loading.value = false }
}

async function saveSettings() {
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    project.value = await updateProject(projectId, {
      name: settings.name,
      description: settings.description,
      accessMode: settings.accessMode,
      password: settings.password
    })
    settings.password = ''
    success.value = '项目设置已保存，现有成员保持不变。'
  } catch (e) { error.value = getPbMessage(e, '项目设置保存失败。') }
  finally { saving.value = false }
}

async function addMember() {
  savingMember.value = true
  error.value = ''
  try {
    await setProjectMember(projectId, newMember.userId, newMember.role)
    newMember.userId = ''
    await reloadMembers()
    success.value = '成员已添加。'
  } catch (e) { error.value = getPbMessage(e, '成员添加失败。') }
  finally { savingMember.value = false }
}

async function changeRole(member, role) {
  error.value = ''
  try {
    await setProjectMember(projectId, member.user, role)
    await reloadMembers()
    success.value = '项目角色已更新。'
  } catch (e) { error.value = getPbMessage(e, '项目角色更新失败。') }
}

async function removeMember(member) {
  if (!window.confirm(`确定移除 ${member.name || member.email} 吗？`)) return
  error.value = ''
  try {
    await removeProjectMember(projectId, member.user)
    await reloadMembers()
    success.value = '成员已移除。'
  } catch (e) { error.value = getPbMessage(e, '成员移除失败。') }
}

async function reloadMembers() {
  members.value = await listProjectMembers(projectId)
  await auth.loadAccessContext({ force: true })
}

async function transferOwner() {
  if (!window.confirm('确定转移项目所有权吗？你将保留为项目管理员。')) return
  transferring.value = true
  error.value = ''
  try {
    await transferProjectOwnership(projectId, nextOwnerId.value)
    await auth.loadAccessContext({ force: true })
    await load()
    success.value = '项目所有权已转移。'
  } catch (e) { error.value = getPbMessage(e, '所有权转移失败。') }
  finally { transferring.value = false }
}

async function removeProject() {
  if (!window.confirm(`确定永久删除项目“${project.value.name}”及其全部材料吗？`)) return
  deleting.value = true
  error.value = ''
  try {
    await deleteProject(projectId)
    await auth.loadAccessContext({ force: true })
    await router.push('/admin')
  } catch (e) { error.value = getPbMessage(e, '项目删除失败。') }
  finally { deleting.value = false }
}

function sourceLabel(source) {
  return ({ assigned: '管理员指定', public: '公开加入', password: '口令加入' })[source] || '管理员指定'
}
</script>
