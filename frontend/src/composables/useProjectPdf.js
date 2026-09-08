import { computed, ref } from 'vue'
import pb from '@/lib/pocketbase'

export function useProjectPdf(page) {
  const pdfError = ref('')
  const pdfLoading = ref(false)
  const currentPdfPage = ref(1)
  const firstPage = ref(1)
  const lastPage = ref(1)
  const totalPdfPages = ref(0)
  const pdfUrl = ref(null)
  let generation = 0
  let controller = null
  const basePdfPage = computed(() => Number(page.value?.pdf_page) || Number(page.value?.page_number) || 1)
  const pdfPageWarning = computed(() => page.value?.pdf_page ? '' : '此条目缺少 PDF 页码，暂按任务序号定位。')
  const allowedPdfPages = computed(() => [firstPage.value, lastPage.value])
  const localPdfPage = computed(() => currentPdfPage.value - firstPage.value + 1)

  function resetPdf() {
    generation++
    controller?.abort()
    if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = null
    pdfError.value = ''
    pdfLoading.value = false
    firstPage.value = lastPage.value = basePdfPage.value
    totalPdfPages.value = 0
    currentPdfPage.value = basePdfPage.value
  }
  async function resolveProjectPdf() {
    const request = ++generation
    pdfLoading.value = true
    controller = new AbortController()
    try {
      const response = await fetch(pb.buildURL(`/api/fangji/pages/${encodeURIComponent(page.value.id)}/pdf`), {
        headers: { Authorization: pb.authStore.token }, signal: controller.signal, cache: 'no-store'
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.message || '加载任务 PDF 失败')
      }
      const blob = await response.blob()
      if (request !== generation) return
      firstPage.value = Number(response.headers.get('X-PDF-Start-Page')) || basePdfPage.value
      lastPage.value = Number(response.headers.get('X-PDF-End-Page')) || firstPage.value
      totalPdfPages.value = Number(response.headers.get('X-PDF-Total-Pages')) || lastPage.value
      currentPdfPage.value = firstPage.value
      pdfUrl.value = URL.createObjectURL(blob)
    } catch (error) {
      if (request === generation && error.name !== 'AbortError') pdfError.value = error.message || '加载任务 PDF 失败'
    } finally {
      if (request === generation) pdfLoading.value = false
    }
  }
  function clampPdfPage(value) {
    return Math.max(firstPage.value, Math.min(lastPage.value, Number(value) || firstPage.value))
  }
  function switchPdfPage(delta) {
    currentPdfPage.value = clampPdfPage(currentPdfPage.value + delta)
  }
  function syncToBasePage() {
    currentPdfPage.value = basePdfPage.value
  }
  return {
    pdfLoading, pdfError, currentPdfPage, basePdfPage, pdfPageWarning,
    allowedPdfPages, pdfUrl, localPdfPage, totalPdfPages,
    resetPdf, resolveProjectPdf, clampPdfPage, switchPdfPage, syncToBasePage
  }
}
