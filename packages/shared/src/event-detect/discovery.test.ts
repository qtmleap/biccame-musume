import { describe, expect, test } from 'bun:test'
import { botStores } from '../stores'
import { buildDetectionDraft, evaluateDetection, filterWebhookPost } from './detection'
import { choice, post, requestWithAssociations, response } from './detection-test-fixtures'
import { describeDetectionOutcome, groundedDiscoveryEvidence, groundedDiscoveryProof } from './discovery'
import { quantityCandidates } from './quantity'

describe('根拠つき発見と登録可否', () => {
  test('focusで根拠語が省かれても高確信の文脈判定をキーワード不在だけで否定しない', () => {
    const value = post('限定デザイン', {
      extractionContext: {
        kind: 'item',
        item: '記念ギフトカード',
        evidence: ['限定デザイン'],
        originalText: 'あべのたん記念ギフトカードを配布します。限定デザインです。'
      }
    })
    expect(filterWebhookPost(value).reason).toBe('no_keyword')
    expect(groundedDiscoveryProof(value)).toEqual([])
    const outcome = describeDetectionOutcome(value, { is_event: { type: 'noul', noul: 0.99 } }, null)
    expect(outcome.discovery.status).toBe('detected')
    expect(outcome.discovery.confidence).toBe(0.99)
    expect(outcome.discovery.evidence).not.toContain('excluded_content:no_keyword')
    expect(outcome.action).toBe('review')
  })

  test('明示的な通常販促の除外と不正投稿元のガードは維持する', () => {
    const answers = { is_event: { type: 'noul' as const, noul: 0.99 } }
    const promotion = post('PCのキャンペーン終了')
    expect(filterWebhookPost(promotion).reason).toBe('excluded_keyword')
    expect(describeDetectionOutcome(promotion, answers, null).discovery.status).toBe('not_event')
    const noHitPromotion = post('PC新製品の予約受付')
    expect(filterWebhookPost(noHitPromotion).reason).toBe('no_keyword')
    expect(describeDetectionOutcome(noHitPromotion, answers, null).discovery.status).toBe('not_event')
    const foreign = post('限定デザイン', { screenName: 'untrusted' })
    expect(describeDetectionOutcome(foreign, answers, null).discovery.status).toBe('not_event')
  })
  test('正規新店舗を通知対象40店舗と分離して受け入れる', () => {
    expect(botStores).toHaveLength(40)
    for (const screenName of ['bic_urawa', 'bic_itt']) {
      expect(filterWebhookPost(post('名刺を本日から配布開始します', { screenName })).reason).toBeUndefined()
    }
    expect(filterWebhookPost(post('あべのたん名刺を配布', { screenName: 'untrusted' })).reason).toBe(
      'non_store_account'
    )
  })

  test('日付が未記載でも本人企画の発見を失わず、登録はしない', () => {
    const value = post('あべのたんハロウィンアクキーを配布します。')
    const request = requestWithAssociations(value)
    const answers = response(request, { is_event: { type: 'noul', noul: 0.72 } }).answers
    const decision = evaluateDetection(value, request, { answers })
    expect(decision.status).toBe('held')
    const outcome = describeDetectionOutcome(value, answers, decision)
    expect(outcome.discovery.status).toBe('detected')
    expect(outcome.discovery.confidence).toBe(0.72)
    expect(outcome.discovery.evidence).toContain('named_character_object')
    expect(outcome.action).toBe('review')
    // 条件の記載が無いことは全員配布として扱うので、未入力の項目には数えない。
    expect(outcome.missingFields).toEqual(['category', 'startDate'])
  })

  test('本文根拠は未実行AIの確率を作らずに表現する', () => {
    const outcome = describeDetectionOutcome(post('あべのたん名刺を配布開始します'), null, null)
    expect(outcome.discovery.status).toBe('detected')
    expect(outcome.discovery.confidence).toBeNull()
    expect(outcome.action).toBe('review')
  })

  test('終了した展示も企画として発見するが新規配布にしない', () => {
    const outcome = describeDetectionOutcome(
      post('千葉たんエリアのパネル展開は本日で終了します', { screenName: 'bic_chiba' }),
      null,
      null
    )
    expect(outcome.discovery.status).toBe('detected')
    expect(outcome.action).toBe('end')
  })

  test('配布終了に伴う在庫無しを通常販促の否定と混同しない', () => {
    const outcome = describeDetectionOutcome(post('あべのたん名刺の配布は終了したため在庫はありません'), null, null)
    expect(outcome.discovery.status).toBe('detected')
    expect(outcome.action).toBe('end')
  })

  test('残数・継続は更新として別扱いにする', () => {
    const outcome = describeDetectionOutcome(post('あべのたんアクキーは残り27個、まだ配布中です'), null, null)
    expect(outcome.discovery.status).toBe('detected')
    expect(outcome.action).toBe('update')
  })

  test.each([
    'あべのたんです！ポケモンのアクキーを本日から販売します',
    'あべのたんのおすすめ家電を販売中です',
    'あべのたん周年おめでとう！落書きを描きました',
    'あべのたんおめでとう！初音ミクのアクキーを配布します',
    'あべのたんからご案内、ポケモンのアクキー販売中です',
    '当店のギフトカードを販売中。チャージ方法は店頭でご案内',
    '私の名刺サイズの製品を販売します',
    'あべのたんの名刺は配布しません。通常の料金相談会です'
  ])('名前・公式投稿元だけで通常販促を企画にしない: %s', (text) => {
    expect(groundedDiscoveryEvidence(post(text))).toEqual([])
    expect(describeDetectionOutcome(post(text), { is_event: { type: 'noul', noul: 0.1 } }, null).discovery.status).toBe(
      'not_event'
    )
  })

  test('物品名の後ろの明示verも対象デザインの根拠として扱う', () => {
    const value = post('ビッ旅 缶バッジ #立川たん ver 残り70個を配布中です', { screenName: 'bic_tachikawa' })
    const outcome = describeDetectionOutcome(value, { is_event: { type: 'noul', noul: 0.81 } }, null)
    expect(outcome.discovery.status).toBe('detected')
    expect(outcome.action).toBe('update')
  })

  test('構造的な不正投稿元を本文根拠で救済しない', () => {
    const value = post('あべのたん名刺を配布', { screenName: 'untrusted' })
    expect(describeDetectionOutcome(value, { is_event: { type: 'noul', noul: 0.99 } }, null).action).toBe('ignore')
  })

  test('条件の記載が無い投稿は条件なし（everyone）として登録し、下書きにも同じ条件を入れる', () => {
    const value = post('あべのたん名刺は11/3から配布')
    const request = requestWithAssociations(value)
    const result = evaluateDetection(value, request, response(request))
    expect(result).toMatchObject({ status: 'register', reasons: [], candidate: { conditions: [{ type: 'everyone' }] } })
    expect(buildDetectionDraft(value, response(request).answers).conditions).toEqual([{ type: 'everyone' }])
  })

  test('任意数量noneの低確度は登録を止めない', () => {
    const value = post()
    const request = requestWithAssociations(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, { quantity: choice('none', { none: 0.6, q100: 0.4 }) })
    )
    expect(result.status).toBe('register')
    if (result.status === 'register') expect(result.candidate).not.toHaveProperty('limitedQuantity')
  })

  test('旧store回答は下書き境界で読み、対象娘へは転用しない', () => {
    const draft = buildDetectionDraft(post(), { store: choice('hamamatsu', { hamamatsu: 0.9311, none: 0.0689 }) })
    expect(draft.stores).toEqual(['hamamatsu'])
    expect(draft.characterIds).toEqual([])
  })
})

