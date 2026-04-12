<template>
  <div class="container page">
    <div class="flex items-center gap-3 mb-6">
      <RouterLink to="/admin" class="btn btn-secondary btn-sm">← 返回</RouterLink>
      <h2 class="font-bold" style="font-size:1.5rem">{{ project?.name || '项目详情' }}</h2>
    </div>

    <div v-if="loadingProject" class="text-muted">加载中...</div>
    <div v-else-if="projectError" class="alert alert-error">{{ projectError }}</div>
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
            <h4 class="font-semibold mb-2">上传 CSV 文件（每行一条待校对文本）</h4>
            <p class="text-sm text-muted mb-3">
              CSV 需包含字段 <code>PDF页码</code>。<br>
              系统会将每行去掉 <code>PDF页码</code> 字段后的内容导入为新条目。
            </p>
            <input type="file" accept=".csv" @change="onCsvSelected" ref="csvInput" style="display:none" />
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
        <div class="card-title">文本条目列表 ({{ pages.length }} 条)</div>
        <div v-if="loadingPages" class="text-muted text-sm">加载中...</div>
        <div v-else-if="pages.length === 0" class="empty-state">
          <div class="empty-state-icon">📄</div>
          <div class="empty-state-text">暂无条目，请上传 PDF 或 CSV 文件</div>
        </div>
        <div v-else class="table-wrapper">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm text-muted">
              已选择 {{ selectedPendingIds.length }} 条待校对条目
            </div>
            <div class="flex gap-2">
              <input
                v-model.trim="rangeSelectInput"
                type="text"
                class="form-control"
                style="width: 220px;"
                placeholder="输入范围，如 1-33 或 1,3,5-8"
                :disabled="mutatingRows"
              />
              <button class="btn btn-secondary btn-sm" @click="selectByRange" :disabled="mutatingRows || !rangeSelectInput">
                范围选中
              </button>
              <button class="btn btn-secondary btn-sm" @click="toggleSelectAllPending" :disabled="mutatingRows || pendingPages.length === 0">
                {{ allPendingSelected ? '取消全选待校对' : '全选待校对' }}
              </button>
              <button class="btn btn-secondary btn-sm" @click="moveSelectedRowsDown" :disabled="mutatingRows || selectedPendingIds.length === 0">
                {{ mutatingRows ? '处理中...' : '批量下移所选' }}
              </button>
              <button class="btn btn-danger btn-sm" @click="deleteSelectedRows" :disabled="mutatingRows || selectedPendingIds.length === 0">
                {{ mutatingRows ? '处理中...' : '批量删除所选' }}
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:64px">选择</th>
                <th>条号</th>
                <th>状态</th>
                <th>校对员</th>
                <th>审核员</th>
                <th>OCR文本预览</th>
                <th style="width:160px">顺序</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pg, idx) in pages" :key="pg.id">
                <td>
                  <input
                    type="checkbox"
                    :checked="selectedPendingIds.includes(pg.id)"
                    :disabled="!isPending(pg) || mutatingRows"
                    @change="toggleRowSelection(pg.id, $event.target.checked)"
                  />
                </td>
                <td>第 {{ formatItemNo(pg.page_number, idx) }} 条</td>
                <td><span :class="statusBadgeClass(pg.status)" class="badge">{{ statusLabel(pg.status) }}</span></td>
                <td class="text-sm text-muted">{{ pg.expand?.proofreader?.name || '—' }}</td>
                <td class="text-sm text-muted">{{ pg.expand?.reviewer?.name || '—' }}</td>
                <td class="text-sm text-muted" style="max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  {{ pg.ocr_text?.slice(0, 80) || '—' }}
                </td>
                <td>
                  <div class="flex gap-2">
                    <button
                      class="btn btn-secondary btn-sm"
                      :disabled="!canMoveUp(pg.id) || mutatingRows"
                      @click="movePendingRow(pg.id, -1)"
                    >
                      上移
                    </button>
                    <button
                      class="btn btn-secondary btn-sm"
                      :disabled="!canMoveDown(pg.id) || mutatingRows"
                      @click="movePendingRow(pg.id, 1)"
                    >
                      下移
                    </button>
                  </div>
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
const projectId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id

const project = ref(null)
const projectError = ref('')
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
const mutatingRows = ref(false)
const pdfSuccess = ref(false)
const pdfError = ref('')
const csvSuccess = ref('')
const csvError = ref('')
const selectedPendingIds = ref([])
const rangeSelectInput = ref('')

const approvedPct = computed(() => {
  if (!pageStats.value.total) return 0
  return Math.round((pageStats.value.approved / pageStats.value.total) * 100)
})

const pendingPages = computed(() => pages.value.filter((p) => p.status === 'pending'))
const allPendingSelected = computed(() => {
  if (!pendingPages.value.length) return false
  return pendingPages.value.every((p) => selectedPendingIds.value.includes(p.id))
})
const pendingIndexById = computed(() => {
  const map = {}
  pendingPages.value.forEach((p, i) => {
    map[p.id] = i
  })
  return map
})

