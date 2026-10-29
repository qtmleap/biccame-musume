import { describe, expect, test } from 'bun:test'
import { storeCriteria } from './association-questions'
import { detectionStores } from './associations'
import type { ClefRequest } from './clef'
import { ClefRequestSchema } from './clef'
import { baseQuestions, buildState, QUESTION_VERSION, STATUS_CRITERIA } from './decide'
import { buildDetectionDraft, createDetectionRequest, createDetectionRequests, DETECTION_VERSION } from './detection'
import { detectionAuthorLabel } from './detection-requests'
import {
  categoryCriteria,
  choice,
  choiceQuestionOf,
  evaluateWithStore,
  post,
  requestWithAssociations,
  response,
  shintouOverrides,
  shintouPost,
  shintouPostText
} from './detection-test-fixtures'
import { createItemCountRequest } from './extraction'
import type { DetectPost } from './post'

describe('Detection version and category criteria', () => {
  test('質問文の変更に合わせて判定の版を上げる（v18 は2段目の店舗の確認の質問だけを直した版。1段目の質問は v17 と同じ）', () => {
    expect(DETECTION_VERSION).toBe(`${QUESTION_VERSION}-webhook-v18-store-confirm-default`)
  })
  test('コースターはotherに入れ、アクキー・アクスタの定義には含めない', () => {
    // アクキー・アクスタに言及する本文では、両方の選択肢が出る。
    const criteria = categoryCriteria(
      requestWithAssociations(post('名刺・アクキー・アクスタではなくアクリルコースターを配布'))
    )
    expect(criteria.other).toContain('アクリルコースター')
    expect(criteria.other).toContain('アクリルプレート')
    for (const key of ['ackey', 'acsta']) {
      const text = criteria[key]
      if (text === undefined) throw new Error('Missing category criteria')
      // 含める範囲の説明（最初の一文）にコースターは出ず、除外の文脈でのみ登場する。
      expect(text.split('。')[0]).not.toContain('コースター')
      expect(text).toMatch(/コースター.*含まない/)
    }
    expect(criteria.limited_card).toBe('期間限定・数量限定・記念の名刺')
    expect(criteria.regular_card).toBe('通年配布の通常名刺')
    expect(criteria.none).toBe('企画の対象となる物品が記載されていない、または物品種別を特定できない')
  })
})

describe('Webhook is_event question', () => {
  const instructionsOf = (questions: ClefRequest['questions'], key: string) => {
    const question = questions[key]
    if (question?.type !== 'noul') throw new Error(`Missing noul question ${key}`)
    return question.instructions
  }
  test('Webhook判定の is_event は「ビッカメ娘のイベントか」を尋ね、配布に限定しない', () => {
    const request = requestWithAssociations(post())
    const instructions = instructionsOf(request.questions, 'is_event')
    expect(request.questions.is_event?.type).toBe('noul')
    expect(instructions).toContain('ビッカメ娘')
    expect(instructions).toContain('擬人化記念イベント')
    expect(instructions).toContain('コラボ')
    expect(instructions).toContain('フェア')
    expect(instructions).toContain('日時を決めて行う催し')
    // 配布物の種類は category が担当するため、is_event は「配布する」ことを条件にしない。
    expect(instructions).not.toContain('配布する')
    expect(instructions).not.toContain('ノベルティを配布')
    // 除外の説明（商品紹介・宣伝・無関係なキャンペーン）は残す。
    expect(instructions).toContain('家電の宣伝')
    expect(instructions).toContain('メーカーのキャンペーン')
    expect(ClefRequestSchema.safeParse(createDetectionRequest(post())).success).toBe(true)
  })
  test('CLIとWebhookの両方がギフトカードに対応し、質問の版で旧キャッシュと分かれる', () => {
    // 共用の配布物判定を更新しても、Webhook 固有のイベント・状態判定は維持する。
    const base = baseQuestions()
    expect(base.is_event).toEqual({
      type: 'noul',
      instructions:
        'この投稿は、ビッカメ娘（ビックカメラの店舗擬人化キャラクター）の名刺・アクリルキーホルダー・アクリルスタンド・缶バッジ・ギフトカードなどのノベルティを配布するイベントについての投稿ですか？ ビッカメ娘の記念・限定デザインの販売・頒布や、入金・チャージ条件付き受取も含みます。無料配布だけに限定しません。汎用ギフトカードの通常販売・購入・残高チャージ方法・支払い方法の案内だけは含みません。ビッカメ娘と関係ない商品の購入特典やメーカーのキャンペーンは含みません。'
    })
    expect(instructionsOf(base, 'is_event')).toContain('配布するイベント')
    expect(QUESTION_VERSION).toBe('v5')
    const webhook = requestWithAssociations(post())
    expect(instructionsOf(webhook.questions, 'is_event')).not.toBe(instructionsOf(base, 'is_event'))
    // 状態の質問文は Webhook だけが上書きする。CLI 共用の baseQuestions は従来のまま。
    expect(base.status).toEqual({
      type: 'choice',
      instructions: 'この投稿が伝えている配布イベントの状態はどれですか？',
      criteria: { ...STATUS_CRITERIA }
    })
    expect(webhook.questions.status).not.toEqual(base.status)
  })
})

