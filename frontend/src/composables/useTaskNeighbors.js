import { computed, ref } from 'vue'

export function useTaskNeighbors(page, listLoader) {
  const prevTaskId = ref('')
  const nextTaskId = ref('')
  const hasNeighborTasks = computed(() => Boolean(prevTaskId.value || nextTaskId.value))

  function resetNeighbors() {
    prevTaskId.value = ''
    nextTaskId.value = ''
  }

  async function loadNeighbors() {
    if (!page.value?.id || !page.value?.project) {
      resetNeighbors()
      return
    }

    const list = await listLoader(page.value)
    const idx = list.findIndex((item) => item.id === page.value.id)
    if (idx < 0 || list.length <= 1) {
      resetNeighbors()
      return
    }

    const prevIdx = (idx - 1 + list.length) % list.length
    const nextIdx = (idx + 1) % list.length
    prevTaskId.value = list[prevIdx].id
    nextTaskId.value = list[nextIdx].id
  }

  return {
    prevTaskId,
    nextTaskId,
    hasNeighborTasks,
    resetNeighbors,
    loadNeighbors
  }
}
