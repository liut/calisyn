import type { AxiosError, AxiosProgressEvent, AxiosResponse, GenericAbortSignal } from 'axios'
import { useAuthStore } from '@/store'
import request from './axios'
import { redirectToLogin } from './unauthorized'

export interface HttpOption {
  url: string
  data?: any
  method?: string
  headers?: any
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
  signal?: GenericAbortSignal
  beforeRequest?: () => void
  afterRequest?: () => void
}

export interface Response<T = any> {
  data: T
  message: string | null
  status: string
}

function successHandler<T>(res: AxiosResponse<Response<T>>): Response<T> {
  const authStore = useAuthStore()

  // HTTP 401（会话/网关鉴权失效）统一跳转登录入口
  if (res.status === 401) {
    redirectToLogin()
    throw res.data
  }

  if (
    (res.status >= 200 && res.status < 300)
    || res.data.status === 'Success'
    || typeof res.data === 'string'
  ) {
    return res.data
  }

  // 服务端以 200 + status=Unauthorized 表示密钥无效：清掉本地密钥，刷新后由 Permission 弹窗接管
  if (res.data.status === 'Unauthorized') {
    authStore.removeToken()
    window.location.reload()
  }

  throw res.data
}

function failHandler(error: AxiosError<Response<Error>>): never {
  // Prefer the server-provided message (e.g. "无权限" for 403) and keep the
  // HTTP status so callers can distinguish 401/403 from generic failures.
  const err = new Error(error?.response?.data?.message || error?.message || 'Error') as Error & {
    status?: number
    response?: AxiosResponse
  }
  err.status = error?.response?.status
  err.response = error?.response
  throw err
}

function http<T = any>(
  { url, data, method, headers, onDownloadProgress, signal, beforeRequest, afterRequest }: HttpOption,
) {
  const onFail = (error: AxiosError<Response<Error>>) => {
    afterRequest?.()

    return failHandler(error)
  }

  beforeRequest?.()

  method = method || 'GET'

  const params = Object.assign(typeof data === 'function' ? data() : data ?? {}, {})

  if (method === 'GET')
    return request.get(url, { params, signal, onDownloadProgress }).then(successHandler<T>, onFail)

  if (method === 'PATCH')
    return request.patch(url, params, { headers, signal, onDownloadProgress }).then(successHandler<T>, onFail)

  if (method === 'PUT')
    return request.put(url, params, { headers, signal, onDownloadProgress }).then(successHandler<T>, onFail)

  if (method === 'DELETE')
    return request.delete(url, { params, headers, signal, onDownloadProgress }).then(successHandler<T>, onFail)

  return request.post(url, params, { headers, signal, onDownloadProgress }).then(successHandler<T>, onFail)
}

/**
 * 上传文件：直接把 `FormData` 交给 axios 发 POST，不走 `http()` 的 body 归一化
 * （`Object.assign` 会把 FormData 摊平成普通对象，丢失文件内容）。
 *
 * 不要手工设置 `Content-Type`：multipart 的 boundary 必须由浏览器/axios 生成，
 * 手写 `multipart/form-data` 会让服务端解析失败。
 */
export function upload<T = any>(
  { url, data, headers, onUploadProgress, signal, beforeRequest, afterRequest }: HttpOption,
): Promise<Response<T>> {
  beforeRequest?.()

  const onFail = (error: AxiosError<Response<Error>>) => {
    afterRequest?.()

    return failHandler(error)
  }

  return request
    .post(url, data, { headers, signal, onUploadProgress })
    .then(successHandler<T>, onFail)
}

export function get<T = any>(
  { url, data, method = 'GET', onDownloadProgress, signal, beforeRequest, afterRequest }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}

export function post<T = any>(
  { url, data, method = 'POST', headers, onDownloadProgress, signal, beforeRequest, afterRequest }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}

export function patch<T = any>(
  { url, data, method = 'PATCH', headers, onDownloadProgress, signal, beforeRequest, afterRequest }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}

export function put<T = any>(
  { url, data, method = 'PUT', headers, onDownloadProgress, signal, beforeRequest, afterRequest }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}

export function del<T = any>(
  { url, data, method = 'DELETE', headers, onDownloadProgress, signal, beforeRequest, afterRequest }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}

export default post