describe('Purchase amount candidates', () => {
  test('「以上お買い物で」の購入額も質問の選択肢にする', () => {
    const request = requestWithAssociations(post('※5,000円以上お買い物でお一人様一枚まで'))
    const question = request.questions.purchase_amount
    if (question?.type !== 'choice') throw new Error('Missing purchase_amount question')
    expect(Object.keys(question.criteria)).toEqual(['p5000', 'none'])
    expect(question.criteria.p5000).toBe('5000円')
  })
  test.each([
    ['1,000円以上のお買い物で', 'p1000'],
    ['3000円お買物でプレゼント', 'p3000'],
    ['2000円以上買い物された方に', 'p2000'],
    ['1500円(税込)以上買物で', 'p1500'],
    ['500円以上ご購入の方', 'p500']
  ])('購入表現「%s」から%sを拾う', (text, key) => {
    const question = requestWithAssociations(post(text)).questions.purchase_amount
    if (question?.type !== 'choice') throw new Error('Missing purchase_amount question')
    expect(Object.hasOwn(question.criteria, key)).toBe(true)
  })
  test('購入表現を伴わない金額は選択肢にしない', () => {
    const { questions } = requestWithAssociations(post('あべのたん限定名刺 1,000円のアクスタを販売'))
    expect(Object.hasOwn(questions, 'purchase_amount')).toBe(false)
  })
})

describe('Webhook question wording', () => {
  const shintouText =
    '🎃新東たん擬人化６周年イベント🎃\n日付：10月19日（月）～なくなり次第終了\n枚数：限定60枚\n※5,000円以上お買い物でお一人様一枚まで\nアクリルコースタープレゼント🎁'
  const request = requestWithAssociations(
    post(shintouText, { screenName: 'Bic_shintoueki', createdAt: '2026-10-16T01:00:00.000Z' })
  )

  test('is_event は「投稿者」行の店舗を投稿者本人の店舗とみなし、除外条項と店舗以外の扱いを残す', () => {
    const question = request.questions.is_event
    if (question?.type !== 'noul') throw new Error('Missing is_event question')
    expect(question.instructions).toContain('「投稿者」の行')
    expect(question.instructions).toContain('本人のアカウント')
    expect(question.instructions).toContain('「ビッカメ娘」の言及が無くても')
    expect(question.instructions).toContain('「店舗以外」のときはこの扱いをしません')
    // 既存の除外条項は残す。
    expect(question.instructions).toContain('通常の商品紹介・家電の宣伝・雑談')
    expect(question.instructions).toContain('ビッカメ娘と関係ない商品の購入特典・メーカーのキャンペーン')
  })

  test('end_date は start_date と別に組み立て、「なくなり次第終了」を終了日の記載なしとして扱わせる', () => {
    const end = choiceQuestionOf(request, 'end_date')
    expect(end.instructions).toContain('なくなり次第終了')
    expect(end.instructions).toContain('無くなり次第終了')
    expect(end.instructions).toContain('終了日の記載なし')
    expect(end.instructions).toContain('開始日を終了日として選ばないでください')
    expect(end.criteria.none).toBe('終了日の記載なし（『なくなり次第終了』など日付で終わりが決まらない場合を含む）')
    // 日付の選択肢は start_date と同じ。none の説明だけが違う。
    const start = choiceQuestionOf(request, 'start_date')
    const { none: endNone, ...endDates } = end.criteria
    const { none: startNone, ...startDates } = start.criteria
    expect(endDates).toEqual(startDates)
    expect(Object.keys(endDates)).toEqual(['d20261019'])
    expect(endNone).not.toBe(startNone)
  })

  test('start_date の質問文と none の説明は従来のまま', () => {
    const start = choiceQuestionOf(request, 'start_date')
    expect(start.instructions).toBe('配布の開始日はどれですか？')
    expect(start.criteria.none).toBe('本文に書かれていない')
    expect(ClefRequestSchema.safeParse(createDetectionRequest(post())).success).toBe(true)
  })
})

