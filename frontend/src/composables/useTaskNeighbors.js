import { computed, ref } from 'vue'

export function useTaskNeighbors(page, listLoader) {
  const prevTaskId = ref('')
  const nextTaskId = ref('')
  const taskPosition = ref(0)
  const taskCount = ref(0)
  const hasNeighborTasks = computed(() => Boolean(prevTaskId.value || nextTaskId.value))

  function resetNeighbors() {
    prevTaskId.value = ''
    nextTaskId.value = ''
    taskPosition.value = 0
    taskCount.value = 0
  }

  async function loadNeighbors() {
    if (!page.value?.id || !page.value?.project) {
      resetNeighbors()
      return
    }

    const list = await listLoader(page.value)
    const idx = list.findIndex((item) => item.id === page.value.id)
    taskCount.value = list.length
    taskPosition.value = idx >= 0 ? idx + 1 : 0
    if (idx < 0 || list.length <= 1) {
      prevTaskId.value = ''
      nextTaskId.value = ''
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
    taskPosition,
    taskCount,
    hasNeighborTasks,
    resetNeighbors,
    loadNeighbors
  }
}
