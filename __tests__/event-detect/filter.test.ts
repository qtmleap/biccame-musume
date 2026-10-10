import { describe, expect, test } from 'bun:test'
import {
  buildRescueTerms,
  classifyPost,
  dedupKey,
  hasDateExpression,
  matchKeywords,
  normalizeText,
  structuralDropReason
} from '@biccame/shared/event-detect/filter'

const stores = new Set(['bic_example', 'bic_other'])

const options = { storeAccounts: stores, rescueTerms: buildRescueTerms(['例たん', 'ビックカメラ']) }

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
    const verdict = classifyPost(post(), options)
    expect(verdict.reason).toBeUndefined()
    expect(verdict.hits.map((hit) => hit.keyword)).toEqual(['名刺', '配布'])
    expect(verdict.strong).toBe(true)
  })

  test('配布の語が無ければ no_keyword で除外する', () => {
    expect(classifyPost(post({ text: 'おはようございます☀️' }), options).reason).toBe('no_keyword')
  })

  test('構造の除外理由はキーワードより優先する', () => {
    const verdict = classifyPost(post({ kind: 'retweet' }), options)
    expect(verdict.reason).toBe('retweet')
    expect(verdict.strong).toBe(false)
  })

  test('無効にした語は数えない', () => {
    const verdict = classifyPost(post({ text: '名刺の写真です' }), {
      ...options,
      disabled: new Set(['名刺'])
    })
    expect(verdict.reason).toBe('no_keyword')
  })

  test('景品名だけで配布方法も日付も無ければ強シグナルにしない', () => {
    const verdict = classifyPost(post({ text: '名刺かわいい' }), options)
    expect(verdict.reason).toBeUndefined()
    expect(verdict.strong).toBe(false)
  })

  test('購入条件と日付があれば配布の語が無くても強シグナルになる', () => {
    const verdict = classifyPost(post({ text: '9/5(土)から税込3,000円以上でアクスタをプレゼント' }), options)
    expect(verdict.strong).toBe(true)
  })

  test('完配など終了の語を拾う', () => {
    const verdict = classifyPost(post({ text: 'マーメイドアクキー・・・完配しました！' }), options)
    expect(verdict.hits.map((hit) => hit.group)).toEqual(['item', 'end'])
  })

  test.each(['完売', '品切れ'])('キーワードから外した「%s」だけでは no_keyword になる', (word) => {
    const verdict = classifyPost(post({ text: `本日は${word}となりました` }), options)
    expect(verdict.reason).toBe('no_keyword')
    expect(verdict.hits).toEqual([])
  })

  test.each([
    ['擬人化記念日', '今年の擬人化記念日が決まりました'],
    ['ビッ旅', 'ビッ旅の詳細は後日お知らせします']
  ])('追加したキーワード「%s」で通過する', (word, text) => {
    const verdict = classifyPost(post({ text }), options)
    expect(verdict.reason).toBeUndefined()
    expect(verdict.hits).toEqual([{ keyword: word, group: 'start' }])
    expect(verdict.strong).toBe(false)
  })

  test('爆誕だけではキーワードにならず、救済語としてだけ働く', () => {
    expect(classifyPost(post({ text: 'ついに爆誕しました！' }), options).reason).toBe('no_keyword')
    const verdict = classifyPost(post({ text: '爆誕記念のフェアを本日スタート' }), options)
    expect(verdict.reason).toBeUndefined()
    expect(verdict.rescueHits).toEqual(['爆誕'])
  })
})

describe('除外語', () => {
  test('除外語を含み救済語を含まない投稿は excluded_keyword で除外する', () => {
    const verdict = classifyPost(
      post({ text: 'ポケモンカード拡張パック、抽選販売の当選者はレシートをお持ちください。配布終了' }),
      options
    )
    expect(verdict.reason).toBe('excluded_keyword')
    expect(verdict.excludeHits.map((hit) => hit.keyword)).toEqual([
      '抽選販売',
      '当選',
      'ポケモン',
      '拡張パック',
      '抽選'
    ])
  })

  test('救済語（名刺・アクスタ等）があれば除外語があっても通過する', () => {
    const verdict = classifyPost(post({ text: '仲良しフェア開催！アクスタを配布します' }), options)
    expect(verdict.reason).toBeUndefined()
    expect(verdict.rescueHits).toEqual(['アクスタ'])
  })

  test('キャラクター名（○○たん）も救済語になる', () => {
    const verdict = classifyPost(post({ text: '例たんサンキューカード、抽選会のあとに配布します' }), options)
    expect(verdict.reason).toBeUndefined()
    expect(verdict.rescueHits).toEqual(['例たん'])
  })

  test('「たん」で終わらない名前は救済語にしない', () => {
    expect(buildRescueTerms(['例たん', 'ビックカメラ', 'ナイセン'])).toContain('例たん')
    expect(buildRescueTerms(['ビックカメラ'])).not.toContain('ビックカメラ')
  })

  test('キーワードが無ければ除外語より no_keyword を優先する', () => {
    expect(classifyPost(post({ text: '新製品が発売されました' }), options).reason).toBe('no_keyword')
  })

  test('強シグナルは除外語の判定より前に決まる', () => {
    const verdict = classifyPost(post({ text: '10/1から体験会で先着100名にステッカーを配布' }), options)
    expect(verdict.reason).toBe('excluded_keyword')
    expect(verdict.strong).toBe(true)
  })

  test.each(['うちわ', 'チラシ', 'お子様', '夏休み', '試飲', '体感', '買得', 'フライデー', '中古', '時計', '取扱い'])(
    '追加した除外語「%s」を含み救済語を含まない投稿は excluded_keyword で除外する',
    (word) => {
      const verdict = classifyPost(post({ text: `10/1から${word}の配布を行います` }), options)
      expect(verdict.reason).toBe('excluded_keyword')
      expect(verdict.excludeHits.map((hit) => hit.keyword)).toContain(word)
      expect(verdict.rescueHits).toEqual([])
    }
  )

  test.each([
    ['名刺', '10/1からうちわ配布、名刺もお渡しします'],
    ['ビッカメ娘', '10/1からビッカメ娘のうちわ配布を行います']
  ])('追加した除外語に当たっても救済語「%s」があれば通過する', (rescue, text) => {
    const verdict = classifyPost(post({ text }), options)
    expect(verdict.reason).toBeUndefined()
    expect(verdict.excludeHits.map((hit) => hit.keyword)).toEqual(['うちわ'])
    expect(verdict.rescueHits).toEqual([rescue])
  })

  test('ビッ旅は救済語でもあるので、除外語と同じ投稿でも通過する', () => {
    const verdict = classifyPost(post({ text: 'ビッ旅の詳細は週末にお知らせします' }), options)
    expect(verdict.reason).toBeUndefined()
    expect(verdict.excludeHits.map((hit) => hit.keyword)).toEqual(['週末'])
    expect(verdict.rescueHits).toEqual(['ビッ旅'])
  })

  test('無効にした除外語では除外しない', () => {
    const verdict = classifyPost(post({ text: '週末はステッカーを配布' }), {
      ...options,
      disabledExcludes: new Set(['週末'])
    })
    expect(verdict.reason).toBeUndefined()
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
