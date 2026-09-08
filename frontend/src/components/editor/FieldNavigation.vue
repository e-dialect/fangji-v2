<template>
  <nav class="mobile-field-navigation" aria-label="字段导航">
    <template v-if="overview">
      <strong>整条总览 · {{ headers.length }} 个字段</strong>
      <button class="btn btn-secondary" @click="$emit('select', index)">返回编辑</button>
      <slot name="submit" />
    </template>
    <template v-else>
      <label><span class="sr-only">选择字段</span><select class="form-control" :value="index" @change="$emit('select', Number($event.target.value))">
        <option v-for="(header, i) in headers" :key="header" :value="i">{{ i + 1 }} / {{ headers.length }} · {{ header }}</option>
      </select></label>
      <button class="btn btn-secondary" :disabled="index === 0" @click="$emit('select', index - 1)">上一个</button>
      <button class="btn btn-primary" @click="$emit('next')">{{ index >= headers.length - 1 ? '整条总览' : '下一个' }}</button>
    </template>
  </nav>
</template>
<script setup>
defineProps({ headers: { type: Array, required: true }, index: Number, overview: Boolean })
defineEmits(['select', 'next'])
</script>
