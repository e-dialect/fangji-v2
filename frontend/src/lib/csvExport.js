export function toSafeCsvCell(value) {
  let text = String(value ?? '')
  if (/^[\t\r ]*[=+\-@]/.test(text)) {
    text = `'${text}`
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}
