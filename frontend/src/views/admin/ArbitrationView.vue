<template>
  <main class="container page workspace-page arbitration-page">
    <header class="page-heading">
      <div>
        <RouterLink :to="`/admin/projects/${projectId}?status=arbitration`" class="back-link">← 返回待仲裁列表</RouterLink>
        <div class="page-eyebrow">管理员仲裁台</div>
        <h1>逐项形成最终版本</h1>
        <p v-if="caseData?.page">
          第 {{ caseData.page.page_number }} 条 · PDF 第 {{ caseData.page.pdf_page }} 页 · 第 {{ caseData.page.proofread_round }} 轮
        </p>
      </div>
    </header>

    <div v-if="loading" class="panel-loading" aria-live="polite">正在加载两次校对结果…</div>
    <div v-else-if="error" class="alert alert-error" role="alert">{{ error }}</div>

    <template v-else-if="caseData">
      <section class="arbitration-summary card" aria-label="仲裁进度">
        <div>
          <div class="page-eyebrow">差异确认</div>
          <strong>{{ resolvedCount }} / {{ differingHeaders.length }}</strong>
          <span>个不一致字段已明确处理</span>
        </div>
        <div class="arbitration-progress">
          <div class="progress" role="progressbar" :aria-valuenow="resolutionPct" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar" :style="{ width: `${resolutionPct}%` }"></div>
          </div>
          <p v-if="unresolvedHeaders.length">还需确认：{{ unresolvedHeaders.join('、') }}</p>
          <p v-else>所有差异字段均已确认，可以检查说明并提交。</p>
        </div>
      </section>

      <section class="card arbitration-workspace">
        <header class="arbitration-toolbar">
          <div>
            <h2>校对结果对比</h2>
            <p>采用任一版本，或直接编辑最终内容；匹配字段会随结果一并保存。</p>
          </div>
          <div class="arbitration-toolbar__view" role="group" aria-label="字段显示范围">
            <button type="button" :class="{ active: !showAllFields }" @click="showAllFields = false">
              仅看差异 {{ differingHeaders.length }}
            </button>
            <button type="button" :class="{ active: showAllFields }" @click="showAllFields = true">
              全部字段 {{ headers.length }}
            </button>
          </div>
        </header>

        <div v-if="differingHeaders.length" class="bulk-source-actions" aria-label="批量采用来源">
          <span>批量处理差异项</span>
          <button type="button" class="btn btn-secondary btn-sm" @click="applySourceToDifferences('original')">全部采用原文</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="applySourceToDifferences('first')">全部采用一校</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="applySourceToDifferences('second')">全部采用二校</button>
        </div>

        <div v-if="visibleHeaders.length" class="arbitration-fields">
          <article
            v-for="header in visibleHeaders"
            :key="header"
            class="arbitration-field"
            :class="{
              'arbitration-field--resolved': isResolved(header),
              'arbitration-field--matching': !differs(header)
            }"
          >
            <header class="arbitration-field__header">
              <h3>{{ header }}</h3>
              <span v-if="!differs(header)" class="resolution-state resolution-state--matching">两校一致</span>
              <span v-else-if="isResolved(header)" class="resolution-state resolution-state--resolved">已确认 · {{ resolutionLabel(header) }}</span>
              <span v-else class="resolution-state resolution-state--pending">待确认</span>
            </header>

            <div class="arbitration-source-grid">
              <section class="comparison-option" :class="{ selected: sourceIs(header, 'original') }">
                <span>导入原文</span>
                <p>{{ displayValue(originalRow[header]) }}</p>
                <button type="button" @click="pickValue(header, 'original')">采用原文</button>
              </section>
              <section class="comparison-option" :class="{ selected: sourceIs(header, 'first') }">
                <span>{{ firstAttempt?.proofreader_name || '一校结果' }}</span>
                <p>{{ displayValue(firstRow[header]) }}</p>
                <button type="button" @click="pickValue(header, 'first')">采用一校</button>
              </section>
              <section class="comparison-option" :class="{ selected: sourceIs(header, 'second') }">
                <span>{{ secondAttempt?.proofreader_name || '二校结果' }}</span>
                <p>{{ displayValue(secondRow[header]) }}</p>
                <button type="button" @click="pickValue(header, 'second')">采用二校</button>
              </section>
              <label class="final-value" :class="{ selected: sourceIs(header, 'custom') }">
                <span>最终结果</span>
                <textarea
                  v-model="finalRow[header]"
                  class="form-control"
                  :aria-label="`${header}的最终仲裁结果`"
                  @input="onFinalInput(header)"
                ></textarea>
              </label>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">
          <div class="empty-state-mark" aria-hidden="true">同</div>
          <div class="empty-state-text">两次校对没有字段差异</div>
          <p>可切换到“全部字段”复核；若状态异常，请返回项目后重新加载。</p>
        </div>
      </section>

      <section class="card arbitration-submit-card">
        <div class="form-group">
          <label class="form-label" for="arbitration-note">仲裁说明 <span class="text-muted">（可选）</span></label>
          <textarea
            id="arbitration-note"
            v-model="note"
            class="form-control"
            maxlength="4000"
            placeholder="记录选择依据、疑难点或需要后续统一的校对规范"
          ></textarea>
        </div>
        <div v-if="submitError" class="alert alert-error" role="alert">{{ submitError }}</div>
        <div class="arbitration-submit-actions">
          <p>
            <strong v-if="unresolvedHeaders.length">还有 {{ unresolvedHeaders.length }} 个差异字段未确认</strong>
            <strong v-else>最终结果已准备好</strong>
            <span>提交后将完成条目，并永久保留两次校对与本次仲裁记录。</span>
          </p>
          <button
            class="btn btn-success"
            :disabled="submitting || unresolvedHeaders.length > 0"
            :title="unresolvedHeaders.length ? '请先确认所有差异字段' : ''"
            @click="openSubmitReview"
          >{{ submitting ? '保存中…' : '检查并完成仲裁' }}</button>
        </div>
      </section>
    </template>

    <div v-if="reviewingSubmission" class="modal-backdrop" role="presentation" @click.self="closeSubmitReview">
      <section class="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="arbitration-review-title" @keydown.esc="closeSubmitReview">
        <div class="confirmation-dialog__mark" aria-hidden="true">裁</div>
        <div>
          <div class="page-eyebrow">最终确认</div>
          <h2 id="arbitration-review-title">完成第 {{ caseData?.page?.page_number }} 条仲裁？</h2>
          <p>已确认 {{ differingHeaders.length }} 个差异字段，其中 {{ sourceCount('custom') }} 个经过手工编辑。</p>
          <p class="text-sm text-muted">提交后条目进入“校对完成”，该操作不能在当前界面撤回。</p>
        </div>
        <div class="confirmation-dialog__actions">
          <button type="button" class="btn btn-secondary" @click="closeSubmitReview">继续检查</button>
          <button ref="submitConfirmButton" type="button" class="btn btn-success" :disabled="submitting" @click="submitFinal">
            {{ submitting ? '正在保存…' : '确认完成仲裁' }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { composeRowText, safeParseRowJson } from '@/composables/useStructuredRow'
import { getDifferingHeaders, getUnresolvedHeaders } from '@/lib/workspaceInsights'
import { getArbitrationCase, submitArbitration } from '@/services/arbitrationService'
import { getPbMessage } from '@/utils/pbErrors'

const route = useRoute()
const router = useRouter()
const projectId = String(route.params.projectId || '')
const pageId = String(route.params.pageId || '')

const loading = ref(true)
const error = ref('')
const submitting = ref(false)
const submitError = ref('')
const submitted = ref(false)
const reviewingSubmission = ref(false)
const submitConfirmButton = ref(null)
const showAllFields = ref(false)
const caseData = ref(null)
const originalRow = reactive({})
const firstRow = reactive({})
const secondRow = reactive({})
const finalRow = reactive({})
const resolutionSource = reactive({})
const resolvedHeaders = reactive(new Set())
const touchedHeaders = reactive(new Set())
const note = ref('')

const firstAttempt = computed(() => caseData.value?.attempts?.find((item) => item.pass_no === 1) || null)
const secondAttempt = computed(() => caseData.value?.attempts?.find((item) => item.pass_no === 2) || null)
const headers = computed(() => {
  return [...new Set([
    ...Object.keys(originalRow),
    ...Object.keys(firstRow),
    ...Object.keys(secondRow)
  ])]
})
const differingHeaders = computed(() => getDifferingHeaders(headers.value, firstRow, secondRow))
const visibleHeaders = computed(() => showAllFields.value ? headers.value : differingHeaders.value)
const unresolvedHeaders = computed(() => getUnresolvedHeaders(differingHeaders.value, resolvedHeaders))
const resolvedCount = computed(() => differingHeaders.value.length - unresolvedHeaders.value.length)
const resolutionPct = computed(() => differingHeaders.value.length
  ? Math.round((resolvedCount.value / differingHeaders.value.length) * 100)
  : 100)
const hasUnsubmittedWork = computed(() => !submitted.value && (touchedHeaders.size > 0 || Boolean(note.value.trim())))

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  loadCase()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

onBeforeRouteLeave(() => {
  if (!hasUnsubmittedWork.value || submitting.value) return true
  return window.confirm('仲裁选择尚未提交，确定离开吗？')
})

async function loadCase() {
  loading.value = true
  error.value = ''
  try {
    const result = await getArbitrationCase(pageId)
    if (result?.page?.project && projectId && result.page.project !== projectId) {
      throw new Error('仲裁条目与当前项目不匹配，请返回项目详情页后重新进入。')
    }
    caseData.value = result
    Object.assign(originalRow, safeParseRowJson(result.page?.ocr_row_json) || { 内容: result.page?.ocr_text || '' })
    Object.assign(firstRow, safeParseRowJson(result.attempts?.find((item) => item.pass_no === 1)?.row_json) || {})
    Object.assign(secondRow, safeParseRowJson(result.attempts?.find((item) => item.pass_no === 2)?.row_json) || {})
    for (const header of headers.value) {
      finalRow[header] = firstRow[header] ?? secondRow[header] ?? originalRow[header] ?? ''
      if (String(firstRow[header] ?? '') === String(secondRow[header] ?? '')) {
        resolutionSource[header] = 'matching'
      }
    }
  } catch (e) {
    error.value = getPbMessage(e, '加载仲裁材料失败')
  } finally {
    loading.value = false
  }
}

function differs(header) {
  return differingHeaders.value.includes(header)
}

function displayValue(value) {
  return String(value ?? '') || '（空白）'
}

function isResolved(header) {
  return !differs(header) || resolvedHeaders.has(header)
}

function sourceIs(header, source) {
  return resolutionSource[header] === source
}

function resolutionLabel(header) {
  return ({
    original: '采用原文',
    first: '采用一校',
    second: '采用二校',
    custom: '手工编辑'
  })[resolutionSource[header]] || '已确认'
}

function sourceValue(header, source) {
  if (source === 'original') return originalRow[header]
  if (source === 'second') return secondRow[header]
  return firstRow[header]
}

function pickValue(header, source) {
  finalRow[header] = String(sourceValue(header, source) ?? '')
  resolutionSource[header] = source
  touchedHeaders.add(header)
  if (differs(header)) resolvedHeaders.add(header)
  submitError.value = ''
}

function onFinalInput(header) {
  resolutionSource[header] = 'custom'
  touchedHeaders.add(header)
  if (differs(header)) resolvedHeaders.add(header)
  submitError.value = ''
}

function applySourceToDifferences(source) {
  for (const header of differingHeaders.value) pickValue(header, source)
}

function sourceCount(source) {
  return differingHeaders.value.filter((header) => resolutionSource[header] === source).length
}

async function openSubmitReview() {
  if (unresolvedHeaders.value.length || submitting.value) {
    submitError.value = unresolvedHeaders.value.length
      ? `请先确认以下差异字段：${unresolvedHeaders.value.join('、')}`
      : ''
    return
  }
  submitError.value = ''
  reviewingSubmission.value = true
  await nextTick()
  submitConfirmButton.value?.focus()
}

function closeSubmitReview() {
  if (submitting.value) return
  reviewingSubmission.value = false
}

function handleBeforeUnload(event) {
  if (!hasUnsubmittedWork.value || submitting.value) return
  event.preventDefault()
  event.returnValue = ''
}

async function submitFinal() {
  if (submitting.value || unresolvedHeaders.value.length) return
  submitting.value = true
  submitError.value = ''
  try {
    const rowJson = JSON.stringify(finalRow)
    await submitArbitration(pageId, {
      rowJson,
      text: composeRowText(headers.value, finalRow),
      note: note.value
    })
    submitted.value = true
    reviewingSubmission.value = false
    await router.push(`/admin/projects/${projectId}?status=arbitration&arbitrated=1`)
  } catch (e) {
    reviewingSubmission.value = false
    submitError.value = getPbMessage(e, '仲裁提交失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.arbitration-page { display: grid; gap: 1rem; }
</style>
