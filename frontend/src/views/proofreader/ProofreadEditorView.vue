<template>
  <div class="editor-layout">
    <!-- Left panel: project PDF -->
    <div class="editor-panel">
      <div class="editor-panel-header">
        <span>📄 原文 · 第 {{ currentPdfPage }} 页</span>
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
          <input
            v-model.number="pdfPageInput"
            type="number"
            class="form-control pdf-page-input"
            :min="allowedPdfPages[0]"
            :max="allowedPdfPages[1]"
            aria-label="PDF 页码"
            @change="applyPdfPageInput"
            @keydown.enter.prevent="applyPdfPageInput"
          />
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
        <span>✏️ 第 {{ page?.page_number || '—' }} 条</span>
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
          <div class="editor-meta mb-3">
            <span>{{ draftStatus || '修改后将自动保存本地草稿' }}</span>
            <span>快捷键：Ctrl/⌘+S 保存草稿 · Ctrl/⌘+Enter 提交 · Alt+←/→ 切换任务</span>
          </div>

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
                      :ref="(el) => setTextareaRef(header, el)"
                      v-model="editedRow[header]"
                      class="form-control"
                      style="min-height:84px;font-family:'Noto Sans', serif;font-size:.95rem;line-height:1.6"
                      @focus="activateField(header, $event)"
                      @select="rememberSelection(header, $event)"
                      @keyup="rememberSelection(header, $event)"
                      @click="rememberSelection(header, $event)"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import IpaKeyboard from '@/components/editor/IpaKeyboard.vue'
import PdfSinglePageViewer from '@/components/editor/PdfSinglePageViewer.vue'
import { useProjectPdf } from '@/composables/useProjectPdf'
import { useStructuredRow } from '@/composables/useStructuredRow'
import { useTaskNeighbors } from '@/composables/useTaskNeighbors'
import { PAGE_STATUS } from '@/constants/pageStatus'
import {
  clearTaskDraft,
  loadTaskDraft,
  saveTaskDraft,
  setTaskFlash,
  takeTaskFlash
} from '@/lib/taskDraft'
import { currentUserId as getCurrentUserId } from '@/services/authService'
import {
  claimNextProjectPage,
  getPage,
  listProofreaderNeighborTasks,
  submitTwoPassProofread
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
const draftStatus = ref('')
const draftReady = ref(false)
const pdfPageInput = ref(1)
const activeSelection = ref({ field: '', start: null, end: null })
const textareaRefs = new Map()
let draftTimer = null

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
  replaceEditedRow,
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

watch(currentPdfPage, (value) => {
  pdfPageInput.value = value
})

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
  window.addEventListener('keydown', handleEditorShortcut)
})

onBeforeUnmount(() => {
  flushDraft()
  clearDraftTimer()
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleEditorShortcut)
})

