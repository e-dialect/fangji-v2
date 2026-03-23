/**
 * Simple CSV parser that handles quoted fields and commas within fields.
 * Returns array of objects keyed by header row.
 */
export function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (!lines.length) return []

  const headers = parseRow(lines[0])
  const result = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseRow(line)
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h.trim()] = (values[idx] || '').trim()
    })
    result.push(obj)
  }

  return result
}

function parseRow(line) {
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
