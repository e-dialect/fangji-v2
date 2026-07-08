<template>
  <div class="editor-layout">
    <!-- Left panel: project PDF -->
    <div class="editor-panel">
      <div class="editor-panel-header">
        <span>📄 项目原始 PDF</span>
        <div class="flex gap-2">
          <button
            class="btn btn-secondary btn-sm"
            :disabled="currentPdfPage <= allowedPdfPages[0]"
            @click="switchPdfPage(-1)"
          >上一页</button>
          <button
            class="btn btn-secondary btn-sm"
            :disabled="currentPdfPage >= allowedPdfPages[1]"
            @click="switchPdfPage(1)"
          >下一页</button>
          <RouterLink to="/tasks" class="btn btn-secondary btn-sm">← 返回项目大厅</RouterLink>
        </div>
      </div>
      <div class="editor-panel-body" style="padding:0">
        <div v-if="loadingPage" class="text-muted">加载中...</div>
        <div v-else-if="!page" class="alert alert-error">页面不存在</div>
        <div v-else-if="pdfError" class="alert alert-error" style="margin:1rem">{{ pdfError }}</div>
        <template v-else>
          <div v-if="pdfPageWarning" class="alert alert-error" style="margin:1rem">{{ pdfPageWarning }}</div>
          <PdfSinglePageViewer
            v-if="pdfUrl"
            :src="pdfUrl"
            :page-number="currentPdfPage"
            :watermark-user-id="currentUserId"
          />
          <div v-else class="empty-state">
            <div class="empty-state-icon">📕</div>
            <div class="empty-state-text">暂无可预览的 PDF 文件</div>
          </div>
        </template>
      </div>
    </div>

    <!-- Right panel: editor + IPA keyboard -->
    <div class="editor-panel">
      <div class="editor-panel-header">
        <span>✏️ 校对编辑区</span>
        <div class="flex gap-2">
          <button
            class="btn btn-secondary btn-sm"
            @click="gotoPrevTask"
            :disabled="!hasNeighborTasks || saving || loadingPage"
          >上一条任务</button>
          <button
            class="btn btn-secondary btn-sm"
            @click="gotoNextTask"
            :disabled="!hasNeighborTasks || saving || loadingPage"
          >下一条任务</button>
          <button class="btn btn-success btn-sm" @click="submitProofread" :disabled="saving">
            {{ saving ? '提交中...' : '✓ 提交校对' }}
          </button>
        </div>
      </div>
      <div class="editor-panel-body">
        <div v-if="loadingPage" class="text-muted">加载中...</div>
        <div v-else-if="!page" class="text-muted">页面不存在</div>
        <template v-else>
          <div v-if="saved" class="alert alert-success mb-3">{{ saved }}</div>
          <div v-if="saveError" class="alert alert-error mb-3">{{ saveError }}</div>

          <label class="form-label">校对表格（按CSV栏目）</label>
          <div class="table-wrapper mb-3">
            <table>
              <tbody>
                <tr>
                  <th
                    v-for="header in rowHeaders"
                    :key="`h-${header}`"
                    class="text-sm font-semibold"
                    style="min-width:180px"
                  >{{ header }}</th>
                </tr>
                <tr>
                  <td
                    v-for="header in rowHeaders"
                    :key="`v-${header}`"
                    style="vertical-align:top;min-width:180px"
                  >
                    <textarea
                      v-model="editedRow[header]"
                      class="form-control"
                      style="min-height:84px;font-family:'Noto Sans', serif;font-size:.95rem;line-height:1.6"
                      @focus="activeField = header"
                      @input="onTextChange"
                      :placeholder="originalRow[header] || ''"
                    ></textarea>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <IpaKeyboard @insert="insertText" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import IpaKeyboard from '@/components/editor/IpaKeyboard.vue'
import PdfSinglePageViewer from '@/components/editor/PdfSinglePageViewer.vue'
import { useProjectPdf } from '@/composables/useProjectPdf'
import { useStructuredRow } from '@/composables/useStructuredRow'
import { useTaskNeighbors } from '@/composables/useTaskNeighbors'
import { PAGE_STATUS } from '@/constants/pageStatus'
import { currentUserId as getCurrentUserId } from '@/services/authService'
import {
  claimNextProjectPage,
  getPage,
  listProofreaderNeighborTasks,
  submitTwoPassProofread,
  updatePage
} from '@/services/pagesService'
import { formatClaimConflict, getPbMessage } from '@/utils/pbErrors'

