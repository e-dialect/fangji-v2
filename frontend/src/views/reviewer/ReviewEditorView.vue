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
          <RouterLink to="/review" class="btn btn-secondary btn-sm">← 返回</RouterLink>
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
            :watermark-user-id="reviewerId || ''"
          />
          <div v-else class="empty-state">
            <div class="empty-state-icon">📕</div>
            <div class="empty-state-text">暂无可预览的 PDF 文件</div>
          </div>
        </template>
      </div>
    </div>

    <!-- Right panel: diff view + review actions -->
    <div class="editor-panel">
      <div class="editor-panel-header">
        <span>🔍 校对内容审核</span>
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
          <template v-if="!isFinished">
            <button class="btn btn-success btn-sm" @click="approve" :disabled="saving">✓ 通过</button>
            <button class="btn btn-danger btn-sm" @click="showRejectForm = !showRejectForm" :disabled="saving">✗ 打回修改</button>
          </template>
          <span v-else :class="`badge badge-${page.status}`" style="font-size:.9rem">{{ statusLabel(page?.status) }}</span>
        </div>
      </div>
      <div class="editor-panel-body">
        <div v-if="loadingPage" class="text-muted">加载中...</div>
        <div v-else-if="!page" class="text-muted">页面不存在</div>
        <template v-else>
          <div v-if="saved" class="alert alert-success mb-3">操作成功！</div>
          <div v-if="saveError" class="alert alert-error mb-3">{{ saveError }}</div>

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
                      style="min-height:84px;font-family:'Noto Sans',serif"
                      @focus="activeField = header"
                    ></textarea>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="showRejectForm" class="card mb-3" style="border:1px solid var(--danger)">
            <div class="card-title" style="color:var(--danger)">打回修改</div>
            <p class="text-sm text-muted mb-2">可在表格中直接改动后打回。</p>
            <IpaKeyboard @insert="insertText" />
            <div class="flex gap-2 mt-3">
              <button class="btn btn-danger btn-sm" @click="reject" :disabled="saving">确认打回</button>
              <button class="btn btn-secondary btn-sm" @click="showRejectForm = false">取消</button>
            </div>
          </div>

          <!-- Side by side raw texts -->
          <details class="mt-3">
            <summary class="text-sm text-muted" style="cursor:pointer">查看原始对比（展开）</summary>
            <div class="grid-2 mt-2">
              <div>
                <div class="text-sm font-semibold mb-1">OCR原文</div>
                <pre style="white-space:pre-wrap;font-size:.85rem;border:1px solid var(--gray-200);border-radius:4px;padding:.75rem;background:var(--gray-50);max-height:300px;overflow-y:auto">{{ page.ocr_text || '（无）' }}</pre>
              </div>
              <div>
                <div class="text-sm font-semibold mb-1">校对后文本</div>
                <pre style="white-space:pre-wrap;font-size:.85rem;border:1px solid var(--gray-200);border-radius:4px;padding:.75rem;background:var(--gray-50);max-height:300px;overflow-y:auto">{{ page.proofread_text || '（无）' }}</pre>
              </div>
            </div>
          </details>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import IpaKeyboard from '@/components/editor/IpaKeyboard.vue'
import PdfSinglePageViewer from '@/components/editor/PdfSinglePageViewer.vue'
import { useProjectPdf } from '@/composables/useProjectPdf'
import { useStructuredRow } from '@/composables/useStructuredRow'
import { useTaskNeighbors } from '@/composables/useTaskNeighbors'
import { PAGE_STATUS, REVIEW_FINISHED_STATUSES, statusLabel } from '@/constants/pageStatus'
import { currentUserId } from '@/services/authService'
import { getPage, listReviewerNeighborTasks, updatePage } from '@/services/pagesService'
import { formatClaimConflict, getPbMessage } from '@/utils/pbErrors'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const page = ref(null)
const loadingPage = ref(true)
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const showRejectForm = ref(false)

