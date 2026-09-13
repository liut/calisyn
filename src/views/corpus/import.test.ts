import type { CorpusImportFailure, CorpusImportTask } from '@/api/corpus'
import { describe, expect, it } from 'vitest'
import {
  activeImportCount,
  buildImportFailureCsv,
  buildImportTemplateCsv,
  classifyImportFailures,
  decodeImportBytes,
  hasImportHeader,
  IMPORT_FAILURE_CSV_HEADER,
  IMPORT_MAX_SIZE,
  IMPORT_TEMPLATE_CSV,
  importDetailCount,
  importFailureGroupKey,
  importFailureRows,
  importStatusKey,
  importSummaryParams,
  isImportTaskActive,
  isImportTaskFinished,
  newlyFinishedImports,
  showsImportCounts,
  validateImportFile,
} from './import'

function failure(patch: Partial<CorpusImportFailure> = {}): CorpusImportFailure {
  return { line: 2, title: 'title', reason: '数据无效', ...patch }
}

function task(patch: Partial<CorpusImportTask> = {}): CorpusImportTask {
  return {
    id: 't1',
    filename: 'doc.csv',
    status: 'succeeded',
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    createdAt: '2026-09-13T00:00:00Z',
    ...patch,
  }
}

describe('validateImportFile', () => {
  const valid = { filename: 'doc.csv', size: 1024, text: 'title,heading,content\n' }

  it('accepts a valid csv file', () => {
    expect(validateImportFile(valid)).toBeNull()
  })

  it('rejects a file that is not a .csv', () => {
    expect(validateImportFile({ ...valid, filename: 'doc.xlsx' })).toBe('corpus.importInvalidType')
    expect(validateImportFile({ ...valid, filename: 'doc' })).toBe('corpus.importInvalidType')
  })

  it('rejects a file larger than the backend limit', () => {
    expect(validateImportFile({ ...valid, size: IMPORT_MAX_SIZE })).toBeNull()
    expect(validateImportFile({ ...valid, size: IMPORT_MAX_SIZE + 1 })).toBe('corpus.importTooLarge')
  })

  it('rejects a file without the required header', () => {
    expect(validateImportFile({ ...valid, text: 'title,content\n' })).toBe('corpus.importInvalidHeader')
    expect(validateImportFile({ ...valid, text: 'heading,title,content\n' })).toBe('corpus.importInvalidHeader')
    expect(validateImportFile({ ...valid, text: '' })).toBe('corpus.importInvalidHeader')
  })
})

describe('hasImportHeader', () => {
  it('accepts mixed case, CRLF, BOM and extra columns', () => {
    expect(hasImportHeader('Title,Heading,Content\n')).toBe(true)
    expect(hasImportHeader('\uFEFFtitle,heading,content\r\na,b,c\r\n')).toBe(true)
    expect(hasImportHeader('title,heading,content,note\n')).toBe(true)
    expect(hasImportHeader('"title","heading","content"\n')).toBe(true)
  })

  it('rejects missing or reordered columns', () => {
    expect(hasImportHeader('title,heading\n')).toBe(false)
    expect(hasImportHeader('title,content,heading\n')).toBe(false)
    expect(hasImportHeader('heading,title,content\n')).toBe(false)
  })
})

describe('decodeImportBytes', () => {
  it('decodes valid utf-8 bytes', () => {
    const bytes = new TextEncoder().encode('title,heading,content\n文档,a,内容\n')
    expect(decodeImportBytes(bytes)).toContain('文档')
  })

  it('returns null for invalid utf-8 bytes', () => {
    expect(decodeImportBytes(new Uint8Array([0x74, 0xFF, 0xFE, 0x2C]))).toBeNull()
  })
})

describe('task status helpers', () => {
  it('separates active from finished statuses', () => {
    expect(isImportTaskActive('pending')).toBe(true)
    expect(isImportTaskActive('processing')).toBe(true)
    expect(isImportTaskActive('succeeded')).toBe(false)
    expect(isImportTaskActive('failed')).toBe(false)

    expect(isImportTaskFinished('succeeded')).toBe(true)
    expect(isImportTaskFinished('failed')).toBe(true)
    expect(isImportTaskFinished('processing')).toBe(false)
  })

  it('maps statuses to corpus copy keys', () => {
    expect(importStatusKey('pending')).toBe('corpus.importStatusPending')
    expect(importStatusKey('processing')).toBe('corpus.importStatusProcessing')
    expect(importStatusKey('succeeded')).toBe('corpus.importStatusSucceeded')
    expect(importStatusKey('failed')).toBe('corpus.importStatusFailed')
  })

  it('only shows counts once the task reached a terminal state', () => {
    expect(showsImportCounts('pending')).toBe(false)
    expect(showsImportCounts('processing')).toBe(false)
    expect(showsImportCounts('succeeded')).toBe(true)
    expect(showsImportCounts('failed')).toBe(true)
  })

  it('counts active tasks and picks out unnotified terminal tasks', () => {
    const tasks = [
      task({ id: 'a', status: 'processing' }),
      task({ id: 'b', status: 'pending' }),
      task({ id: 'c', status: 'succeeded' }),
      task({ id: 'd', status: 'failed' }),
    ]

    expect(activeImportCount(tasks)).toBe(2)
    expect(newlyFinishedImports(tasks, new Set(['c'])).map(t => t.id)).toEqual(['d'])
    expect(newlyFinishedImports(tasks, new Set(['c', 'd']))).toEqual([])
  })
})