onMounted(async () => {
  try {
    project.value = await pb.collection('projects').getOne(projectId)
  } catch (e) {
    const status = e?.status || e?.response?.status
    if (status === 401) {
      projectError.value = '登录状态已失效，请重新登录。'
    } else if (status === 403) {
      projectError.value = '无权限查看该项目。'
    } else if (status === 404) {
      projectError.value = '项目不存在。'
    } else {
      projectError.value = e?.response?.message || '加载项目失败，请稍后重试。'
    }
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
        filter: `project="${projectId}"`,
        sort: 'page_number',
        expand: 'proofreader,reviewer'
      })
      allPages.push(...result.items)
      page += 1
    } while (page <= result.totalPages)
    pages.value = allPages
    selectedPendingIds.value = selectedPendingIds.value.filter((id) => allPages.some((p) => p.id === id && p.status === 'pending'))
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
    formData.append('project', projectId)
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
    const text = await readCsvText(csvFile.value)
    const rows = parseCsv(text.replace(/^\uFEFF/, ''))
    if (!rows.length) throw new Error('CSV 文件为空或无法读取有效行')

    const headerKeys = Object.keys(rows[0] || {})
    const pdfPageKey = headerKeys.find((k) => k.trim() === 'PDF页码')
    if (!pdfPageKey) {
      throw new Error('CSV 缺少必填字段：PDF页码')
    }

    // Determine next page number from existing pages.
    const existingPages = await pb.collection('pages').getFullList({
      filter: `project="${projectId}"`,
      fields: 'page_number'
    })
    let nextPageNum = existingPages.reduce((max, p) => {
      const n = Number(p.page_number)
      return Number.isFinite(n) ? Math.max(max, n) : max
    }, 0) + 1

    let created = 0
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const pdfPageRaw = String(row[pdfPageKey] ?? '').trim()
      const pdfPage = Number(pdfPageRaw)
      if (!Number.isInteger(pdfPage) || pdfPage <= 0) {
        throw new Error(`第 ${i + 2} 行的 PDF页码 无效，请填写正整数`)
      }

      const parts = []
      for (const [key, value] of Object.entries(row)) {
        if (key.trim() === 'PDF页码') continue
        const textPart = String(value ?? '').trim()
        if (textPart) parts.push(textPart)
      }
      const entryText = parts.join(' ').trim()
      if (!entryText) {
        throw new Error(`第 ${i + 2} 行去掉 PDF页码 后内容为空`)
      }

      await pb.collection('pages').create({
        project: projectId,
        page_number: nextPageNum++,
        pdf_page: pdfPage,
        ocr_text: entryText,
        status: 'pending'
      })
      created++
    }

    csvSuccess.value = `成功导入 ${created} 条待校对任务！`
    selectedPendingIds.value = []
    csvFile.value = null
    if (csvInput.value) csvInput.value.value = ''
    await loadPages()
  } catch (e) {
    csvError.value = e?.message || '导入失败，请检查文件格式'
  } finally {
    uploadingCsv.value = false
  }
}

async function readCsvText(file) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  // Try UTF-8 first, then common Chinese CSV encodings.
  const candidates = ['utf-8', 'gb18030', 'gbk']
  let best = ''
  let bestScore = Number.POSITIVE_INFINITY

  for (const encoding of candidates) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: false }).decode(bytes)
      const score = textGarbleScore(decoded)
      if (score < bestScore) {
        best = decoded
        bestScore = score
      }
      // Clean UTF-8 result: return early for speed and stability.
      if (encoding === 'utf-8' && score === 0) return decoded
    } catch {
      // Ignore unsupported encodings and continue fallback.
    }
  }

  if (!best) {
    throw new Error('CSV 文件编码无法识别，请保存为 UTF-8 或 GB18030 后重试')
  }
  return best
}

function textGarbleScore(text) {
  if (!text) return 0
  // Replacement char usually indicates decode mismatch.
  const replacementCount = (text.match(/\uFFFD/g) || []).length
  // Null chars are also a strong signal of broken decoding.
  const nullCount = (text.match(/\u0000/g) || []).length
  return replacementCount * 10 + nullCount
}

function isPending(row) {
  return row?.status === 'pending'
}

function toggleRowSelection(id, checked) {
  if (mutatingRows.value) return
  if (checked) {
    if (!selectedPendingIds.value.includes(id)) selectedPendingIds.value.push(id)
    return
  }
  selectedPendingIds.value = selectedPendingIds.value.filter((x) => x !== id)
}

function toggleSelectAllPending() {
  if (mutatingRows.value) return
  if (allPendingSelected.value) {
    selectedPendingIds.value = []
    return
  }
  selectedPendingIds.value = pendingPages.value.map((p) => p.id)
}

function canMoveUp(id) {
  const idx = pendingIndexById.value[id]
  return Number.isInteger(idx) && idx > 0
}

function canMoveDown(id) {
  const idx = pendingIndexById.value[id]
  return Number.isInteger(idx) && idx < pendingPages.value.length - 1
}