describe('Category criteria are narrowed to kinds with evidence in the text', () => {
  // 新東たんの投稿は本文に名刺・アクキー・アクスタのどの語も無く「アクリルコースター」だけが書かれている。
  const keysOf = (text: string, overrides: Partial<DetectPost> = {}) =>
    Object.keys(categoryCriteria(requestWithAssociations(post(text, overrides))))

  test('新東たん近似の投稿は other と none だけが残る', () => {
    expect(keysOf(shintouPostText, shintouOverrides)).toEqual(['other', 'none'])
  })
  test('「名刺」があれば限定名刺と通常名刺が残る', () => {
    expect(keysOf('新東たん限定名刺を配布')).toEqual(['limited_card', 'regular_card', 'other', 'none'])
  })
  test.each([
    ['アクキー', ['ackey']],
    ['アクリルキーホルダー', ['ackey']],
    ['キーホルダー', ['ackey']],
    ['アクスタ', ['acsta']],
    ['アクリルスタンド', ['acsta']],
    ['スタンド', ['acsta']]
  ])('「%s」があれば対応する種類が残る', (word, kept) => {
    expect(keysOf(`${word}をプレゼント`)).toEqual([...kept, 'other', 'none'])
  })
  test('複数の語があれば複数残り、キーの並びは元の定義のまま', () => {
    expect(keysOf('アクスタとアクキーと名刺を配布')).toEqual([
      'limited_card',
      'regular_card',
      'ackey',
      'acsta',
      'other',
      'none'
    ])
  })
  test('引用元の本文にある語も拾う', () => {
    expect(keysOf('こちらを配布', { quoted: { id: '1', screenName: 'someone', text: '限定アクスタ' } })).toEqual([
      'acsta',
      'other',
      'none'
    ])
    // 引用元だけでなく本文の語も従来どおり拾う。
    expect(keysOf('名刺を配布', { quoted: { id: '1', screenName: 'someone', text: '限定アクスタ' } })).toEqual([
      'limited_card',
      'regular_card',
      'acsta',
      'other',
      'none'
    ])
  })
  test('全角・半角の表記ゆれは正規化してから探す（ｱｸｽﾀ）', () => {
    expect(keysOf('ｱｸｽﾀを配布')).toEqual(['acsta', 'other', 'none'])
  })
  test('各選択肢の説明文は絞り込みで変えない', () => {
    const criteria = categoryCriteria(requestWithAssociations(post('名刺・アクキー・アクスタを配布')))
    expect(criteria.limited_card).toBe('期間限定・数量限定・記念の名刺')
    expect(criteria.regular_card).toBe('通年配布の通常名刺')
    expect(criteria.none).toBe('企画の対象となる物品が記載されていない、または物品種別を特定できない')
  })
  test('category の質問文と他の質問は変えない', () => {
    const request = requestWithAssociations(shintouPost)
    const question = request.questions.category
    if (question?.type !== 'choice') throw new Error('Missing category question')
    expect(question.instructions).toContain('本文で企画の対象として明示されている物品')
    expect(choiceQuestionOf(request, 'status').criteria).toEqual({ ...STATUS_CRITERIA })
    expect(ClefRequestSchema.safeParse(createDetectionRequest(post())).success).toBe(true)
  })

  test('絞り込んだ category に other が高確率で返れば、category_unconfirmed なしで other の登録候補になる', () => {
    // 条件は購入＋先着（保留規則を通る形）にするため、本文に「先着順」を足す。
    const value = post(`${shintouPostText}\n先着順`, shintouOverrides)
    const request = requestWithAssociations(value)
    const result = evaluateWithStore(
      value,
      request,
      response(request, {
        is_event: { type: 'noul', noul: 0.95 },
        category: choice('other', { other: 0.95, none: 0.03 }),
        start_date: choice('d20261019', { d20261019: 0.99 }),
        end_date: choice('none', { none: 0.7348, d20261019: 0.2652 }),
        condition: choice('purchase_first_come', { purchase_first_come: 0.99 }),
        purchase_amount: choice('p5000', { p5000: 0.99 }),
        quantity: choice('q60', { q60: 0.99 })
      })
    )
    expect(result.reasons).not.toContain('category_unconfirmed')
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.category).toBe('other')
    expect(result.candidate.title).toBe('ビックカメラ新宿東口駅前店 ノベルティ配布')
  })
  test('リクエストに無い種類（本文に根拠語が無い acsta）を答えた応答は、不正な選択として投げる', () => {
    const value = post(shintouPostText, shintouOverrides)
    const request = requestWithAssociations(value)
    expect(() =>
      evaluateWithStore(value, request, response(request, { category: choice('acsta', { acsta: 0.95, other: 0.03 }) }))
    ).toThrow('Invalid detection choice')
  })
  test('旧版が保存した全選択肢の category 回答も、下書きと表示でそのまま扱える', () => {
    const value = post(shintouPostText, shintouOverrides)
    const answers = { category: choice('acsta', { acsta: 0.62, ackey: 0.2, other: 0.1 }) }
    expect(buildDetectionDraft(value, answers)).toMatchObject({
      category: 'acsta',
      stores: [],
      characterIds: []
    })
  })
  test('「限定カード」だけの書き方は根拠語が無く、限定名刺は選択肢に出ない（other に落ちる）', () => {
    expect(keysOf('限定カードを配布')).toEqual(['other', 'none'])
  })
})

