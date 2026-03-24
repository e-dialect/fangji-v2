<template>
  <div class="container page">
    <div class="flex items-center gap-3 mb-6">
      <RouterLink to="/admin" class="btn btn-secondary btn-sm">← 返回</RouterLink>
      <h2 class="font-bold" style="font-size:1.5rem">{{ project?.name || '项目详情' }}</h2>
    </div>

    <div v-if="loadingProject" class="text-muted">加载中...</div>
    <div v-else-if="!project" class="alert alert-error">项目不存在</div>
    <template v-else>
      <!-- Project summary -->
      <div class="card mb-6">
        <div class="card-title">项目概览</div>
        <p v-if="project.description" class="text-muted text-sm mb-4">{{ project.description }}</p>
        <div class="grid-3">
          <div class="stat-card">
            <div class="stat-value">{{ pageStats.total }}</div>
            <div class="stat-label">总页数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ pageStats.proofread }}</div>
            <div class="stat-label">已校对</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ pageStats.approved }}</div>
            <div class="stat-label">已审核通过</div>
          </div>
        </div>
        <div v-if="pageStats.total > 0" class="mt-4">
          <div class="progress">
            <div class="progress-bar" :style="{ width: approvedPct + '%' }"></div>
          </div>
          <span class="text-sm text-muted mt-1">审核进度: {{ approvedPct }}%</span>
        </div>
      </div>

      <!-- Upload section -->
      <div class="card mb-6">
        <div class="card-title">上传文件</div>

        <div class="grid-2">
          <!-- PDF upload -->
          <div>
            <h4 class="font-semibold mb-2">上传 PDF 文件</h4>
            <p class="text-sm text-muted mb-3">上传扫描版PDF，系统将自动按页拆分并进行OCR识别（后台处理，可能需要几分钟）。</p>
            <input type="file" accept=".pdf" @change="onPdfSelected" ref="pdfInput" style="display:none" />
            <button class="btn btn-secondary" @click="$refs.pdfInput.click()">选择 PDF 文件</button>
            <span v-if="pdfFile" class="text-sm ml-2">{{ pdfFile.name }}</span>
            <div v-if="pdfFile" class="mt-3">
              <button class="btn btn-primary" @click="uploadPdf" :disabled="uploadingPdf">
                {{ uploadingPdf ? '上传中...' : '上传 PDF' }}
              </button>
            </div>
            <div v-if="pdfSuccess" class="alert alert-success mt-2">PDF 上传成功！</div>
            <div v-if="pdfError" class="alert alert-error mt-2">{{ pdfError }}</div>
          </div>

          <!-- CSV upload -->
          <div>
            <h4 class="font-semibold mb-2">上传 CSV/TSV 文件（手动OCR结果）</h4>
            <p class="text-sm text-muted mb-3">
              上传已处理好的OCR结果CSV或TSV文件，自动识别分隔符。<br>
              必须包含页码列（<code>page_number</code> 或 <code>page</code>），其余列将合并为识别文本。<br>
              支持多列格式（如 <code>word</code> + <code>pinyin</code>）及每页多行数据。
            </p>
            <input type="file" accept=".csv,.tsv" @change="onCsvSelected" ref="csvInput" style="display:none" />
            <button class="btn btn-secondary" @click="$refs.csvInput.click()">选择 CSV 文件</button>
            <span v-if="csvFile" class="text-sm ml-2">{{ csvFile.name }}</span>
            <div v-if="csvFile" class="mt-3">
              <button class="btn btn-primary" @click="uploadCsv" :disabled="uploadingCsv">
                {{ uploadingCsv ? '导入中...' : '导入 CSV' }}
              </button>
            </div>
            <div v-if="csvSuccess" class="alert alert-success mt-2">{{ csvSuccess }}</div>
            <div v-if="csvError" class="alert alert-error mt-2">{{ csvError }}</div>
          </div>
        </div>
      </div>

      <!-- Pages list -->
      <div class="card">
        <div class="card-title">页面列表 ({{ pages.length }} 页)</div>
        <div v-if="loadingPages" class="text-muted text-sm">加载中...</div>
        <div v-else-if="pages.length === 0" class="empty-state">
          <div class="empty-state-icon">📄</div>
          <div class="empty-state-text">暂无页面，请上传 PDF 或 CSV 文件</div>
        </div>
        <div v-else class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>页码</th>
                <th>状态</th>
                <th>校对员</th>
                <th>审核员</th>
                <th>OCR文本预览</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pg in pages" :key="pg.id">
                <td>第 {{ pg.page_number }} 页</td>
                <td><span :class="statusBadgeClass(pg.status)" class="badge">{{ statusLabel(pg.status) }}</span></td>
                <td class="text-sm text-muted">{{ pg.expand?.proofreader?.name || '—' }}</td>
                <td class="text-sm text-muted">{{ pg.expand?.reviewer?.name || '—' }}</td>
                <td class="text-sm text-muted" style="max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  {{ pg.ocr_text?.slice(0, 80) || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import pb from '@/lib/pocketbase'
import { parseCsv } from '@/lib/csvParser'

const route = useRoute()

const project = ref(null)
const pages = ref([])
const loadingProject = ref(true)
const loadingPages = ref(true)
const pageStats = ref({ total: 0, proofread: 0, approved: 0 })

