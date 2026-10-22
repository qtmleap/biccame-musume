import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { z } from 'zod'
import { type ConfirmTarget, confirmRequest, isConcreteCharacter, isConcreteStore } from './d1-confirm-requests'
import type { Top } from './d1-gold-candidate'
import type { GoldEvent } from './d1-gold-schema'

export type Kind = 'T' | 'D'
export type CharacterBasis = 'explicit' | 'assumed'

// 1候補ぶんの入力。保存済みの判定（state・店舗・娘の確率）と、突き合わせ済みの D1 の正解イベント。
export type CandidateFact = {
  caseId: string
  index: number
  // 保存済みの判定リクエストの state（createDetectionRequests が作ったもの。末尾に抽出段階の店舗ヒントを含む）。
  state: string
  extractionStore: string | null
  store: Top
  character: Top
  gold: GoldEvent
}

export type PlanItem = {
  itemId: string
  caseId: string
  index: number
  kind: Kind
  storeTarget: string | null
  characterTarget: string | null
  characterBasis: CharacterBasis | null
  // 報告用の文脈。抽出段階の店舗ヒントと D1 の正解店舗（リクエストのハッシュには入らない）。
  extractionStore: string | null
  goldStores: string[]
  // 交絡の印。確認対象の店舗が state 末尾の抽出段階ヒントと一致するか、娘が確認対象の店舗と同じ id か。
  storeEqualsHint: boolean | null
  characterSameIdAsStore: boolean | null
  // 確認対象が choice の最上位と同じか（同じでなければ、机上の「最上位を確認する」に T の結果を使えない）。
  storeIsChoiceTop: boolean | null
  characterIsChoiceTop: boolean | null
  // 現行の choice 1問の最上位とその確率（2段階目との比較に使う）。
  storeTopChoice: string
  storeTopProbability: number
  characterTopChoice: string
  characterTopProbability: number
  requestSha256: string
  request: ClefRequest
}

export const sha256Of = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

// 確率の降順（同率はキー順）。最上位が先頭。
export const rankedKeys = (probabilities: Readonly<Record<string, number>>) =>
  Object.entries(probabilities)
    .sort(([keyA, a], [keyB, b]) => b - a || keyA.localeCompare(keyB))
    .map(([key]) => key)

const first = <T>(rows: readonly T[]): T | null => (rows.length === 0 ? null : rows[0])

// T の店舗: D1 の正解店舗。複数あるときは、抽出段階の店舗、最上位の店舗、先頭の順に選ぶ。
const correctStore = (fact: CandidateFact): string | null => {
  const stores = fact.gold.stores.filter(isConcreteStore)
  if (fact.extractionStore !== null && stores.includes(fact.extractionStore)) return fact.extractionStore
  if (stores.includes(fact.store.choice)) return fact.store.choice
  return first(stores)
}

// 娘の正解: D1 に明示があればその娘、無ければ「D1 の店舗と同じ娘」を仮定の正解とする。
const correctCharacters = (fact: CandidateFact): { basis: CharacterBasis; ids: string[] } => {
  const explicit = fact.gold.characterIds.length > 0
  const ids = explicit ? fact.gold.characterIds : fact.gold.stores
  return { basis: explicit ? 'explicit' : 'assumed', ids: ids.filter(isConcreteCharacter) }
}

const correctCharacter = (fact: CandidateFact, storeTarget: string | null) => {
  const { basis, ids } = correctCharacters(fact)
  if (basis === 'assumed')
    return { basis, target: storeTarget !== null && ids.includes(storeTarget) ? storeTarget : first(ids) }
  return { basis, target: ids.includes(fact.character.choice) ? fact.character.choice : first(ids) }
}

// D（ひっかけ）: 2 位以降で、具体的、かつ D1 の正解でない候補を確率の高い順に 1 つ選ぶ。
const wrongOne = (top: Top, correct: readonly string[], concrete: (id: string) => boolean) =>
  first(
    rankedKeys(top.probabilities)
      .slice(1)
      .filter((key) => concrete(key) && !correct.includes(key))
  )