describe('Webhook status question compares the post date with the start date', () => {
  const request = requestWithAssociations(post(shintouPostText, shintouOverrides))
  const status = choiceQuestionOf(request, 'status')

  test('質問文は「投稿日」の行と配布の「開始日」を比べる手順と、告知・開始・継続・終了の対応を示す', () => {
    for (const word of ['投稿日', '開始日', '告知', '開始', '継続', '終了'])
      expect(status.instructions, word).toContain(word)
    // 比べる相手は今日の日付ではなく投稿日。
    expect(status.instructions).toContain('今日の日付とは比べません')
    // 開始日と投稿日の前後ごとに、選ぶ状態を明記する。
    expect(status.instructions).toContain('開始日が投稿日より後: 配布開始前の告知（announce）')
    expect(status.instructions).toContain('開始日が投稿日と同じ日')
    expect(status.instructions).toContain('開始（start）')
    expect(status.instructions).toContain('開始日が投稿日より前: 告知ではありません')
    expect(status.instructions).toContain('継続（ongoing）')
    expect(status.instructions).toContain('終了（end）')
  })
  test('選択肢は従来どおり（announce / start / ongoing / end / none）で、説明も STATUS_CRITERIA のまま', () => {
    expect(Object.keys(status.criteria)).toEqual(['announce', 'start', 'ongoing', 'end', 'none'])
    expect(status.criteria).toEqual({ ...STATUS_CRITERIA })
  })
  test('質問の位置と、状態の質問文以外の共通質問は変えない', () => {
    expect(Object.keys(request.questions).slice(0, 3)).toEqual(['is_event', 'status', 'category'])
    expect(ClefRequestSchema.safeParse(createDetectionRequest(post())).success).toBe(true)
  })
  test('どの投稿でも同じ質問文になり、投稿日は buildState が渡す「投稿日」の行から読ませる', () => {
    const other = choiceQuestionOf(requestWithAssociations(post()), 'status')
    expect(other.instructions).toBe(status.instructions)
    expect(request.state).toContain('投稿日: 2026-10-16（金）')
  })
  test('CLI 共用の baseQuestions の状態の質問文は従来のまま', () => {
    const base = baseQuestions().status
    if (base?.type !== 'choice') throw new Error('Missing base status question')
    expect(base.instructions).toBe('この投稿が伝えている配布イベントの状態はどれですか？')
    expect(base.instructions).not.toContain('投稿日')
  })
})

