import { describe, expect, test } from 'bun:test'
import { buildDetectionCatalog } from '../../../../scripts/generate-bot-stores'
import { STORE_DISPLAY_NAMES } from '../domain/badges/store-display-names'
import { isEventForCharacter, resolveEventCharacters } from '../domain/event-character'
import { EventCharacterSchema, EventRequestSchema } from '../schemas/event.dto'
import { StoreKeySchema } from '../schemas/store.dto'
import { characterCriteria, storeCriteria } from './association-questions'
import { detectionCharacters, detectionStores } from './associations'
import { ClefRequestSchema } from './clef'
import { createDetectionRequests, DETECTION_VERSION, DetectionCandidateSchema } from './detection'
import { choiceQuestionOf } from './detection-test-fixtures'
import { EXTRACTION_VERSION, validateEventExtraction } from './extraction'
import type { DetectPost } from './post'
import { webhookPromptDefinition } from './prompt-definitions'

const post: DetectPost = {
  id: '2112435987582513432',
  screenName: 'bic_funabashi',
  createdAt: '2026-10-11T01:00:00.000Z',
  kind: 'original',
  text: 'ふなとーたん擬人化記念アクリルキーホルダーを2026年11月3日から全員に配布します',
  url: 'https://x.com/bic_funabashi/status/2112435987582513432',
  media: []
}
const other: DetectPost = { ...post, screenName: 'bic_abeno', text: 'あべのたん限定名刺を11/3から配布します' }
const SPECIAL_KEYS = ['none', 'multiple', 'other', 'secret', 'store_character']

describe('開催店舗と配布物の対象ビッカメ娘', () => {
  test('通知対象外と閉店キャラも判定辞書へ含み、物理店舗とは分離する', () => {
    expect(detectionCharacters).toHaveLength(51)
    expect(detectionStores).toHaveLength(44)
    expect(detectionCharacters.find((entry) => entry.id === 'funato')?.name).toBe('ふなとーたん')
    expect(detectionStores.some((entry) => entry.id === 'funato')).toBe(false)
    const catalog = buildDetectionCatalog([{ id: 'closed', character: { name: '閉店たん', is_biccame_musume: true } }])
    expect(catalog).toEqual({ stores: [], characters: [{ id: 'closed', name: '閉店たん' }] })
  })
})

