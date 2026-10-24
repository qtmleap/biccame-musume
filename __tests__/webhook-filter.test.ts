import { describe, expect, test } from 'bun:test'
import { WEBHOOK_KEYWORD_VERDICTS, webhookKeywordVerdict } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import {
  cycleWebhookConfidenceSort,
  hasWebhookFilterConditions,
  INITIAL_WEBHOOK_FILTER,
  NO_WEBHOOK_FILTER,
  parseWebhookFilter,
  setWebhookPostStatus,
  setWebhookRange,
  setWebhookScreenName,
  setWebhookVerdict,
  webhookColumnAriaSort
} from '@/atoms/webhook-filter-atom'
import { webhookKeywordLabel, webhookKeywordVerdictLabel } from '@/components/admin/webhook-labels'
import { filterWith, query } from './fixtures/webhook-filter'

describe('受信履歴のクエリスキーマ', () => {
  test('何も指定しなければ日時の新しい順で、期間・判定・ステータスは絞り込まない', () => {
    const parsed = query({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data).toEqual({ limit: 25, sort: 'createdAt', order: 'desc' })
  })

  test('期間・並べ替え・判定・ステータスをクエリ文字列から受け取る', () => {
    const parsed = query({
      range: '24h',
      sort: 'confidence',
      order: 'asc',
      verdict: 'excluded',
      postStatus: 'ignored'
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data).toMatchObject({
      range: '24h',
      sort: 'confidence',
      order: 'asc',
      verdict: 'excluded',
      postStatus: 'ignored'
    })
  })

  test.each(['announce', 'start', 'ongoing', 'end', 'ignored'])('ステータス %s を受け付ける', (postStatus) => {
    const parsed = query({ postStatus })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.postStatus).toBe(postStatus)
  })

  test('キャラクターの投稿アカウントを受け付け、不正な値を拒否する', () => {
    expect(query({ screenName: 'BIC_abeno' }).success).toBe(true)
    for (const screenName of ['', '@bic_abeno', 'a'.repeat(16), "bic' OR 1=1", 'bic%']) {
      expect(query({ screenName }).success).toBe(false)
    }
  })

  test('精度の下限・上限はもう絞り込みに使わない（未知のキーとして捨てる）', () => {
    // zod の object は未知のキーを捨てるので 400 ではなく無視になる。結果にも残らない。
    const parsed = query({ minConfidence: '0.9', maxConfidence: '0.1' })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data).toEqual({ limit: 25, sort: 'createdAt', order: 'desc' })
    expect(Object.keys(parsed.data)).not.toContain('minConfidence')
    expect(Object.keys(parsed.data)).not.toContain('maxConfidence')
  })

  test.each([
    ['未知の期間', { range: '7d' }],
    ['未知の並べ替え', { sort: 'status' }],
    ['未知の向き', { order: 'up' }],
    ['未知の判定', { verdict: 'unknown' }],
    ['未知のステータス', { postStatus: 'foo' }],
    ['ステータスの空文字', { postStatus: '' }],
    ['ジョブの状態名はステータスではない', { postStatus: 'held' }]
  ])('%sは弾く', (_label, value) => {
    expect(query(value).success).toBe(false)
  })

  test('既存の status と cursor と limit は従来どおり', () => {
    expect(query({ status: 'held', cursor: '123', limit: '100' }).success).toBe(true)
    expect(query({ status: 'unknown' }).success).toBe(false)
    expect(query({ cursor: 'abc' }).success).toBe(false)
    expect(query({ limit: '101' }).success).toBe(false)
  })
})

