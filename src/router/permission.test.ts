import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store/helper'
import { useAuthStoreWithout } from '@/store/modules/auth'
import { routes } from './index'
import { setupPageGuard } from './permission'

const stub = { template: '<div />' }

function createGuardRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'Root',
        component: stub,
        redirect: '/chat',
        children: [
          { path: '/chat/:csid?', name: 'Chat', component: stub },
          { path: '/corpus', name: 'Corpus', component: stub },
        ],
      },
      { path: '/500', name: '500', component: stub },
    ],
  })

  setupPageGuard(router)

  return router
}

describe('router - corpus route registration', () => {
  it('registers /corpus as a Root child named Corpus', () => {
    const root = routes.find(route => route.name === 'Root')
    const corpus = root?.children?.find(route => route.name === 'Corpus')

    expect(corpus?.path).toBe('/corpus')
  })
})

describe('router/permission.ts - keeper guard', () => {
  let authStore: ReturnType<typeof useAuthStoreWithout>

  beforeEach(() => {
    setActivePinia(store)
    authStore = useAuthStoreWithout()
    authStore.session = null
  })

  it('redirects non-keeper users away from /corpus', async () => {
    authStore.session = { auth: true, keeper: false }
    const router = createGuardRouter()

    await router.push('/corpus')

    expect(router.currentRoute.value.name).toBe('Chat')
  })

  it('lets keeper users reach /corpus', async () => {
    authStore.session = { auth: true, keeper: true }
    const router = createGuardRouter()

    await router.push('/corpus')

    expect(router.currentRoute.value.name).toBe('Corpus')
  })

  it('applies the keeper check to the session loaded by getSession', async () => {
    vi.spyOn(authStore, 'getSession').mockResolvedValue({ auth: true, keeper: false } as any)
    const router = createGuardRouter()

    await router.push('/corpus')

    expect(router.currentRoute.value.name).toBe('Chat')
  })

  it('keeps regular chat navigation working', async () => {
    authStore.session = { auth: true, keeper: true }
    const router = createGuardRouter()

    await router.push('/chat/abc')

    expect(router.currentRoute.value.name).toBe('Chat')
    expect(router.currentRoute.value.params.csid).toBe('abc')
  })
})
