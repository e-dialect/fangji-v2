<template>
  <p v-if="unavailable.length" class="alert alert-error" role="status">
    生僻字补充字体暂不可用；如显示方框，可按码位核对：
    <span v-for="char in unavailable" :key="char">{{ char }}（{{ codePointLabel(char) }}） </span>
    。原文仍完整保留，可检查网络后刷新页面。
  </p>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { rareCharacters, codePointLabel, unavailableRareCharacters } from '@/lib/rareCharacters'

const props = defineProps({ texts: { type: Array, default: () => [] } })
const chars = computed(() => rareCharacters(props.texts))
const unavailable = ref([])
// Skip ordinary text entirely. A changed field cancels stale results without
// changing user input or replacing a stored character with a placeholder.
watch(chars, async (value, _, onCleanup) => {
  let active = true
  onCleanup(() => { active = false })
  if (!value.length) { unavailable.value = []; return }
  const result = await unavailableRareCharacters(value, document.fonts)
  if (active) unavailable.value = result
}, { immediate: true })
</script>
