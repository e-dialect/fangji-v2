<template>
  <div class="ipa-keyboard">
    <div class="ipa-keyboard-heading">
      <div>
        <div class="ipa-keyboard-title">莆仙方言字符板</div>
        <p>字符会插入当前字段的光标位置；展开需要的分组即可。</p>
      </div>
      <span>{{ sections.reduce((total, section) => total + section.keys.length, 0) }} 个字符</span>
    </div>

    <details
      v-for="section in sections"
      :key="section.label"
      class="ipa-section"
      :open="section.open"
    >
      <summary class="ipa-section-label">
        <span>{{ section.label }}</span>
        <span>{{ section.keys.length }}</span>
      </summary>
      <div class="ipa-keys">
        <button
          v-for="key in section.keys"
          :key="key"
          type="button"
          class="ipa-key"
          :title="`插入 ${key}`"
          :aria-label="`插入字符 ${key}`"
          @mousedown.prevent
          @click="$emit('insert', key)"
        >{{ key }}</button>
      </div>
    </details>
  </div>
</template>

<script setup>
defineEmits(['insert'])

const sections = [
  {
    label: '辅音',
    open: true,
    keys: ['ʰ', 'ʦ', 'ɬ', 'θ', 'ŋ', 'β', 'ɣ', 'ʔ', 'Ø']
  },
  {
    label: '元音',
    open: true,
    keys: ['ɛ', 'ø', 'ɒ', 'œ', 'ɵ', 'ə', 'ɯ', 'ɐ', 'æ', 'ᴇ', 'ɤ']
  },
  {
    label: '鼻化',
    open: false,
    keys: ['ã', 'ẽ', 'ĩ', 'ø̃', 'ỹ', 'ɒ̃', 'ũ', 'ɔ̃', 'ɛ̃', 'œ̃', 'ɐ̃', 'õ']
  },
  {
    label: '数字上标',
    open: true,
    keys: ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸']
  },
  {
    label: '大词典拼音方案',
    open: false,
    keys: ['ü', 'ñ', 'ệ', 'ẹ', 'ê', 'ô']
  },
  {
    label: '平话字 (BUC) — 小写',
    open: false,
    keys: [
      'á', 'â', 'a̍', 'ā',
      'é', 'ê', 'e̍', 'ē',
      'í', 'î', 'i̍', 'ī',
      'ó', 'ô', 'o̍', 'ō',
      'ú', 'û', 'u̍', 'ū',
      'a̤', 'á̤', 'â̤', 'a̤̍', 'ā̤',
      'e̤', 'é̤', 'ê̤', 'e̤̍', 'ē̤',
      'o̤', 'ó̤', 'ô̤', 'o̤̍', 'ō̤',
      'ṳ', 'ṳ́', 'ṳ̂', 'ṳ̍', 'ṳ̄',
      'ń', 'n̂', 'n̍', 'n̄',
      'ⁿ', 'ᴺ'
    ]
  },
  {
    label: '平话字 (BUC) — 大写',
    open: false,
    keys: [
      'Á', 'Â', 'A̍', 'Ā',
      'É', 'Ê', 'E̍', 'Ē',
      'Í', 'Î', 'I̍', 'Ī',
      'Ó', 'Ô', 'O̍', 'Ō',
      'Ú', 'Û', 'U̍', 'Ū',
      'A̤', 'Á̤', 'Â̤', 'A̤̍', 'Ā̤',
      'E̤', 'É̤', 'Ê̤', 'E̤̍', 'Ē̤',
      'O̤', 'Ó̤', 'Ô̤', 'O̤̍', 'Ō̤',
      'Ṳ', 'Ṳ́', 'Ṳ̂', 'Ṳ̍', 'Ṳ̄',
      'Ń', 'N̂', 'N̍', 'N̄'
    ]
  }
]
</script>
