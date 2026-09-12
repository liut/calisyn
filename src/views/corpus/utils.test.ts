import type { CorpusDocument } from '@/api/corpus'
import { describe, expect, it } from 'vitest'
import { buildCorpusPatch, corpusErrorKey } from './utils'

function doc(id: string, patch: Partial<CorpusDocument> = {}): CorpusDocument {
  return { id, title: `title-${id}`, heading: `heading-${id}`, content: `content-${id}`, ...patch }
}

describe('buildCorpusPatch', () => {
  const original = doc('d1', { title: 'title-d1', heading: 'heading-d1', content: 'content-d1' })

  it('returns only the fields the user actually changed', () => {
    const patch = buildCorpusPatch(original, {
      title: 'title-d1',
      heading: 'heading-d1',
      content: 'edited content',
    })

    expect(patch).toEqual({ content: 'edited content' })
  })

  it('returns an empty patch when nothing changed, so no request is needed', () => {
    expect(buildCorpusPatch(original, {
      title: 'title-d1',
      heading: 'heading-d1',
      content: 'content-d1',
    })).toEqual({})
  })

  it('treats clearing a field and a missing original document explicitly', () => {
    expect(buildCorpusPatch(original, { heading: '' })).toEqual({ heading: '' })
    expect(buildCorpusPatch(null, { title: 'x' })).toEqual({})
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
