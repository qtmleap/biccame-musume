import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DETECTION_VERSION,
  type DetectionThresholds,
  evaluateDetection,
  STORE_DEFAULT_THRESHOLD
} from '@biccame/shared/event-detect/detection'
import { webhookPromptDefinition } from '@biccame/shared/event-detect/prompt-definitions'
import { evaluateFixtureCases, sourceOfFixture, summarize } from '../scripts/lib/event-detect/d1-gold-fixture-eval'
import {
  FIXTURE_FILE,
  type FixtureSplit,
  fixtureHash,
  parseFixture
} from '../scripts/lib/event-detect/d1-gold-fixture-schema'
import { canonicalJson } from '../scripts/lib/event-detect/d1-gold-replay'
import { sha256Hex } from '../scripts/lib/event-detect/d1-gold-schema'
import { GOAL_PIPELINE_PROFILE } from '../scripts/lib/event-detect/goal-pipeline-profile'

// 保存した実 AI の応答（D1 の人手修正済みイベントを正解とする Golden）を、現行の evaluateDetection で再評価して精度の下限を守る。
// 実 AI は呼ばない。フィクスチャは scripts/export-d1-gold-fixture.ts が作る（手順と指標の定義は docs/event-detection-golden.md）。
const fixture = parseFixture(readFileSync(resolve(FIXTURE_FILE), 'utf8'))
const { fieldThresholds: snapshotFields, ...snapshot } = GOAL_PIPELINE_PROFILE.thresholds
const withStore = (store: number): DetectionThresholds => ({
  ...snapshot,
  fieldThresholds: { ...snapshotFields, store }
})
const casesOf = (split: FixtureSplit) => fixture.cases.filter((item) => item.split === split)

// 本番の設定の KV のスナップショット（保存済みの店舗 90%）をそのまま使うと、保存した値が優先するので、店舗の 1 段目のしきい値が 90% になる。
// 保存応答は 2 段目（確認）の回答を持てないため、70% 以上 90% 未満の店舗は確認で拾えず、1 件も登録されない（下の「保存済みの店舗の閾値」のテスト）。
// 実運用ではそうした店舗は確認を聞かれて拾われる。ここでは店舗の既定（STORE_DEFAULT_THRESHOLD = 70%）を明示して評価し、規則の効果を守る。
//
// 下限（登録数・precision）は件数の監査を外した評価で守る。委任の「本番ポリシーに合わせる」とは異なるので理由を残す:
// 本番の監査（90%）は、保存応答では dev が 1 件（全項目一致 0）、test が 0 件しか通さない。そこに下限を置いても
// 規則の効果を守れない（0 件の下限は何も検証しない）。そこで、規則の効果は監査なしで、監査の効果は「登録を減らすだけ」
// 「70% なら登録が戻る」の別のテストで見る。本番の登録がほぼ 0 件のままであることは、docs/event-detection-golden.md に明記している。
const ADOPTED = withStore(STORE_DEFAULT_THRESHOLD)
const evaluateSplit = (split: FixtureSplit, thresholds: DetectionThresholds, auditThreshold: number) =>
  evaluateFixtureCases(casesOf(split), { thresholds, pinTop: false }, auditThreshold)

// 規則の効果は、件数の監査（本番では不一致・低確度の候補を全て保留にする）とは別に測る。監査 90% は保存応答の 8 割以上を止める。
const rules = { dev: evaluateSplit('dev', ADOPTED, 0.9), test: evaluateSplit('test', ADOPTED, 0.9) }
// 参考: 件数の監査を 70% にした場合（EVENT_DETECTION_ITEM_COUNT_THRESHOLD=0.7）。不一致のときの抽出のやり直しは再現していない近似。
const audit70 = { dev: evaluateSplit('dev', ADOPTED, 0.7), test: evaluateSplit('test', ADOPTED, 0.7) }

