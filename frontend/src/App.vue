<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useChatStore } from './stores/chat'
import { useSettingsStore } from './stores/settings'
import { useThemeStore } from './stores/theme'

onMounted(async () => {
  useThemeStore().load()
  useChatStore().load()
  await useSettingsStore().hydrate().catch(() => undefined)
})
</script>