async function loadPage() {
  clearDraftTimer()
  draftReady.value = false
  loadingPage.value = true
  page.value = null
  resetNeighbors()
  resetPdf()
  saveError.value = ''
  saved.value = ''
  initialRowJson.value = ''
  draftStatus.value = ''
  activeSelection.value = { field: '', start: null, end: null }
  textareaRefs.clear()

  try {
    page.value = await getPage(route.params.id, { expand: 'project_file' })
    syncToBasePage()
    hydrateForProofread(page.value)
    initialRowJson.value = stringifyEditedRow()
    restoreDraft()
    await resolveProjectPdf()
    await loadNeighbors()
    const flash = takeTaskFlash(window.sessionStorage)
    if (flash) saved.value = flash
  } catch (e) {
    saveError.value = formatClaimConflict(e, '加载任务失败，请返回项目大厅刷新后重试')
  } finally {
    draftReady.value = Boolean(page.value)
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
  scheduleDraftSave()
}

async function insertText(char) {
  const field = activeField.value || rowHeaders.value[0]
  const textarea = textareaRefs.get(field)
  const selection = activeSelection.value.field === field
    ? activeSelection.value
    : {
        start: textarea?.selectionStart,
        end: textarea?.selectionEnd
      }
  const cursor = insertIntoActiveField(char, selection)
  onTextChange()
  if (cursor == null) return
  await nextTick()
  const target = textareaRefs.get(field)
  target?.focus()
  target?.setSelectionRange(cursor, cursor)
  activeSelection.value = { field, start: cursor, end: cursor }
}

function setTextareaRef(header, element) {
  if (element) textareaRefs.set(header, element)
  else textareaRefs.delete(header)
}

function activateField(header, event) {
  activeField.value = header
  rememberSelection(header, event)
}

function rememberSelection(header, event) {
  const target = event?.target
  activeSelection.value = {
    field: header,
    start: Number.isInteger(target?.selectionStart) ? target.selectionStart : null,
    end: Number.isInteger(target?.selectionEnd) ? target.selectionEnd : null
  }
}

function confirmDiscardChanges() {
  if (!hasUnsavedChanges.value) return true
  return window.confirm('当前校对内容尚未提交，确定要离开吗？')
}

function handleBeforeUnload(event) {
  flushDraft()
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

function scheduleDraftSave() {
  if (!draftReady.value) return
  clearDraftTimer()
  draftStatus.value = '草稿保存中...'
  draftTimer = window.setTimeout(() => flushDraft(), 500)
}

function flushDraft() {
  clearDraftTimer()
  if (!draftReady.value || !page.value || !currentUserId.value || !initialRowJson.value) return
  try {
    if (!hasUnsavedChanges.value) {
      clearTaskDraft(window.localStorage, {
        userId: currentUserId.value,
        pageId: page.value.id
      })
      draftStatus.value = ''
      return
    }
    const draft = saveTaskDraft(window.localStorage, {
      userId: currentUserId.value,
      pageId: page.value.id,
      sourceSignature: initialRowJson.value,
      row: JSON.parse(stringifyEditedRow())
    })
    draftStatus.value = draft ? `草稿已保存于 ${formatDraftTime(draft.savedAt)}` : ''
  } catch {
    draftStatus.value = '草稿保存失败，请勿关闭页面'
  }
}

function restoreDraft() {
  const draft = loadTaskDraft(window.localStorage, {
    userId: currentUserId.value,
    pageId: page.value?.id,
    sourceSignature: initialRowJson.value
  })
  if (!draft) return
  replaceEditedRow(draft.row)
  if (stringifyEditedRow() === initialRowJson.value) {
    clearTaskDraft(window.localStorage, {
      userId: currentUserId.value,
      pageId: page.value.id
    })
    return
  }
  draftStatus.value = `已恢复 ${formatDraftTime(draft.savedAt)} 的本地草稿`
}

function clearDraftTimer() {
  if (draftTimer) {
    window.clearTimeout(draftTimer)
    draftTimer = null
  }
}

function formatDraftTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚才'
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function handleEditorShortcut(event) {
  if (event.defaultPrevented) return
  const control = event.ctrlKey || event.metaKey
  if (control && event.key.toLowerCase() === 's') {
    event.preventDefault()
    flushDraft()
    return
  }
  if (control && event.key === 'Enter') {
    event.preventDefault()
    if (!saving.value && !loadingPage.value) submitProofread()
    return
  }
  if (!event.altKey || control) return
  if (event.key === 'ArrowLeft' && prevTaskId.value) {
    event.preventDefault()
    gotoPrevTask()
  } else if (event.key === 'ArrowRight' && nextTaskId.value) {
    event.preventDefault()
    gotoNextTask()
  }
}

function applyPdfPageInput() {
  const nextPage = Number(pdfPageInput.value)
  currentPdfPage.value = Math.max(
    allowedPdfPages.value[0],
    Math.min(allowedPdfPages.value[1], Number.isInteger(nextPage) ? nextPage : allowedPdfPages.value[0])
  )
  pdfPageInput.value = currentPdfPage.value
}

async function submitProofread() {
  if (saving.value || !page.value) return
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
    clearTaskDraft(window.localStorage, {
      userId,
      pageId: page.value.id
    })
    draftStatus.value = ''
    saved.value = result.message || (
      result.status === PAGE_STATUS.APPROVED
        ? '该条目已完成。'
        : result.status === PAGE_STATUS.ARBITRATION
          ? '两次结果不一致，已转交管理员仲裁。'
          : '校对已提交。'
    )

    try {
      const nextPage = await claimNextProjectPage(projectId, userId)
      if (nextPage?.id) {
        setTaskFlash(window.sessionStorage, saved.value)
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
