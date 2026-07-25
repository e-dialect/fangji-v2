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
            <div class="stat-label">校对完成</div>
          </div>
        </div>
        <div v-if="pageStats.total > 0" class="mt-4">
          <div class="progress">
            <div class="progress-bar" :style="{ width: approvedPct + '%' }"></div>
          </div>
          <span class="text-sm text-muted mt-1">完成进度: {{ approvedPct }}%</span>
        </div>
      </div>

      <!-- Upload section -->
      <div class="card mb-6">
        <div class="card-title">上传文件</div>

        <div class="grid-2">
          <!-- PDF upload -->
          <div>
            <h4 class="font-semibold mb-2">上传 PDF 文件</h4>
            <p class="text-sm text-muted mb-3">上传扫描版 PDF 作为校对原文预览。当前系统不会自动 OCR 或生成条目，请通过 CSV 导入待校对文本。</p>
            <input type="file" accept=".pdf" @change="onPdfSelected" ref="pdfInput" style="display:none" />
            <button class="btn btn-secondary" @click="$refs.pdfInput.click()">选择 PDF 文件</button>
            <span v-if="pdfFile" class="text-sm ml-2">{{ pdfFile.name }}</span>
            <div v-if="pdfFile" class="mt-3">
              <button class="btn btn-primary" @click="uploadPdf" :disabled="uploadingPdf">
                {{ uploadingPdf ? '上传处理中...' : '上传 PDF' }}
              </button>
            </div>
            <div v-if="pdfProcessing" class="alert mt-2">PDF 已上传，后端正在校验文件...</div>
            <div v-if="pdfSuccess" class="alert alert-success mt-2">PDF 校验完成，可在校对编辑器中预览。</div>
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
                {{ uploadingCsv ? '上传处理中...' : '导入 CSV' }}
              </button>
            </div>
            <div v-if="csvJob" class="import-job-card mt-3">
              <div class="flex items-center justify-between gap-2">
                <strong>{{ csvJobStatusLabel }}</strong>
                <span class="text-sm text-muted">作业 {{ csvJob.id }}</span>
              </div>
              <div class="progress mt-2">
                <div class="progress-bar" :style="{ width: csvJobProgress + '%' }"></div>
              </div>
              <div class="text-sm mt-2">
                已处理 {{ csvJob.processed_count || 0 }} 条；
                成功 {{ csvJob.success_count || 0 }} 条；
                跳过 {{ csvJob.failed_count || 0 }} 条
              </div>
              <div v-if="csvJob.error_message" class="text-sm text-muted mt-1">{{ csvJob.error_message }}</div>
            </div>
            <div v-if="csvSuccess" class="alert alert-success mt-2">{{ csvSuccess }}</div>
            <div v-if="csvError" class="alert alert-error mt-2" style="white-space:pre-line">{{ csvError }}</div>
            <div v-if="csvImportErrors.length" class="mt-3">
              <div class="font-semibold mb-2">
                错误明细（显示前 {{ csvImportErrors.length }} 条）
              </div>
              <div class="table-wrapper import-error-table">
                <table>
                  <thead>
                    <tr>
                      <th>CSV 行</th>
                      <th>字段</th>
                      <th>错误代码</th>
                      <th>原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in csvImportErrors" :key="item.id">
                      <td>{{ item.row_number || '—' }}</td>
                      <td>{{ item.column_name || '—' }}</td>
                      <td><code>{{ item.error_code }}</code></td>
                      <td>
                        {{ item.message }}
                        <span v-if="item.raw_value" class="text-muted">（值：{{ item.raw_value }}）</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Export section -->
      <div class="card mb-6">
        <div class="card-title">导出结果</div>
        <p class="text-sm text-muted mb-3">
          导出当前项目的最终校对结果 CSV。只有两次校对一致后的条目会使用最终校对内容，其余条目回退到原始内容。
        </p>
        <div class="flex gap-2 items-center">
          <button class="btn btn-primary" @click="exportCsv" :disabled="exportingCsv">
            {{ exportingCsv ? '导出中...' : '导出校对结果 CSV' }}
          </button>
          <span v-if="exportError" class="alert alert-error" style="margin:0">{{ exportError }}</span>
          <span v-if="exportSuccess" class="alert alert-success" style="margin:0">{{ exportSuccess }}</span>
        </div>
      </div>

      <!-- Pages list -->
      <div class="card">
        <div class="card-title">
          文本条目列表（共 {{ pages.length }} 条<span v-if="hasActiveListFilter">，筛选出 {{ filteredPages.length }} 条</span>）
        </div>
        <div v-if="mutationSuccess" class="alert alert-success" role="status">{{ mutationSuccess }}</div>
        <div v-if="mutationError" class="alert alert-error" role="alert">{{ mutationError }}</div>
        <div v-if="pages.length" class="admin-list-filters mb-4">
          <label class="admin-filter-field">
            <span>搜索条目</span>
            <input
              v-model="searchQuery"
              type="search"
              class="form-control"
              placeholder="条号、PDF页码、文本或校对员"
            />
          </label>
          <label class="admin-filter-field">
            <span>状态</span>
            <select v-model="selectedStatus" class="form-control">
              <option value="">全部状态</option>
              <option v-for="option in statusOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="admin-filter-field admin-filter-size">
            <span>每页显示</span>
            <select v-model.number="listPageSize" class="form-control">
              <option :value="10">10 条</option>
              <option :value="25">25 条</option>
              <option :value="50">50 条</option>
              <option :value="100">100 条</option>
            </select>
          </label>
          <button
            v-if="hasActiveListFilter"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="resetListFilters"
          >
            清除筛选
          </button>
        </div>
        <div v-if="loadingPages" class="text-muted text-sm">加载中...</div>
        <div v-else-if="pagesError" class="alert alert-error">
          {{ pagesError }}
          <button type="button" class="btn btn-secondary btn-sm ml-2" @click="loadPages">重新加载</button>
        </div>
        <div v-else-if="pages.length === 0" class="empty-state">
          <div class="empty-state-icon">📄</div>
          <div class="empty-state-text">暂无条目，请上传 CSV 文件</div>
        </div>
        <div v-else-if="filteredPages.length === 0" class="empty-state">
          <div class="empty-state-icon">🔎</div>
          <div class="empty-state-text">没有符合当前条件的条目</div>
          <button type="button" class="btn btn-secondary mt-3" @click="resetListFilters">清除筛选</button>
        </div>
        <div v-else>
          <div class="admin-table-actions mb-3">
            <div class="text-sm text-muted">
              已选择 {{ selectedPendingIds.length }} 条待校对条目；范围按完整列表条号选择
            </div>
            <div class="admin-bulk-actions">
              <input
                v-model.trim="rangeSelectInput"
                type="text"
                class="form-control"
                placeholder="输入范围，如 1-33 或 1,3,5-8"
                aria-label="按完整列表范围选择条目"
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
          <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style="width:64px">选择</th>
                <th>条号</th>
                <th>状态</th>
                <th>一校</th>
                <th>二校</th>
                <th>不一致次数</th>
                <th>OCR文本预览</th>
                <th style="width:100px">操作</th>
                <th style="width:160px">顺序</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pg, idx) in displayedPages" :key="pg.id">
                <td>
                  <input
                    type="checkbox"
                    :checked="selectedPendingIds.includes(pg.id)"
                    :disabled="!isPending(pg) || mutatingRows"
                    :aria-label="`选择第 ${formatItemNo(pg.page_number, displayedPageOffset + idx)} 条`"
                    @change="toggleRowSelection(pg.id, $event.target.checked)"
                  />
                </td>
                <td>第 {{ formatItemNo(pg.page_number, displayedPageOffset + idx) }} 条</td>
                <td><span :class="statusBadgeClass(pg.status)" class="badge">{{ statusLabel(pg.status) }}</span></td>
                <td class="text-sm text-muted">{{ pg.expand?.first_proofreader?.name || pg.expand?.first_proofreader?.email || '—' }}</td>
                <td class="text-sm text-muted">{{ pg.expand?.second_proofreader?.name || pg.expand?.second_proofreader?.email || '—' }}</td>
                <td class="text-sm text-muted">{{ pg.mismatch_count || 0 }}</td>
                <td class="text-sm text-muted" style="max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  {{ pg.ocr_text?.slice(0, 80) || '—' }}
                </td>
                <td>
                  <RouterLink
                    v-if="pg.status === PAGE_STATUS.ARBITRATION"
                    :to="`/admin/projects/${projectId}/arbitration/${pg.id}`"
                    class="btn btn-warn btn-sm"
                  >
                    仲裁
                  </RouterLink>
                  <span v-else class="text-muted">—</span>
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
          <nav v-if="listPagination.totalPages > 1" class="admin-pagination" aria-label="条目分页">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="listPagination.page <= 1"
              @click="currentListPage -= 1"
            >
              上一页
            </button>
            <span class="text-sm text-muted">
              第 {{ listPagination.page }} / {{ listPagination.totalPages }} 页
            </span>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="listPagination.page >= listPagination.totalPages"
              @click="currentListPage += 1"
            >
              下一页
            </button>
          </nav>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { filterAdminPages, paginateItems, parseRangeInput } from '@/lib/adminPageList'