async function movePendingRow(id, direction) {
  if (mutatingRows.value) return
  const idx = pendingIndexById.value[id]
  if (!Number.isInteger(idx)) return
  const targetIdx = idx + direction
  if (targetIdx < 0 || targetIdx >= pendingPages.value.length) return

  const current = pendingPages.value[idx]
  const target = pendingPages.value[targetIdx]
  if (!current || !target) return

  mutatingRows.value = true
  try {
    const maxPageNum = pages.value.reduce((max, p) => {
      const n = Number(p.page_number)
      return Number.isFinite(n) ? Math.max(max, n) : max
    }, 0)
    const tempPageNum = maxPageNum + 1
    const currentPageNum = Number(current.page_number)
    const targetPageNum = Number(target.page_number)

    await pb.collection('pages').update(current.id, { page_number: tempPageNum })
    await pb.collection('pages').update(target.id, { page_number: currentPageNum })
    await pb.collection('pages').update(current.id, { page_number: targetPageNum })
    await loadPages()
  } catch (e) {
    alert(e?.response?.message || '顺序调整失败，请重试')
  } finally {
    mutatingRows.value = false
  }
}

function parseRangeInput(text, max) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const indices = new Set()
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim())
      const start = Number(startStr)
      const end = Number(endStr)
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue
      const from = Math.max(1, Math.min(start, end))
      const to = Math.min(max, Math.max(start, end))
      for (let i = from; i <= to; i++) indices.add(i - 1)
    } else {
      const n = Number(part)
      if (!Number.isInteger(n)) continue
      if (n >= 1 && n <= max) indices.add(n - 1)
    }
  }

  return Array.from(indices).sort((a, b) => a - b)
}

function selectByRange() {
  if (mutatingRows.value) return
  const indexes = parseRangeInput(rangeSelectInput.value, pages.value.length)
  if (!indexes.length) {
    alert('范围格式无效，请输入如 1-33 或 1,3,5-8')
    return
  }

  const ids = []
  for (const idx of indexes) {
    const row = pages.value[idx]
    if (row && isPending(row)) ids.push(row.id)
  }

  selectedPendingIds.value = ids
  if (!ids.length) {
    alert('该范围内没有可操作的待校对条目（仅 pending 可选）')
  }
}

async function applyPendingOrderByIds(orderedPendingIds) {
  const pending = pendingPages.value
  if (!pending.length) return
  const pageNumbers = pending.map((p) => Number(p.page_number)).sort((a, b) => a - b)
  const pendingById = Object.fromEntries(pending.map((p) => [p.id, p]))

  for (let i = 0; i < orderedPendingIds.length; i++) {
    const id = orderedPendingIds[i]
    const row = pendingById[id]
    if (!row) continue
    const nextNo = pageNumbers[i]
    if (Number(row.page_number) !== nextNo) {
      await pb.collection('pages').update(id, { page_number: nextNo })
    }
  }
}

async function moveSelectedRowsDown() {
  if (mutatingRows.value || selectedPendingIds.value.length === 0) return
  const pending = pendingPages.value
  if (!pending.length) return

  const ids = pending.map((p) => p.id)
  const selectedSet = new Set(selectedPendingIds.value)
  const reordered = [...ids]

  let moved = false
  for (let i = reordered.length - 2; i >= 0; i--) {
    const curr = reordered[i]
    const next = reordered[i + 1]
    if (selectedSet.has(curr) && !selectedSet.has(next)) {
      reordered[i] = next
      reordered[i + 1] = curr
      moved = true
    }
  }

  if (!moved) return

  mutatingRows.value = true
  try {
    await applyPendingOrderByIds(reordered)
    await loadPages()
  } catch (e) {
    alert(e?.response?.message || '批量下移失败，请重试')
  } finally {
    mutatingRows.value = false
  }
}

async function resequenceAllRows() {
  const all = await pb.collection('pages').getFullList({
    filter: `project="${projectId}"`,
    sort: 'page_number',
    fields: 'id,page_number'
  })
  for (let i = 0; i < all.length; i++) {
    const desired = i + 1
    if (Number(all[i].page_number) !== desired) {
      await pb.collection('pages').update(all[i].id, { page_number: desired })
    }
  }
}

async function deleteSelectedRows() {
  if (mutatingRows.value || selectedPendingIds.value.length === 0) return
  const ok = window.confirm(`确认删除已选择的 ${selectedPendingIds.value.length} 条待校对条目吗？此操作不可恢复。`)
  if (!ok) return

  mutatingRows.value = true
  try {
    await Promise.all(selectedPendingIds.value.map((id) => pb.collection('pages').delete(id)))
    selectedPendingIds.value = []
    await resequenceAllRows()
    await loadPages()
  } catch (e) {
    alert(e?.response?.message || '批量删除失败，请重试')
  } finally {
    mutatingRows.value = false
  }
}

function statusLabel(s) {
  const map = { pending: '待校对', claimed: '已认领', proofreading: '校对中', proofread: '待审核', reviewing: '审核中', approved: '已通过', rejected: '已打回' }
  return map[s] || s
}

function formatItemNo(pageNumber, fallbackIndex) {
  const n = Number(pageNumber)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return fallbackIndex + 1
}

function statusBadgeClass(s) {
  return `badge-${s}`
}
</script>
