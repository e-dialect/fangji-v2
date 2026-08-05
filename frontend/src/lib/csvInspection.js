export const CSV_PAGE_FIELD_ALIASES = ['PDF页码', 'page', 'pdf_page', '页码']

export function parseCsvInspection(value) {
  if (!value) return null
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || !Array.isArray(parsed.headers)) return null
    return {
      encoding: String(parsed.encoding || ''),
      headers: parsed.headers.map((header) => String(header)),
      pdfPageField: String(parsed.pdf_page_field || ''),
      totalRows: Number(parsed.total_rows || 0),
      validRows: Number(parsed.valid_rows || 0),
      invalidRows: Number(parsed.invalid_rows || 0),
      preview: Array.isArray(parsed.preview) ? parsed.preview.slice(0, 5) : []
    }
  } catch {
    return null
  }
}

export function csvFatalMessage(job, fallback = 'CSV 后端处理失败') {
  if (!job || job.status !== 'failed') return ''
  const code = job.error_code ? `[${job.error_code}] ` : ''
  return `${code}${job.error_message || fallback}`
}
