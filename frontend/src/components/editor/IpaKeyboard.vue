<template>
  <div class="ipa-keyboard">
    <div class="ipa-keyboard-title">莆仙方言 IPA 键盘</div>

    <div v-for="section in sections" :key="section.label" class="ipa-section">
      <div class="ipa-section-label">{{ section.label }}</div>
      <div class="ipa-keys">
        <button
          v-for="key in section.keys"
          :key="key"
          type="button"
          class="ipa-key"
          :title="key"
          @click="$emit('insert', key)"
        >{{ key }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['insert'])

const sections = [
  {
    label: '辅音',
    keys: ['ʰ', 'ʦ', 'ɬ', 'θ', 'ŋ', 'β', 'ɣ', 'ʔ', 'Ø']
  },
  {
    label: '元音',
    keys: ['ɛ', 'ø', 'ɒ', 'œ', 'ɵ', 'ə', 'ɯ', 'ɐ', 'æ', 'ᴇ', 'ɤ']
  },
  {
    label: '鼻化',
    keys: ['ã', 'ẽ', 'ĩ', 'ø̃', 'ỹ', 'ɒ̃', 'ũ', 'ɔ̃', 'ɛ̃', 'œ̃', 'ɐ̃', 'õ']
  },
  {
    label: '数字上标',
    keys: ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸']
  },
  {
    label: '大词典拼音方案',
    keys: ['ü', 'ñ', 'ệ', 'ẹ', 'ê', 'ô']
  },
  {
    label: '平话字 (BUC) — 小写',
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
