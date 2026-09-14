import type { SkillEditForm, SkillMetaValues } from './utils'
import type { SkillDetail } from '@/api/skill'
import { describe, expect, it } from 'vitest'
import {
  buildSkillPatch,
  channelOption,
  composeSkillContent,
  emptySkillMeta,
  invalidSkillMetaFields,
  isKnownPlatform,
  isOwnSkill,
  parseSkillContent,
  sameSkillMeta,
  skillErrorKey,
  skillMetaOwner,
  skillSortParam,
  validateSkillBody,
  validateSkillDescription,
  validateSkillForm,
} from './utils'

const validForm = {
  name: 'invoice',
  description: '开票相关的操作指引',
  body: '按顺序执行。',
  channel: 'web' as const,
  meta: emptySkillMeta(),
}

/** 编辑态表单：默认是 detail() 里那条没有元数据的技能，按需覆盖。 */
function editForm(patch: Partial<SkillEditForm> = {}): SkillEditForm {
  return {
    description: 'old',
    body: 'old body',
    channel: 'web',
    meta: emptySkillMeta(),
    ...patch,
  }
}

function meta(patch: Partial<SkillMetaValues> = {}): SkillMetaValues {
  return { ...emptySkillMeta(), ...patch }
}

/** 测试里读 `metadata.hermes` 的小工具，避免在断言里写 `as any`。 */
function hermesOf(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const metadata = frontmatter.metadata as Record<string, unknown> | undefined

  return (metadata?.hermes ?? {}) as Record<string, unknown>
}

function detail(patch: Partial<SkillDetail> = {}): SkillDetail {
  return {
    id: 'sk1',
    name: 'invoice',
    description: 'old',
    channel: 'web',
    owner: 'us-1',
    content: '---\nname: invoice\ndescription: old\n---\n\nold body',
    files: [],
    ...patch,
  }
}

describe('validateSkillForm', () => {
  it('accepts a well-formed form', () => {
    expect(validateSkillForm(validForm)).toBeNull()
    expect(validateSkillForm({ ...validForm, name: 'a-b-c' })).toBeNull()
    // 前后空白不该让合法输入被判失败
    expect(validateSkillForm({ ...validForm, name: ' invoice ' })).toBeNull()
  })

  it('requires a name', () => {
    expect(validateSkillForm({ ...validForm, name: '   ' })).toBe('skill.nameRequired')
  })

  it.each([
    ['-invoice', 'skill.nameFormat'],
    ['invoice-', 'skill.nameFormat'],
    ['in--voice', 'skill.nameFormat'],
    ['Invoice', 'skill.nameFormat'],
    ['in_voice', 'skill.nameFormat'],
    ['invoice-1', null],
  ])('rejects the malformed name %s', (name, expected) => {
    expect(validateSkillForm({ ...validForm, name })).toBe(expected)
  })

  it('caps the name at 64 characters', () => {
    expect(validateSkillForm({ ...validForm, name: 'a'.repeat(64) })).toBeNull()
    expect(validateSkillForm({ ...validForm, name: 'a'.repeat(65) })).toBe('skill.nameLength')
  })

  it('requires a description', () => {
    expect(validateSkillForm({ ...validForm, description: ' ' })).toBe('skill.descriptionRequired')
  })

  it('counts the description by character, not by code unit or byte', () => {
    expect(validateSkillForm({ ...validForm, description: '中'.repeat(124) })).toBeNull()
    expect(validateSkillForm({ ...validForm, description: '中'.repeat(125) })).toBe('skill.descriptionTooLong')
  })

  it('requires a non-blank body', () => {
    expect(validateSkillForm({ ...validForm, body: '' })).toBe('skill.bodyRequired')
    expect(validateSkillForm({ ...validForm, body: '\n  \t' })).toBe('skill.bodyRequired')
  })
})

// 抽屉的编辑态只改描述与正文，这两条规则要能在 create 表单之外单独复用。
describe('validateSkillDescription / validateSkillBody', () => {
  it('requires a description and caps it by character count', () => {
    expect(validateSkillDescription('  ')).toBe('skill.descriptionRequired')
    expect(validateSkillDescription('中'.repeat(124))).toBeNull()
    expect(validateSkillDescription('中'.repeat(125))).toBe('skill.descriptionTooLong')
  })

  it('requires a non-blank body', () => {
    expect(validateSkillBody('')).toBe('skill.bodyRequired')
    expect(validateSkillBody('\n \t')).toBe('skill.bodyRequired')
    expect(validateSkillBody('第一步\n第二步')).toBeNull()
  })
})

