import { computed, ref } from 'vue'
import { findLatestProjectPdf, getFileUrl } from '@/services/projectFilesService'

export function useProjectPdf(page) {
  const pdfFileRecord = ref(null)
  const pdfError = ref('')
  const currentPdfPage = ref(1)

  const basePdfPage = computed(() => {
    const pageNo = Number(page.value?.pdf_page)
    if (Number.isInteger(pageNo) && pageNo > 0) return pageNo
    const fallback = Number(page.value?.page_number)
    return Number.isInteger(fallback) && fallback > 0 ? fallback : 1
  })

  const pdfPageWarning = computed(() => {
    const pageNo = Number(page.value?.pdf_page)
    if (Number.isInteger(pageNo) && pageNo > 0) return ''
    return '此条目缺少 PDF页码，当前暂用任务序号定位 PDF。请在远程数据中补齐 pdf_page。'
  })

  const allowedPdfPages = computed(() => [basePdfPage.value, basePdfPage.value + 1])

  const pdfUrl = computed(() => {
    if (!pdfFileRecord.value?.file) return null
    return getFileUrl(pdfFileRecord.value, pdfFileRecord.value.file)
  })

  function resetPdf() {
    pdfFileRecord.value = null
    pdfError.value = ''
    currentPdfPage.value = 1
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
      const matched = await findLatestProjectPdf(page.value?.project)
      if (matched) pdfFileRecord.value = matched
    } catch (error) {
      pdfError.value = error?.response?.message || '加载项目 PDF 失败'
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

  function syncToBasePage() {
    currentPdfPage.value = basePdfPage.value
  }

  return {
    pdfFileRecord,
    pdfError,
    currentPdfPage,
    basePdfPage,
    pdfPageWarning,
    allowedPdfPages,
    pdfUrl,
    resetPdf,
    resolveProjectPdf,
    clampPdfPage,
    switchPdfPage,
    syncToBasePage
  }
}