describe('受信履歴の絞り込み・並べ替えの状態', () => {
  test('既定は判定が一致・日時の新しい順で、条件なしは判定・ステータスもすべての日時の新しい順', () => {
    expect(INITIAL_WEBHOOK_FILTER).toEqual({
      range: null,
      sort: 'createdAt',
      order: 'desc',
      verdict: 'match',
      postStatus: null,
      screenName: null,
      discovery: null
    })
    expect(NO_WEBHOOK_FILTER).toEqual({
      range: null,
      sort: 'createdAt',
      order: 'desc',
      verdict: null,
      postStatus: null,
      screenName: null,
      discovery: null
    })
    // 既定と条件なしは判定だけが違う。
    expect(NO_WEBHOOK_FILTER).toEqual({ ...INITIAL_WEBHOOK_FILTER, verdict: null })
  })

  test('「条件をクリア」を押せるのは、外せる条件があるとき（既定の一致のままでも押せる）', () => {
    expect(hasWebhookFilterConditions(NO_WEBHOOK_FILTER)).toBe(false)
    expect(hasWebhookFilterConditions(INITIAL_WEBHOOK_FILTER)).toBe(true)
    for (const changed of [
      filterWith({ screenName: 'bic_abeno' }),
      filterWith({ range: '1h' }),
      filterWith({ range: '24h' }),
      filterWith({ sort: 'confidence' }),
      filterWith({ order: 'asc' }),
      filterWith({ sort: 'confidence', order: 'asc' }),
      filterWith({ verdict: 'match' }),
      filterWith({ verdict: 'mismatch' }),
      filterWith({ verdict: 'excluded' }),
      filterWith({ postStatus: 'announce' }),
      filterWith({ postStatus: 'start' }),
      filterWith({ postStatus: 'ongoing' }),
      filterWith({ postStatus: 'end' }),
      filterWith({ postStatus: 'ignored' })
    ]) {
      expect(hasWebhookFilterConditions(changed)).toBe(true)
    }
  })

  test('保存値の検証: 正しい値はそのまま使う', () => {
    for (const value of [
      INITIAL_WEBHOOK_FILTER,
      // 「すべて」を選んだ状態(verdict: null)は有効な保存値で、既定の一致で上書きしない。
      NO_WEBHOOK_FILTER,
      filterWith({ range: '24h', sort: 'confidence', order: 'asc', verdict: 'excluded', postStatus: 'ignored' }),
      filterWith({ postStatus: 'ongoing' })
    ]) {
      expect(parseWebhookFilter(value)).toEqual(value)
    }
  })

  test.each([
    ['null', null],
    ['文字列', 'filter'],
    ['空オブジェクト', {}],
    ['配列', []],
    ['項目が欠ける', { range: null, sort: 'createdAt', order: 'desc' }],
    ['ステータスの項目が無い(旧い保存値)', { range: null, sort: 'createdAt', order: 'desc', verdict: null }],
    ['未知の期間', { ...INITIAL_WEBHOOK_FILTER, range: '7d' }],
    ['未知の並べ替え', { ...INITIAL_WEBHOOK_FILTER, sort: 'status' }],
    ['未知の向き', { ...INITIAL_WEBHOOK_FILTER, order: 'up' }],
    ['未知の判定', { ...INITIAL_WEBHOOK_FILTER, verdict: 'unknown' }],
    ['未知のステータス', { ...INITIAL_WEBHOOK_FILTER, postStatus: 'foo' }],
    ['ジョブの状態名のステータス', { ...INITIAL_WEBHOOK_FILTER, postStatus: 'held' }],
    ['ステータスが数値', { ...INITIAL_WEBHOOK_FILTER, postStatus: 1 }]
  ])('保存値の検証: 壊れた値(%s)は既定値(判定は一致)に倒す', (_label, value) => {
    const parsed = parseWebhookFilter(value)
    expect(parsed).toEqual(INITIAL_WEBHOOK_FILTER)
    expect(parsed.verdict).toBe('match')
    expect(parsed.postStatus).toBeNull()
  })

  test('期間と判定とステータスの更新は、変わらなければ同じ参照を返す', () => {
    const filter = filterWith({ range: '1h', verdict: 'match', postStatus: 'end' })
    expect(setWebhookRange(filter, '1h')).toBe(filter)
    expect(setWebhookVerdict(filter, 'match')).toBe(filter)
    expect(setWebhookPostStatus(filter, 'end')).toBe(filter)
    expect(setWebhookRange(filter, null)).toEqual(filterWith({ verdict: 'match', postStatus: 'end' }))
    expect(setWebhookVerdict(filter, 'excluded')).toEqual(
      filterWith({ range: '1h', verdict: 'excluded', postStatus: 'end' })
    )
    expect(setWebhookPostStatus(filter, 'ignored')).toEqual(
      filterWith({ range: '1h', verdict: 'match', postStatus: 'ignored' })
    )
    // null は「すべて」に戻す。
    expect(setWebhookPostStatus(filter, null)).toEqual(filterWith({ range: '1h', verdict: 'match' }))
  })

  test('ステータスは他の条件を変えずに、5つの値それぞれへ切り替えられる', () => {
    const base = filterWith({ range: '24h', verdict: 'mismatch', sort: 'confidence', order: 'asc' })
    for (const postStatus of ['announce', 'start', 'ongoing', 'end', 'ignored'] as const) {
      expect(setWebhookPostStatus(base, postStatus)).toEqual({ ...base, postStatus })
    }
  })

  test('キャラクターを変えても他の条件を保ち、同じ値なら参照を保つ', () => {
    const base = filterWith({ range: '24h', verdict: 'excluded', postStatus: 'end', sort: 'confidence' })
    const selected = setWebhookScreenName(base, 'bic_abeno')
    expect(selected).toEqual({ ...base, screenName: 'bic_abeno' })
    expect(setWebhookScreenName(selected, 'bic_abeno')).toBe(selected)
    expect(setWebhookScreenName(selected, null)).toEqual(base)
    expect(parseWebhookFilter(selected)).toEqual(selected)
    const { screenName, ...legacy } = selected
    expect(screenName).toBe('bic_abeno')
    expect(parseWebhookFilter(legacy)).toEqual(base)
    expect(parseWebhookFilter({ ...base, screenName: '@invalid' })).toEqual(INITIAL_WEBHOOK_FILTER)
  })

  test('更新は元の値を書き換えない', () => {
    const base = filterWith({ range: '1h' })
    setWebhookRange(base, '24h')
    setWebhookPostStatus(base, 'start')
    cycleWebhookConfidenceSort(base)
    expect(base).toEqual(filterWith({ range: '1h' }))
  })
})