describe('parseSkillContent / composeSkillContent', () => {
  it('round-trips name, description and body', () => {
    const content = composeSkillContent({ name: 'invoice', description: '开票指引', body: '第一步\n第二步' })
    const parsed = parseSkillContent(content)

    expect(parsed.name).toBe('invoice')
    expect(parsed.description).toBe('开票指引')
    expect(parsed.body).toBe('第一步\n第二步')
  })

  it('round-trips descriptions that would break a hand-written template', () => {
    const description = 'a: b "q" \'s\' #tag\nem\n😀'
    const content = composeSkillContent({ name: 'invoice', description, body: 'body' })

    expect(parseSkillContent(content).description).toBe(description)
  })

  it('keeps unknown frontmatter keys when rebuilding', () => {
    const original = '---\nname: invoice\ndescription: old\nallowed-tools: Read,Write\nlicense: MIT\n---\n\nbody'
    const parsed = parseSkillContent(original)

    expect(parsed.frontmatter['allowed-tools']).toBe('Read,Write')

    const rebuilt = parseSkillContent(composeSkillContent({
      frontmatter: parsed.frontmatter,
      name: parsed.name,
      description: 'new',
      body: parsed.body,
    }))

    expect(rebuilt.frontmatter['allowed-tools']).toBe('Read,Write')
    expect(rebuilt.frontmatter.license).toBe('MIT')
    expect(rebuilt.description).toBe('new')
  })

  it('tolerates a leading BOM', () => {
    expect(parseSkillContent('\uFEFF---\nname: invoice\ndescription: d\n---\n\nbody').body).toBe('body')
  })

  it.each([
    ['no frontmatter', 'just a body'],
    ['only an opening delimiter', '---\nname: invoice'],
    ['no closing delimiter', '---\nname: invoice\ndescription: d'],
    ['invalid yaml', '---\nname: [invoice\ndescription: d\n---\n\nbody'],
    ['a non-object frontmatter', '---\n- a\n- b\n---\n\nbody'],
    ['a missing description', '---\nname: invoice\n---\n\nbody'],
    ['an empty description', '---\nname: invoice\ndescription: " "\n---\n\nbody'],
  ])('falls back to the raw content for %s without throwing', (_label, content) => {
    const parsed = parseSkillContent(content)

    expect(parsed.frontmatter).toEqual({})
    expect(parsed.name).toBe('')
    expect(parsed.body).toBe(content)
  })
})

describe('buildSkillPatch', () => {
  it('rebuilds content when only the description changed', () => {
    const patch = buildSkillPatch(detail(), editForm({ description: 'new' }))

    expect(patch.description).toBe('new')
    expect(patch.content).toContain('description: new')
    expect(parseSkillContent(patch.content ?? '').body).toBe('old body')
    expect(patch.channel).toBeUndefined()
  })

  it('rebuilds content when only the body changed', () => {
    const patch = buildSkillPatch(detail(), editForm({ body: 'new body' }))

    expect(patch.description).toBeUndefined()
    expect(parseSkillContent(patch.content ?? '').body).toBe('new body')
  })

  it('sends only the channel when nothing but the channel changed', () => {
    expect(buildSkillPatch(detail(), editForm({ channel: 'feishu' })))
      .toEqual({ channel: 'feishu' })
  })

  it('returns an empty patch when nothing changed or the original is missing', () => {
    expect(buildSkillPatch(detail(), editForm())).toEqual({})
    expect(buildSkillPatch(null, editForm({ description: 'new', body: 'new body' }))).toEqual({})
  })

  it('never writes a channel it cannot represent, even when other fields changed', () => {
    const patch = buildSkillPatch(
      detail({ channel: 'channel 3' }),
      editForm({ description: 'new', body: 'new body' }),
    )

    expect(patch.channel).toBeUndefined()
    expect(patch.description).toBe('new')
    expect(parseSkillContent(patch.content ?? '').body).toBe('new body')
  })
})

