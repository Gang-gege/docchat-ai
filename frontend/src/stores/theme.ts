import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemeId = 'light' | 'dark' | 'ink'

export const THEME_OPTIONS: Array<{ id: ThemeId; label: string; tip: string }> = [
  { id: 'light', label: '晴空', tip: '浅色青绿' },
  { id: 'dark', label: '夜航', tip: '深色护眼' },
  { id: 'ink', label: '墨蓝', tip: '沉浸蓝调' },
]

const KEY = 'docchat-theme'

function applyTheme(theme: ThemeId) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.classList.toggle('dark', theme === 'dark' || theme === 'ink')
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeId>('light')

  const currentLabel = computed(() => THEME_OPTIONS.find((t) => t.id === theme.value)?.label || '晴空')

  function load() {
    const saved = localStorage.getItem(KEY) as ThemeId | null
    if (saved && THEME_OPTIONS.some((t) => t.id === saved)) {
      theme.value = saved
    }
    applyTheme(theme.value)
  }

  function setTheme(next: ThemeId) {
    theme.value = next
    localStorage.setItem(KEY, next)
    applyTheme(next)
  }

  watch(theme, (v) => applyTheme(v))

  return { theme, currentLabel, load, setTheme }
})
