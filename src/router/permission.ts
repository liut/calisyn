import type { Router } from 'vue-router'
import { useUserStore } from '@/store'

import { useAuthStoreWithout } from '@/store/modules/auth'

export function setupPageGuard(router: Router) {
  router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStoreWithout()
    const userStore = useUserStore()
    if (!authStore.session) {
      try {
        const data = await authStore.getSession()
        // 这里可能有问题，如果服务端返回 auth=false，说明未配置密钥或说不需要验证，那就不应该管这个
        // 之所有注释它是因为在当前实现中，服务端未配置密钥时会直接返回 401 或 Unauthorized，而不是返回 auth=false，所以这段代码实际上是多余的
        // 而且为了兼容部分使用全站 token 的验证方案，这里敢不应该管理 token 的生命周期，应该由全站管理
        // 当 auth=false 时（服务端未配置密钥或说不需要验证），保留 token 避免重复登录
        // if (String(data.auth) === 'false' && authStore.token)
        //   authStore.removeToken()

        if (data.uri && typeof data.uri === 'string' && data.uri.trim() !== '') {
          window.location.href = data.uri

          return // Necessary to stop router navigation after browser redirect
        }
        if (to.path === '/500') {
          next({ name: 'Root' })
        }
        else {
          // eslint-disable-next-line no-console
          console.info(data.user)
          if (typeof data.user === 'object')
            userStore.updateUserInfo(data.user)

          next()
        }
      }
      catch {
        if (to.path !== '/500')
          next({ name: '500' })
        else
          next()
      }
    }
    else {
      next()
    }
  })
}
