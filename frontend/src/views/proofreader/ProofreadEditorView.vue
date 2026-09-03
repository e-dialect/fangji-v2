<template>
  <main class="editor-layout">
    <section class="editor-panel" aria-labelledby="source-panel-title">
      <header class="editor-panel-header editor-panel-header--source">
        <div class="editor-context">
          <span>原文定位</span>
          <strong id="source-panel-title">PDF 第 {{ currentPdfPage }} 页</strong>
        </div>
        <div class="editor-toolbar" aria-label="PDF 页码导航">
          <button
            class="btn btn-secondary btn-sm"
            :disabled="currentPdfPage <= allowedPdfPages[0]"
            @click="switchPdfPage(-1)"
          >上一页</button>
          <label class="pdf-page-control">
            <span class="sr-only">PDF 页码</span>
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
          </label>
          <button
            class="btn btn-secondary btn-sm"
            :disabled="currentPdfPage >= allowedPdfPages[1]"
            @click="switchPdfPage(1)"
          >下一页</button>
          <RouterLink to="/tasks" class="btn btn-quiet btn-sm">返回大厅</RouterLink>
        </div>
      </header>
      <div class="editor-panel-body editor-panel-body--pdf">
        <div v-if="loadingPage" class="panel-loading" aria-live="polite">正在加载原文…</div>
        <div v-else-if="!page" class="alert alert-error">页面不存在</div>
        <div v-else-if="pdfError" class="alert alert-error editor-inline-alert">{{ pdfError }}</div>
        <template v-else>
          <div v-if="pdfPageWarning" class="alert alert-error editor-inline-alert">{{ pdfPageWarning }}</div>
          <PdfSinglePageViewer
            v-if="pdfUrl"
            :src="pdfUrl"
            :page-number="currentPdfPage"
            :watermark-user-id="currentUserId"
          />
          <div v-else class="empty-state">
            <div class="empty-state-mark" aria-hidden="true">PDF</div>
            <div class="empty-state-text">这个项目没有可预览的 PDF</div>
            <p>你仍可根据已导入的结构化字段完成校对。</p>
          </div>
        </template>
      </div>
    </section>

    <section class="editor-panel" aria-labelledby="task-panel-title">
      <header class="editor-panel-header editor-panel-header--task">
        <div class="editor-context">
          <span>{{ projectName }} · {{ passLabel }}</span>
          <strong id="task-panel-title">第 {{ page?.page_number || '—' }} 条</strong>
        </div>
        <div class="editor-toolbar" aria-label="校对任务导航">
          <span class="task-position" aria-label="当前任务位置">
            {{ taskPosition || 1 }} / {{ taskCount || 1 }}
          </span>
          <button
            class="btn btn-secondary btn-sm"
            @click="gotoPrevTask"
            :disabled="!hasNeighborTasks || saving || loadingPage"
          >上一条</button>
          <button
            class="btn btn-secondary btn-sm"
            @click="gotoNextTask"
            :disabled="!hasNeighborTasks || saving || loadingPage"
          >下一条</button>
          <button
            class="btn btn-success btn-sm"
            @click="openSubmitReview"
            :disabled="saving || loadingPage || !page"
          >{{ saving ? '提交中…' : '检查并提交' }}</button>
        </div>
      </header>

      <div class="editor-panel-body editor-panel-body--fields">
        <div v-if="loadingPage" class="panel-loading" aria-live="polite">正在准备校对字段…</div>
        <div v-else-if="!page" class="empty-state">
          <div class="empty-state-text">页面不存在</div>
          <RouterLink to="/tasks" class="btn btn-secondary mt-3">返回项目大厅</RouterLink>
        </div>
        <template v-else>
          <div v-if="saved" class="alert alert-success" role="status">{{ saved }}</div>
          <div v-if="saveError" class="alert alert-error" role="alert">{{ saveError }}</div>

          <div class="editor-meta" aria-live="polite">
            <span class="draft-indicator" :class="{ 'draft-indicator--saved': draftStatus.includes('已保存') || draftStatus.includes('已恢复') }">
              <i aria-hidden="true"></i>
              {{ draftStatus || '修改后自动保存到本机' }}
            </span>
            <span class="shortcut-hint">⌘/Ctrl+S 草稿 · ⌘/Ctrl+Enter 提交 · Alt+←/→ 切换</span>
          </div>

          <div class="field-progress-summary">
            <div>
              <span>结构化校对</span>
              <strong>{{ rowHeaders.length }} 个字段，已修改 {{ changedFields.length }} 个</strong>
            </div>
            <span class="pass-badge">{{ passLabel }}</span>
          </div>

          <div class="proofread-fields">
            <article
              v-for="(header, index) in rowHeaders"
              :key="header"
              class="proofread-field"
              :class="{
                'proofread-field--active': activeField === header,
                'proofread-field--changed': isFieldChanged(header)
              }"
            >
              <header class="proofread-field__header">
                <div>
                  <span>字段 {{ index + 1 }}</span>
                  <h2>{{ header }}</h2>
                </div>
                <div class="proofread-field__actions">
                  <span v-if="isFieldChanged(header)" class="field-change-label">已修改</span>
                  <button
                    type="button"
                    class="btn btn-quiet btn-sm"
                    :disabled="!isFieldChanged(header)"
                    @click="restoreField(header)"
                  >恢复原文</button>
                </div>
              </header>

              <div class="source-value">
                <span>导入原文</span>
                <p>{{ originalRow[header] || '（空白）' }}</p>
              </div>

              <label class="sr-only" :for="`proofread-field-${index}`">{{ header }} 校对结果</label>
              <textarea
                :id="`proofread-field-${index}`"
                :ref="(el) => setTextareaRef(header, el)"
                v-model="editedRow[header]"
                class="form-control proofread-textarea"
                @focus="activateField(header, $event)"
                @select="rememberSelection(header, $event)"
                @keyup="rememberSelection(header, $event)"
                @click="rememberSelection(header, $event)"
                @input="onTextChange"
                :placeholder="`输入${header}的校对结果`"
              ></textarea>
            </article>
          </div>

          <IpaKeyboard @insert="insertText" />
        </template>
      </div>
    </section>

    <div
      v-if="reviewingSubmission"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeSubmitReview"
    >
      <section
        class="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-review-title"
        @keydown.esc="closeSubmitReview"
      >
        <div class="confirmation-dialog__mark" aria-hidden="true">校</div>
        <div>
          <div class="page-eyebrow">提交前确认</div>
          <h2 id="submit-review-title">确认第 {{ page?.page_number }} 条{{ passLabel }}结果</h2>
          <p v-if="changedFields.length">
            你修改了 {{ changedFields.length }} 个字段：{{ changedFields.join('、') }}。
          </p>
          <p v-else>
            本条没有修改字段，提交表示你确认导入内容全部正确。
          </p>
          <p class="text-sm text-muted">
            提交后不能自行撤回；系统会自动流转并尝试领取本项目下一条。
          </p>
        </div>
        <div class="confirmation-dialog__actions">
          <button type="button" class="btn btn-secondary" @click="closeSubmitReview">继续检查</button>
          <button
            ref="submitConfirmButton"
            type="button"
            class="btn btn-success"
            :disabled="saving"
            @click="submitProofread"
          >{{ saving ? '正在提交…' : `确认提交${passLabel}` }}</button>
        </div>
      </section>
    </div>
  </main>
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
import { getChangedFields, proofreadPassLabel } from '@/lib/workspaceInsights'
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
const reviewingSubmission = ref(false)
const submitConfirmButton = ref(null)
const activeSelection = ref({ field: '', start: null, end: null })
const textareaRefs = new Map()
let draftTimer = null

