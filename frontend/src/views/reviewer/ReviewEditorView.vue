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
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import pb from '@/lib/pocketbase'
import { useAuthStore } from '@/stores/auth'
import IpaKeyboard from '@/components/editor/IpaKeyboard.vue'
import PdfSinglePageViewer from '@/components/editor/PdfSinglePageViewer.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const page = ref(null)
const loadingPage = ref(true)
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const showRejectForm = ref(false)
const editedText = ref('')
const pdfFileRecord = ref(null)
const pdfError = ref('')
const currentPdfPage = ref(1)
const prevTaskId = ref('')
const nextTaskId = ref('')
const hasNeighborTasks = computed(() => Boolean(prevTaskId.value || nextTaskId.value))
const rowHeaders = ref([])
const proofreadRow = ref({})
const editedRow = ref({})
const activeField = ref('')

const reviewerId = computed(() => pb.authStore.model?.id || auth.user?.id || null)
const basePdfPage = computed(() => {
  const pageNo = Number(page.value?.pdf_page)
  if (Number.isInteger(pageNo) && pageNo > 0) return pageNo
  const fallback = Number(page.value?.page_number)
  return Number.isInteger(fallback) && fallback > 0 ? fallback : 1
})
const allowedPdfPages = computed(() => [basePdfPage.value, basePdfPage.value + 1])

const pdfUrl = computed(() => {
  if (!pdfFileRecord.value?.file) return null
  return pb.files.getUrl(pdfFileRecord.value, pdfFileRecord.value.file)
})

const isFinished = computed(() => {
  return page.value && (
    ['approved', 'rejected'].includes(page.value.status) ||
    (page.value.status === 'reviewing' && page.value.reviewer !== reviewerId.value)
  )
})

watch(() => route.params.id, async () => {
  await loadPage()
}, { immediate: true })

