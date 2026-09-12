import type { CorpusDocument } from '@/api/corpus'
import { describe, expect, it } from 'vitest'
import { corpusErrorKey, mergeCorpusSearch, paginate, sortCorpusDocuments } from './utils'

function doc(id: string, patch: Partial<CorpusDocument> = {}): CorpusDocument {
  return { id, title: `title-${id}`, heading: `heading-${id}`, content: `content-${id}`, ...patch }
}

describe('mergeCorpusSearch', () => {
  it('dedupes documents across the three field queries and sorts by updatedAt desc', () => {
    const merged = mergeCorpusSearch([
      [doc('a', { updatedAt: '2026-01-01T00:00:00Z' }), doc('b', { updatedAt: '2026-03-01T00:00:00Z' })],
      [doc('b', { updatedAt: '2026-03-01T00:00:00Z', title: 'duplicate' })],
      [doc('c', { updatedAt: '2026-02-01T00:00:00Z' })],
    ])

    expect(merged.map(item => item.id)).toEqual(['b', 'c', 'a'])
    // 先出现的结果优先，不被后续重复项覆盖
    expect(merged.find(item => item.id === 'b')?.title).toBe('title-b')
  })

  it('falls back to createdAt and sorts documents without timestamps last', () => {
    const merged = mergeCorpusSearch([[
      doc('unknown'),
      doc('created-only', { createdAt: '2025-01-01T00:00:00Z' }),
      doc('updated', { updatedAt: '2026-05-01T00:00:00Z' }),
    ]])

    expect(merged.map(item => item.id)).toEqual(['updated', 'created-only', 'unknown'])
  })

  it('returns an empty list for empty input', () => {
    expect(mergeCorpusSearch([])).toEqual([])
    expect(mergeCorpusSearch([[], []])).toEqual([])
  })
})

describe('sortCorpusDocuments', () => {
  it('sorts by heading in both directions', () => {
    const documents = [doc('b', { heading: 'beta' }), doc('a', { heading: 'alpha' }), doc('c', { heading: 'gamma' })]

    expect(sortCorpusDocuments(documents, 'heading', 'ascend').map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(sortCorpusDocuments(documents, 'heading', 'descend').map(item => item.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by createdAt desc without mutating the input', () => {
    const documents = [doc('a', { createdAt: '2026-01-01T00:00:00Z' }), doc('b', { createdAt: '2026-02-01T00:00:00Z' })]

    expect(sortCorpusDocuments(documents, 'created', 'descend').map(item => item.id)).toEqual(['b', 'a'])
    expect(documents.map(item => item.id)).toEqual(['a', 'b'])
  })
})

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5]

  it('slices the requested page and reports the total', () => {
    expect(paginate(items, 1, 2)).toEqual({ rows: [1, 2], total: 5 })
    expect(paginate(items, 3, 2)).toEqual({ rows: [5], total: 5 })
  })

  it('returns an empty page when the page is past the end', () => {
    expect(paginate(items, 9, 2)).toEqual({ rows: [], total: 5 })
  })

  it('clamps invalid page and page size values', () => {
    expect(paginate(items, 0, 0)).toEqual({ rows: [1], total: 5 })
    expect(paginate(items, -3, -10)).toEqual({ rows: [1], total: 5 })
  })
})

describe('corpusErrorKey', () => {
  it('maps 403 and 401 responses to their dedicated copy', () => {
    expect(corpusErrorKey({ status: 403 })).toBe('corpus.permissionDenied')
    expect(corpusErrorKey({ status: 401 })).toBe('corpus.authExpired')
  })

  it('returns null for other failures so callers keep their fallback copy', () => {
    expect(corpusErrorKey({ status: 500 })).toBeNull()
    expect(corpusErrorKey(new Error('Network Error'))).toBeNull()
    expect(corpusErrorKey(undefined)).toBeNull()
  })
})
