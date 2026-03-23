<template>
  <div class="container page" style="max-width:640px">
    <div class="flex items-center gap-3 mb-6">
      <RouterLink to="/admin" class="btn btn-secondary btn-sm">← 返回</RouterLink>
      <h2 class="font-bold" style="font-size:1.5rem">创建新项目</h2>
    </div>

    <div class="card">
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label class="form-label">项目名称 <span style="color:var(--danger)">*</span></label>
          <input v-model="form.name" type="text" class="form-control" placeholder="如：《莆田方言词典》校对项目" required />
        </div>
        <div class="form-group">
          <label class="form-label">项目简介</label>
          <textarea v-model="form.description" class="form-control" placeholder="简要介绍本项目的背景、目标等（可选）"></textarea>
        </div>

        <div v-if="error" class="alert alert-error">{{ error }}</div>
        <div v-if="success" class="alert alert-success">项目创建成功！即将跳转...</div>

        <div class="flex gap-3">
          <button type="submit" class="btn btn-primary" :disabled="loading">
            {{ loading ? '创建中...' : '创建项目' }}
          </button>
          <RouterLink to="/admin" class="btn btn-secondary">取消</RouterLink>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import pb from '@/lib/pocketbase'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const error = ref('')
const success = ref(false)

const form = ref({ name: '', description: '' })

async function handleSubmit() {
  loading.value = true
  error.value = ''
  try {
    const project = await pb.collection('projects').create({
      name: form.value.name,
      description: form.value.description,
      admin: auth.user.id
    })
    success.value = true
    setTimeout(() => router.push(`/admin/projects/${project.id}`), 1200)
  } catch (e) {
    error.value = e?.response?.message || '创建失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>
