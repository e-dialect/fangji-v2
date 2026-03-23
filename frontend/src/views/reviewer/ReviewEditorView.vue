<template>
  <div class="editor-layout">
    <!-- Left panel: original image -->
    <div class="editor-panel">
      <div class="editor-panel-header">
        <span>📄 原始扫描图 — 第 {{ page?.page_number }} 页</span>
        <RouterLink to="/review" class="btn btn-secondary btn-sm">← 返回</RouterLink>
      </div>
      <div class="editor-panel-body" style="display:flex;align-items:flex-start;justify-content:center">
        <div v-if="loadingPage" class="text-muted">加载中...</div>
        <div v-else-if="!page" class="alert alert-error">页面不存在</div>
        <template v-else>
          <img
            v-if="imageUrl"
            :src="imageUrl"
            alt="原始扫描图"
            style="max-width:100%;height:auto;border:1px solid var(--gray-200);border-radius:4px"
          />
          <div v-else class="empty-state">
            <div class="empty-state-icon">🖼️</div>
            <div class="empty-state-text">暂无原始图片</div>
          </div>
        </template>
      </div>
    </div>

    <!-- Right panel: diff view + review actions -->
    <div class="editor-panel">
      <div class="editor-panel-header">
        <span>🔍 校对内容审核</span>
        <div v-if="!isFinished" class="flex gap-2">
          <button class="btn btn-success btn-sm" @click="approve" :disabled="saving">✓ 通过</button>
          <button class="btn btn-danger btn-sm" @click="showRejectForm = !showRejectForm" :disabled="saving">✗ 打回修改</button>
        </div>
        <span v-else :class="`badge badge-${page.status}`" style="font-size:.9rem">{{ statusLabel(page?.status) }}</span>
      </div>
      <div class="editor-panel-body">
        <div v-if="loadingPage" class="text-muted">加载中...</div>
        <div v-else-if="!page" class="text-muted">页面不存在</div>
        <template v-else>
          <div v-if="saved" class="alert alert-success mb-3">操作成功！</div>
          <div v-if="saveError" class="alert alert-error mb-3">{{ saveError }}</div>

          <!-- Reject form -->
          <div v-if="showRejectForm" class="card mb-3" style="border:1px solid var(--danger)">
            <div class="card-title" style="color:var(--danger)">打回修改</div>
            <p class="text-sm text-muted mb-2">可在下方直接修改文本后打回，校对员将看到修改建议。</p>
            <textarea
              ref="rejectTextareaRef"
              v-model="editedText"
              class="form-control mb-3"
              style="min-height:120px;font-family:'Noto Sans',serif"
            ></textarea>
            <IpaKeyboard @insert="insertText" />
            <div class="flex gap-2 mt-3">
              <button class="btn btn-danger btn-sm" @click="reject" :disabled="saving">确认打回</button>
              <button class="btn btn-secondary btn-sm" @click="showRejectForm = false">取消</button>
            </div>
          </div>

          <!-- Diff display -->
          <div class="mb-3">
            <div class="flex gap-3 mb-2" style="font-size:.82rem">
              <span style="background:#ffe4e6;padding:.1rem .4rem;border-radius:3px;color:#be123c">删除</span>
              <span style="background:#dcfce7;padding:.1rem .4rem;border-radius:3px;color:#15803d">新增</span>
            </div>
            <div
              style="white-space:pre-wrap;font-family:'Noto Sans',serif;font-size:1rem;line-height:1.7;border:1px solid var(--gray-200);border-radius:var(--radius);padding:1rem;background:#fff;min-height:200px"
            >
              <template v-for="(part, i) in diffParts" :key="i">
                <span
                  :class="{
                    'diff-del': part.type === 'delete',
                    'diff-add': part.type === 'insert'
                  }"
                >{{ part.text }}</span>
              </template>
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
import { ref, onMounted, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import pb from '@/lib/pocketbase'
import { useAuthStore } from '@/stores/auth'
import { diffTexts } from '@/lib/diff'
import IpaKeyboard from '@/components/editor/IpaKeyboard.vue'

const route = useRoute()
const auth = useAuthStore()

const page = ref(null)
const loadingPage = ref(true)
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const showRejectForm = ref(false)
const editedText = ref('')
const rejectTextareaRef = ref(null)

const imageUrl = computed(() => {
  if (!page.value?.image) return null
  return pb.files.getUrl(page.value, page.value.image)
})

const diffParts = computed(() => {
  if (!page.value) return []
  return diffTexts(page.value.ocr_text || '', page.value.proofread_text || '')
})

const isFinished = computed(() => {
  return page.value && (
    ['approved', 'rejected'].includes(page.value.status) ||
    (page.value.status === 'reviewing' && page.value.reviewer !== auth.user.id)
  )
})

onMounted(async () => {
  try {
    page.value = await pb.collection('pages').getOne(route.params.id)
    editedText.value = page.value.proofread_text || page.value.ocr_text || ''
    // Mark as "reviewing" if status is "proofread".
    // The server hook enforces that only one reviewer can transition a page from
    // "proofread" to "reviewing", so if this update fails the page was already
    // claimed by another reviewer.
    if (page.value.status === 'proofread') {
      try {
        await pb.collection('pages').update(page.value.id, {
          status: 'reviewing',
          reviewer: auth.user.id
        })
        page.value.status = 'reviewing'
        page.value.reviewer = auth.user.id
      } catch (lockErr) {
        // Re-fetch to get the latest status/reviewer
        page.value = await pb.collection('pages').getOne(route.params.id)
        editedText.value = page.value.proofread_text || page.value.ocr_text || ''
        saveError.value = lockErr?.response?.message || '该任务已被其他审核员占用，您可以查看但无法操作。'
      }
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingPage.value = false
  }
})

function insertText(char) {
  const el = rejectTextareaRef.value
  if (!el) {
    editedText.value += char
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  editedText.value = editedText.value.slice(0, start) + char + editedText.value.slice(end)
  setTimeout(() => {
    el.selectionStart = el.selectionEnd = start + char.length
    el.focus()
  }, 0)
}

async function approve() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  try {
    await pb.collection('pages').update(page.value.id, {
      status: 'approved',
      reviewer: auth.user.id,
      reviewed_at: new Date().toISOString()
    })
    page.value.status = 'approved'
    saved.value = true
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
  try {
    await pb.collection('pages').update(page.value.id, {
      status: 'rejected',
      reviewer: auth.user.id,
      reviewed_at: new Date().toISOString(),
      proofread_text: editedText.value
    })
    page.value.status = 'rejected'
    page.value.proofread_text = editedText.value
    saved.value = true
    showRejectForm.value = false
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