const reviewerId = computed(() => currentUserId(auth.user))
const {
  rowHeaders,
  proofreadRow,
  editedRow,
  activeField,
  hydrateForReview,
  composeCurrentText,
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
  if (!currentPage?.project) return []
  return listReviewerNeighborTasks(currentPage.project, reviewerId.value)
})

const isFinished = computed(() => {
  return page.value && (
    REVIEW_FINISHED_STATUSES.includes(page.value.status) ||
    (page.value.status === PAGE_STATUS.REVIEWING && page.value.reviewer !== reviewerId.value)
  )
})

watch(() => route.params.id, async () => {
  await loadPage()
}, { immediate: true })

async function loadPage() {
  loadingPage.value = true
  page.value = null
  resetNeighbors()
  resetPdf()
  saveError.value = ''
  saved.value = false
  showRejectForm.value = false

  try {
    page.value = await getPage(route.params.id, { expand: 'project_file' })
    syncToBasePage()
    hydrateForReview(page.value)
    await resolveProjectPdf()
    await loadNeighbors()
    if (page.value.status === PAGE_STATUS.PROOFREAD) {
      try {
        await updatePage(page.value.id, {
          status: PAGE_STATUS.REVIEWING,
          reviewer: reviewerId.value
        })
        page.value.status = PAGE_STATUS.REVIEWING
        page.value.reviewer = reviewerId.value
        await loadNeighbors()
      } catch (lockErr) {
        page.value = await getPage(route.params.id, { expand: 'project_file' })
        hydrateForReview(page.value)
        await resolveProjectPdf()
        await loadNeighbors()
        saveError.value = formatClaimConflict(lockErr, '该任务已被其他审核员占用，您可以查看但无法操作。')
      }
    }
  } catch (e) {
    saveError.value = formatClaimConflict(e, '加载审核任务失败，请返回审核大厅刷新后重试')
  } finally {
    loadingPage.value = false
  }
}

function gotoPrevTask() {
  if (!prevTaskId.value) return
  router.push(`/review/${prevTaskId.value}`)
}

function gotoNextTask() {
  if (!nextTaskId.value) return
  router.push(`/review/${nextTaskId.value}`)
}

function insertText(char) {
  insertIntoActiveField(char)
}

async function approve() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  const targetNextId = nextTaskId.value
  const nextProofreadText = composeCurrentText(editedRow.value)
  try {
    await updatePage(page.value.id, {
      proofread_row_json: stringifyEditedRow(),
      proofread_text: nextProofreadText,
      status: PAGE_STATUS.APPROVED,
      reviewer: reviewerId.value,
      reviewed_at: new Date().toISOString()
    })
    if (targetNextId) {
      await router.push(`/review/${targetNextId}`)
      return
    }
    page.value.status = PAGE_STATUS.APPROVED
    page.value.proofread_text = nextProofreadText
    page.value.proofread_row_json = stringifyEditedRow()
    hydrateForReview(page.value)
    saved.value = true
    await loadNeighbors()
  } catch (e) {
    saveError.value = getPbMessage(e, '操作失败，请重试')
  } finally {
    saving.value = false
  }
}

async function reject() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  const targetNextId = nextTaskId.value
  const nextProofreadText = composeCurrentText(editedRow.value)
  try {
    await updatePage(page.value.id, {
      status: PAGE_STATUS.REJECTED,
      reviewer: reviewerId.value,
      reviewed_at: new Date().toISOString(),
      proofread_row_json: stringifyEditedRow(),
      proofread_text: nextProofreadText
    })
    if (targetNextId) {
      await router.push(`/review/${targetNextId}`)
      return
    }
    page.value.status = PAGE_STATUS.REJECTED
    page.value.proofread_text = nextProofreadText
    page.value.proofread_row_json = stringifyEditedRow()
    hydrateForReview(page.value)
    saved.value = true
    showRejectForm.value = false
    await loadNeighbors()
  } catch (e) {
    saveError.value = getPbMessage(e, '操作失败，请重试')
  } finally {
    saving.value = false
  }
}
</script>