const route = useRoute()
const router = useRouter()

const page = ref(null)
const loadingPage = ref(true)
const saving = ref(false)
const saved = ref('')
const saveError = ref('')
const initialRowJson = ref('')

const currentUserId = computed(() => getCurrentUserId() || '')
const hasUnsavedChanges = computed(() => {
  return Boolean(
    page.value &&
    !loadingPage.value &&
    !saving.value &&
    initialRowJson.value &&
    stringifyEditedRow() !== initialRowJson.value
  )
})
const {
  rowHeaders,
  originalRow,
  editedRow,
  activeField,
  editedText,
  hydrateForProofread,
  markChanged,
  insertText: insertIntoActiveField,
  stringifyEditedRow
} = useStructuredRow()

const {
  pdfError,
  currentPdfPage,
  pdfPageWarning,
  allowedPdfPages,
  pdfUrl,
  resetPdf,
  resolveProjectPdf,
  switchPdfPage,
  syncToBasePage
} = useProjectPdf(page)

const {
  prevTaskId,
  nextTaskId,
  hasNeighborTasks,
  resetNeighbors,
  loadNeighbors
} = useTaskNeighbors(page, async (currentPage) => {
  const userId = currentUserId.value
  if (!currentPage?.project || !userId) return []
  return listProofreaderNeighborTasks(currentPage.project, userId)
})

watch(() => route.params.id, async () => {
  await loadPage()
}, { immediate: true })

onBeforeRouteLeave(() => {
  if (!confirmDiscardChanges()) return false
})

onBeforeRouteUpdate((to, from) => {
  if (to.params.id !== from.params.id && !confirmDiscardChanges()) return false
})

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

async function loadPage() {
  loadingPage.value = true
  page.value = null
  resetNeighbors()
  resetPdf()
  saveError.value = ''
  saved.value = ''
  initialRowJson.value = ''

  try {
    page.value = await getPage(route.params.id, { expand: 'project_file' })
    syncToBasePage()
    hydrateForProofread(page.value)
    initialRowJson.value = stringifyEditedRow()
    await resolveProjectPdf()
    await loadNeighbors()
    if (page.value.status === PAGE_STATUS.CLAIMED) {
      await updatePage(page.value.id, { status: PAGE_STATUS.PROOFREADING })
      page.value.status = PAGE_STATUS.PROOFREADING
      await loadNeighbors()
    }
  } catch (e) {
    saveError.value = formatClaimConflict(e, '加载任务失败，请返回项目大厅刷新后重试')
  } finally {
    loadingPage.value = false
  }
}

function gotoPrevTask() {
  if (!prevTaskId.value) return
  router.push(`/tasks/${prevTaskId.value}/edit`)
}

function gotoNextTask() {
  if (!nextTaskId.value) return
  router.push(`/tasks/${nextTaskId.value}/edit`)
}

function onTextChange() {
  saved.value = ''
  saveError.value = ''
  markChanged()
}

function insertText(char) {
  insertIntoActiveField(char)
  onTextChange()
}

function confirmDiscardChanges() {
  if (!hasUnsavedChanges.value) return true
  return window.confirm('当前校对内容尚未提交，确定要离开吗？')
}

function handleBeforeUnload(event) {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

async function submitProofread() {
  saving.value = true
  saved.value = ''
  saveError.value = ''
  const projectId = page.value?.project
  const userId = currentUserId.value
  const rowJson = stringifyEditedRow()
  const text = editedText.value
  try {
    const result = await submitTwoPassProofread(page.value.id, userId, {
      rowJson,
      text
    })
    initialRowJson.value = rowJson
    page.value.status = result.status
    saved.value = result.status === PAGE_STATUS.APPROVED
      ? '该条目已完成。'
      : result.status === PAGE_STATUS.PENDING
        ? '该条目已退回任务池。'
        : '校对已提交。'

    try {
      const nextPage = await claimNextProjectPage(projectId, userId)
      if (nextPage?.id) {
        await router.push(`/tasks/${nextPage.id}/edit`)
        return
      }
      saved.value += ' 当前项目暂无下一条可由你处理的任务。'
    } catch (claimError) {
      saved.value += ' 自动接取下一条失败，请返回项目大厅刷新后重试。'
      console.warn('Failed to claim next page after successful proofread submit:', claimError)
    }

    await loadNeighbors()
  } catch (e) {
    saveError.value = getPbMessage(e, '提交失败，请重试')
  } finally {
    saving.value = false
  }
}
</script>