describe('現行版（v19）の1段目の店舗・娘の質問セット（v17 と同一。店舗の質問は v15 から変わらない。娘は store_character を足した）', () => {
  const [request] = createDetectionRequests(post)

  test('店舗は44店舗 + multiple + none の46択、娘は51人 + store_character・other・secret・multiple・none の56択', () => {
    const store = choiceQuestionOf(request, 'store')
    const character = choiceQuestionOf(request, 'character')
    expect(Object.keys(store.criteria)).toHaveLength(46)
    expect(Object.keys(character.criteria)).toHaveLength(56)
    expect(Object.keys(store.criteria)).toEqual([...detectionStores.map((entry) => entry.id), 'multiple', 'none'])
    expect(Object.keys(character.criteria)).toEqual([
      ...detectionCharacters.map((entry) => entry.id),
      'store_character',
      'other',
      'secret',
      'multiple',
      'none'
    ])
  })
  test('選択肢の説明は名前だけで、娘の名前や投稿アカウントを店舗の説明に入れない', () => {
    const store = choiceQuestionOf(request, 'store')
    const character = choiceQuestionOf(request, 'character')
    expect(store.criteria.funabashi).toBe('船橋駅FACE店')
    expect(store.criteria.abeno).toBe('あべのキューズモール店')
    expect(store.criteria.akiba).toBe('AKIBA店')
    expect(character.criteria.funato).toBe('ふなとーたん')
    expect(character.criteria.funabashi).toBe('ふなたん')
    expect(character.criteria.abeno).toBe('あべのたん')
    for (const entry of detectionStores) {
      expect(store.criteria[entry.id]).not.toContain('たん')
      if (entry.screenName !== undefined) expect(store.criteria[entry.id]).not.toContain(entry.screenName)
    }
    expect(store.criteria.multiple).toContain('複数の店舗')
    expect(character.criteria.other).toContain('特定の娘に紐付かない')
    expect(character.criteria.secret).toContain('伏せられている')
    expect(character.criteria.multiple).toContain('共同デザイン')
    expect(character.criteria.none).toContain('ビッカメ娘の企画ではない')
  })
  test('特別値のキーはカタログの id と衝突せず、カタログの id はすべて保存先のスキーマに合う', () => {
    const ids = new Set([...detectionStores, ...detectionCharacters].map((entry) => entry.id))
    for (const key of SPECIAL_KEYS) expect(ids.has(key), key).toBe(false)
    for (const entry of detectionStores) expect(StoreKeySchema.safeParse(entry.id).success, entry.id).toBe(true)
    for (const entry of detectionCharacters)
      expect(EventCharacterSchema.safeParse(entry.id).success, entry.id).toBe(true)
    // 特別値のうち、娘として保存できるのは other と secret だけ。none・multiple・store_character は登録候補に入れない
    // （store_character は採用した店舗の娘に置き換えて保存する。detection-character.ts）。
    expect(EventCharacterSchema.safeParse('other').success).toBe(true)
    expect(EventCharacterSchema.safeParse('secret').success).toBe(true)
    expect(EventCharacterSchema.safeParse('none').success).toBe(false)
    expect(EventCharacterSchema.safeParse('multiple').success).toBe(false)
    expect(EventCharacterSchema.safeParse('store_character').success).toBe(false)
  })
  test('送信は1バッチで、質問は64問以内。店舗・娘ごとの noul 質問は作らない', () => {
    const batches = createDetectionRequests(post)
    expect(batches).toHaveLength(1)
    expect(ClefRequestSchema.safeParse(batches[0]).success).toBe(true)
    expect(Object.keys(batches[0].questions).length).toBeLessThanOrEqual(64)
    expect(Object.keys(batches[0].questions).filter((key) => /^(venue|character)\./.test(key))).toEqual([])
  })
  test('店舗・娘の質問と選択肢は版で固定され、投稿ごとに変わる情報は state にだけ入る', () => {
    const [first] = createDetectionRequests(post, 'clef', 'funabashi')
    const [second] = createDetectionRequests(other, 'clef-flash', 'akiba')
    for (const key of ['store', 'character']) expect(first.questions[key]).toEqual(second.questions[key])
    expect(first.state).not.toBe(second.state)
    expect(first.state).toContain('抽出段階の開催店舗候補（未確定）: funabashi')
    expect(second.state).toContain('抽出段階の開催店舗候補（未確定）: akiba')
    const fixed = JSON.stringify([first.questions.store, first.questions.character])
    for (const value of ['@bic_funabashi', '@bic_abeno', '2112435987582513432', '2026-10-11'])
      expect(fixed).not.toContain(value)
    expect(createDetectionRequests(post)[0].state).not.toContain('抽出段階の開催店舗候補')
  })
  test('店舗の質問文は版固定の方針（1店舗だけ・投稿者の店舗は明らかなときだけ・娘の所属店舗と別・抽出候補）を持つ', () => {
    const { instructions } = choiceQuestionOf(request, 'store')
    expect(instructions).toContain('開催店舗は1つだけ')
    expect(instructions).toContain('文脈上そこで配布すると明らか')
    expect(instructions).toContain('別店舗での配布案内なら投稿者の店舗を採用しない')
    expect(instructions).toContain('対象キャラクターの所属店舗と開催店舗は別')
    expect(instructions).toContain('抽出段階の開催店舗候補（未確定）')
    expect(instructions).toContain('multiple')
    expect(instructions).toContain('none')
  })
  test('娘の質問文は共同デザインを multiple、企画でないものを none とし、本文にない娘の推測を禁じる', () => {
    const { instructions } = choiceQuestionOf(request, 'character')
    expect(instructions).toContain('本文に名前のない娘を推測しない')
    expect(instructions).toContain('multiple')
    expect(instructions).toContain('other')
    expect(instructions).toContain('secret')
    expect(instructions).toContain('none')
  })
  test('選択肢の生成関数は呼び出しごとに同じ内容を返す', () => {
    expect(storeCriteria()).toEqual(storeCriteria())
    expect(characterCriteria()).toEqual(characterCriteria())
  })
})

