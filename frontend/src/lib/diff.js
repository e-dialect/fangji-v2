/**
 * Simple character-level diff for highlighting changes between two texts.
 * Returns array of { type: 'equal'|'delete'|'insert', text: string }
 */
export function diffTexts(oldText, newText) {
  // Split into lines first for better readability, then char-level within lines
  const result = []
  const oldLines = (oldText || '').split('\n')
  const newLines = (newText || '').split('\n')

  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i] ?? ''
    const newLine = newLines[i] ?? ''
    if (oldLine === newLine) {
      result.push({ type: 'equal', text: oldLine + (i < maxLen - 1 ? '\n' : '') })
    } else {
      // Char-level diff within this line
      const charDiff = charLevelDiff(oldLine, newLine)
      result.push(...charDiff)
      if (i < maxLen - 1) result.push({ type: 'equal', text: '\n' })
    }
  }
  return result
}

function charLevelDiff(a, b) {
  // LCS-based char diff
  const m = a.length
  const n = b.length

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Traceback
  const result = []
  let i = m, j = n
  const parts = []
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      parts.push({ type: 'equal', text: a[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.push({ type: 'insert', text: b[j - 1] })
      j--
    } else {
      parts.push({ type: 'delete', text: a[i - 1] })
      i--
    }
  }
  parts.reverse()

  // Merge consecutive same-type parts
  for (const p of parts) {
    if (result.length && result[result.length - 1].type === p.type) {
      result[result.length - 1].text += p.text
    } else {
      result.push({ ...p })
    }
  }
  return result
}
