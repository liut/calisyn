import type { AxiosResponse } from 'axios'
import axios from 'axios'
import { useAuthStore } from '@/store'
import { redirectToLogin } from './unauthorized'

const authHeader = import.meta.env.VITE_AUTH_HEADER || 'Authorization'

const service = axios.create({
  baseURL: import.meta.env.VITE_API_PATH || '/api',
})

service.interceptors.request.use(
  (config) => {
    const token = useAuthStore().token
    if (token) {
      if (authHeader === 'Authorization')
        config.headers.Authorization = `Bearer ${token}`
      else config.headers[authHeader] = token
      // console.info(config.headers, token)
    }
    else {
      // Add token from localStorage if VITE_SITE_TOKEN_KEY is set and not empty
      const tokenKey = import.meta.env.VITE_SITE_TOKEN_KEY || 'token'
      const storedToken = localStorage.getItem(tokenKey)
      if (storedToken) {
        const headerKey = import.meta.env.VITE_SITE_HEADER_KEY || 'token'
        config.headers[headerKey] = storedToken
      }
    }

    return config
  },
  (error) => {
    // console.info('Request error:', error)
    return Promise.reject(error.response)
  },
)

service.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    if (response.status === 200)
      return response

    throw new Error(response.status.toString())
  },
  (error) => {
    // 会话/网关鉴权失效（HTTP 401）：统一跳转登录入口，避免各调用方各自处理
    if (error?.response?.status === 401)
      redirectToLogin()

    return Promise.reject(error)
  },
)

export default service
