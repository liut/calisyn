import type { MemoryEditForm } from './utils'
import type { MemoryDetail } from '@/api/memory'

import { describe, expect, it } from 'vitest'
import {
  buildMemoryPatch,
  emptyMemoryForm,
  isNotFoundError,
  MEMORY_DEFAULT_SORT_FIELD,
  MEMORY_DEFAULT_SORT_ORDER,
  MEMORY_SORTABLE_FIELDS,
  MEMORY_TIERS,
  memoryErrorKey,
  memorySortParam,
  memoryTierOption,
} from './utils'

function detail(patch: Partial<MemoryDetail> = {}): MemoryDetail {
  return {
    id: 'm-1',
    ownerID: 'me',
    key: 'k',
    cate: 'preference',
    tier: 'working',
    importanceScore: 0.5,
    accessCount: 0,
    decayRate: 0,
    creatorID: 'me',
    content: 'original body',
    ...patch,
  }
}
function form(patch: Partial<MemoryEditForm> = {}): MemoryEditForm {
  return { ...emptyMemoryForm(), ...patch }
}

describe('memoryTierOption', () => {
  it('maps each known tier to its label key and marks it editable', () => {
    const expected: Record<string, string> = {
      'working': 'memory.tierWorking',
      'short-term': 'memory.tierShortTerm',
      'long-term': 'memory.tierLongTerm',
    }

    for (const tier of MEMORY_TIERS) {
      const option = memoryTierOption(tier)
      expect(option.editable).toBe(true)
      expect(option.labelKey).toBe(expected[tier])
    }
  })

  it('falls back to read-only for unknown or empty tiers', () => {
    expect(memoryTierOption('mystery')).toEqual({ labelKey: 'memory.tierUnknown', editable: false })
    expect(memoryTierOption('')).toEqual({ labelKey: 'memory.tierUnknown', editable: false })
    expect(memoryTierOption(null)).toEqual({ labelKey: 'memory.tierUnknown', editable: false })
    expect(memoryTierOption(undefined)).toEqual({ labelKey: 'memory.tierUnknown', editable: false })
  })
})

describe('memorySortParam', () => {
  it('uses a leading dash for descend', () => {
    expect(memorySortParam('created', 'descend')).toBe('-created')
    expect(memorySortParam('updated', 'descend')).toBe('-updated')
  })

  it('omits the dash for ascend', () => {
    expect(memorySortParam('created', 'ascend')).toBe('created')
    expect(memorySortParam('updated', 'ascend')).toBe('updated')
  })

  it('exposes the same default as the panel', () => {
    expect(`${MEMORY_DEFAULT_SORT_ORDER === 'descend' ? '-' : ''}${MEMORY_DEFAULT_SORT_FIELD}`).toBe('-created')
    expect(MEMORY_SORTABLE_FIELDS).toEqual(['created', 'updated', 'key'])
  })
})

describe('buildMemoryPatch', () => {
  it('emits only the changed fields', () => {
    const original = detail()
    const next = form({ cate: 'preference', tier: 'working', content: 'new body' })

    expect(buildMemoryPatch(original, next)).toEqual({ content: 'new body' })
  })

  it('returns an empty patch when nothing changed', () => {
    const original = detail()
    const next = form({ cate: 'preference', content: 'original body', tier: 'working' })

    expect(buildMemoryPatch(original, next)).toEqual({})
  })

  it('omits tier when the existing tier is not editable', () => {
    const original = detail({ tier: 'mystery' })
    const next = form({ cate: 'preference', content: 'original body', tier: 'working' })

    expect(buildMemoryPatch(original, next)).toEqual({})
  })

  it('emits tier when both sides are known and different', () => {
    const original = detail({ tier: 'working' })
    const next = form({ cate: 'preference', content: 'original body', tier: 'long-term' })

    expect(buildMemoryPatch(original, next)).toEqual({ tier: 'long-term' })
  })

  it('combines multiple changed fields', () => {
    const original = detail()
    const next = form({ cate: 'fact', content: 'updated body', tier: 'long-term' })

    expect(buildMemoryPatch(original, next)).toEqual({
      cate: 'fact',
      content: 'updated body',
      tier: 'long-term',
    })
  })
})

describe('memoryErrorKey', () => {
  it('maps 401 to authExpired', () => {
    expect(memoryErrorKey({ status: 401 }, 'memory.loadFailed')).toBe('memory.authExpired')
  })

  it('maps 403 to permissionDenied', () => {
    expect(memoryErrorKey({ status: 403 }, 'memory.loadFailed')).toBe('memory.permissionDenied')
  })
  it('falls back to the caller key on 404 (drawer reads it via isNotFoundError)', () => {
    expect(memoryErrorKey({ status: 404 }, 'memory.loadFailed')).toBe('memory.loadFailed')
    expect(memoryErrorKey({ status: 404 }, 'memory.saveFailed')).toBe('memory.saveFailed')
  })

  it('falls back to the caller key for unknown statuses', () => {
    expect(memoryErrorKey({ status: 500 }, 'memory.saveFailed')).toBe('memory.saveFailed')
    expect(memoryErrorKey({}, 'memory.deleteFailed')).toBe('memory.deleteFailed')
  })

  it('falls back when the error is nullish', () => {
    expect(memoryErrorKey(null, 'memory.loadFailed')).toBe('memory.loadFailed')
    expect(memoryErrorKey(undefined, 'memory.loadFailed')).toBe('memory.loadFailed')
  })
})

describe('isNotFoundError', () => {
  it('is true for status 404', () => {
    expect(isNotFoundError({ status: 404 })).toBe(true)
  })

  it('is false for other statuses and nullish values', () => {
    expect(isNotFoundError({ status: 401 })).toBe(false)
    expect(isNotFoundError({ status: 500 })).toBe(false)
    expect(isNotFoundError({})).toBe(false)
    expect(isNotFoundError(null)).toBe(false)
    expect(isNotFoundError(undefined)).toBe(false)
  })
})
