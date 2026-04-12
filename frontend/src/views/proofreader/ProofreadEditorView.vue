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

          <label class="form-label">校对文本</label>
          <textarea
            ref="textareaRef"
            v-model="editedText"
            class="form-control"
            style="min-height:300px;font-family:'Noto Sans', serif;font-size:1rem;line-height:1.7"
            placeholder="在此处输入/修改OCR识别的文字..."
            @input="onTextChange"
          ></textarea>

          <IpaKeyboard @insert="insertText" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import pb from '@/lib/pocketbase'
import IpaKeyboard from '@/components/editor/IpaKeyboard.vue'
import PdfSinglePageViewer from '@/components/editor/PdfSinglePageViewer.vue'

const route = useRoute()

const page = ref(null)
const loadingPage = ref(true)
const editedText = ref('')
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const textareaRef = ref(null)
const pdfFileRecord = ref(null)
const pdfError = ref('')
const currentPdfPage = ref(1)
const currentUserId = computed(() => pb.authStore.model?.id || '')

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

onMounted(async () => {
  try {
    page.value = await pb.collection('pages').getOne(route.params.id, { expand: 'project_file' })
    currentPdfPage.value = basePdfPage.value
    // Prefill with proofread_text if already started, else ocr_text
    editedText.value = page.value.proofread_text || page.value.ocr_text || ''
    await resolveProjectPdf()
    // Mark as "proofreading" if still "claimed"
    if (page.value.status === 'claimed') {
      await pb.collection('pages').update(page.value.id, { status: 'proofreading' })
      page.value.status = 'proofreading'
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingPage.value = false
  }
})

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

function onTextChange() {
  saved.value = false
  saveError.value = ''
}

function insertText(char) {
  const el = textareaRef.value
  if (!el) {
    editedText.value += char
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  const before = editedText.value.slice(0, start)
  const after = editedText.value.slice(end)
  editedText.value = before + char + after
  // Restore cursor position after Vue re-renders
  setTimeout(() => {
    el.selectionStart = el.selectionEnd = start + char.length
    el.focus()
  }, 0)
}

async function submitProofread() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  try {
    await pb.collection('pages').update(page.value.id, {
      proofread_text: editedText.value,
      status: 'proofread',
      proofread_at: new Date().toISOString()
    })
    saved.value = true
    page.value.status = 'proofread'
  } catch (e) {
    saveError.value = e?.response?.message || '提交失败，请重试'
  } finally {
    saving.value = false
  }
}
</script>