const V13 = 'v5-webhook-v13-choice-associations'
const V14 = 'v5-webhook-v14-concise-choices'
const V15 = 'v5-webhook-v15-concise-author'
const V16 = 'v5-webhook-v16-confirm-selection'
const V19 = 'v5-webhook-v19-gift-card-category'
const SPECIAL_STORE_KEYS = ['multiple', 'none']
const SPECIAL_CHARACTER_KEYS = ['other', 'secret', 'multiple', 'none']
const V17_CHARACTER_KEYS = ['store_character', ...SPECIAL_CHARACTER_KEYS]
const questionOfVersion = (version: string, key: 'store' | 'character') => {
  const definition = webhookPromptDefinition(version)
  const question = definition?.questions.find((entry) => entry.key === key)
  if (question === undefined) throw new Error(`Missing ${key} question in ${version}`)
  return question
}

describe('v14 から続く選択肢の説明: 名前だけ（括弧・id・「ビックカメラ」なし）', () => {
  const store = storeCriteria()
  const character = characterCriteria()

  test('現行版は v19 で、店舗 44 件の説明はすべてアプリの短い店舗名（STORE_DISPLAY_NAMES）', () => {
    expect(DETECTION_VERSION).toBe(V19)
    expect(detectionStores).toHaveLength(44)
    for (const entry of detectionStores) {
      const key = StoreKeySchema.safeParse(entry.id)
      if (!key.success) throw new Error(`Unknown store key: ${entry.id}`)
      expect(store[entry.id], entry.id).toBe(STORE_DISPLAY_NAMES[key.data])
    }
  })
  test('娘 51 人の説明は、カタログの名前そのもの', () => {
    expect(detectionCharacters).toHaveLength(51)
    for (const entry of detectionCharacters) expect(character[entry.id], entry.id).toBe(entry.name)
  })
  test('説明に「ビックカメラ」・括弧・id を含めない（id の大文字小文字は区別して検査する）', () => {
    for (const [criteria, entries] of [
      [store, detectionStores],
      [character, detectionCharacters]
    ] as const) {
      for (const entry of entries) {
        const text = criteria[entry.id]
        expect(text, entry.id).not.toContain('ビックカメラ')
        expect(text, entry.id).not.toContain('（')
        expect(text, entry.id).not.toContain('(')
        expect(text, entry.id).not.toContain(entry.id)
      }
    }
  })
  test('説明どうしは重複しない（店舗の説明、娘の説明のそれぞれ）', () => {
    expect(new Set(Object.values(store)).size).toBe(Object.keys(store).length)
    expect(new Set(Object.values(character)).size).toBe(Object.keys(character).length)
  })
  test('選択肢の数とキー: 店舗は v13 から変わらず 46、娘は v13 の 55 に store_character を足した 56', () => {
    expect(Object.keys(store)).toEqual([...detectionStores.map((entry) => entry.id), ...SPECIAL_STORE_KEYS])
    expect(Object.keys(character)).toEqual([...detectionCharacters.map((entry) => entry.id), ...V17_CHARACTER_KEYS])
    expect(Object.keys(store)).toHaveLength(46)
    expect(Object.keys(character)).toHaveLength(56)
    const v13Character = questionOfVersion(V13, 'character').criteria
    expect(Object.keys(character).filter((key) => key !== 'store_character')).toEqual([
      ...detectionCharacters.map((entry) => entry.id),
      ...SPECIAL_CHARACTER_KEYS
    ])
    expect(Object.keys(v13Character)).toHaveLength(55)
  })
  test('特別な選択肢（multiple・none・other・secret）の説明は v13 のまま変えない', () => {
    const v13Store = questionOfVersion(V13, 'store').criteria
    const v13Character = questionOfVersion(V13, 'character').criteria
    for (const key of SPECIAL_STORE_KEYS) expect(store[key], key).toBe(v13Store[key])
    for (const key of SPECIAL_CHARACTER_KEYS) expect(character[key], key).toBe(v13Character[key])
  })
})