import { safeParseRowJson } from '@/composables/useStructuredRow'
import {
  PAGE_STATUS,
  PAGE_STATUS_LABELS,
  PROOFREAD_PROGRESS_STATUSES,
  statusBadgeClass,
  statusLabel
} from '@/constants/pageStatus'
import { deletePage, getPagedProjectPages, listAllProjectPages, updatePage } from '@/services/pagesService'
import { createProjectPdf, getProjectFile } from '@/services/projectFilesService'
import { createCsvImport, getImportJob, listImportJobErrors } from '@/services/importJobsService'
import { getProject } from '@/services/projectsService'
import { getPbMessage, getPbStatus } from '@/utils/pbErrors'

const route = useRoute()
const projectId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id

const project = ref(null)
const projectError = ref('')
const pages = ref([])
const pagesError = ref('')
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
const mutationSuccess = ref('')
const mutationError = ref('')
const pdfSuccess = ref(false)
const pdfProcessing = ref(false)
const pdfError = ref('')
const csvSuccess = ref('')
const csvError = ref('')
const csvJob = ref(null)
const csvImportErrors = ref([])
const exportingCsv = ref(false)
const exportError = ref('')
const exportSuccess = ref('')
const selectedPendingIds = ref([])
const rangeSelectInput = ref('')
const searchQuery = ref('')
const selectedStatus = ref('')
const currentListPage = ref(1)
const listPageSize = ref(25)
let pdfPollGeneration = 0
let csvPollGeneration = 0

