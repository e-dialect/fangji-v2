<template>
  <div class="pdf-viewer">
    <div v-if="error" class="alert alert-error" style="margin:1rem">{{ error }}</div>
    <div v-else class="pdf-canvas-wrap" ref="wrapRef">
      <canvas ref="canvasRef" class="pdf-canvas"></canvas>
      <div v-if="loading" class="pdf-loading-mask">PDF 加载中...</div>
      <div class="pdf-watermark-layer" v-if="watermarkText">
        <span
          v-for="n in 18"
          :key="n"
          class="pdf-watermark-item"
        >{{ watermarkText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount, computed } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  pageNumber: { type: Number, default: 1 },
  watermarkUserId: { type: String, default: '' }
})

const wrapRef = ref(null)
const canvasRef = ref(null)
const loading = ref(false)
const error = ref('')

let pdfDocTask = null
let pdfDoc = null
let renderTask = null
let resizeObserver = null
let pdfjsLib = null
const today = new Date()
const watermarkDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const watermarkText = computed(() => {
  return props.watermarkUserId ? `${props.watermarkUserId} ${watermarkDate}` : ''
})

watch(
  () => props.src,
  async (newSrc) => {
    await loadPdf(newSrc)
  },
  { immediate: true }
)

watch(
  () => props.pageNumber,
  async () => {
    await renderCurrentPage()
  }
)

async function loadPdf(src) {
  cleanupRenderOnly()
  error.value = ''

  if (!src) {
    pdfDoc = null
    loading.value = false
    return
  }

  loading.value = true
  try {
    const lib = await ensurePdfJsLib()
    lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js'

    if (pdfDocTask) {
      try { await pdfDocTask.destroy() } catch {}
    }
    pdfDocTask = lib.getDocument({ url: src })
    pdfDoc = await pdfDocTask.promise
    await nextTick()
    await renderCurrentPage()
    attachResizeObserver()
  } catch (e) {
    pdfDoc = null
    error.value = e?.message || 'PDF 加载失败'
  } finally {
    loading.value = false
  }
}

async function ensurePdfJsLib() {
  if (pdfjsLib) return pdfjsLib
  if (window.pdfjsLib) {
    pdfjsLib = window.pdfjsLib
    return pdfjsLib
  }
  await loadScript('/pdfjs/pdf.min.js')
  if (!window.pdfjsLib) {
    throw new Error('PDF.js 初始化失败')
  }
  pdfjsLib = window.pdfjsLib
  return pdfjsLib
}

function loadScript(src, type = 'text/javascript') {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.type = type
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('加载 PDF.js 资源失败'))
    document.head.appendChild(script)
  })
}

async function renderCurrentPage() {
  if (!pdfDoc || !canvasRef.value || !wrapRef.value) return
  const maxPage = pdfDoc.numPages || 1
  const safePage = Math.max(1, Math.min(maxPage, Number(props.pageNumber) || 1))

  if (renderTask) {
    try { renderTask.cancel() } catch {}
    renderTask = null
  }

  try {
    const page = await pdfDoc.getPage(safePage)
    const baseViewport = page.getViewport({ scale: 1 })
    const wrapWidth = Math.max(1, wrapRef.value.clientWidth - 16)
    const cssScale = wrapWidth / baseViewport.width
    const viewport = page.getViewport({ scale: cssScale })
    // Hide PDF header by cropping a fixed top band (in PDF points) after scaling.
    const headerCropAtScale1 = 48
    const cropCssPx = Math.max(0, Math.min(viewport.height * 0.25, headerCropAtScale1 * cssScale))

    const canvas = canvasRef.value
    const context = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const targetCssWidth = Math.floor(viewport.width)
    const targetCssHeight = Math.max(1, Math.floor(viewport.height - cropCssPx))
    canvas.width = Math.floor(targetCssWidth * dpr)
    canvas.height = Math.floor(targetCssHeight * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${targetCssHeight}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, targetCssWidth, targetCssHeight)

    const tempCanvas = document.createElement('canvas')
    const tempContext = tempCanvas.getContext('2d')
    tempCanvas.width = Math.floor(viewport.width * dpr)
    tempCanvas.height = Math.floor(viewport.height * dpr)
    tempContext.setTransform(dpr, 0, 0, dpr, 0, 0)

    renderTask = page.render({ canvasContext: tempContext, viewport })
    await renderTask.promise
    renderTask = null

    context.drawImage(
      tempCanvas,
      0,
      Math.floor(cropCssPx * dpr),
      canvas.width,
      canvas.height,
      0,
      0,
      targetCssWidth,
      targetCssHeight
    )
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') {
      error.value = e?.message || '渲染失败'
    }
  }
}

function attachResizeObserver() {
  if (resizeObserver || !wrapRef.value) return
  resizeObserver = new ResizeObserver(() => {
    renderCurrentPage()
  })
  resizeObserver.observe(wrapRef.value)
}

function cleanupRenderOnly() {
  if (renderTask) {
    try { renderTask.cancel() } catch {}
    renderTask = null
  }
}

onBeforeUnmount(async () => {
  cleanupRenderOnly()
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (pdfDocTask) {
    try { await pdfDocTask.destroy() } catch {}
    pdfDocTask = null
  }
  pdfDoc = null
})
</script>

<style scoped>
.pdf-viewer {
  width: 100%;
  height: 100%;
  min-height: 720px;
  overflow: auto;
  background: #f8fafc;
}

.pdf-canvas-wrap {
  position: relative;
  min-height: 100%;
  padding: 8px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.pdf-canvas {
  display: block;
  background: #fff;
}

.pdf-loading-mask {
  position: absolute;
  inset: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(248, 250, 252, 0.68);
  color: #475569;
  font-size: 14px;
  pointer-events: none;
}

.pdf-watermark-layer {
  position: absolute;
  inset: 8px;
  pointer-events: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-content: space-evenly;
  justify-items: center;
  overflow: hidden;
}

.pdf-watermark-item {
  color: rgba(30, 41, 59, 0.16);
  font-size: 14px;
  letter-spacing: 0.5px;
  transform: rotate(-28deg);
  user-select: none;
  white-space: nowrap;
}
</style>
