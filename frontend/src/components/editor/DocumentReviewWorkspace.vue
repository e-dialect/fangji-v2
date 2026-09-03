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
          <RouterLink v-if="returnTo" :to="returnTo" class="btn btn-quiet btn-sm">{{ returnLabel }}</RouterLink>
        </div>
      </header>
      <div class="editor-panel-body editor-panel-body--pdf">
        <div v-if="loading" class="panel-loading" aria-live="polite">正在加载原文…</div>
        <div v-else-if="!page" class="alert alert-error">页面不存在</div>
        <div v-else-if="pdfError" class="alert alert-error editor-inline-alert">{{ pdfError }}</div>
        <template v-else>
          <div v-if="pdfPageWarning" class="alert alert-error editor-inline-alert">{{ pdfPageWarning }}</div>
          <PdfSinglePageViewer
            v-if="pdfUrl"
            :src="pdfUrl"
            :page-number="currentPdfPage"
            :watermark-user-id="watermarkUserId"
          />
          <div v-else class="empty-state">
            <div class="empty-state-mark" aria-hidden="true">PDF</div>
            <div class="empty-state-text">这个项目没有可预览的 PDF</div>
            <p>{{ emptyPdfDescription }}</p>
          </div>
        </template>
      </div>
    </section>

    <section class="editor-panel" :aria-labelledby="contentLabelledBy">
      <slot name="panel-header"></slot>
      <div class="editor-panel-body editor-panel-body--fields">
        <slot></slot>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref, toRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PdfSinglePageViewer from '@/components/editor/PdfSinglePageViewer.vue'
import { useProjectPdf } from '@/composables/useProjectPdf'

const props = defineProps({
  page: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  watermarkUserId: { type: String, default: '' },
  returnTo: { type: String, default: '' },
  returnLabel: { type: String, default: '返回' },
  contentLabelledBy: { type: String, default: '' },
  emptyPdfDescription: {
    type: String,
    default: '仍可根据已导入的结构化字段继续处理。'
  }
})

const pdfPageInput = ref(1)
const pageRef = toRef(props, 'page')
const {
  pdfError,
  currentPdfPage,
  pdfPageWarning,
  allowedPdfPages,
  pdfUrl,
  resetPdf,
  resolveProjectPdf,
  clampPdfPage,
  switchPdfPage,
  syncToBasePage
} = useProjectPdf(pageRef)

watch(currentPdfPage, (value) => {
  pdfPageInput.value = value
})

watch(() => props.page?.id, async (pageId) => {
  resetPdf()
  if (!pageId) return
  syncToBasePage()
  pdfPageInput.value = currentPdfPage.value
  await resolveProjectPdf()
}, { immediate: true })

function applyPdfPageInput() {
  currentPdfPage.value = clampPdfPage(pdfPageInput.value)
  pdfPageInput.value = currentPdfPage.value
}
</script>