// フィクスチャの保存応答は v15 の 1 段目の質問への回答。現行の版（v17）は、v15 に対して娘の質問に store_character を足し、
// 「店舗の娘と同一と仮定しない」注意書きを外した版なので、現行のソースは v15 の 1 段目の質問をもう作れない。
// そこで版の文字列は現行（v17）と比べず、次の 3 つで守る。
//   1. フィクスチャは「作られた版（v15）」の 1 段目の質問への回答であること。
//   2. 生成済みの版定義に、v15 の 1 段目の質問が 1 文字も変わらず残っていること（内容の sha256 で固定）。
//   3. 保存応答の再評価に使う現行の request は、娘の質問を除けば v15 と同一で、娘の質問の選択肢は v15 の選択肢を全て含むこと。
// 2 段目の回答はフィクスチャに無い。1 段目の最上位が 70% 以上の店舗・娘は確認なしで確定するので数字は出せるが、70% 未満は確認でしか確定できず、
// 保存応答は確認を受けられないので採用されない。したがって下の数字は「2 段目を受けられない保存応答での下限」で、実運用では 70% 未満の候補が
// 確認で拾われるため、登録数はこれより多くなる（実 AI で測っていない）。
// v17 の回答を含むフィクスチャへの再作成は、v17 を実 AI で測り直した後に行う（docs/event-detection-golden.md）。
const FIXTURE_VERSION = 'v5-webhook-v15-concise-author'
// 生成済みの v15 の版定義（保存済み。変えてはならない）の内容の sha256。
const V15_DEFINITION_SHA256 = '4dea483fb9bb0eec2b07087ce6ba616846baefd0c33932fbb1cd4f24a7ed765a'
// v15 のソースで、全フィクスチャ候補から作った 1 段目の request（state と質問）の sha256。1 段目の質問・文言・選択肢・state が変わると変わる。
// 現行の request の娘の質問を v15 の版定義の娘の質問に置き換えたものが、この値と一致する。
const FIRST_STAGE_REQUESTS_SHA256 = 'e1dfe1e1490bad1f609ea0974254cd81e44af1a65e16ebd649da8e6c4714cad4'

const v15Definition = () => {
  const definition = webhookPromptDefinition(FIXTURE_VERSION)
  if (definition === undefined) throw new Error('Missing v15 prompt definition')
  return definition
}
const v15CharacterQuestion = () => {
  const question = v15Definition().questions.find((entry) => entry.key === 'character')
  if (question === undefined || question.type !== 'choice') throw new Error('Missing v15 character question')
  return { type: question.type, instructions: question.instructions, criteria: question.criteria }
}
const fixtureRequests = () =>
  fixture.cases.flatMap((item) => item.candidates.flatMap((candidate) => sourceOfFixture(item, candidate).requests))