describe('初期配布上限と数量の意味', () => {
  test.each([
    'アクキー残り27個、特典残90枚',
    '18時くらいでのアクキー配布数は73個です',
    'アクスタ2個をセットでお渡し',
    'お一人様1個まで'
  ])('残数・累計・内訳を総数へ流用しない: %s', (text) => {
    expect(quantityCandidates(post(text))).toEqual([])
  })
  test('明示した配布総数だけを保持する', () => {
    expect(quantityCandidates(post('先着100枚、数量限定200個。お一人様1個まで'))).toEqual([100, 200])
  })
})

const denial = { is_event: { type: 'noul' as const, noul: 0.01 } }
const ignored = { status: 'ignored' as const, confidence: 0.01, reasons: ['not_distribution_event'] }

// 初回の独立監査で使った12対照を、通常CIでも外部ファイルなしで再現する。
describe('独立監査の関係・操作対照', () => {
  test.each([
    '有楽町たんが選んだギフトカードを販売中です。贈り物にどうぞ。',
    '有楽町たんセレクトのギフトカードを販売中です。通常商品のお知らせです。',
    '有楽町たんです。ギフトカードを販売中です。',
    '有楽町たんのお祝いの後はギフトカードのご案内です。通常のギフトカードを販売中。',
    '有楽町たんが選ぶ初音ミクのアクリルスタンドを販売中です。',
    '有楽町たんエリアでメーカーの新型テレビを展示中です。通常製品のご案内です。',
    '当店の開店記念イベントを開催します。家電製品を全品10%OFFで販売します。',
    '法人営業を担当する私の名刺を配布します。担当者へのお問い合わせにご利用ください。',
    '有楽町たんの名刺を眺めていました。通常のギフトカードを販売中です。',
    '有楽町たん名刺を眺めていました、通常のギフトカードを販売中です。',
    '有楽町たんのおすすめのギフトカードを販売します。',
    '有楽町たんデザインのギフトカードを配布しません。',
    '有楽町たん名刺は配布していません。',
    '有楽町たんミュージアムに新型テレビを展示します。',
    '有楽町たんパネルで販売中です。通常のテレビ製品です。',
    '有楽町たんが描いた初音ミクのアクスタを販売します。',
    '有楽町たん名刺を眺めました\n通常のギフトカードを販売中です。',
    '有楽町たん名刺を配布する予定はありません。',
    '有楽町たん名刺の配布はございません。',
    '配布中の有楽町たん名刺を眺めてうっとりしました。',
    '有楽町たん名刺配布が嬉しくて落書きをしました。',
    '有楽町たん名刺を配布しますか？'
  ])('話者・推薦・場所・別節を強い企画根拠にしない: %s', (text) => {
    const value = post(text, { screenName: 'bic_yuurakuchou' })
    expect(groundedDiscoveryProof(value).filter((proof) => proof.strength === 'explicit')).toEqual([])
    expect(describeDetectionOutcome(value, denial, ignored).discovery.status).toBe('not_event')
  })

  test.each([
    '有楽町たんデザインのギフトカードを数量限定で販売します。',
    '有楽町たんアクリルキーホルダーを先着100名に配布します。',
    '有楽町たんとふなとーたんのコラボ名刺を配布します。',
    '有楽町たんの新しいイラストのアクキーを配布します。',
    '缶バッジ 有楽町たんver.を配布します。',
    '有楽町たんのパネル展示は終了しました。',
    '「有楽町たん名刺」を配布します。',
    '有楽町たんアクリルキーホルダー ハロウィンver.を配布します。',
    '有楽町たん名刺\n数量限定で配布します。',
    '有楽町たんが描かれたポストカードを販売します。',
    'ふなとーたんとのコラボ名刺を配布します。',
    '有楽町たんステッカーと名刺セットを配布します。',
    '有楽町たん名刺を配布しております。',
    'あべのたんアクキーをプレゼントするで～',
    'お渡しするのは有楽町たん名刺です。'
  ])('明示されたデザイン・直接物品・共同企画を保持する: %s', (text) => {
    const value = post(text, { screenName: 'bic_yuurakuchou' })
    expect(groundedDiscoveryProof(value).some((proof) => proof.strength === 'explicit')).toBe(true)
    expect(describeDetectionOutcome(value, denial, ignored).discovery.status).toBe('detected')
    expect(describeDetectionOutcome(value, denial, ignored).discovery.confidence).toBe(0.01)
  })

  test('弱い自己言及はモデル否定を覆さず、保留域も確定させない', () => {
    const value = post('私の名刺を配布します。')
    expect(groundedDiscoveryProof(value).every((proof) => proof.strength === 'model-only')).toBe(true)
    expect(describeDetectionOutcome(value, denial, ignored).discovery.status).toBe('not_event')
    expect(describeDetectionOutcome(value, { is_event: { type: 'noul', noul: 0.72 } }, null).discovery.status).toBe(
      'uncertain'
    )
    expect(describeDetectionOutcome(value, { is_event: { type: 'noul', noul: 0.99 } }, null).discovery.status).toBe(
      'detected'
    )
  })

  test('支持spanは元の本文へ戻せ、関係と操作の両方を検証できる', () => {
    const value = post('お知らせです。\n有楽町たんデザインのギフトカードを数量限定で販売します。', {
      screenName: 'bic_yuurakuchou'
    })
    const proof = groundedDiscoveryProof(value)
    expect(proof.length).toBeGreaterThan(0)
    for (const entry of proof) {
      expect(entry.sourceText.slice(entry.start, entry.end)).toBe(entry.quote)
      expect(entry.sourceText).toBe(value.text)
      expect(entry.policy).toBe('character-subject-operation-v1')
      const normalized = entry.quote.normalize('NFKC').replace(/\s+/g, '')
      expect(normalized).toContain(entry.relation)
      expect(normalized).toContain(entry.operation)
      expect(normalized.slice(entry.normalizedSpan.start, entry.normalizedSpan.end)).toBe(entry.normalizedSpan.text)
    }
  })

  test('引用の明示根拠は出典が正規アカウントの時だけ採用する', () => {
    const value = post('こちらをご確認ください。', {
      quoted: { id: '1000000000000000001', screenName: 'bic_yuurakuchou', text: '有楽町たん名刺を配布します。' }
    })
    expect(groundedDiscoveryProof(value).some((proof) => proof.source === 'quoted')).toBe(true)
    expect(
      groundedDiscoveryProof({
        ...value,
        quoted: {
          ...value.quoted,
          id: '1000000000000000001',
          screenName: 'untrusted',
          text: '有楽町たん名刺を配布します。'
        }
      })
    ).toEqual([])
    const focused = {
      ...value,
      extractionContext: {
        kind: 'item' as const,
        item: '有楽町たん名刺',
        evidence: ['有楽町たん名刺を配布します。'],
        originalText: value.text,
        quotedText: '有楽町たん名刺を配布します。',
        quotedScreenName: 'untrusted'
      }
    }
    expect(groundedDiscoveryProof(focused)).toEqual([])
  })

  test('抽出itemの捏造名や別物品の参考原文を根拠に使わない', () => {
    const value = post('通常のギフトカードをご案内します。', {
      screenName: 'bic_yuurakuchou',
      extractionContext: {
        kind: 'item',
        item: '有楽町たんデザインギフトカード',
        evidence: ['通常のギフトカードをご案内します。'],
        originalText: '有楽町たん名刺を配布します。\n通常のギフトカードをご案内します。'
      }
    })
    expect(groundedDiscoveryProof(value)).toEqual([])
    expect(describeDetectionOutcome(value, denial, ignored).discovery.status).toBe('not_event')
    const unsupported = {
      ...value,
      extractionContext: {
        ...value.extractionContext,
        kind: 'item' as const,
        item: '有楽町たん名刺',
        evidence: ['有楽町たん名刺を配布します。'],
        originalText: '通常のギフトカードをご案内します。'
      }
    }
    expect(groundedDiscoveryProof(unsupported)).toEqual([])
  })
})