const itemOf = (fact: CandidateFact, kind: Kind, target: ConfirmTarget, basis: CharacterBasis | null): PlanItem => {
  const request = confirmRequest(fact.state, target)
  const store = target.store === undefined ? null : target.store
  const character = target.character === undefined ? null : target.character
  return {
    itemId: `${fact.caseId}-c${fact.index}-${kind}`,
    caseId: fact.caseId,
    index: fact.index,
    kind,
    storeTarget: store,
    characterTarget: character,
    characterBasis: character === null ? null : basis,
    extractionStore: fact.extractionStore,
    goldStores: [...fact.gold.stores],
    storeEqualsHint: store === null ? null : store === fact.extractionStore,
    characterSameIdAsStore: store === null || character === null ? null : store === character,
    storeIsChoiceTop: store === null ? null : store === fact.store.choice,
    characterIsChoiceTop: character === null ? null : character === fact.character.choice,
    storeTopChoice: fact.store.choice,
    storeTopProbability: fact.store.probability,
    characterTopChoice: fact.character.choice,
    characterTopProbability: fact.character.probability,
    requestSha256: sha256Of(request),
    request
  }
}

// 1候補から T と D を作る。確認対象の行は、保存応答の最上位が具体的な店舗（娘）の側にだけ付ける。
// 最上位が none / multiple / other / secret の側は、2段階目に進まない（本番でも確認の対象がない）ので測らない。
export const planCandidate = (fact: CandidateFact): PlanItem[] => {
  const storeActive = isConcreteStore(fact.store.choice)
  const characterActive = isConcreteCharacter(fact.character.choice)
  if (!storeActive && !characterActive) return []
  const storeTruth = correctStore(fact)
  const right = correctCharacter(fact, storeTruth)
  const target = (store: string | null, character: string | null): ConfirmTarget => ({
    ...(store === null ? {} : { store }),
    ...(character === null ? {} : { character })
  })
  const truth = target(storeActive ? storeTruth : null, characterActive ? right.target : null)
  const trap = target(
    storeActive ? wrongOne(fact.store, fact.gold.stores, isConcreteStore) : null,
    characterActive ? wrongOne(fact.character, correctCharacters(fact).ids, isConcreteCharacter) : null
  )
  const present = (value: ConfirmTarget) => value.store !== undefined || value.character !== undefined
  return [
    ...(present(truth) ? [itemOf(fact, 'T', truth, right.basis)] : []),
    ...(present(trap) ? [itemOf(fact, 'D', trap, right.basis)] : [])
  ]
}

export const buildPlan = (facts: readonly CandidateFact[]) => facts.flatMap(planCandidate)

export const planSha256 = (items: readonly PlanItem[]) =>
  sha256Of(items.map((item) => [item.itemId, item.requestSha256]))

const TopSchema = z.object({
  choice: z.string().nonempty(),
  probability: z.number(),
  probabilities: z.record(z.string().nonempty(), z.number())
})
export const RecordsSchema = z.array(
  z.object({
    caseId: z.string().nonempty(),
    completed: z.boolean(),
    calls: z.number().int().nonnegative(),
    candidates: z.array(
      z.object({
        index: z.number().int().nonnegative(),
        contextOnly: z.boolean(),
        extractionStore: z.string().nonempty().nullable(),
        matchedGold: z.string().nonempty().nullable(),
        view: z.object({ store: TopSchema.nullable(), character: TopSchema.nullable() })
      })
    )
  })
)
// 前回の突き合わせの結果（records.json）を読む。候補と D1 のイベントの対応づけは、これをそのまま使う。
export const readRecords = async (runDirectory: string) => {
  const records = RecordsSchema.safeParse(JSON.parse(await readFile(join(runDirectory, 'records.json'), 'utf8')))
  if (!records.success) throw new Error('Invalid records.json')
  return records.data
}
const SavedJudgementSchema = z.object({ requests: z.array(z.object({ state: z.string().nonempty() })).nonempty() })
const SavedResultSchema = z.object({ judgements: z.array(SavedJudgementSchema) })
const CallSchema = z.object({ stage: z.string().nonempty(), body: z.object({ state: z.string().nonempty() }).loose() })