describe('Golden フィクスチャの整合', () => {
  test('フィクスチャは v15 の 1 段目の質問で作られている', () => {
    const message = `フィクスチャの版が想定と違います（${fixture.detectionVersion} != ${FIXTURE_VERSION}）。再作成したら FIXTURE_VERSION と V15_DEFINITION_SHA256 / FIRST_STAGE_REQUESTS_SHA256 を更新してください（手順は docs/event-detection-golden.md）`
    if (fixture.detectionVersion !== FIXTURE_VERSION) throw new Error(message)
    expect(fixture.detectionVersion).toBe(FIXTURE_VERSION)
  })

  test('生成済みの版定義に v15 の 1 段目の質問が変わらず残っている（現行の版 v17 とは別の版）', () => {
    expect(DETECTION_VERSION).not.toBe(FIXTURE_VERSION)
    expect(sha256Hex(JSON.stringify(v15Definition()))).toBe(V15_DEFINITION_SHA256)
    // v15 の定義の質問は、1 段目の質問だけ（確認の質問は v16 から）。
    expect(v15Definition().questions.map((question) => question.key)).not.toContain('store_confirm')
    expect(v15Definition().questions.map((question) => question.key)).not.toContain('character_confirm')
  })

  test('現行の 1 段目の request は、娘の質問を v15 の定義に戻せば v15 と同一（娘の質問以外は変わっていない）', () => {
    const requests = fixtureRequests()
    expect(requests.length).toBeGreaterThan(0)
    const restored = requests.map((request) => ({
      ...request,
      questions: { ...request.questions, character: v15CharacterQuestion() }
    }))
    expect(sha256Hex(canonicalJson(restored))).toBe(FIRST_STAGE_REQUESTS_SHA256)
    // 現行の娘の質問は v15 とは別物（store_character を足した）で、現行の 1 段目に確認の質問は無い。
    for (const request of requests) {
      expect(Object.keys(request.questions)).not.toContain('store_confirm')
      expect(Object.keys(request.questions)).not.toContain('character_confirm')
      const character = request.questions.character
      if (character?.type !== 'choice') throw new Error('Missing character question')
      expect(character.criteria).not.toEqual(v15CharacterQuestion().criteria)
      expect(Object.keys(character.criteria)).toContain('store_character')
    }
  })

  test('v15 の保存応答の娘の回答は、v15 の選択肢にも現行の選択肢にも含まれ、store_character は含まない（再評価が有効）', () => {
    const v15Keys = Object.keys(v15CharacterQuestion().criteria)
    const checked = fixture.cases.flatMap((item) =>
      item.candidates.map((candidate) => {
        const source = sourceOfFixture(item, candidate)
        const character = source.answers.character
        const current = source.request.questions.character
        if (character?.type !== 'choice' || current?.type !== 'choice') throw new Error('Missing character answer')
        for (const key of [character.choice, ...Object.keys(character.probabilities)]) {
          expect(v15Keys).toContain(key)
          expect(Object.keys(current.criteria)).toContain(key)
          expect(key).not.toBe('store_character')
        }
        return character.choice
      })
    )
    expect(checked.length).toBeGreaterThan(0)
  })

  test('内容のハッシュが一致する（フィクスチャの破損・改変の検知）', () => {
    const { contentSha256, ...body } = fixture
    expect(fixtureHash(body)).toBe(contentSha256)
  })

  test('開発用 100 投稿と検証用 174 投稿を、重ならずに含む', () => {
    const ids = fixture.cases.map((item) => item.caseId)
    expect(new Set(ids).size).toBe(ids.length)
    expect([casesOf('dev').length, casesOf('test').length]).toEqual([100, 174])
    expect(summarize(rules.dev, 'raw').goldEvents).toBe(114)
    expect(summarize(rules.test, 'raw').goldEvents).toBe(206)
  })
})

// 下限は、店舗・娘の採用を「最上位が 70% 以上なら確認なしで確定」にしたあとの実測（現行の evaluateDetection で保存応答を再評価。実 AI は呼んでいない）から
// 余裕を持たせた値。規則は COND・ESN・CHG の 3 つ（END は試して外した）。
// 実測（件数の監査を外した評価）:
//   開発用 R1 登録 20・全項目一致 18・90.0%、検証用 R1 登録 62・全項目一致 44・71.0%
//   （件数の監査 70% は開発用 17 / 15、検証用 59 / 43）。
// 変更前（旧版の下限 30%）は 開発用 26 / 23 / 88.5%、検証用 70 / 50 / 71.4%、50% 固定にした場合は 25 / 22 / 88.0% と 67 / 47 / 70.1%。
// 下限を 70% にして登録が減る（開発用 26 → 20、検証用 70 → 62）のは、確率が 70% 未満の最上位が、確認の質問を受けられない保存応答では採用されず
// store_unconfirmed で保留になるため。この数字は「2 段目を受けられない保存応答での下限」で、実運用では 70% 未満の候補が確認の「はい」で拾われるので、
// 登録数は下限より多くなる。拾われた分の精度は、実 AI で測るまで分からない（docs/event-detection-golden.md の 70% の節）。
// 下限を緩めた理由は上のとおり（保存応答に 2 段目の回答が無いため、70% 未満を採用できない）。精度が下がったからではない:
// 減った登録（開発用 6・検証用 8）のうち、全項目一致の正解が 11 件（開発用 5・検証用 6）、誤登録が 3 件（開発用 1・検証用 2）。
// 誤登録は開発用 3 → 2、検証用 20 → 18 と減ったが、取りこぼした正解のほうが多い。
// 再評価は決定的なので、割れたときは評価ロジックの変更が精度を下げたということ。
// 下限は主指標の R1 に置く。D1 の終了日はイベント終了後に人が確定した値で、開始時点の投稿からは取れないので、
// 候補に終了日が無ければ一致とする（候補に終了日があるときは D1 と同じ日付のときだけ一致。docs/event-detection-golden.md）。
//   開発用（規則を決めるのに使った 100 投稿）:
//     R1: 登録 20・全項目一致 18・precision 90.0%（下限は登録 17 以上・precision 80% 以上・全項目一致 15 以上）
//     strict（参考）: 登録 20・全項目一致 14・precision 70.0%
//   検証用（まだ規則に使っていない 174 投稿）:
//     R1: 登録 62・全項目一致 44・precision 71.0%（下限は登録 57 以上・precision 65% 以上・全項目一致 40 以上）
//     strict（参考）: 登録 62・全項目一致 36・precision 58.1%
//   合計（開発用 + 検証用）: R1 登録 82・全項目一致 62（precision 75.6%、登録率 19.4%）、strict 登録 82・全項目一致 50
// 余裕は登録 3〜5 件、precision 5〜10 ポイント、全項目一致 3〜4 件。AI の応答が変わらない限りゆらがないが、規則の微調整を妨げない幅にしてある。
const RULES_FLOOR = {
  dev: { registered: 17, precision: 0.8 },
  test: { registered: 57, precision: 0.65 }
} as const
// 基準（店舗・娘を最上位採用し、保留規則を足さない場合）の R1 の全項目一致は 開発用 23・検証用 52（旧版の下限 30% のときの実測）。
// 下限を 70% にした分（2 段目を受けられない保存応答での下限）として、検証用は 12 件まで失ってよい。
const BASELINE_EXACT = { dev: 23, test: 52 } as const
const EXACT_FLOOR = { dev: 15, test: 40 } as const
// 主指標（R1）。終了日以外の項目と登録の可否は strict と同じ。
const primary = (split: FixtureSplit) => {
  const { registered, announceTime } = summarize(rules[split], 'raw')
  return { registered, exact: announceTime.exact, precision: announceTime.precision }
}

