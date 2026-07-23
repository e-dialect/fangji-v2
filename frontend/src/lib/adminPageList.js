function searchableText(page) {
  const firstProofreader = page?.expand?.first_proofreader
  const secondProofreader = page?.expand?.second_proofreader
  return [
    page?.page_number,
    page?.pdf_page,
    page?.ocr_text,
    page?.proofread_text,
    firstProofreader?.name,
    firstProofreader?.email,
    secondProofreader?.name,
    secondProofreader?.email
  ].map((value) => String(value ?? '').toLocaleLowerCase('zh-CN')).join('\n')
}

export function filterAdminPages(pages, { query = '', status = '' } = {}) {
  const source = Array.isArray(pages) ? pages : []
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('zh-CN')
  return source.filter((page) => {
    if (status && page?.status !== status) return false
    return !normalizedQuery || searchableText(page).includes(normalizedQuery)
  })
}

export function paginateItems(items, page = 1, perPage = 25) {
  const source = Array.isArray(items) ? items : []
  const safePerPage = Math.max(1, Number(perPage) || 25)
  const totalPages = Math.max(1, Math.ceil(source.length / safePerPage))
  const safePage = Math.max(1, Math.min(totalPages, Number(page) || 1))
  const start = (safePage - 1) * safePerPage
  return {
    items: source.slice(start, start + safePerPage),
    page: safePage,
    perPage: safePerPage,
    totalItems: source.length,
    totalPages
  }
}

export function parseRangeInput(text, max) {
  const raw = String(text || '').trim()
  const safeMax = Math.max(0, Number(max) || 0)
  if (!raw || !safeMax) return []
  const indices = new Set()
  const parts = raw.split(/[,，]/).map((value) => value.trim()).filter(Boolean)

  for (const part of parts) {
    if (part.includes('-')) {
      const [startText, endText] = part.split('-').map((value) => value.trim())
      const start = Number(startText)
      const end = Number(endText)
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue
      const from = Math.max(1, Math.min(start, end))
      const to = Math.min(safeMax, Math.max(start, end))
      for (let value = from; value <= to; value += 1) indices.add(value - 1)
      continue
    }

    const value = Number(part)
    if (Number.isInteger(value) && value >= 1 && value <= safeMax) {
      indices.add(value - 1)
    }
  }

  return Array.from(indices).sort((left, right) => left - right)
}
