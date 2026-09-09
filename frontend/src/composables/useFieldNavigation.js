import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fieldAt, navigateField } from '@/lib/fieldNavigation'

export function useFieldNavigation(headers, taskId) {
  const index = ref(0)
  const overview = ref(false)
  const mobile = ref(false)
  const current = computed(() => fieldAt(headers.value, index.value))
  const update = () => { mobile.value = window.innerWidth <= 768 }
  onMounted(() => { update(); window.addEventListener('resize', update) })
  onBeforeUnmount(() => window.removeEventListener('resize', update))
  watch(taskId, () => { index.value = 0; overview.value = false })
  watch(headers, () => { index.value = Math.min(index.value, Math.max(0, headers.value.length - 1)) })
  function navigate(action) {
    const state = navigateField(headers.value.length, index.value, action)
    index.value = state.index
    overview.value = state.overview
  }
  const select = (value) => navigate(value)
  const next = () => navigate('next')
  return { index, overview, mobile, current, select, next }
}
