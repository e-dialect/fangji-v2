export function rareCharacters(texts) {
  return [...new Set(texts.flatMap((text) => Array.from(String(text ?? ''))))]
    .filter((char) => {
      const cp = char.codePointAt(0)
      return (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0xf900 && cp <= 0xfaff)
        || (cp >= 0x20000 && cp <= 0x2ee5f) || (cp >= 0x2f800 && cp <= 0x2fa1f)
        || (cp >= 0x30000 && cp <= 0x3347f)
    })
}

export function codePointLabel(char) {
  return `U+${char.codePointAt(0).toString(16).toUpperCase()}`
}

export async function unavailableRareCharacters(chars, fonts) {
  if (!fonts?.load) return chars
  const checks = await Promise.all(chars.map(async (char) => {
    try {
      const faces = await fonts.load('16px "Fangji Rare Han"', char)
      return faces.length ? null : char
    } catch {
      return char
    }
  }))
  return checks.filter(Boolean)
}