describe('現行の判定（店舗・娘を最上位採用 + 保留規則）の精度の下限（終了日は R1）', () => {
  test.each(['dev', 'test'] as const)('%s: 登録数と precision が下限を下回らない', (split) => {
    const result = primary(split)
    const floor = RULES_FLOOR[split]
    expect(result.registered).toBeGreaterThanOrEqual(floor.registered)
    expect(result.precision).not.toBeNull()
    if (result.precision !== null) expect(result.precision).toBeGreaterThanOrEqual(floor.precision)
  })

  test.each(['dev', 'test'] as const)('%s: 全項目一致の登録が、基準より多く失われていない', (split) => {
    const { exact } = primary(split)
    expect(exact).toBeGreaterThanOrEqual(EXACT_FLOOR[split])
    expect(BASELINE_EXACT[split] - exact).toBeLessThanOrEqual(BASELINE_EXACT[split] - EXACT_FLOOR[split])
  })

  test('保留規則は精度を上げる: 検証用の誤登録が、基準の 34 件（86 件中）から 24 件以下に減る（実測 18 件）', () => {
    const { registered, exact } = primary('test')
    expect(registered - exact).toBeLessThanOrEqual(24)
  })

  test('strict（参考）は R1 より厳しいだけで、登録の可否は変わらない', () => {
    for (const split of ['dev', 'test'] as const) {
      const result = summarize(rules[split], 'raw')
      expect(result.exact, split).toBeLessThanOrEqual(result.announceTime.exact)
      expect(result.exact, split).toBeGreaterThan(0)
    }
    // 参考の実測: 開発用 14 件・検証用 36 件。終了日の食い違いだけで、R1 との差は開発用 4 件・検証用 8 件。
    expect(summarize(rules.dev, 'raw').exact).toBe(14)
    expect(summarize(rules.test, 'raw').exact).toBe(36)
  })

  test('娘の既定: 保存応答で character_unconfirmed の保留は、店舗が採用されないか、娘の最上位が multiple・none のものだけ', () => {
    const tops = fixture.cases
      .filter((item) => item.split === 'dev' || item.split === 'test')
      .flatMap((item) => item.candidates.map((candidate) => sourceOfFixture(item, candidate)))
      .flatMap((source) => {
        const result = evaluateDetection(
          source.post,
          source.request,
          { answers: source.answers },
          ADOPTED,
          source.storeKey
        )
        const character = source.answers.character
        return result.reasons.includes('character_unconfirmed') &&
          !result.reasons.includes('store_unconfirmed') &&
          character?.type === 'choice'
          ? [character.choice]
          : []
      })
    expect(tops.length).toBeGreaterThan(0)
    for (const top of tops) expect(['multiple', 'none']).toContain(top)
  })

  test('娘の既定: 登録した候補の娘は 1 件で、店舗の娘・other・secret・店舗と別の具体的な娘のいずれか（空にならない）', () => {
    for (const split of ['dev', 'test'] as const) {
      const registered = rules[split]
        .flatMap((item) => item.outcomes)
        .filter((outcome) => outcome.status === 'register')
      expect(registered.length, split).toBeGreaterThan(0)
      for (const outcome of registered) {
        const candidate = outcome.candidate
        if (typeof candidate !== 'object' || candidate === null || !('characterIds' in candidate))
          throw new Error('Missing candidate')
        expect(candidate.characterIds, split).toHaveLength(1)
      }
    }
  })

  test('登録した候補に、本文だけから作った文脈候補（抽出が 0 件の投稿）は含まれない', () => {
    for (const split of ['dev', 'test'] as const)
      expect(
        rules[split].flatMap((item) => item.outcomes).filter((o) => o.status === 'register' && o.contextOnly)
      ).toEqual([])
  })
})