const statusOptions = Object.entries(PAGE_STATUS_LABELS).map(([value, label]) => ({ value, label }))

const approvedPct = computed(() => {
  if (!pageStats.value.total) return 0
  return Math.round((pageStats.value.approved / pageStats.value.total) * 100)
})

const pendingPages = computed(() => pages.value.filter((p) => p.status === PAGE_STATUS.PENDING))
const filteredPages = computed(() => filterAdminPages(pages.value, {
  query: searchQuery.value,
  status: selectedStatus.value
}))
const listPagination = computed(() => paginateItems(
  filteredPages.value,
  currentListPage.value,
  listPageSize.value
))
const displayedPages = computed(() => listPagination.value.items)
const displayedPageOffset = computed(() => (listPagination.value.page - 1) * listPagination.value.perPage)
const hasActiveListFilter = computed(() => Boolean(searchQuery.value.trim() || selectedStatus.value))
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
const csvJobProgress = computed(() => {
  const processed = Number(csvJob.value?.processed_count || 0)
  const total = Number(csvJob.value?.total_count || 0)
  if (csvJob.value?.status === 'completed' || csvJob.value?.status === 'completed_with_errors') return 100
  if (!total) return csvJob.value?.status === 'processing' ? 10 : 0
  return Math.min(99, Math.round((processed / total) * 100))
})
const csvJobStatusLabel = computed(() => ({
  queued: '等待后端处理',
  processing: '后端正在导入',
  completed: '导入完成',
  completed_with_errors: '导入完成，部分条目已跳过',
  failed: '导入失败'
})[csvJob.value?.status] || '准备导入')

watch([searchQuery, selectedStatus, listPageSize], () => {
  currentListPage.value = 1
})

watch(() => listPagination.value.page, (page) => {
  if (currentListPage.value !== page) currentListPage.value = page
})

onMounted(async () => {
  try {
    project.value = await getProject(projectId)
  } catch (e) {
    const status = getPbStatus(e)
    if (status === 401) {
      projectError.value = '登录状态已失效，请重新登录。'
    } else if (status === 403) {
      projectError.value = '无权限查看该项目。'
    } else if (status === 404) {
      projectError.value = '项目不存在。'
    } else {
      projectError.value = getPbMessage(e, '加载项目失败，请稍后重试。')
    }
    loadingProject.value = false
    return
  }
  loadingProject.value = false
  await loadPages()
})

onBeforeUnmount(() => {
  pdfPollGeneration += 1
  csvPollGeneration += 1
})