describe('isOwnSkill', () => {
  it('is true only for a strict match', () => {
    expect(isOwnSkill('us-1', 'us-1')).toBe(true)
  })

  it('never claims ownership when the session has no oid', () => {
    expect(isOwnSkill('', '')).toBe(false)
    expect(isOwnSkill('us-1', '')).toBe(false)
    expect(isOwnSkill('us-1', undefined)).toBe(false)
    expect(isOwnSkill(undefined, undefined)).toBe(false)
  })

  it('is false for a different or differently formatted oid', () => {
    expect(isOwnSkill('us-1', 'us-2')).toBe(false)
    expect(isOwnSkill('us-1', 'US-1')).toBe(false)
  })
})

describe('skillErrorKey', () => {
  it('maps permission and session errors to their dedicated copy', () => {
    expect(skillErrorKey({ status: 403 }, 'skill.saveFailed')).toBe('skill.permissionDenied')
    expect(skillErrorKey({ status: 401 }, 'skill.saveFailed')).toBe('skill.authExpired')
  })

  it('maps a duplicate name to the dedicated copy', () => {
    expect(skillErrorKey({ status: 400, message: 'skill name already exists' }, 'skill.createFailed'))
      .toBe('skill.nameTaken')
  })

  it('keeps the caller fallback for everything else', () => {
    expect(skillErrorKey({ status: 500, message: 'boom' }, 'skill.createFailed')).toBe('skill.createFailed')
    expect(skillErrorKey(new Error('Network Error'), 'skill.createFailed')).toBe('skill.createFailed')
    expect(skillErrorKey(undefined, 'skill.createFailed')).toBe('skill.createFailed')
  })
})

describe('channelOption', () => {
  it('maps the four representable channels to editable labels', () => {
    expect(channelOption('none')).toEqual({ labelKey: 'skill.channelNone', editable: true })
    expect(channelOption('web')).toEqual({ labelKey: 'skill.channelWeb', editable: true })
    expect(channelOption('wecom')).toEqual({ labelKey: 'skill.channelWecom', editable: true })
    expect(channelOption('feishu')).toEqual({ labelKey: 'skill.channelFeishu', editable: true })
  })

  it('treats bitmask and unknown values as read-only', () => {
    expect(channelOption('channel 3')).toEqual({ labelKey: 'skill.channelUnknown', editable: false })
    expect(channelOption('email')).toEqual({ labelKey: 'skill.channelUnknown', editable: false })
    expect(channelOption(undefined)).toEqual({ labelKey: 'skill.channelUnknown', editable: false })
  })
})

describe('skillSortParam', () => {
  it('encodes descending order with a leading dash', () => {
    expect(skillSortParam('created', 'descend')).toBe('-created')
    expect(skillSortParam('updated', 'ascend')).toBe('updated')
  })
})

// 后端 89f1631 的七列：version/author/license/platforms 在顶层，
// category/homepage/related_skills 在 metadata.hermes 下。
const fullMeta = meta({
  version: '1.0.0',
  author: 'Siqi Chen, Hermes Agent',
  license: 'MIT',
  platforms: ['linux', 'macos'],
  category: 'software-development',
  homepage: 'https://example.com/skill',
  relatedSkills: ['invoice', 'refund'],
})

const fullContent = [
  '---',
  'name: invoice',
  'description: old',
  'version: 1.0.0',
  'author: Siqi Chen, Hermes Agent',
  'license: MIT',
  'platforms:',
  '  - linux',
  '  - macos',
  'metadata:',
  '  hermes:',
  '    category: software-development',
  '    homepage: https://example.com/skill',
  '    related_skills:',
  '      - invoice',
  '      - refund',
  '---',
  '',
  'old body',
].join('\n')