async function loadPage() {
  loadingPage.value = true
  page.value = null
  prevTaskId.value = ''
  nextTaskId.value = ''
  pdfFileRecord.value = null
  pdfError.value = ''
  saveError.value = ''
  saved.value = false
  showRejectForm.value = false

  try {
    page.value = await pb.collection('pages').getOne(route.params.id, { expand: 'project_file' })
    currentPdfPage.value = basePdfPage.value
    editedText.value = page.value.proofread_text || page.value.ocr_text || ''
    hydrateRowData()
    await resolveProjectPdf()
    await loadNeighbors()
    // Mark as "reviewing" if status is "proofread".
    // The server hook enforces that only one reviewer can transition a page from
    // "proofread" to "reviewing", so if this update fails the page was already
    // claimed by another reviewer.
    if (page.value.status === 'proofread') {
      try {
        await pb.collection('pages').update(page.value.id, {
          status: 'reviewing',
          reviewer: reviewerId.value
        })
        page.value.status = 'reviewing'
        page.value.reviewer = reviewerId.value
        await loadNeighbors()
      } catch (lockErr) {
        // Re-fetch to get the latest status/reviewer
        page.value = await pb.collection('pages').getOne(route.params.id, { expand: 'project_file' })
        editedText.value = page.value.proofread_text || page.value.ocr_text || ''
        hydrateRowData()
        await resolveProjectPdf()
        await loadNeighbors()
        saveError.value = lockErr?.response?.message || '该任务已被其他审核员占用，您可以查看但无法操作。'
      }
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingPage.value = false
  }
}

async function resolveProjectPdf() {
  pdfError.value = ''
  pdfFileRecord.value = null

  const linked = page.value?.expand?.project_file
  if (linked?.file) {
    pdfFileRecord.value = linked
    return
  }

  try {
    const list = await pb.collection('project_files').getFullList({
      filter: `project="${page.value.project}"`,
      sort: '-created'
    })
    const matched = list.find((r) => typeof r.file === 'string' && r.file.length > 0)
    if (matched) {
      pdfFileRecord.value = matched
      return
    }
  } catch (e) {
    pdfError.value = e?.response?.message || '加载项目 PDF 失败'
    return
  }
}

function clampPdfPage(pageNo) {
  const min = allowedPdfPages.value[0]
  const max = allowedPdfPages.value[1]
  return Math.max(min, Math.min(max, Number(pageNo) || min))
}

function switchPdfPage(delta) {
  currentPdfPage.value = clampPdfPage(currentPdfPage.value + delta)
}

async function loadNeighbors() {
  if (!page.value?.project) {
    prevTaskId.value = ''
    nextTaskId.value = ''
    return
  }
  const userId = reviewerId.value
  const baseFilter = userId
    ? `project="${page.value.project}" && (status="proofread" || (status="reviewing" && reviewer="${userId}"))`
    : `project="${page.value.project}" && status="proofread"`
  const list = await pb.collection('pages').getFullList({
    filter: baseFilter,
    sort: 'page_number',
    fields: 'id,page_number'
  })
  const idx = list.findIndex((item) => item.id === page.value.id)
  if (idx < 0 || list.length <= 1) {
    prevTaskId.value = ''
    nextTaskId.value = ''
    return
  }
  const prevIdx = (idx - 1 + list.length) % list.length
  const nextIdx = (idx + 1) % list.length
  prevTaskId.value = list[prevIdx].id
  nextTaskId.value = list[nextIdx].id
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
  const key = activeField.value || rowHeaders.value[0]
  if (!key) return
  const current = String(editedRow.value[key] || '')
  editedRow.value[key] = current + char
}

function safeParseRowJson(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function hydrateRowData() {
  const ocrObj = safeParseRowJson(page.value?.ocr_row_json) || { '内容': page.value?.ocr_text || '' }
  const proofObj = safeParseRowJson(page.value?.proofread_row_json) || { ...ocrObj, '内容': page.value?.proofread_text || ocrObj['内容'] || '' }
  const headers = Object.keys(ocrObj)

  rowHeaders.value = headers.length ? headers : ['内容']
  proofreadRow.value = {}
  editedRow.value = {}
  rowHeaders.value.forEach((h) => {
    proofreadRow.value[h] = String(proofObj[h] ?? '')
    editedRow.value[h] = String(proofObj[h] ?? '')
  })
  activeField.value = rowHeaders.value[0] || ''
}

function composeRowText(rowObj) {
  return rowHeaders.value
    .map((h) => String(rowObj[h] || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

async function approve() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  const targetNextId = nextTaskId.value
  const nextProofreadText = composeRowText(editedRow.value)
  try {
    await pb.collection('pages').update(page.value.id, {
      proofread_row_json: JSON.stringify(editedRow.value),
      proofread_text: nextProofreadText,
      status: 'approved',
      reviewer: reviewerId.value,
      reviewed_at: new Date().toISOString()
    })
    if (targetNextId) {
      await router.push(`/review/${targetNextId}`)
      return
    }
    page.value.status = 'approved'
    page.value.proofread_text = nextProofreadText
    page.value.proofread_row_json = JSON.stringify(editedRow.value)
    hydrateRowData()
    saved.value = true
    await loadNeighbors()
  } catch (e) {
    saveError.value = e?.response?.message || '操作失败，请重试'
  } finally {
    saving.value = false
  }
}

async function reject() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  const targetNextId = nextTaskId.value
  const nextProofreadText = composeRowText(editedRow.value)
  try {
    await pb.collection('pages').update(page.value.id, {
      status: 'rejected',
      reviewer: reviewerId.value,
      reviewed_at: new Date().toISOString(),
      proofread_row_json: JSON.stringify(editedRow.value),
      proofread_text: nextProofreadText
    })
    if (targetNextId) {
      await router.push(`/review/${targetNextId}`)
      return
    }
    page.value.status = 'rejected'
    page.value.proofread_text = nextProofreadText
    page.value.proofread_row_json = JSON.stringify(editedRow.value)
    hydrateRowData()
    saved.value = true
    showRejectForm.value = false
    await loadNeighbors()
  } catch (e) {
    saveError.value = e?.response?.message || '操作失败，请重试'
  } finally {
    saving.value = false
  }
}

function statusLabel(s) {
  const map = { approved: '已通过', rejected: '已打回', reviewing: '审核中' }
  return map[s] || s
}
</script>

