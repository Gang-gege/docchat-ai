import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: AppLayout,
      redirect: '/home',
      children: [
        { path: 'home', name: 'home', component: () => import('../views/HomeView.vue') },
        { path: 'knowledge', name: 'knowledge', component: () => import('../views/KnowledgeView.vue') },
        { path: 'chat', name: 'chat', component: () => import('../views/ChatView.vue') },
        { path: 'lab', name: 'lab', component: () => import('../views/LabView.vue') },
        { path: 'eval', name: 'eval', component: () => import('../views/EvalView.vue') },
        { path: 'workflows', name: 'workflows', component: () => import('../views/WorkflowView.vue') },
        { path: 'settings', name: 'settings', component: () => import('../views/SettingsView.vue') },
      ],
    },
  ],
})