describe('parseSkillContent - metadata', () => {
  it('reads the seven fields from both frontmatter levels', () => {
    expect(parseSkillContent(fullContent).meta).toEqual(fullMeta)
  })

  it('joins an author sequence and a scalar author the same way', () => {
    const sequence = parseSkillContent('---\nname: a\ndescription: d\nauthor: [A, B]\n---\n\nbody')
    const scalar = parseSkillContent('---\nname: a\ndescription: d\nauthor: A\n---\n\nbody')

    expect(sequence.meta.author).toBe('A, B')
    expect(scalar.meta.author).toBe('A')
  })

  it('trims and dedupes related skills while keeping their order', () => {
    const parsed = parseSkillContent(
      '---\nname: a\ndescription: d\nmetadata:\n  hermes:\n    related_skills:\n      - b\n      - " b "\n      - a\n---\n\nbody',
    )

    expect(parsed.meta.relatedSkills).toEqual(['b', 'a'])
  })

  it('ignores non-string and nested values instead of throwing', () => {
    const parsed = parseSkillContent(
      '---\nname: a\ndescription: d\nversion: 1\nlicense:\n  spdx: MIT\nmetadata: linux\n---\n\nbody',
    )

    expect(parsed.meta).toEqual(emptySkillMeta())
  })

  it('falls back to empty metadata when there is no frontmatter', () => {
    expect(parseSkillContent('just a body').meta).toEqual(emptySkillMeta())
  })
})

describe('composeSkillContent - metadata', () => {
  it('round-trips all seven fields', () => {
    const content = composeSkillContent({ name: 'invoice', description: 'old', body: 'body', meta: fullMeta })

    expect(parseSkillContent(content).meta).toEqual(fullMeta)
  })

  // 钉住写出的 YAML 形态：后端按顶层四项 + metadata.hermes 三项解析，位置写错会静默丢字段。
  it('writes the layout the backend parses', () => {
    expect(composeSkillContent({ name: 'invoice', description: 'old', body: 'body', meta: fullMeta }))
      .toBe([
        '---',
        'name: invoice',
        'description: old',
        'version: 1.0.0',
        'author: Siqi Chen, Hermes Agent',
        'license: MIT',
        'platforms:',
        '  - linux',
        '  - macos',
        'metadata:',
        '  hermes:',
        '    category: software-development',
        '    homepage: https://example.com/skill',
        '    related_skills:',
        '      - invoice',
        '      - refund',
        '---',
        '',
        'body',
      ].join('\n'))
  })

  it('writes the nested fields under metadata.hermes', () => {
    const parsed = parseSkillContent(
      composeSkillContent({ name: 'invoice', description: 'old', body: 'body', meta: fullMeta }),
    )

    expect(parsed.frontmatter.version).toBe('1.0.0')
    expect(parsed.frontmatter.platforms).toEqual(['linux', 'macos'])
    expect(hermesOf(parsed.frontmatter).category).toBe('software-development')
    expect(hermesOf(parsed.frontmatter).related_skills).toEqual(['invoice', 'refund'])
  })

  it('keeps other keys inside metadata.hermes', () => {
    const source = '---\nname: a\ndescription: d\nmetadata:\n  hermes:\n    tags: [x]\n    category: tool\n---\n\nbody'
    const rebuilt = parseSkillContent(composeSkillContent({
      frontmatter: parseSkillContent(source).frontmatter,
      name: 'a',
      description: 'd',
      body: 'body',
      meta: meta({ category: 'tool' }),
    }))

    expect(hermesOf(rebuilt.frontmatter).tags).toEqual(['x'])
  })

  it('omits empty fields and clears the objects they lived in', () => {
    const rebuilt = parseSkillContent(composeSkillContent({
      frontmatter: parseSkillContent(fullContent).frontmatter,
      name: 'invoice',
      description: 'old',
      body: 'body',
      meta: emptySkillMeta(),
    }))

    expect(rebuilt.frontmatter).toEqual({ name: 'invoice', description: 'old' })
    expect(rebuilt.frontmatter.metadata).toBeUndefined()
  })

  it('keeps existing metadata when the caller does not pass meta', () => {
    const rebuilt = parseSkillContent(composeSkillContent({
      frontmatter: parseSkillContent(fullContent).frontmatter,
      name: 'invoice',
      description: 'new',
      body: 'body',
    }))

    expect(rebuilt.meta).toEqual(fullMeta)
  })

  it('preserves platform names the interface cannot represent', () => {
    const source = '---\nname: a\ndescription: d\nplatforms: [linux, plan9]\n---\n\nbody'
    const parsed = parseSkillContent(source)
    const rebuilt = parseSkillContent(composeSkillContent({
      frontmatter: parsed.frontmatter,
      name: 'a',
      description: 'd',
      body: 'body',
      meta: parsed.meta,
    }))

    expect(rebuilt.meta.platforms).toEqual(['linux', 'plan9'])
  })
})

