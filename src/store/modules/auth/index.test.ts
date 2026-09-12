import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { store } from '@/store/helper'
import { useAuthStore, useAuthStoreWithout } from './index'

describe('auth store - isKeeper', () => {
  beforeEach(() => {
    setActivePinia(store)
    const authStore = useAuthStore()
    authStore.session = null
  })

  it('defaults to false when session is absent', () => {
    const authStore = useAuthStoreWithout()
    expect(authStore.isKeeper).toBe(false)
  })

  it('reflects session.keeper', () => {
    const authStore = useAuthStoreWithout()

    authStore.session = { auth: true, keeper: true } as any
    expect(authStore.isKeeper).toBe(true)

    authStore.session = { auth: true, keeper: false } as any
    expect(authStore.isKeeper).toBe(false)
  })
})
