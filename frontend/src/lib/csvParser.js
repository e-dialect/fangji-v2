/**
 * Detect the delimiter used in a CSV/TSV string.
 * Returns '\t' for tab-separated, ',' for comma-separated.
 */
export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || ''
  const tabCount = (firstLine.match(/\t/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  return tabCount > 0 && tabCount > commaCount ? '\t' : ','
}

/**
 * Simple CSV/TSV parser that handles quoted fields and commas within fields.
 * Auto-detects delimiter (tab or comma).
 * Returns array of objects keyed by header row.
 */
export function parseCsv(text) {
  const delimiter = detectDelimiter(text)
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (!lines.length) return []

  const headers = parseRow(lines[0], delimiter)
  const result = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseRow(line, delimiter)
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h.trim()] = (values[idx] || '').trim()
    })
    result.push(obj)
  }

  return result
}

function parseRow(line, delimiter = ',') {
  if (delimiter === '\t') {
    return line.split('\t')
  }

  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
