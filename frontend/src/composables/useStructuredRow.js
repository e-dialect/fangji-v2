import { ref } from 'vue'

export function safeParseRowJson(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function composeRowText(headers, rowObj) {
  return headers
    .map((header) => String(rowObj?.[header] || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

export function useStructuredRow() {
  const rowHeaders = ref([])
  const originalRow = ref({})
  const proofreadRow = ref({})
  const editedRow = ref({})
  const activeField = ref('')
  const editedText = ref('')

  function hydrateForProofread(page) {
    const ocrObj = safeParseRowJson(page?.ocr_row_json) || { '内容': page?.ocr_text || '' }
    const proofObj = safeParseRowJson(page?.proofread_row_json)
    const headers = Object.keys(ocrObj)

    rowHeaders.value = headers.length ? headers : ['内容']
    originalRow.value = {}
    proofreadRow.value = {}
    editedRow.value = {}

    rowHeaders.value.forEach((header) => {
      originalRow.value[header] = String(ocrObj[header] ?? '')
      const value = proofObj && header in proofObj ? proofObj[header] : ocrObj[header]
      editedRow.value[header] = String(value ?? '')
    })
    activeField.value = rowHeaders.value[0] || ''
    editedText.value = composeCurrentText()
  }

  function hydrateForReview(page) {
    const ocrObj = safeParseRowJson(page?.ocr_row_json) || { '内容': page?.ocr_text || '' }
    const proofObj = safeParseRowJson(page?.proofread_row_json) || {
      ...ocrObj,
      '内容': page?.proofread_text || ocrObj['内容'] || ''
    }
    const headers = Object.keys(ocrObj)

    rowHeaders.value = headers.length ? headers : ['内容']
    originalRow.value = {}
    proofreadRow.value = {}
    editedRow.value = {}

    rowHeaders.value.forEach((header) => {
      originalRow.value[header] = String(ocrObj[header] ?? '')
      proofreadRow.value[header] = String(proofObj[header] ?? '')
      editedRow.value[header] = String(proofObj[header] ?? '')
    })
    activeField.value = rowHeaders.value[0] || ''
    editedText.value = composeCurrentText()
  }

  function composeCurrentText(rowObj = editedRow.value) {
    return composeRowText(rowHeaders.value, rowObj)
  }

  function insertText(char) {
    const key = activeField.value || rowHeaders.value[0]
    if (!key) return
    const current = String(editedRow.value[key] || '')
    editedRow.value[key] = current + char
    editedText.value = composeCurrentText()
  }

  function markChanged() {
    editedText.value = composeCurrentText()
  }

  function stringifyEditedRow() {
    return JSON.stringify(editedRow.value)
  }

  return {
    rowHeaders,
    originalRow,
    proofreadRow,
    editedRow,
    activeField,
    editedText,
    hydrateForProofread,
    hydrateForReview,
    composeCurrentText,
    insertText,
    markChanged,
    stringifyEditedRow
  }
}