async function loadPages() {
  loadingPages.value = true
  pagesError.value = ''
  try {
    const perPage = 50
    const allPages = []
    let page = 1
    let result
    do {
      result = await getPagedProjectPages(projectId, page, perPage, {
        expand: 'proofreader,first_proofreader,second_proofreader'
      })
      allPages.push(...result.items)
      page += 1
    } while (page <= result.totalPages)
    pages.value = allPages
    selectedPendingIds.value = selectedPendingIds.value.filter((id) => allPages.some((p) => p.id === id && p.status === PAGE_STATUS.PENDING))
    pageStats.value.total = allPages.length
    pageStats.value.proofread = allPages.filter(p => PROOFREAD_PROGRESS_STATUSES.includes(p.status)).length
    pageStats.value.approved = allPages.filter(p => p.status === PAGE_STATUS.APPROVED).length
  } catch (e) {
    pagesError.value = getPbMessage(e, '条目列表加载失败，请稍后重试。')
  } finally {
    loadingPages.value = false
  }
}

function resetListFilters() {
  searchQuery.value = ''
  selectedStatus.value = ''
  currentListPage.value = 1
}

function clearMutationFeedback() {
  mutationSuccess.value = ''
  mutationError.value = ''
}

function onPdfSelected(e) {
  pdfFile.value = e.target.files[0] || null
  pdfSuccess.value = false
  pdfProcessing.value = false
  pdfError.value = ''
}

function onCsvSelected(e) {
  csvFile.value = e.target.files[0] || null
  csvSuccess.value = ''
  csvError.value = ''
  csvJob.value = null
  csvImportErrors.value = []
}

async function uploadPdf() {
  if (!pdfFile.value) return
  uploadingPdf.value = true
  pdfError.value = ''
  pdfSuccess.value = false
  pdfProcessing.value = false
  const generation = ++pdfPollGeneration
  try {
    let record = await createProjectPdf({ projectId, file: pdfFile.value })
    pdfProcessing.value = record.status === 'processing'
    pdfFile.value = null
    if (pdfInput.value) pdfInput.value.value = ''
    while (record.status === 'processing' && generation === pdfPollGeneration) {
      await pollDelay(1000)
      record = await getProjectFile(record.id)
    }
    if (generation !== pdfPollGeneration) return
    pdfProcessing.value = false
    if (record.status === 'ready') {
      pdfSuccess.value = true
    } else {
      pdfError.value = record.error_message || 'PDF 后端校验失败'
    }
  } catch (e) {
    pdfError.value = getPbStatus(e) === 413
      ? 'PDF 文件超过 50 MB 上限'
      : getPbMessage(e, '上传失败，请重试')
    pdfProcessing.value = false
  } finally {
    if (generation === pdfPollGeneration) uploadingPdf.value = false
  }
}

async function uploadCsv() {
  if (!csvFile.value) return
  uploadingCsv.value = true
  csvError.value = ''
  csvSuccess.value = ''
  csvJob.value = null
  csvImportErrors.value = []
  const generation = ++csvPollGeneration
  try {
    let job = await createCsvImport({ projectId, file: csvFile.value })
    csvJob.value = job
    csvFile.value = null
    if (csvInput.value) csvInput.value.value = ''
    while (['queued', 'processing'].includes(job.status) && generation === csvPollGeneration) {
      await pollDelay(1000)
      job = await getImportJob(job.id)
      csvJob.value = job
    }
    if (generation !== csvPollGeneration) return

    if (job.status === 'failed') {
      csvError.value = job.error_message || 'CSV 后端处理失败'
    } else {
      csvSuccess.value = job.failed_count > 0
        ? `成功导入 ${job.success_count} 条，跳过 ${job.failed_count} 条错误记录。`
        : `成功导入 ${job.success_count} 条待校对任务！`
      selectedPendingIds.value = []
      if (job.failed_count > 0) {
        const result = await listImportJobErrors(job.id, 1, 100)
        csvImportErrors.value = result.items
      }
      await loadPages()
    }
  } catch (e) {
    csvError.value = getPbStatus(e) === 413
      ? 'CSV 文件超过 50 MB 上限'
      : getPbMessage(e, '导入失败，请检查文件格式')
  } finally {
    if (generation === csvPollGeneration) uploadingCsv.value = false
  }
}