describe('v13 の定義は固定のまま残り、v14 は説明だけが違う', () => {
  test('v13 の store / character の説明は旧形式の「名前（id）」のまま', () => {
    const store = questionOfVersion(V13, 'store').criteria
    const character = questionOfVersion(V13, 'character').criteria
    expect(store.abeno).toBe('ビックカメラあべのキューズモール店（abeno）')
    expect(store.funabashi).toBe('ビックカメラ船橋駅FACE店（funabashi）')
    expect(character.funato).toBe('ふなとーたん（funato）')
    for (const entry of detectionStores) expect(store[entry.id], entry.id).toBe(`${entry.name}（${entry.id}）`)
    for (const entry of detectionCharacters) expect(character[entry.id], entry.id).toBe(`${entry.name}（${entry.id}）`)
  })
  test('v14 の定義は新形式で、店舗は現行コードの質問と、娘は v16 の保存済み定義（v17 より前の最後の版）と一致する', () => {
    const [request] = createDetectionRequests(post)
    const actual = choiceQuestionOf(request, 'store')
    expect(questionOfVersion(V14, 'store').criteria).toEqual(actual.criteria)
    expect(questionOfVersion(V14, 'store').instructions).toBe(actual.instructions)
    expect(questionOfVersion(V14, 'character').criteria).toEqual(questionOfVersion(V16, 'character').criteria)
    expect(questionOfVersion(V14, 'character').instructions).toBe(questionOfVersion(V16, 'character').instructions)
    expect(questionOfVersion(V14, 'store').criteria.abeno).toBe('あべのキューズモール店')
    expect(questionOfVersion(V14, 'character').criteria.abeno).toBe('あべのたん')
  })
  test('v13 と v14 の質問文（instructions）は同じで、違うのは説明だけ', () => {
    for (const key of ['store', 'character'] as const) {
      const v13 = questionOfVersion(V13, key)
      const v14 = questionOfVersion(V14, key)
      expect(v14.instructions).toBe(v13.instructions)
      expect(v14.type).toBe(v13.type)
      expect(Object.keys(v14.criteria)).toEqual(Object.keys(v13.criteria))
      expect(v14.criteria).not.toEqual(v13.criteria)
    }
  })
  test('v13 と v14 は別の版で、質問の並びと state のひな形は同じ', () => {
    const v13 = webhookPromptDefinition(V13)
    const v14 = webhookPromptDefinition(V14)
    if (v13 === undefined || v14 === undefined) throw new Error('Missing prompt definition')
    expect(v14.questionVersion).not.toBe(v13.questionVersion)
    expect(v14.questions.map((entry) => entry.key)).toEqual(v13.questions.map((entry) => entry.key))
    expect(v14.stateTemplate).toBe(v13.stateTemplate)
    expect(v14.dynamicCriteria).toBe(v13.dynamicCriteria)
  })
})