describe('判定の入力文（state）の「投稿者」の行', () => {
  const authorLine = (state: string) => state.split('\n').find((line) => line.startsWith('投稿者:'))
  const funabashi = post('ふなたん限定名刺 2026年11月3日から先着100枚を配布します', { screenName: 'bic_funabashi' })
  const stateOf = (value: DetectPost) => createDetectionRequests(value)[0].state

  test('店舗アカウントの投稿者は「@アカウント / 短い店舗名」で、「ビックカメラ」も括弧の店舗IDも出ない', () => {
    const line = authorLine(stateOf(funabashi))
    expect(line).toBe('投稿者: @bic_funabashi / 船橋駅FACE店')
    expect(line).not.toContain('ビックカメラ')
    expect(line).not.toContain('（funabashi）')
  })
  test('店舗アカウントでない投稿者は従来どおり「店舗以外」', () => {
    expect(authorLine(stateOf(post('名刺を配布します', { screenName: 'someone' })))).toBe('投稿者: @someone / 店舗以外')
  })
  test('投稿者の行以外（投稿日・画像・本文）は従来の state と同じ', () => {
    expect(stateOf(funabashi)).toBe(
      [
        '投稿日: 2026-10-11（日）',
        '投稿者: @bic_funabashi / 船橋駅FACE店',
        '画像: 0 枚（画像の内容は含まれない）',
        '本文:',
        'ふなたん限定名刺 2026年11月3日から先着100枚を配布します'
      ].join('\n')
    )
  })
  test('44 店舗すべてで、投稿者の行の店舗名は店舗の選択肢の説明（storeCriteria）と同じ短い名前', () => {
    const criteria = storeCriteria()
    expect(detectionStores).toHaveLength(44)
    for (const store of detectionStores) {
      const line = authorLine(stateOf(post('名刺を配布します', { screenName: store.screenName })))
      expect(line, store.id).toBe(`投稿者: @${store.screenName} / ${criteria[store.id]}`)
      expect(line, store.id).not.toContain('ビックカメラ')
      expect(line, store.id).not.toContain(`（${store.id}）`)
    }
  })
  test('抽出段階の開催店舗候補の行は従来の書式のまま', () => {
    const state = createDetectionRequests(funabashi, 'clef', 'akiba')[0].state
    expect(state.split('\n').at(-1)).toBe('抽出段階の開催店舗候補（未確定）: akiba')
  })
  // 実際のカタログには同じアカウントを持つ店舗が無いので、複数アカウントは buildState に直接アカウントを渡して確かめる。
  test('同じアカウントの店舗が複数あれば「・」で連結する（判定用の名前の関数を buildState へ渡す）', () => {
    const accounts = [
      { storeId: 'funabashi', name: 'ビックカメラ船橋駅FACE店', screenName: 'bic_funabashi' },
      { storeId: 'funato', name: 'ビックカメラ船橋東武店', screenName: 'Bic_Funabashi' }
    ]
    const line = authorLine(buildState(funabashi, accounts, detectionAuthorLabel))
    expect(line).toBe('投稿者: @bic_funabashi / 船橋駅FACE店・船橋東武店')
  })
})

describe('抽出と配布物の数のチェックの入力は、判定の変更の影響を受けない', () => {
  const authorLine = (state: string) => state.split('\n').find((line) => line.startsWith('投稿者:'))
  const funabashi = post('ふなたん限定名刺 2026年11月3日から先着100枚を配布します', { screenName: 'bic_funabashi' })

  test('配布物の数のチェック（createItemCountRequest）は従来の「店舗名（店舗ID）」の形のまま', () => {
    expect(authorLine(createItemCountRequest(funabashi).state)).toBe(
      '投稿者: @bic_funabashi / ビックカメラ船橋駅FACE店（funabashi）'
    )
    expect(authorLine(createItemCountRequest(post('x', { screenName: 'someone' })).state)).toBe(
      '投稿者: @someone / 店舗以外'
    )
  })
  test('同じ投稿でも、判定の state と配布物の数のチェックの state は「投稿者」の行だけが違う', () => {
    const detection = createDetectionRequests(funabashi)[0].state.split('\n')
    const count = createItemCountRequest(funabashi).state.split('\n')
    expect(detection).toHaveLength(count.length)
    expect(detection.flatMap((line, index) => (line === count[index] ? [] : [index]))).toEqual([1])
  })
})
