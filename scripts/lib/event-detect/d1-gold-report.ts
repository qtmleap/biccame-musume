import type { Rate, scoreRecords } from './d1-gold-score'

type Score = ReturnType<typeof scoreRecords>
const pct = (value: Rate | { n: number; d: number; rate: number | null }) =>
  `${value.n}/${value.d}${value.rate === null ? '' : ` (${(value.rate * 100).toFixed(1)}%)`}`
const num = (value: number | null) => (value === null ? '-' : value.toFixed(3))
const table = (header: readonly string[], rows: readonly (readonly string[])[]) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`)
  ].join('\n')
const counts = (value: Record<string, number>) =>
  Object.entries(value)
    .sort(([, a], [, b]) => b - a)
    .map(([key, n]) => `${key}=${n}`)
    .join(', ')

// 採点結果を人が読む表にする。topOneInterpretable が偽のときは (d) の数値を出さない。
export const formatScore = (score: Score, topOneInterpretable: boolean) => {
  const { sample, capture, contextOnly, predicted, current, topOne, character, confidence } = score
  const fieldRows = Object.entries(predicted.fields).map(([name, value]) => [
    name,
    pct(value.ofMatchedCandidates),
    pct(value.ofAllGoldEvents)
  ])
  const quality = (title: string, value: Score['current']['registeredCorrect']) =>
    table(
      [
        '区分',
        '登録数',
        '正解と全項目一致',
        '誤り(対応あり)',
        '誤り(対応なし)',
        '登録の正答率',
        '正解イベント全体に対する再現'
      ],
      [
        [
          title,
          String(value.registered),
          String(value.correct),
          String(value.wrongMatched),
          String(value.wrongUnmatched),
          pct(value.precision),
          pct(value.recallOfGoldEvents)
        ]
      ]
    )
  return [
    `# D1 gold measurement (${sample.posts} posts / ${sample.goldEvents} gold events)`,
    `completed posts ${sample.completedPosts}, incomplete ${sample.incompletePosts}, candidates ${sample.candidates} (context-only ${capture.contextOnlyCandidates}), calls ${sample.calls}`,
    `count audit: ${counts(sample.auditStatus)}; stopped posts ${sample.stoppedPosts}`,
    `errors: posts with errors ${score.errors.postsWithErrors} (${counts(score.errors.byKind)})`,
    '',
    '## a. 正解イベントを候補にできた割合 (抽出段階)',
    table(
      ['指標', '値'],
      [
        ['正解イベント全体 (未完の投稿も分母)', pct(capture.allGoldEvents)],
        ['  うち 唯一の候補としての対応づけを除く', pct(capture.allGoldEventsExcludingSoleCandidate)],
        ['完了した投稿の正解イベント', pct(capture.inCompletedPosts)],
        ['全正解を取り切った投稿', pct(capture.postsWithAllGoldCaptured)],
        ['対応づけの根拠', counts(capture.byBasis)],
        ['対応づかなかった候補', String(capture.unmatchedCandidates)]
      ]
    ),
    '',
    `## b. 最上位予測 (しきい値なし) と D1 正解の一致 (対応づけた候補 ${predicted.matchedCandidates} 件)`,
    table(['項目', '対応づけた候補に対する一致', '正解イベント全体に対する一致'], fieldRows),
    table(
      ['指標', '値'],
      [
        ['店舗・種類・開始日がすべて一致', pct(predicted.coreAllMatch)],
        ['全項目一致 (娘は明示分のみ)', pct(predicted.allMatch)],
        [
          '抽出段階の店舗が合わず、判定の店舗が一致して対応づいた候補 (店舗の一致が対応づけと独立でない)',
          pct(predicted.storeMatchedByExtractionOnly)
        ],
        ['項目別の不一致', counts(predicted.missByField)]
      ]
    ),
    '',
    '## c. 現行しきい値での最終状態',
    table(
      ['対象', '候補数', '状態', 'held の理由(延べ)'],
      [
        [
          '全候補',
          String(current.allCandidates.n),
          counts(current.allCandidates.byStatus),
          counts(current.allCandidates.heldReasons)
        ],
        [
          '対応づけた候補',
          String(current.matchedCandidates.n),
          counts(current.matchedCandidates.byStatus),
          counts(current.matchedCandidates.heldReasons)
        ]
      ]
    ),
    `held の先頭の理由: ${counts(current.allCandidates.heldFirstReason)}; 理由の個数: ${counts(current.allCandidates.heldReasonCountDistribution)}`,
    `登録に進んだ投稿: ${pct(current.postsWithRegister)}`,
    quality('現行しきい値 (evaluateDetection)', current.registeredCorrect),
    `件数監査の保留を重ねた最終状態 (本番と同じ distribution_item_count_*): ${counts(current.afterAuditGate.allCandidates.byStatus)}; held の理由: ${counts(current.afterAuditGate.allCandidates.heldReasons)}`,
    `登録に進んだ投稿 (監査後): ${pct(current.afterAuditGate.postsWithRegister)}`,
    quality('現行しきい値 + 件数監査', current.afterAuditGate.registeredCorrect),
    `文脈候補 (抽出0件、正解と対応づけない) ${contextOnly.n} 件: 現行 ${counts(contextOnly.current.byStatus)}; held の理由 ${counts(contextOnly.current.heldReasons)}`,
    '',
    '## d. 店舗・娘を最上位でそのまま採用した再評価',
    topOneInterpretable
      ? [
          table(
            ['対象', '候補数', '状態', 'held の理由(延べ)'],
            [
              [
                '全候補',
                String(topOne.allCandidates.n),
                counts(topOne.allCandidates.byStatus),
                counts(topOne.allCandidates.heldReasons)
              ]
            ]
          ),
          `登録に進んだ投稿: ${pct(topOne.postsWithRegister)}`,
          quality('最上位採用 (evaluateDetection)', topOne.registered),
          `誤りの項目別: ${counts(topOne.registered.wrongByField)}`,
          `件数監査の保留を重ねた状態: ${counts(topOne.afterAuditGate.allCandidates.byStatus)}; 登録に進んだ投稿 ${pct(topOne.afterAuditGate.postsWithRegister)}`,
          quality('最上位採用 + 件数監査', topOne.afterAuditGate.registered),
          `文脈候補 ${contextOnly.n} 件の最上位採用後: ${counts(contextOnly.topOne.byStatus)}`
        ].join('\n')
      : '再評価の整合確認に失敗したため、この節の数値は出さない。',
    '',
    '## e. ビッカメ娘',
    table(
      ['指標', '値'],
      [
        ['D1 に明示された娘を持つイベント', String(character.explicitGoldEvents)],
        ['  そのうち 正解の娘 = 正解の店舗', pct(character.explicitGoldCharacterEqualsGoldStore)],
        ['  そのうち 候補にできたもの', String(character.explicitGoldCaptured)],
        ['  最上位が明示された娘と一致', pct(character.topMatchesExplicitGold)],
        [
          '最上位の娘 = 最上位の店舗と同じ実在 ID (全候補。multiple 同士は含めない)',
          pct(character.sameRealIdAsTopStore)
        ],
        ['  最上位の店舗が実在 ID の候補に限ると', pct(character.sameRealIdGivenStoreIsId)],
        ['  娘と店舗の最上位の関係', counts(character.relationToTopStore)],
        ...Object.entries(character.topIsSpecial).map(([name, value]) => [`最上位が ${name}`, pct(value)]),
        [
          '確率の平均: 最上位 / 特別な選択肢の合計 / それ以外の合計 / 店舗と同じ ID',
          `${num(character.meanProbability.top)} / ${num(character.meanProbability.special)} / ${num(character.meanProbability.nonSpecial)} / ${num(character.meanProbability.sameIdAsTopStore)}`
        ],
        [
          '最上位の娘の確率 (中央値 / 四分位)',
          `${num(character.topProbability.median)} (${num(character.topProbability.q1)} - ${num(character.topProbability.q3)})`
        ]
      ]
    ),
    '',
    '## f. 確率の分布としきい値',
    `店舗の最上位確率 (全候補): min ${num(confidence.storeTopProbability.min)}, Q1 ${num(confidence.storeTopProbability.q1)}, median ${num(confidence.storeTopProbability.median)}, Q3 ${num(confidence.storeTopProbability.q3)}, max ${num(confidence.storeTopProbability.max)}`,
    table(
      ['しきい値', '店舗が通る', '娘が通る', '両方が通る'],
      confidence.passingBoth.map((row) => [
        `${Math.round(row.threshold * 100)}%`,
        pct(row.store),
        pct(row.character),
        pct(row.both)
      ])
    )
  ].join('\n')
}
