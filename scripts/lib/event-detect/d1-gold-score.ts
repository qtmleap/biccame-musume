import type { Top } from './d1-gold-candidate'
import { allFieldsMatch, coreFieldsMatch, FIELD_NAMES, failedFields } from './d1-gold-compare'
import { type CandidateRecord, type CaseRecord, SPECIAL_CHOICES } from './d1-gold-records'
import type { GoldCase } from './d1-gold-schema'
import { countByKey } from './d1-gold-schema'

export type Rate = { n: number; d: number; rate: number | null }
export const rate = (n: number, d: number): Rate => ({ n, d, rate: d === 0 ? null : n / d })
const count = <T>(rows: readonly T[], predicate: (row: T) => boolean) => rows.filter(predicate).length

export const quantile = (values: readonly number[], q: number) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}
const spread = (values: readonly number[]) => ({
  n: values.length,
  min: quantile(values, 0),
  q1: quantile(values, 0.25),
  median: quantile(values, 0.5),
  q3: quantile(values, 0.75),
  max: quantile(values, 1)
})
const mean = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

const probabilityOf = (top: Top | null) => (top === null ? 0 : top.probability)
const isRealId = (top: Top | null) => top !== null && !SPECIAL_CHOICES.includes(top.choice)
// 最上位の娘と最上位の店舗の関係。特別な選択肢（multiple・none など）は実在の ID と区別する。
const relationOf = (candidate: CandidateRecord) => {
  const store = candidate.view.store
  const character = candidate.view.character
  if (store === null || character === null) return 'missing'
  if (isRealId(store) && isRealId(character)) return store.choice === character.choice ? 'same-id' : 'different-id'
  if (!isRealId(store) && !isRealId(character))
    return store.choice === character.choice ? `both-${store.choice}` : 'both-special-different'
  return isRealId(store) ? `store-id-character-${character.choice}` : `store-${store.choice}-character-id`
}

export const THRESHOLDS = [0.9, 0.8, 0.7, 0.6, 0.5] as const

// 登録された候補が正解と全項目一致するか。対応づかなかった登録は「誤った登録（対応なし）」として数える。
const registrationQuality = (
  rows: readonly CandidateRecord[],
  pick: (row: CandidateRecord) => CandidateRecord['current'],
  goldTotal: number
) => {
  const registered = rows.filter((row) => pick(row).status === 'register')
  const withGold = registered.filter((row) => pick(row).fields !== null)
  const exact = withGold.filter((row) => {
    const fields = pick(row).fields
    return fields !== null && allFieldsMatch(fields)
  })
  return {
    registered: registered.length,
    correct: exact.length,
    wrongMatched: withGold.length - exact.length,
    wrongUnmatched: registered.length - withGold.length,
    precision: rate(exact.length, registered.length),
    recallOfGoldEvents: rate(exact.length, goldTotal),
    wrongByField: countByKey(
      withGold.flatMap((row) => {
        const fields = pick(row).fields
        return fields === null ? [] : failedFields(fields)
      }),
      (name) => name
    )
  }
}

export type PostError = { caseId: string; kinds: string[]; messages: string[]; calls: number }

