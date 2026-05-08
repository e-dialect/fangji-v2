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
          <div v-if="isSecondPass" class="alert alert-success mb-3">
            当前为第二次校对。若本次结果与第一次完全一致，该条目将自动完成。
          </div>
          <div v-else class="alert alert-success mb-3">
            当前为第一次校对。提交后将等待另一位校对员进行第二次校对。
          </div>
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
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
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

const currentUserId = computed(() => getCurrentUserId() || '')
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

const isSecondPass = computed(() => Boolean(page.value?.first_proofreader))

watch(() => route.params.id, async () => {
  await loadPage()
}, { immediate: true })

async function loadPage() {
  loadingPage.value = true
  page.value = null
  resetNeighbors()
  resetPdf()
  saveError.value = ''
  saved.value = ''

  try {
    page.value = await getPage(route.params.id, { expand: 'project_file' })
    syncToBasePage()
    hydrateForProofread(page.value)
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
    const nextPage = await claimNextProjectPage(projectId, userId)
    if (nextPage?.id) {
      await router.push(`/tasks/${nextPage.id}/edit`)
      return
    }
    page.value.status = result.status
    saved.value = result.status === PAGE_STATUS.APPROVED
      ? '两次校对结果一致，该条目已完成。当前项目暂无下一条可由你处理的任务。'
      : result.status === PAGE_STATUS.PENDING
        ? '两次校对结果不一致，该条目已退回任务池重新进行两次校对。当前项目暂无下一条可由你处理的任务。'
        : '第一次校对已提交。当前项目暂无下一条可由你处理的任务。'
    await loadNeighbors()
  } catch (e) {
    saveError.value = getPbMessage(e, '提交失败，请重试')
  } finally {
    saving.value = false
  }
}
</script>