const currentUserId = computed(() => getCurrentUserId() || '')
const projectName = computed(() => page.value?.expand?.project?.name || '当前项目')
const passLabel = computed(() => proofreadPassLabel(page.value))
const changedFields = computed(() => getChangedFields(rowHeaders.value, originalRow.value, editedRow.value))
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
  taskPosition,
  taskCount,
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
  reviewingSubmission.value = false
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
    page.value = await getPage(route.params.id, { expand: 'project,project_file' })
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

function isFieldChanged(header) {
  return changedFields.value.includes(header)
}

async function restoreField(header) {
  if (!isFieldChanged(header)) return
  editedRow.value[header] = String(originalRow.value[header] ?? '')
  activeField.value = header
  onTextChange()
  await nextTick()
  textareaRefs.get(header)?.focus()
}

async function openSubmitReview() {
  if (saving.value || loadingPage.value || !page.value) return
  flushDraft()
  reviewingSubmission.value = true
  await nextTick()
  submitConfirmButton.value?.focus()
}

function closeSubmitReview() {
  if (saving.value) return
  reviewingSubmission.value = false
}

function confirmDiscardChanges() {
  if (!hasUnsavedChanges.value) return true
  return window.confirm('当前校对内容尚未提交，确定要离开吗？本地草稿会保留。')
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
  draftStatus.value = '草稿保存中…'
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
  if (event.key === 'Escape' && reviewingSubmission.value) {
    event.preventDefault()
    closeSubmitReview()
    return
  }
  const control = event.ctrlKey || event.metaKey
  if (control && event.key.toLowerCase() === 's') {
    event.preventDefault()
    flushDraft()
    return
  }
  if (control && event.key === 'Enter') {
    event.preventDefault()
    if (reviewingSubmission.value) submitProofread()
    else openSubmitReview()
    return
  }
  if (!event.altKey || control || reviewingSubmission.value) return
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
    reviewingSubmission.value = false
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
