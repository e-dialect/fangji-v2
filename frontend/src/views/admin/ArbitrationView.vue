<template>
  <div class="container page">
    <div class="flex items-center gap-3 mb-6">
      <RouterLink :to="`/admin/projects/${projectId}`" class="btn btn-secondary btn-sm">← 返回项目</RouterLink>
      <div>
        <h2 class="font-bold" style="font-size:1.5rem">条目仲裁</h2>
        <p v-if="caseData?.page" class="text-sm text-muted mt-1">
          第 {{ caseData.page.page_number }} 条 · PDF 第 {{ caseData.page.pdf_page }} 页 · 第 {{ caseData.page.proofread_round }} 轮
        </p>
      </div>
    </div>

    <div v-if="loading" class="text-muted">加载仲裁材料...</div>
    <div v-else-if="error" class="alert alert-error">{{ error }}</div>

    <template v-else-if="caseData">
      <div class="alert alert-info mb-4">
        两位校对员的结果不一致。请逐字段确认最终内容；提交后将保留双方原始结果和本次仲裁记录。
      </div>

      <div class="card mb-6">
        <div class="card-title">逐字段对比</div>
        <div class="table-wrapper">
          <table class="arbitration-table">
            <thead>
              <tr>
                <th>字段</th>
                <th>原始内容</th>
                <th>{{ firstAttempt?.proofreader_name || '一校结果' }}</th>
                <th>{{ secondAttempt?.proofreader_name || '二校结果' }}</th>
                <th>最终结果</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="header in headers" :key="header">
                <th>{{ header }}</th>
                <td class="comparison-cell">{{ originalRow[header] || '—' }}</td>
                <td :class="{ 'comparison-different': differs(header) }" class="comparison-cell">
                  {{ firstRow[header] || '—' }}
                  <button type="button" class="pick-value" @click="finalRow[header] = firstRow[header] || ''">采用</button>
                </td>
                <td :class="{ 'comparison-different': differs(header) }" class="comparison-cell">
                  {{ secondRow[header] || '—' }}
                  <button type="button" class="pick-value" @click="finalRow[header] = secondRow[header] || ''">采用</button>
                </td>
                <td>
                  <textarea
                    v-model="finalRow[header]"
                    class="form-control"
                    style="min-width:220px;min-height:84px"
                  ></textarea>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="form-group">
          <label class="form-label" for="arbitration-note">仲裁说明（可选）</label>
          <textarea
            id="arbitration-note"
            v-model="note"
            class="form-control"
            maxlength="4000"
            placeholder="记录选择依据、疑难点或需后续统一的规范"
          ></textarea>
        </div>
        <div v-if="submitError" class="alert alert-error">{{ submitError }}</div>
        <button class="btn btn-success" :disabled="submitting" @click="submitFinal">
          {{ submitting ? '保存中...' : '确认最终结果并完成条目' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { composeRowText, safeParseRowJson } from '@/composables/useStructuredRow'
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
const caseData = ref(null)
const originalRow = reactive({})
const firstRow = reactive({})
const secondRow = reactive({})
const finalRow = reactive({})
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

onMounted(loadCase)

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
    }
  } catch (e) {
    error.value = getPbMessage(e, '加载仲裁材料失败')
  } finally {
    loading.value = false
  }
}

function differs(header) {
  return String(firstRow[header] ?? '') !== String(secondRow[header] ?? '')
}

async function submitFinal() {
  if (submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const rowJson = JSON.stringify(finalRow)
    await submitArbitration(pageId, {
      rowJson,
      text: composeRowText(headers.value, finalRow),
      note: note.value
    })
    await router.push(`/admin/projects/${projectId}?arbitrated=1`)
  } catch (e) {
    submitError.value = getPbMessage(e, '仲裁提交失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.arbitration-table th:first-child {
  min-width: 120px;
}

.comparison-cell {
  min-width: 210px;
  max-width: 320px;
  white-space: pre-wrap;
  vertical-align: top;
}

.comparison-different {
  background: #fff7ed;
}

.pick-value {
  display: block;
  margin-top: .5rem;
  padding: .2rem .55rem;
  border: 1px solid var(--gray-300);
  border-radius: 4px;
  background: #fff;
  color: var(--primary);
  cursor: pointer;
}
</style>