describe('精度の並べ替えの巡回', () => {
  test('既定(日時の新しい順) → 精度の高い順 → 精度の低い順 → 既定 と3段で一周する', () => {
    const high = cycleWebhookConfidenceSort(INITIAL_WEBHOOK_FILTER)
    expect(high).toEqual({ ...INITIAL_WEBHOOK_FILTER, sort: 'confidence', order: 'desc' })
    const low = cycleWebhookConfidenceSort(high)
    expect(low).toEqual({ ...INITIAL_WEBHOOK_FILTER, sort: 'confidence', order: 'asc' })
    expect(cycleWebhookConfidenceSort(low)).toEqual(INITIAL_WEBHOOK_FILTER)
  })

  test('巡回しても絞り込み(期間・判定・ステータス)は変えない', () => {
    const base = filterWith({ range: '24h', verdict: 'match', postStatus: 'announce' })
    const high = cycleWebhookConfidenceSort(base)
    const low = cycleWebhookConfidenceSort(high)
    const back = cycleWebhookConfidenceSort(low)
    for (const value of [high, low, back]) {
      expect(value).toMatchObject({ range: '24h', verdict: 'match', postStatus: 'announce' })
    }
    expect(back).toEqual(base)
  })

  test('日時の古い順など精度以外の並びから押したときは、精度の高い順から始める', () => {
    expect(cycleWebhookConfidenceSort(filterWith({ order: 'asc' }))).toEqual(
      filterWith({ sort: 'confidence', order: 'desc' })
    )
  })

  test('aria-sort は精度が並べ替えの軸のときだけ向きを示し、それ以外は none', () => {
    expect(webhookColumnAriaSort(INITIAL_WEBHOOK_FILTER, 'confidence')).toBe('none')
    expect(webhookColumnAriaSort(filterWith({ sort: 'confidence', order: 'desc' }), 'confidence')).toBe('descending')
    expect(webhookColumnAriaSort(filterWith({ sort: 'confidence', order: 'asc' }), 'confidence')).toBe('ascending')
    expect(webhookColumnAriaSort(INITIAL_WEBHOOK_FILTER, 'createdAt')).toBe('descending')
  })
})

describe('判定の表示と絞り込みの対応', () => {
  const post = (text: string, overrides: Partial<DetectPost> = {}): DetectPost => ({
    id: '2109221721773576390',
    createdAt: '2026-10-11T01:00:00.000Z',
    screenName: 'bic_abeno',
    kind: 'original',
    text,
    url: 'https://x.com/bic_abeno/status/2109221721773576390',
    media: [],
    ...overrides
  })
  const posts = [
    post('あべのたん限定名刺 2026年11月3日から先着100枚を配布します'),
    post('日常のあいさつです'),
    post('あべのたん限定名刺を配布', { kind: 'retweet' })
  ]

  test('画面の「判定」列の表示(一致 / 不一致 / 除外)は webhookKeywordVerdict と1対1に対応する', () => {
    expect(posts.map((value) => webhookKeywordVerdict(value))).toEqual(['match', 'mismatch', 'excluded'])
    expect(posts.map((value) => webhookKeywordLabel(value))).toEqual(['一致', '不一致', '除外'])
    for (const value of posts) {
      expect(webhookKeywordLabel(value)).toBe(webhookKeywordVerdictLabel(webhookKeywordVerdict(value)))
    }
  })

  test('絞り込みの選択肢の表示名は列の表示名と同じで、すべての判定にある', () => {
    expect(WEBHOOK_KEYWORD_VERDICTS.map(webhookKeywordVerdictLabel)).toEqual(['一致', '不一致', '除外'])
  })
})
