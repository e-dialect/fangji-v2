<template>
  <div v-if="selectedKeyboard" class="ipa-keyboard">
    <div class="ipa-keyboard-heading">
      <div>
        <div class="ipa-keyboard-title">{{ selectedKeyboard.name }}</div>
        <p>{{ selectedKeyboard.description || '字符会插入当前字段的光标位置；展开需要的分组即可。' }}</p>
      </div>
      <label v-if="keyboards.length > 1" class="keyboard-switcher">
        <span class="sr-only">切换项目键盘</span>
        <select v-model="selectedKeyboardId" class="form-control">
          <option v-for="keyboard in keyboards" :key="keyboard.keyboardId" :value="keyboard.keyboardId">{{ keyboard.name }}</option>
        </select>
      </label>
      <span v-else>{{ keyCount }} 个字符</span>
    </div>

    <details
      v-for="section in selectedKeyboard.definition.sections"
      :key="section.id"
      class="ipa-section"
      :open="section.defaultOpen"
    >
      <summary class="ipa-section-label">
        <span>{{ section.label }}</span>
        <span>{{ section.keys.length }}</span>
      </summary>
      <div class="ipa-keys">
        <button
          v-for="(key, index) in section.keys"
          :key="`${section.id}-${index}-${key.value}`"
          type="button"
          class="ipa-key"
          :title="key.hint || `插入 ${key.value}`"
          :aria-label="key.hint || `插入字符 ${key.value}`"
          @mousedown.prevent
          @click="$emit('insert', key.value)"
        >{{ key.label || key.value }}</button>
      </div>
    </details>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { currentUserId } from '@/services/authService'
import { getProjectKeyboards } from '@/services/keyboardsService'
import { chooseProjectKeyboard, keyboardPreferenceKey } from '@/lib/keyboardSelection'

const props = defineProps({ projectId: { type: String, default: '' } })
defineEmits(['insert'])

const keyboards = ref([])
const projectDefaultId = ref('')
const selectedKeyboardId = ref('')
let loadGeneration = 0

const selectedKeyboard = computed(() => keyboards.value.find((item) => item.keyboardId === selectedKeyboardId.value) || null)
const keyCount = computed(() => selectedKeyboard.value?.definition?.sections?.reduce((total, section) => total + section.keys.length, 0) || 0)

watch(() => props.projectId, load, { immediate: true })
watch(selectedKeyboardId, (keyboardId) => {
  if (!keyboardId || !props.projectId) return
  try { localStorage.setItem(keyboardPreferenceKey(currentUserId(), props.projectId), keyboardId) } catch {}
})

async function load(projectId) {
  const generation = ++loadGeneration
  keyboards.value = []
  selectedKeyboardId.value = ''
  if (!projectId) return
  try {
    const result = await getProjectKeyboards(projectId)
    if (generation !== loadGeneration) return
    keyboards.value = Array.isArray(result.items) ? result.items : []
    projectDefaultId.value = result.defaultKeyboardId || ''
    let remembered = ''
    try { remembered = localStorage.getItem(keyboardPreferenceKey(currentUserId(), projectId)) || '' } catch {}
    selectedKeyboardId.value = chooseProjectKeyboard(keyboards.value, projectDefaultId.value, remembered)?.keyboardId || ''
  } catch {
    if (generation === loadGeneration) keyboards.value = []
  }
}
</script>
