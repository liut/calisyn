import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { store } from '@/store/helper'
import { useUserStore } from './index'

describe('user store - oid', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(store)
    // 同一个 pinia 实例在文件内跨用例复用，先归零避免上一条用例的状态泄漏。
    useUserStore().resetUserInfo()
  })

  it('keeps the oid from the session user object', () => {
    const userStore = useUserStore()

    userStore.updateUserInfo({ oid: 'us-1' })
    expect(userStore.userInfo.oid).toBe('us-1')

    // 会话加载后可能分多次写入用户字段，后续合并不能丢掉 oid。
    userStore.updateUserInfo({ name: 'someone' })
    expect(userStore.userInfo.oid).toBe('us-1')
    expect(userStore.userInfo.name).toBe('someone')
  })

  it('persists oid together with the pre-existing fields', () => {
    const userStore = useUserStore()

    userStore.updateUserInfo({ avatar: 'a.png', name: 'n', description: 'd', oid: 'us-9' })

    const stored = JSON.parse(window.localStorage.getItem('userStorage') ?? '{}')
    expect(stored.data.userInfo).toMatchObject({
      avatar: 'a.png',
      name: 'n',
      description: 'd',
      oid: 'us-9',
    })
  })

  it('leaves oid undefined when the session omits it', () => {
    const userStore = useUserStore()

    userStore.updateUserInfo({ name: 'n' })

    // 空字符串会被误判成「有 oid」，降级判定要求缺省即 undefined。
    expect(userStore.userInfo.oid).toBeUndefined()
  })
})