// 提交时校验（不在输入时限制）：超长仅在提交那一步拦下，文案由组件渲染在对应字段下。
describe('invalidSkillMetaFields', () => {
  it('accepts empty and within-limit values', () => {
    expect(invalidSkillMetaFields(emptySkillMeta())).toEqual([])
    expect(invalidSkillMetaFields(meta({ version: '1.0.0', homepage: 'https://example.com' }))).toEqual([])
  })

  it('counts characters rather than code units or bytes', () => {
    expect(invalidSkillMetaFields(meta({ author: '中'.repeat(128) }))).toEqual([])
    expect(invalidSkillMetaFields(meta({ author: '中'.repeat(129) }))).toEqual(['author'])
  })

  it('reports every over-long field, in declaration order', () => {
    expect(invalidSkillMetaFields(meta({
      version: 'a'.repeat(33),
      license: 'MIT',
      homepage: 'b'.repeat(256),
    }))).toEqual(['version', 'homepage'])
  })

  it('ignores surrounding whitespace when measuring', () => {
    expect(invalidSkillMetaFields(meta({ license: ` ${'c'.repeat(32)} ` }))).toEqual([])
  })
})

// 记录级 meta.owner（与 frontmatter 无关）：只有非空字符串算存在。
describe('skillMetaOwner', () => {
  it('reads a string owner and trims it', () => {
    expect(skillMetaOwner({ owner: 'admin' })).toBe('admin')
    expect(skillMetaOwner({ owner: '  admin  ' })).toBe('admin')
  })

  it('treats anything else as absent', () => {
    expect(skillMetaOwner(undefined)).toBe('')
    expect(skillMetaOwner(null)).toBe('')
    expect(skillMetaOwner({})).toBe('')
    expect(skillMetaOwner({ owner: '' })).toBe('')
    expect(skillMetaOwner({ owner: '   ' })).toBe('')
    expect(skillMetaOwner({ owner: 42 })).toBe('')
    expect(skillMetaOwner({ owner: { name: 'admin' } })).toBe('')
  })

  it('ignores other keys in the record meta', () => {
    expect(skillMetaOwner({ other: 'x' })).toBe('')
  })
})

describe('isKnownPlatform / sameSkillMeta', () => {
  it('matches platform names case-insensitively', () => {
    expect(isKnownPlatform('linux')).toBe(true)
    expect(isKnownPlatform(' MacOS ')).toBe(true)
    expect(isKnownPlatform('plan9')).toBe(false)
  })

  it('ignores surrounding whitespace but not real differences', () => {
    expect(sameSkillMeta(meta({ version: '1.0.0' }), meta({ version: ' 1.0.0 ' }))).toBe(true)
    expect(sameSkillMeta(meta({ platforms: ['linux'] }), meta({ platforms: ['linux', 'macos'] }))).toBe(false)
    expect(sameSkillMeta(meta({ relatedSkills: ['a', 'b'] }), meta({ relatedSkills: ['b', 'a'] }))).toBe(false)
  })
})

describe('buildSkillPatch - metadata', () => {
  it('rebuilds content when only metadata changed', () => {
    const patch = buildSkillPatch(detail(), editForm({ meta: fullMeta }))

    expect(patch.description).toBeUndefined()
    expect(parseSkillContent(patch.content ?? '').meta).toEqual(fullMeta)
  })

  it('returns an empty patch when metadata is unchanged', () => {
    const patch = buildSkillPatch(detail({ content: fullContent }), editForm({ body: 'old body', meta: meta(fullMeta) }))

    expect(patch).toEqual({})
  })

  it('drops a cleared field from the rebuilt content', () => {
    const patch = buildSkillPatch(
      detail({ content: fullContent }),
      editForm({ body: 'old body', meta: meta({ ...fullMeta, license: '' }) }),
    )
    const rebuilt = parseSkillContent(patch.content ?? '')

    expect(rebuilt.meta.license).toBe('')
    expect(rebuilt.frontmatter.license).toBeUndefined()
    expect(rebuilt.meta.version).toBe('1.0.0')
  })
})
