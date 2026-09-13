import { describe, expect, it } from 'vitest'
import enUS from './en-US'
import esES from './es-ES'
import koKR from './ko-KR'
import ruRU from './ru-RU'
import viVN from './vi-VN'
import zhCN from './zh-CN'
import zhTW from './zh-TW'

/** 以 zh-CN 为基准：任一语言漏键、多键或插值参数不一致，页面就会出现缺文案或原始 key。 */
const messages: Record<string, { corpus: Record<string, string> }> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'zh-TW': zhTW,
  'es-ES': esES,
  'ko-KR': koKR,
  'ru-RU': ruRU,
  'vi-VN': viVN,
}

const placeholders = (value: string) => (value.match(/\{[a-z]+\}/g) ?? []).sort()

describe('locale messages', () => {
  it('keeps the same top-level sections in every language', () => {
    const base = Object.keys(zhCN).sort()

    for (const [lang, message] of Object.entries(messages))
      expect(Object.keys(message).sort(), lang).toEqual(base)
  })

  it('keeps the corpus key set identical across languages', () => {
    const base = Object.keys(zhCN.corpus).sort()

    for (const [lang, message] of Object.entries(messages))
      expect(Object.keys(message.corpus).sort(), lang).toEqual(base)
  })

  it('keeps the corpus interpolation parameters aligned', () => {
    for (const [key, value] of Object.entries(zhCN.corpus) as [keyof typeof zhCN.corpus, string][]) {
      for (const [lang, message] of Object.entries(messages))
        expect(placeholders(message.corpus[key] as string), `${lang}.${key}`).toEqual(placeholders(value))
    }
  })
})
