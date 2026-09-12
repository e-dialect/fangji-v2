<template>
  <span class="user-avatar" aria-hidden="true">
    <img v-if="src && !failed" :src="src" alt="" @error="failed = true" />
    <span v-else>{{ initial }}</span>
  </span>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import pb from '@/lib/pocketbase'
const props = defineProps({ user: { type: Object, default: null } })
const failed = ref(false)
const src = computed(() => props.user?.avatar ? pb.files.getURL(props.user, props.user.avatar) : '')
const initial = computed(() => Array.from(String(props.user?.name || props.user?.email || '校'))[0].toLocaleUpperCase('zh-CN'))
watch(src, () => { failed.value = false })
</script>
<style scoped>
.user-avatar { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #e2e8f0; color: #475569; }
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
