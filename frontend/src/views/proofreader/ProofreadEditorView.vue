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
          <RouterLink to="/tasks" class="btn btn-secondary btn-sm">← 返回</RouterLink>
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
          <div v-if="page.status === 'rejected'" class="alert alert-error mb-3">
            ⚠️ 此任务已被打回，请重新校对后再次提交。
          </div>
          <div v-if="saved" class="alert alert-success mb-3">已成功提交，等待审核！</div>
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
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import pb from '@/lib/pocketbase'
import IpaKeyboard from '@/components/editor/IpaKeyboard.vue'
import PdfSinglePageViewer from '@/components/editor/PdfSinglePageViewer.vue'

const route = useRoute()
const router = useRouter()

const page = ref(null)
const loadingPage = ref(true)
const editedText = ref('')
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const pdfFileRecord = ref(null)
const pdfError = ref('')
const currentPdfPage = ref(1)
const currentUserId = computed(() => pb.authStore.model?.id || '')
const prevTaskId = ref('')
const nextTaskId = ref('')
const hasNeighborTasks = computed(() => Boolean(prevTaskId.value || nextTaskId.value))
const rowHeaders = ref([])
const originalRow = ref({})
const editedRow = ref({})
const activeField = ref('')

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

  try {
    page.value = await pb.collection('pages').getOne(route.params.id, { expand: 'project_file' })
    currentPdfPage.value = basePdfPage.value
    // Prefill with proofread_text if already started, else ocr_text
    editedText.value = page.value.proofread_text || page.value.ocr_text || ''
    hydrateRowData()
    await resolveProjectPdf()
    await loadNeighbors()
    // Mark as "proofreading" if still "claimed"
    if (page.value.status === 'claimed') {
      await pb.collection('pages').update(page.value.id, { status: 'proofreading' })
      page.value.status = 'proofreading'
      await loadNeighbors()
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

  // 1) Prefer the page-linked project_file relation if available.
  const linked = page.value?.expand?.project_file
  if (linked?.file) {
    pdfFileRecord.value = linked
    return
  }

  // 2) Fallback to latest uploaded PDF for this project.
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
  const userId = currentUserId.value
  if (!page.value?.project || !userId) {
    prevTaskId.value = ''
    nextTaskId.value = ''
    return
  }
  const list = await pb.collection('pages').getFullList({
    filter: `project="${page.value.project}" && proofreader="${userId}" && (status="claimed" || status="proofreading" || status="rejected")`,
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
  router.push(`/tasks/${prevTaskId.value}/edit`)
}

function gotoNextTask() {
  if (!nextTaskId.value) return
  router.push(`/tasks/${nextTaskId.value}/edit`)
}

function onTextChange() {
  saved.value = false
  saveError.value = ''
  editedText.value = composeRowText()
}

function insertText(char) {
  const key = activeField.value || rowHeaders.value[0]
  if (!key) return
  const current = String(editedRow.value[key] || '')
  editedRow.value[key] = current + char
  onTextChange()
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
  const proofObj = safeParseRowJson(page.value?.proofread_row_json)
  const headers = Object.keys(ocrObj)

  rowHeaders.value = headers.length ? headers : ['内容']
  originalRow.value = {}
  editedRow.value = {}

  rowHeaders.value.forEach((h) => {
    originalRow.value[h] = String(ocrObj[h] ?? '')
    editedRow.value[h] = String((proofObj && h in proofObj ? proofObj[h] : ocrObj[h]) ?? '')
  })
  activeField.value = rowHeaders.value[0] || ''
  editedText.value = composeRowText()
}

function composeRowText() {
  return rowHeaders.value
    .map((h) => String(editedRow.value[h] || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

async function submitProofread() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  const targetNextId = nextTaskId.value
  try {
    await pb.collection('pages').update(page.value.id, {
      proofread_row_json: JSON.stringify(editedRow.value),
      proofread_text: editedText.value,
      status: 'proofread',
      proofread_at: new Date().toISOString()
    })
    if (targetNextId) {
      await router.push(`/tasks/${targetNextId}/edit`)
      return
    }
    saved.value = true
    page.value.status = 'proofread'
    await loadNeighbors()
  } catch (e) {
    saveError.value = e?.response?.message || '提交失败，请重试'
  } finally {
    saving.value = false
  }
}
</script>
