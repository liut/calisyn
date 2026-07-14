import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from './index'

// router.push 在测试中以空操作代理
vi.mock('@/router', () => ({
  router: {
    push: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('chat store runningStreams', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('registers and looks up a stream entry by csid', () => {
    const store = useChatStore()
    const controller = new AbortController()

    store.registerStream('csid-1', {
      controller,
      messageIndex: 0,
      startedAt: 1,
      cancelled: false,
    })

    const entry = store.getRunningByCsid('csid-1')
    expect(entry).toBeDefined()
    expect(entry?.controller).toBe(controller)
    expect(entry?.messageIndex).toBe(0)
    expect(entry?.cancelled).toBe(false)
  })

  it('unregisters an entry by csid', () => {
    const store = useChatStore()
    const controller = new AbortController()
    store.registerStream('csid-1', {
      controller,
      messageIndex: 0,
      startedAt: 1,
      cancelled: false,
    })

    store.unregisterStream('csid-1')

    expect(store.getRunningByCsid('csid-1')).toBeUndefined()
  })

  it('aborts the prior entry when registering twice on the same csid', () => {
    const store = useChatStore()
    const first = new AbortController()
    const second = new AbortController()

    store.registerStream('csid-1', {
      controller: first,
      messageIndex: 0,
      startedAt: 1,
      cancelled: false,
    })
    store.registerStream('csid-1', {
      controller: second,
      messageIndex: 1,
      startedAt: 2,
      cancelled: false,
    })

    expect(first.signal.aborted).toBe(true)
    const entry = store.getRunningByCsid('csid-1')
    expect(entry?.controller).toBe(second)
  })

  it('abortByCsid marks cancelled, aborts, and unregisters', () => {
    const store = useChatStore()
    const controller = new AbortController()
    store.registerStream('csid-1', {
      controller,
      messageIndex: 0,
      startedAt: 1,
      cancelled: false,
    })

    store.abortByCsid('csid-1')

    expect(controller.signal.aborted).toBe(true)
    expect(store.getRunningByCsid('csid-1')).toBeUndefined()
  })

  it('abortByCsid on an unknown csid does not throw', () => {
    const store = useChatStore()
    expect(() => store.abortByCsid('nope')).not.toThrow()
  })

  it('migrateStreamEntry moves the entry to the new csid and unregisters the old', () => {
    const store = useChatStore()
    const controller = new AbortController()
    store.registerStream('old', {
      controller,
      messageIndex: 0,
      startedAt: 1,
      cancelled: false,
    })

    store.migrateStreamEntry('old', 'new')

    expect(store.getRunningByCsid('old')).toBeUndefined()
    const entry = store.getRunningByCsid('new')
    expect(entry?.controller).toBe(controller)
  })

  it('migrateStreamEntry ignores no-op or unknown cases', () => {
    const store = useChatStore()
    expect(() => store.migrateStreamEntry('', 'new')).not.toThrow()
    expect(() => store.migrateStreamEntry('old', 'old')).not.toThrow()
    expect(() => store.migrateStreamEntry('absent', 'new')).not.toThrow()
  })

  it('abortAllStreams aborts every registered stream', () => {
    const store = useChatStore()
    const a = new AbortController()
    const b = new AbortController()
    store.registerStream('a', { controller: a, startedAt: 1, cancelled: false })
    store.registerStream('b', { controller: b, startedAt: 2, cancelled: false })

    store.abortAllStreams()

    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(true)
    expect(store.getRunningByCsid('a')).toBeUndefined()
    expect(store.getRunningByCsid('b')).toBeUndefined()
  })

  it('registerStream ignores empty csid', () => {
    const store = useChatStore()
    const controller = new AbortController()
    store.registerStream('', { controller, startedAt: 1, cancelled: false })
    expect(Object.keys(store.runningStreams)).toHaveLength(0)
  })
})
