import axios from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiBody } from '../types'

export const http = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

http.interceptors.response.use(
  (res) => {
    const body = res.data as ApiBody<unknown>
    if (body && typeof body.code === 'number' && body.code !== 0) {
      ElMessage.error(body.msg || '请求失败')
      return Promise.reject(body)
    }
    return res
  },
  (err) => {
    const msg = err.response?.data?.msg || err.message || '网络错误'
    ElMessage.error(msg)
    return Promise.reject(err)
  },
)