describe('classifyImportFailures', () => {
  it('splits failures and skips by the kind field', () => {
    const groups = classifyImportFailures(task({
      failed: 1,
      skipped: 1,
      errors: [
        failure({ line: 3, title: 'dup', reason: '重复文档: title+heading 已存在，跳过', kind: 'skipped' }),
        failure({ line: 4, title: 'bad', kind: 'failed' }),
      ],
    }))

    expect(groups.failed.map(row => row.line)).toEqual([4])
    expect(groups.skipped.map(row => row.line)).toEqual([3])
    expect(groups.unknown).toEqual([])
  })

  it('falls back to the reason prefix when kind is missing and counts agree', () => {
    const groups = classifyImportFailures(task({
      failed: 1,
      skipped: 1,
      errors: [
        failure({ line: 3, reason: '重复文档: title+heading 已存在，跳过' }),
        failure({ line: 4, reason: '数据无效' }),
      ],
    }))

    expect(groups.skipped.map(row => row.line)).toEqual([3])
    expect(groups.failed.map(row => row.line)).toEqual([4])
    expect(groups.unknown).toEqual([])
  })

  it('keeps entries unclassified when counts cannot validate the guess', () => {
    const groups = classifyImportFailures(task({
      failed: 5,
      skipped: 0,
      errors: [failure({ line: 3, reason: '数据无效' })],
    }))

    expect(groups.failed).toEqual([])
    expect(groups.unknown.map(row => row.line)).toEqual([3])
  })

  it('preserves the backend order in the row view', () => {
    const rows = importFailureRows(task({
      failed: 1,
      skipped: 1,
      errors: [
        failure({ line: 3, kind: 'skipped' }),
        failure({ line: 4, kind: 'failed' }),
      ],
    }))

    expect(rows.map(row => [row.line, row.group])).toEqual([[3, 'skipped'], [4, 'failed']])
  })

  it('maps every group to its copy key', () => {
    expect(importFailureGroupKey('failed')).toBe('corpus.importKindFailed')
    expect(importFailureGroupKey('skipped')).toBe('corpus.importKindSkipped')
    expect(importFailureGroupKey('unknown')).toBe('corpus.importKindUnknown')
  })
})

describe('importDetailCount', () => {
  it('flags truncation when the detail is shorter than the failure counts', () => {
    const truncated = importDetailCount(task({
      failed: 3,
      skipped: 2,
      errors: [failure(), failure()],
    }))
    expect(truncated).toEqual({ shown: 2, total: 5, truncated: true })
  })

  it('does not flag truncation when the detail covers every counted row', () => {
    const full = importDetailCount(task({
      failed: 1,
      skipped: 1,
      errors: [failure(), failure()],
    }))
    expect(full).toEqual({ shown: 2, total: 2, truncated: false })
  })
})

describe('buildImportFailureCsv', () => {
  it('exports a header plus one row per failure, excluding skipped rows', () => {
    const csv = buildImportFailureCsv(task({
      failed: 2,
      skipped: 1,
      errors: [
        failure({ line: 3, title: 'dup', kind: 'skipped' }),
        failure({ line: 4, title: 'bad one', kind: 'failed' }),
        failure({ line: 5, title: 'bad two', reason: 'title 已存在', kind: 'failed' }),
      ],
    }))

    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe(IMPORT_FAILURE_CSV_HEADER)
    expect(lines).toHaveLength(3)
    expect(csv).not.toContain('dup')
    expect(csv).toContain('title,heading,content,line,reason')
  })

  it('keeps unclassified rows in the export so no failure row is dropped', () => {
    const csv = buildImportFailureCsv(task({
      failed: 9,
      skipped: 9,
      errors: [failure({ line: 7, title: 'mystery' })],
    }))

    expect(csv).toContain('mystery')
  })

  it('escapes separators, quotes and newlines per RFC4180', () => {
    const csv = buildImportFailureCsv(task({
      failed: 1,
      errors: [failure({ line: 8, title: 'a,b', reason: 'say "hi"\nagain' })],
    }))

    expect(csv).toContain('"a,b"')
    expect(csv).toContain('"say ""hi""\nagain"')
  })

  it('produces nothing when there is no failure row to export', () => {
    expect(buildImportFailureCsv(task({ failed: 0, skipped: 0, errors: [] }))).toBe('')
    expect(buildImportFailureCsv(task({
      failed: 0,
      skipped: 1,
      errors: [failure({ kind: 'skipped' })],
    }))).toBe('')
  })
})

describe('buildImportTemplateCsv', () => {
  it('contains the header row only', () => {
    expect(buildImportTemplateCsv()).toBe(IMPORT_TEMPLATE_CSV)
    expect(buildImportTemplateCsv().trimEnd().split('\n')).toHaveLength(1)
    expect(hasImportHeader(buildImportTemplateCsv())).toBe(true)
  })
})

describe('importSummaryParams', () => {
  it('exposes the counts used by the completion summary', () => {
    expect(importSummaryParams(task({ total: 100, success: 98, failed: 2, skipped: 0 }))).toEqual({
      total: 100,
      success: 98,
      failed: 2,
      skipped: 0,
    })
  })
})