describe('本番の運用と件数の監査', () => {
  test('本番と同じ件数の監査（90%）は登録を止めるだけで、規則の登録より増やさない', () => {
    for (const split of ['dev', 'test'] as const) {
      const production = summarize(rules[split], 'production')
      expect(production.registered).toBeLessThanOrEqual(summarize(rules[split], 'raw').registered)
      expect(production.announceTime.exact).toBeLessThanOrEqual(primary(split).exact)
    }
  })

  test('保存済みの店舗の閾値（KV のスナップショットの 90%）は判定に効く。保存応答は確認を受けられないので、90% 未満の店舗は採用されない', () => {
    for (const split of ['dev', 'test'] as const) {
      // 保存値 0.9 のまま（本番の KV と同じ）: 保存応答に 90% 以上の最上位は無く、確認の回答も無いので、登録は 0 件。
      // 実運用では 70% 以上 90% 未満の店舗は確認を聞かれて拾われるので、0 件にはならない。確認の回数が増えるだけで登録は止まらない。
      const kept = summarize(evaluateSplit(split, withStore(snapshotFields.store), 0.9), 'raw')
      expect(kept.registered, split).toBe(0)
    }
  })

  test('店舗のしきい値は下げるほど（確認なしで確定する範囲が広がるほど）登録が増える（単調）', () => {
    for (const split of ['dev', 'test'] as const) {
      const registeredAt = (store: number) => summarize(evaluateSplit(split, withStore(store), 0.9), 'raw').registered
      const [at90, at70, at50, at30] = [0.9, 0.7, 0.5, 0.3].map(registeredAt)
      expect(at90, split).toBe(0)
      expect(at70, split).toBeGreaterThan(at90)
      expect(at50, split).toBeGreaterThanOrEqual(at70)
      expect(at30, split).toBeGreaterThanOrEqual(at50)
    }
  })

  // 実測（R1）: 開発用 登録 17・全項目一致 15（88.2%）、検証用 登録 59・全項目一致 43（72.9%）。strict は 12 / 35。
  test('参考: 件数の監査を 70% にすれば、検証用で登録 52 件以上・precision 65% 以上になる（終了日は R1）', () => {
    const dev = summarize(audit70.dev, 'production')
    const test = summarize(audit70.test, 'production')
    expect(dev.registered).toBeGreaterThanOrEqual(14)
    expect(dev.announceTime.precision).toBeGreaterThanOrEqual(0.8)
    expect(test.registered).toBeGreaterThanOrEqual(52)
    expect(test.announceTime.precision).toBeGreaterThanOrEqual(0.65)
  })
})