const pdfInput = ref(null)
const csvInput = ref(null)
const pdfFile = ref(null)
const csvFile = ref(null)
const uploadingPdf = ref(false)
const uploadingCsv = ref(false)
const pdfSuccess = ref(false)
const pdfError = ref('')
const csvSuccess = ref('')
const csvError = ref('')

const approvedPct = computed(() => {
  if (!pageStats.value.total) return 0
  return Math.round((pageStats.value.approved / pageStats.value.total) * 100)
})

onMounted(async () => {
  try {
    project.value = await pb.collection('projects').getOne(route.params.id)
  } catch {
    loadingProject.value = false
    return
  }
  loadingProject.value = false
  await loadPages()
})

async function loadPages() {
  loadingPages.value = true
  try {
    const perPage = 50
    const allPages = []
    let page = 1
    let result
    do {
      result = await pb.collection('pages').getList(page, perPage, {
        filter: `project="${route.params.id}"`,
        sort: 'page_number',
        expand: 'proofreader,reviewer'
      })
      allPages.push(...result.items)
      page += 1
    } while (page <= result.totalPages)
    pages.value = allPages
    pageStats.value.total = allPages.length
    pageStats.value.proofread = allPages.filter(p => ['proofread', 'reviewing', 'approved'].includes(p.status)).length
    pageStats.value.approved = allPages.filter(p => p.status === 'approved').length
  } catch (e) {
    console.error(e)
  } finally {
    loadingPages.value = false
  }
}

function onPdfSelected(e) {
  pdfFile.value = e.target.files[0] || null
  pdfSuccess.value = false
  pdfError.value = ''
}

function onCsvSelected(e) {
  csvFile.value = e.target.files[0] || null
  csvSuccess.value = ''
  csvError.value = ''
}

async function uploadPdf() {
  if (!pdfFile.value) return
  uploadingPdf.value = true
  pdfError.value = ''
  try {
    const formData = new FormData()
    formData.append('project', route.params.id)
    formData.append('file', pdfFile.value)
    formData.append('original_filename', pdfFile.value.name)
    formData.append('status', 'processing')
    await pb.collection('project_files').create(formData)
    pdfSuccess.value = true
    pdfFile.value = null
    if (pdfInput.value) pdfInput.value.value = ''
  } catch (e) {
    pdfError.value = e?.response?.message || '上传失败，请重试'
  } finally {
    uploadingPdf.value = false
  }
}

async function uploadCsv() {
  if (!csvFile.value) return
  uploadingCsv.value = true
  csvError.value = ''
  csvSuccess.value = ''
  try {
    const text = await csvFile.value.text()
    const rows = parseCsv(text)
    if (!rows.length) throw new Error('CSV 文件为空或格式不正确')

    // Detect page number column: prefer 'page_number', fall back to 'page'
    const firstRow = rows[0]
    const pageCol = 'page_number' in firstRow ? 'page_number' : 'page' in firstRow ? 'page' : null
    if (!pageCol) {
      throw new Error('CSV 必须包含页码列（page_number 或 page）')
    }

    // Text columns are all columns except the page number column
    const textCols = Object.keys(firstRow).filter(c => c !== pageCol)

    // Group rows by page number, aggregating text from all text columns
    const pageMap = new Map()
    let invalidRows = 0
    for (const row of rows) {
      const pageNum = parseInt(row[pageCol], 10)
      if (isNaN(pageNum)) { invalidRows++; continue }
      const rowText = textCols.map(c => row[c] || '').filter(Boolean).join('\t')
      if (pageMap.has(pageNum)) {
        if (rowText) pageMap.set(pageNum, pageMap.get(pageNum) + '\n' + rowText)
      } else {
        pageMap.set(pageNum, rowText)
      }
    }

    // Fetch existing page numbers for this project to detect duplicates
    const existingPages = await pb.collection('pages').getFullList({
      filter: `project="${route.params.id}"`,
      fields: 'page_number'
    })
    const existingPageNums = new Set(existingPages.map(p => p.page_number))

    let created = 0
    const skipped = []
    for (const [pageNum, ocrText] of pageMap) {
      if (existingPageNums.has(pageNum)) {
        skipped.push(pageNum)
        continue
      }
      await pb.collection('pages').create({
        project: route.params.id,
        page_number: pageNum,
        ocr_text: ocrText,
        status: 'pending'
      })
      created++
      existingPageNums.add(pageNum)
    }

    let msg = `成功导入 ${created} 条记录！`
    if (skipped.length) {
      msg += ` 已跳过 ${skipped.length} 条重复页码（第 ${skipped.slice(0, 5).join('、')} 页${skipped.length > 5 ? ' 等' : ''}）。`
    }
    if (invalidRows) {
      msg += ` 已忽略 ${invalidRows} 行无效页码数据。`
    }
    csvSuccess.value = msg
    csvFile.value = null
    if (csvInput.value) csvInput.value.value = ''
    await loadPages()
  } catch (e) {
    csvError.value = e?.message || '导入失败，请检查文件格式'
  } finally {
    uploadingCsv.value = false
  }
}

function statusLabel(s) {
  const map = { pending: '待校对', claimed: '已认领', proofreading: '校对中', proofread: '待审核', reviewing: '审核中', approved: '已通过', rejected: '已打回' }
  return map[s] || s
}
function statusBadgeClass(s) {
  return `badge-${s}`
}
</script>