describe('v14 の定義は固定のまま残り、v15 は state の「投稿者」の行だけが違う', () => {
  const definitionOf = (version: string) => {
    const definition = webhookPromptDefinition(version)
    if (definition === undefined) throw new Error(`Missing prompt definition: ${version}`)
    return definition
  }
  test('v14 の state のひな形は従来の「その版の店舗辞書で解決した投稿者」のまま（保存済みの定義は変えない）', () => {
    const v14 = definitionOf(V14)
    expect(v14.stateTemplate.split('\n')[1]).toBe('投稿者: @{{screenName}} / {{その版の店舗辞書で解決した投稿者}}')
    expect(v14.stateTemplate).toBe(definitionOf(V13).stateTemplate)
  })
  test('v15 は state の「投稿者」の行のひな形だけが違い、質問・選択肢・動的項目の説明は v14 と同じ', () => {
    const v14 = definitionOf(V14)
    const v15 = definitionOf(V15)
    expect(v15.questionVersion).not.toBe(v14.questionVersion)
    expect(v15.origin).toBe(v14.origin)
    expect(v15.questions).toEqual(v14.questions)
    expect(v15.dynamicCriteria).toBe(v14.dynamicCriteria)
    const lines14 = v14.stateTemplate.split('\n')
    const lines15 = v15.stateTemplate.split('\n')
    expect(lines15).toHaveLength(lines14.length)
    const changed = lines15.flatMap((line, index) => (line === lines14[index] ? [] : [index]))
    expect(changed).toEqual([1])
    expect(lines15[1]).toStartWith('投稿者: @{{screenName}} / {{投稿者の店舗の短い名前')
    expect(lines15[1]).not.toContain('その版の店舗辞書')
    expect(lines15[1]).not.toContain('ビックカメラ')
  })
  test('v15 の定義は、店舗は現行コードの質問と、娘は v16 の保存済み定義と一致する（娘の質問は v17 で変わった）', () => {
    const [request] = createDetectionRequests(post)
    const actual = choiceQuestionOf(request, 'store')
    expect(questionOfVersion(V15, 'store').criteria).toEqual(actual.criteria)
    expect(questionOfVersion(V15, 'store').instructions).toBe(actual.instructions)
    expect(questionOfVersion(V15, 'character').criteria).toEqual(questionOfVersion(V16, 'character').criteria)
    expect(questionOfVersion(V15, 'character').instructions).toBe(questionOfVersion(V16, 'character').instructions)
  })
  test('配布物の抽出の定義は従来の「店舗名（店舗ID）」のひな形のまま（抽出の入力は v15 で変えない）', () => {
    const extraction = definitionOf(EXTRACTION_VERSION)
    expect(extraction.stateTemplate.split('\n')[1]).toBe(
      '投稿者: @{{screenName}} / {{その版の店舗辞書で解決した投稿者}}'
    )
  })
})

describe('抽出と保存スキーマ', () => {
  test('抽出も開催店舗とキャラを別配列として保持する', () => {
    const extraction = validateEventExtraction(post, {
      events: [
        { item: '記念アクキー', stores: ['funabashi', 'abeno'], characterIds: ['funato'], evidence: [post.text] }
      ]
    })
    expect(extraction.events[0].characterIds).toEqual(['funato'])
    expect(extraction.events[0].stores).toEqual(['funabashi', 'abeno'])
    expect(() =>
      validateEventExtraction(post, {
        events: [{ item: '記念アクキー', stores: ['funato'], characterIds: ['funato'], evidence: [post.text] }]
      })
    ).toThrow('unsupported store')
  })
  test('新規API入力は対象配列の省略を拒否し、新規抽出も省略を拒否する', () => {
    expect(EventRequestSchema.shape.characterIds.safeParse(undefined).success).toBe(false)
    expect(() =>
      validateEventExtraction(post, { events: [{ item: 'アクキー', stores: ['funabashi'], evidence: [post.text] }] })
    ).toThrow('Invalid event extraction')
  })
  test('旧候補の不足fieldは空配列とし、配列を店舗に読み替えない', () => {
    expect(DetectionCandidateSchema.shape.characterIds.safeParse(undefined)).toEqual({ success: true, data: [] })
    expect(resolveEventCharacters({ characterIds: [] })).toEqual([])
    expect(isEventForCharacter({ characterIds: ['funato'] }, 'funabashi')).toBe(false)
  })
  test('保存済みの v3〜v12 の結果は複数店舗・複数の娘の候補も再パースできる（1件の保証は evaluateDetection が行う）', () => {
    const parsed = DetectionCandidateSchema.safeParse({
      category: 'ackey',
      title: '船橋 アクキー配布',
      stores: ['abeno', 'funabashi'],
      characterIds: ['funabashi', 'funato'],
      startDate: '2026-11-03',
      conditions: [{ type: 'everyone' }],
      referenceUrls: [{ type: 'announce', url: post.url }],
      isPreliminary: false
    })
    expect(parsed.success).toBe(true)
  })
})
