import { describe, expect, test } from 'bun:test'
import {
  classifyPost,
  dedupKey,
  hasDateExpression,
  matchKeywords,
  normalizeText,
  structuralDropReason
} from '@biccame/shared/event-detect/filter'

const stores = new Set(['bic_example', 'bic_other'])

const post = (overrides: Partial<Parameters<typeof classifyPost>[0]> = {}) => ({
  kind: 'original' as const,
  screenName: 'Bic_Example',
  text: '10/1から限定名刺を配布します',
  ...overrides
})

describe('structuralDropReason', () => {
  test('リツイートは本文に関係なく除外する', () => {
    expect(structuralDropReason(post({ kind: 'retweet' }), stores)).toBe('retweet')
  })

  test('他アカウント宛てのリプライは除外し、自己リプライは残す', () => {
    const toOther = post({ kind: 'reply', replyTo: { id: '1', screenName: 'someone' } })
    const toSelf = post({ kind: 'reply', replyTo: { id: '1', screenName: 'bic_example' } })
    expect(structuralDropReason(toOther, stores)).toBe('reply_to_other')
    expect(structuralDropReason(toSelf, stores)).toBeUndefined()
  })

  test('店舗アカウント以外は除外し、大文字小文字は区別しない', () => {
    expect(structuralDropReason(post({ screenName: 'fan_account' }), stores)).toBe('non_store_account')
    expect(structuralDropReason(post({ screenName: 'BIC_OTHER' }), stores)).toBeUndefined()
  })

  test('引用は除外しない', () => {
    expect(structuralDropReason(post({ kind: 'quote' }), stores)).toBeUndefined()
  })
})

describe('classifyPost', () => {
  test('配布の語を含む店舗の投稿は通過する', () => {
    const verdict = classifyPost(post(), { storeAccounts: stores })
    expect(verdict.reason).toBeUndefined()
    expect(verdict.hits.map((hit) => hit.keyword)).toEqual(['名刺', '配布'])
    expect(verdict.strong).toBe(true)
  })

  test('配布の語が無ければ no_keyword で除外する', () => {
    expect(classifyPost(post({ text: 'おはようございます☀️' }), { storeAccounts: stores }).reason).toBe('no_keyword')
  })

  test('構造の除外理由はキーワードより優先する', () => {
    const verdict = classifyPost(post({ kind: 'retweet' }), { storeAccounts: stores })
    expect(verdict.reason).toBe('retweet')
    expect(verdict.strong).toBe(false)
  })

  test('無効にした語は数えない', () => {
    const verdict = classifyPost(post({ text: '名刺の写真です' }), {
      storeAccounts: stores,
      disabled: new Set(['名刺'])
    })
    expect(verdict.reason).toBe('no_keyword')
  })

  test('景品名だけで配布方法も日付も無ければ強シグナルにしない', () => {
    const verdict = classifyPost(post({ text: '名刺かわいい' }), { storeAccounts: stores })
    expect(verdict.reason).toBeUndefined()
    expect(verdict.strong).toBe(false)
  })

  test('購入条件と日付があれば配布の語が無くても強シグナルになる', () => {
    const verdict = classifyPost(post({ text: '9/5(土)から税込3,000円以上でアクスタをプレゼント' }), {
      storeAccounts: stores
    })
    expect(verdict.strong).toBe(true)
  })

  test('完配・品切れなど終了の語を拾う', () => {
    const verdict = classifyPost(post({ text: 'マーメイドアクキー・・・完配しました！' }), { storeAccounts: stores })
    expect(verdict.hits.map((hit) => hit.group)).toEqual(['item', 'end'])
  })
})

describe('normalizeText', () => {
  test('全角英数と半角カナを揃え、URL と空白を除く', () => {
    expect(normalizeText('１０／１（木） ｱｸｷｰ\nhttps://t.co/abc 配布')).toBe('10/1(木)アクキー配布')
  })

  test('全角で書かれた語も一致する', () => {
    expect(matchKeywords(normalizeText('税込３，０００円以上')).map((hit) => hit.keyword)).toEqual(['円以上'])
  })
})

describe('hasDateExpression', () => {
  test.each(['10/25(日)から', '8月22日スタート', '本日まで', '明日から', '最終日です'])(
    '%s を日付として扱う',
    (text) => {
      expect(hasDateExpression(normalizeText(text))).toBe(true)
    }
  )

  test('日付を含まない文は false', () => {
    expect(hasDateExpression('ご来店お待ちしております')).toBe(false)
  })
})

describe('dedupKey', () => {
  test('URL と空白だけが異なる文面は同じキーになる', () => {
    expect(dedupKey('配布します！\nhttps://t.co/aaa')).toBe(dedupKey('配布します！ https://t.co/bbb'))
  })
})