// 保存済みの判定の state が、実際に送った judge の call-N.json の body.state と一致するかを確かめる。
const savedJudgeStates = async (caseDirectory: string) => {
  const names = (await readdir(caseDirectory)).filter((name) => /^call-\d+\.json$/.test(name))
  const calls = await Promise.all(
    names.map(async (name) => CallSchema.safeParse(JSON.parse(await readFile(join(caseDirectory, name), 'utf8'))))
  )
  return new Set(calls.flatMap((call) => (call.success && call.data.stage === 'judge' ? [call.data.body.state] : [])))
}

export type LoadedFacts = {
  facts: CandidateFact[]
  integrity: { checkedStates: number; stateNotInJudgeCalls: number; skippedNoStoreOrCharacter: number }
}

// 保存済みの測定（records.json の突き合わせと cases/<id>/result.json）から、候補ごとの入力を読む。読み取りだけで AI は呼ばない。
export const loadFacts = async (runDirectory: string, golds: ReadonlyMap<string, readonly GoldEvent[]>) => {
  const records = await readRecords(runDirectory)
  const perCase = await Promise.all(
    records
      .filter((record) => record.completed)
      .map(async (record) => {
        const directory = join(runDirectory, 'cases', record.caseId)
        const saved = SavedResultSchema.safeParse(JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')))
        if (!saved.success) throw new Error('Invalid saved result.json')
        const sent = await savedJudgeStates(directory)
        const events = golds.get(record.caseId)
        if (events === undefined) throw new Error('Missing gold events for a saved case')
        return record.candidates.map((candidate) => {
          const judgement = saved.data.judgements[candidate.index]
          if (judgement === undefined) throw new Error('Saved judgement missing for a record candidate')
          const state = judgement.requests[0].state
          const gold = events.find((event) => event.uuid === candidate.matchedGold)
          return { record, candidate, state, gold, sentState: sent.has(state) }
        })
      })
  )
  const rows = perCase.flat().filter((row) => !row.candidate.contextOnly && row.gold !== undefined)
  const facts = rows.flatMap((row): CandidateFact[] => {
    const { store, character } = row.candidate.view
    if (store === null || character === null || row.gold === undefined) return []
    return [
      {
        caseId: row.record.caseId,
        index: row.candidate.index,
        state: row.state,
        extractionStore: row.candidate.extractionStore,
        store,
        character,
        gold: row.gold
      }
    ]
  })
  return {
    facts,
    integrity: {
      checkedStates: rows.length,
      stateNotInJudgeCalls: rows.filter((row) => !row.sentState).length,
      skippedNoStoreOrCharacter: rows.length - facts.length
    }
  } satisfies LoadedFacts
}

const SavedResponseSchema = z.object({
  stage: z.string().nonempty(),
  response: z.object({ usage: z.object({ input_tokens: z.number().int().nonnegative() }).optional() }).loose()
})

// 保存した判定リクエスト (judge) の応答にある入力トークン数。確認リクエストとの大きさの比較に使う。
export const savedJudgeInputTokens = async (runDirectory: string) => {
  const cases = await readdir(join(runDirectory, 'cases'))
  const perCase = await Promise.all(
    cases.map(async (caseId) => {
      const directory = join(runDirectory, 'cases', caseId)
      const names = (await readdir(directory)).filter((name) => /^response-\d+\.json$/.test(name))
      return await Promise.all(
        names.map(async (name) => {
          const parsed = SavedResponseSchema.safeParse(JSON.parse(await readFile(join(directory, name), 'utf8')))
          if (!parsed.success || parsed.data.stage !== 'judge') return []
          const usage = parsed.data.response.usage
          return usage === undefined ? [] : [usage.input_tokens]
        })
      )
    })
  )
  return perCase.flat(2)
}