function pollDelay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function exportCsv() {
  exportingCsv.value = true
  exportError.value = ''
  exportSuccess.value = ''
  try {
    const all = await listAllProjectPages(projectId, {
      fields: 'id,page_number,pdf_page,status,ocr_text,proofread_text,ocr_row_json,proofread_row_json'
    })
    if (!all.length) {
      throw new Error('当前项目暂无可导出的条目')
    }

    const headers = []
    const rows = all.map((item) => {
      const proofObj = item.status === PAGE_STATUS.APPROVED
        ? safeParseRowJson(item.proofread_row_json)
        : null
      const ocrObj = safeParseRowJson(item.ocr_row_json)
      const rowObj = proofObj || ocrObj || { 内容: item.proofread_text || item.ocr_text || '' }
      for (const key of Object.keys(rowObj)) {
        if (!headers.includes(key)) headers.push(key)
      }
      return {
        pageNumber: Number(item.pdf_page) || Number(item.page_number) || '',
        rowObj
      }
    })

    const finalHeaders = ['PDF页码', ...headers]
    const lines = [finalHeaders.map(toCsvCell).join(',')]
    for (const row of rows) {
      const values = [row.pageNumber, ...headers.map((h) => row.rowObj[h] ?? '')]
      lines.push(values.map(toCsvCell).join(','))
    }

    const csvText = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = (project.value?.name || 'project').replace(/[\\/:*?"<>|]/g, '_')
    link.href = url
    link.download = `${safeName}_校对结果.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    exportSuccess.value = `已导出 ${rows.length} 条记录`
  } catch (e) {
    exportError.value = e?.message || '导出失败，请重试'
  } finally {
    exportingCsv.value = false
  }
}

function toCsvCell(value) {
  const str = String(value ?? '')
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function isPending(row) {
  return row?.status === PAGE_STATUS.PENDING
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
  clearMutationFeedback()
  try {
    const maxPageNum = pages.value.reduce((max, p) => {
      const n = Number(p.page_number)
      return Number.isFinite(n) ? Math.max(max, n) : max
    }, 0)
    const tempPageNum = maxPageNum + 1
    const currentPageNum = Number(current.page_number)
    const targetPageNum = Number(target.page_number)

    await updatePage(current.id, { page_number: tempPageNum })
    await updatePage(target.id, { page_number: currentPageNum })
    await updatePage(current.id, { page_number: targetPageNum })
    await loadPages()
    mutationSuccess.value = `第 ${currentPageNum} 条已${direction < 0 ? '上移' : '下移'}。`
  } catch (e) {
    mutationError.value = getPbMessage(e, '顺序调整失败，请重试')
  } finally {
    mutatingRows.value = false
  }
}

function selectByRange() {
  if (mutatingRows.value) return
  clearMutationFeedback()
  const indexes = parseRangeInput(rangeSelectInput.value, pages.value.length)
  if (!indexes.length) {
    mutationError.value = '范围格式无效，请输入如 1-33 或 1,3,5-8。'
    return
  }

  const ids = []
  for (const idx of indexes) {
    const row = pages.value[idx]
    if (row && isPending(row)) ids.push(row.id)
  }

  selectedPendingIds.value = ids
  if (!ids.length) {
    mutationError.value = '该范围内没有可操作的待校对条目（仅待校对状态可选）。'
  } else {
    mutationSuccess.value = `已按范围选择 ${ids.length} 条待校对条目。`
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
      await updatePage(id, { page_number: nextNo })
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

  if (!moved) {
    clearMutationFeedback()
    mutationError.value = '所选条目已经位于可下移范围的末尾。'
    return
  }

  mutatingRows.value = true
  clearMutationFeedback()
  try {
    await applyPendingOrderByIds(reordered)
    await loadPages()
    mutationSuccess.value = `已下移 ${selectedPendingIds.value.length} 条待校对条目。`
  } catch (e) {
    mutationError.value = getPbMessage(e, '批量下移失败，请重试')
  } finally {
    mutatingRows.value = false
  }
}

async function resequenceAllRows() {
  const all = await listAllProjectPages(projectId, {
    fields: 'id,page_number'
  })
  for (let i = 0; i < all.length; i++) {
    const desired = i + 1
    if (Number(all[i].page_number) !== desired) {
      await updatePage(all[i].id, { page_number: desired })
    }
  }
}

async function deleteSelectedRows() {
  if (mutatingRows.value || selectedPendingIds.value.length === 0) return
  const ok = window.confirm(`确认删除已选择的 ${selectedPendingIds.value.length} 条待校对条目吗？此操作不可恢复。`)
  if (!ok) return

  const deleteCount = selectedPendingIds.value.length
  mutatingRows.value = true
  clearMutationFeedback()
  try {
    await Promise.all(selectedPendingIds.value.map((id) => deletePage(id)))
    selectedPendingIds.value = []
    await resequenceAllRows()
    await loadPages()
    mutationSuccess.value = `已删除 ${deleteCount} 条待校对条目，并重新整理条号。`
  } catch (e) {
    mutationError.value = getPbMessage(e, '批量删除失败，请重试')
  } finally {
    mutatingRows.value = false
  }
}

function formatItemNo(pageNumber, fallbackIndex) {
  const n = Number(pageNumber)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return fallbackIndex + 1
}

</script>
