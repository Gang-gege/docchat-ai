<template>
  <div class="app-shell">
    <aside class="app-aside">
      <div class="app-brand">
        <div class="brand-mark" aria-hidden="true">D</div>
        <div class="brand-text">
          <strong>DocChat AI</strong>
          <small>私有文档智能问答</small>
        </div>
      </div>

      <el-menu
        class="app-menu"
        :default-active="route.path"
        router
        background-color="transparent"
        text-color="rgba(226,232,240,0.82)"
        active-text-color="#ecfeff"
      >
        <el-menu-item index="/home">
          <span class="menu-ico">⌂</span>
          <span>总览</span>
        </el-menu-item>
        <el-menu-item index="/knowledge">
          <span class="menu-ico">▣</span>
          <span>知识库</span>
        </el-menu-item>
        <el-menu-item index="/chat">
          <span class="menu-ico">✎</span>
          <span>对话</span>
        </el-menu-item>
        <el-menu-item index="/lab">
          <span class="menu-ico">⌕</span>
          <span>检索实验室</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <span class="menu-ico">⚙</span>
          <span>设置</span>
        </el-menu-item>
      </el-menu>

      <div class="aside-foot">
        <div class="theme-box">
          <div class="theme-label">主题 · {{ themeStore.currentLabel }}</div>
          <div class="theme-switch">
            <button
              v-for="opt in THEME_OPTIONS"
              :key="opt.id"
              type="button"
              class="theme-btn"
              :class="{ active: themeStore.theme === opt.id }"
              :title="opt.tip"
              @click="themeStore.setTheme(opt.id)"
            >
              <span class="theme-dot" :data-theme-preview="opt.id" />
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="aside-pill">RAG · Agent · SQLite</div>
      </div>
    </aside>

    <main class="app-main">
      <router-view />
    </main>
    <RobotAssistant />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import RobotAssistant from '../components/RobotAssistant.vue'
import { THEME_OPTIONS, useThemeStore } from '../stores/theme'

const route = useRoute()
const themeStore = useThemeStore()
</script>