export const scoreRecords = (
  cases: readonly GoldCase[],
  records: readonly CaseRecord[],
  errors: readonly PostError[]
) => {
  const completed = records.filter((record) => record.completed)
  const golds = records.flatMap((record) => record.golds)
  const candidates = completed.flatMap((record) => record.candidates)
  const real = candidates.filter((candidate) => !candidate.contextOnly)
  const matched = real.filter((candidate) => candidate.matchedGold !== null && candidate.argmax !== null)
  const goldTotal = golds.length

  // a. 正解イベントを候補にできた割合（完了しなかった投稿の正解も分母に残す）。
  const capture = {
    allGoldEvents: rate(
      count(golds, (gold) => gold.captured),
      goldTotal
    ),
    allGoldEventsExcludingSoleCandidate: rate(
      count(golds, (gold) => gold.captured && gold.basis !== 'sole-candidate'),
      goldTotal
    ),
    inCompletedPosts: rate(
      count(golds, (gold) => gold.captured),
      count(golds, (gold) => gold.postCompleted)
    ),
    byBasis: countByKey(
      golds.filter((gold) => gold.basis !== null),
      (gold) => String(gold.basis)
    ),
    postsWithAllGoldCaptured: rate(
      count(records, (record) => record.completed && record.golds.every((gold) => gold.captured)),
      records.length
    ),
    unmatchedCandidates: records.reduce((sum, record) => sum + record.unmatchedCandidates, 0),
    contextOnlyCandidates: count(candidates, (candidate) => candidate.contextOnly)
  }

  // b. 対応づけた候補の最上位予測（しきい値なし）と正解の一致率。
  const field = (name: (typeof FIELD_NAMES)[number]) => ({
    ofMatchedCandidates: rate(
      count(matched, (candidate) => candidate.argmax?.[name] === true),
      matched.length
    ),
    ofAllGoldEvents: rate(
      count(matched, (candidate) => candidate.argmax?.[name] === true),
      goldTotal
    )
  })
  const predicted = {
    matchedCandidates: matched.length,
    fields: Object.fromEntries(FIELD_NAMES.map((name) => [name, field(name)])),
    coreAllMatch: rate(
      count(matched, (candidate) => candidate.argmax !== null && coreFieldsMatch(candidate.argmax)),
      matched.length
    ),
    allMatch: rate(
      count(matched, (candidate) => candidate.argmax !== null && allFieldsMatch(candidate.argmax)),
      matched.length
    ),
    storeMatchedByExtractionOnly: rate(
      count(matched, (candidate) => candidate.judgedStoreContributed),
      matched.length
    ),
    missByField: countByKey(
      matched.flatMap((candidate) => (candidate.argmax === null ? [] : failedFields(candidate.argmax))),
      (name) => name
    )
  }

  // c. 現行しきい値での最終状態と、held の理由。
  const states = (rows: readonly CandidateRecord[], pick: (row: CandidateRecord) => CandidateRecord['current']) => ({
    n: rows.length,
    byStatus: countByKey(rows, (row) => pick(row).status),
    heldReasons: countByKey(
      rows.filter((row) => pick(row).status === 'held').flatMap((row) => pick(row).reasons),
      (reason) => reason
    ),
    // 最初の（先頭の）理由だけで数えた内訳。何で止まったかの主因。
    heldFirstReason: countByKey(
      rows.filter((row) => pick(row).status === 'held' && pick(row).reasons.length > 0),
      (row) => pick(row).reasons[0]
    ),
    heldReasonCountDistribution: countByKey(
      rows.filter((row) => pick(row).status === 'held'),
      (row) => String(pick(row).reasons.length)
    )
  })
  const current = {
    allCandidates: states(real, (row) => row.current),
    matchedCandidates: states(matched, (row) => row.current),
    postsWithRegister: rate(
      count(completed, (record) => record.candidates.some((c) => !c.contextOnly && c.current.status === 'register')),
      records.length
    ),
    registeredCorrect: registrationQuality(real, (row) => row.current, goldTotal),
    // 本番と同じ件数監査の保留を重ねた最終状態。監査が matched 以外の投稿の register は held になる。
    afterAuditGate: {
      allCandidates: states(real, (row) => row.currentGated),
      postsWithRegister: rate(
        count(completed, (record) =>
          record.candidates.some((c) => !c.contextOnly && c.currentGated.status === 'register')
        ),
        records.length
      ),
      registeredCorrect: registrationQuality(real, (row) => row.currentGated, goldTotal)
    }
  }

  // d. 店舗・娘を最上位でそのまま採用した再評価。
  const topOne = {
    allCandidates: states(real, (row) => row.topOne),
    matchedCandidates: states(matched, (row) => row.topOne),
    postsWithRegister: rate(
      count(completed, (record) => record.candidates.some((c) => !c.contextOnly && c.topOne.status === 'register')),
      records.length
    ),
    registered: registrationQuality(real, (row) => row.topOne, goldTotal),
    afterAuditGate: {
      allCandidates: states(real, (row) => row.topOneGated),
      postsWithRegister: rate(
        count(completed, (record) =>
          record.candidates.some((c) => !c.contextOnly && c.topOneGated.status === 'register')
        ),
        records.length
      ),
      registered: registrationQuality(real, (row) => row.topOneGated, goldTotal)
    }
  }
  // 抽出が0件で本文だけから作った文脈候補。正解とは対応づけず、状態だけを別に数える。
  const contextOnly = {
    n: candidates.length - real.length,
    current: states(
      candidates.filter((candidate) => candidate.contextOnly),
      (row) => row.current
    ),
    topOne: states(
      candidates.filter((candidate) => candidate.contextOnly),
      (row) => row.topOne
    )
  }

  // e. ビッカメ娘。
  const explicit = matched.filter((candidate) =>
    cases.some((c) => c.events.some((e) => e.uuid === candidate.matchedGold && e.characterIds.length > 0))
  )
  const withCharacter = real.filter((candidate) => candidate.view.character !== null)
  const goldExplicit = cases.flatMap((sample) => sample.events).filter((event) => event.characterIds.length > 0)
  const character = {
    explicitGoldEvents: goldExplicit.length,
    explicitGoldCharacterEqualsGoldStore: rate(
      count(goldExplicit, (event) => event.characterIds.some((id) => event.stores.includes(id))),
      goldExplicit.length
    ),
    explicitGoldCaptured: explicit.length,
    topMatchesExplicitGold: rate(
      count(explicit, (candidate) => candidate.argmax?.character === true),
      explicit.length
    ),
    // 最上位の娘が最上位の店舗と「実在の同じ ID」か。multiple 同士・none 同士は同じ ID とは数えない。
    sameRealIdAsTopStore: rate(
      count(withCharacter, (c) => relationOf(c) === 'same-id'),
      withCharacter.length
    ),
    sameRealIdGivenStoreIsId: rate(
      count(withCharacter, (c) => relationOf(c) === 'same-id'),
      count(withCharacter, (c) => isRealId(c.view.store))
    ),
    relationToTopStore: countByKey(withCharacter, relationOf),
    topIsSpecial: Object.fromEntries(
      SPECIAL_CHOICES.map((name) => [
        name,
        rate(
          count(withCharacter, (c) => c.view.character?.choice === name),
          withCharacter.length
        )
      ])
    ),
    topCharacterCounts: countByKey(withCharacter, (c) => String(c.view.character?.choice)),
    meanProbability: {
      top: mean(withCharacter.flatMap((c) => (c.view.character === null ? [] : [c.view.character.probability]))),
      special: mean(withCharacter.flatMap((c) => (c.characterMass === null ? [] : [c.characterMass.special]))),
      nonSpecial: mean(withCharacter.flatMap((c) => (c.characterMass === null ? [] : [c.characterMass.nonSpecial]))),
      sameIdAsTopStore: mean(
        withCharacter.flatMap((c) => (c.characterMass === null ? [] : [c.characterMass.sameAsTopStore]))
      )
    },
    topProbability: spread(
      withCharacter.flatMap((c) => (c.view.character === null ? [] : [c.view.character.probability]))
    )
  }

  // f. 店舗・娘の最上位確率としきい値。
  const withBoth = real.filter((c) => c.view.store !== null && c.view.character !== null)
  const confidence = {
    storeTopProbability: spread(real.flatMap((c) => (c.view.store === null ? [] : [c.view.store.probability]))),
    storeTopProbabilityMatched: spread(
      matched.flatMap((c) => (c.view.store === null ? [] : [c.view.store.probability]))
    ),
    passingBoth: THRESHOLDS.map((threshold) => ({
      threshold,
      store: rate(
        count(real, (c) => c.view.store !== null && c.view.store.probability >= threshold),
        real.length
      ),
      character: rate(
        count(real, (c) => c.view.character !== null && c.view.character.probability >= threshold),
        real.length
      ),
      both: rate(
        count(
          withBoth,
          (c) => probabilityOf(c.view.store) >= threshold && probabilityOf(c.view.character) >= threshold
        ),
        real.length
      )
    }))
  }

  const errorKinds = countByKey(
    errors.flatMap((error) => error.kinds),
    (kind) => kind
  )
  return {
    sample: {
      posts: records.length,
      goldEvents: goldTotal,
      completedPosts: completed.length,
      incompletePosts: records.length - completed.length,
      candidates: candidates.length,
      realCandidates: real.length,
      calls: records.reduce((sum, record) => sum + record.calls, 0),
      auditStatus: countByKey(completed, (record) => String(record.auditStatus)),
      stoppedPosts: count(completed, (record) => record.stopped)
    },
    errors: { postsWithErrors: errors.length, byKind: errorKinds, detail: errors },
    capture,
    contextOnly,
    predicted,
    current,
    topOne,
    character,
    confidence
  }
}
