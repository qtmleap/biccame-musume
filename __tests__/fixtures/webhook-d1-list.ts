import { listWebhookJobs } from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import { webhookKeywordVerdict } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'

// ---- 受信履歴の絞り込み・並べ替え ----

export type ListSeed = {
  postId: string
  /** 受信日時(ms)。 */
  createdAt: number
  /** null は未判定。 */
  confidence: number | null
  text: string
  screenName?: string
  kind?: DetectPost['kind']
  /** ジョブの状態。省略は held。 */
  status?: string
  /** 保存する回答（answers_json）。省略と null は未保存(NULL)。壊れた JSON もそのまま入れて確かめる。 */
  answersJson?: string | null
}

export const MATCH_TEXT = 'あべのたん限定名刺 2026年11月3日から先着100枚を配布します'

export const MISMATCH_TEXT = '日常のあいさつです'

/** 判定の期待値は本文から推測せず、判定関数そのものを通して確かめてから使う。 */
export const verdictOf = (seed: ListSeed) => webhookKeywordVerdict(listSeedPost(seed))

export const listSeedPost = (seed: ListSeed): DetectPost => ({
  id: seed.postId,
  screenName: seed.screenName === undefined ? 'bic_abeno' : seed.screenName,
  text: seed.text,
  createdAt: '2026-10-11T00:00:00Z',
  kind: seed.kind === undefined ? 'original' : seed.kind,
  url: `https://x.com/bic_abeno/status/${seed.postId}`,
  media: []
})

export const seedListJobs = async (env: Bindings, seeds: readonly ListSeed[]) => {
  for (const seed of seeds) {
    await env.DB.prepare(
      `INSERT INTO webhook_event_jobs(post_id,post_json,source_url,event_uuid,status,answers_json,confidence,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
      .bind(
        seed.postId,
        JSON.stringify(listSeedPost(seed)),
        `https://x.com/bic_abeno/status/${seed.postId}`,
        crypto.randomUUID(),
        seed.status === undefined ? 'held' : seed.status,
        seed.answersJson === undefined ? null : seed.answersJson,
        seed.confidence,
        seed.createdAt,
        seed.createdAt
      )
      .run()
  }
}

/** 期待する並び。SQL とは独立に JS で作る。NULL は最小値(-1)、同値は投稿IDで同じ向きに並べる。 */
export const expectedOrder = (
  seeds: readonly ListSeed[],
  sort: 'createdAt' | 'confidence',
  order: 'asc' | 'desc'
): string[] => {
  const keyOf = (seed: ListSeed) =>
    sort === 'createdAt' ? seed.createdAt : seed.confidence === null ? -1 : seed.confidence
  const sign = order === 'asc' ? 1 : -1
  return seeds
    .toSorted((a, b) => {
      const byKey = keyOf(a) - keyOf(b)
      if (byKey !== 0) return sign * byKey
      // 投稿IDは TEXT の比較(SQLite の既定は 2 進数順)。桁数が違えば桁数の少ない方が先になるとは限らない。
      return sign * (a.postId < b.postId ? -1 : a.postId > b.postId ? 1 : 0)
    })
    .map((seed) => seed.postId)
}

export type ListOptions = Parameters<typeof listWebhookJobs>[1]

export type ListScan = Parameters<typeof listWebhookJobs>[2]

/** nextCursor が null になるまで辿り、各ページの投稿IDを返す。無限ループ防止に上限を持つ。 */
export const walkPages = async (
  env: Bindings,
  options: ListOptions,
  scan?: ListScan,
  cursor?: string,
  pages: readonly string[][] = []
): Promise<string[][]> => {
  if (pages.length >= 200) throw new Error('Pagination did not terminate')
  const page = await listWebhookJobs(env, cursor === undefined ? options : { ...options, cursor }, scan)
  const collected = [...pages, page.jobs.map((job) => job.postId)]
  return page.nextCursor === null ? collected : walkPages(env, options, scan, page.nextCursor, collected)
}

export const HOUR = 3_600_000

export const BASE = 1_791_676_800_000

/**
 * 重複・欠落を捉えるための並び。
 * - 投稿IDの桁数が違う(9, 10, 100, 1000)。TEXT 比較なので '9' > '10' になる。
 * - created_at の同値、confidence の同値、複数の NULL。
 * - 判定は一致・不一致・除外(リツイート)が混在する。
 */
export const pagingSeeds: readonly ListSeed[] = [
  { postId: '9', createdAt: BASE, confidence: 0.5, text: MATCH_TEXT },
  { postId: '10', createdAt: BASE, confidence: 0.5, text: MISMATCH_TEXT },
  { postId: '100', createdAt: BASE, confidence: null, text: MATCH_TEXT },
  { postId: '1000', createdAt: BASE + 1, confidence: null, text: MATCH_TEXT, kind: 'retweet' },
  { postId: '11', createdAt: BASE + 1, confidence: 0.9, text: MISMATCH_TEXT },
  { postId: '12', createdAt: BASE + 2, confidence: 0, text: MATCH_TEXT },
  { postId: '13', createdAt: BASE + 2, confidence: 1, text: MATCH_TEXT },
  { postId: '14', createdAt: BASE + 3, confidence: 0.9, text: MISMATCH_TEXT, kind: 'retweet' },
  { postId: '15', createdAt: BASE + 3, confidence: null, text: MATCH_TEXT },
  { postId: '16', createdAt: BASE + 4, confidence: 0.25, text: MATCH_TEXT }
]

/** 判定の絞り込みテスト用の並び。受信日時の新しい順に並べたときの判定を、先頭から固定する。 */
export const verdictSeeds = (verdicts: readonly ('match' | 'mismatch' | 'excluded')[]): ListSeed[] =>
  verdicts.map((verdict, index) => ({
    postId: String(3000 + index),
    // index が小さいほど新しい(= 日時の新しい順で先に出る)。
    createdAt: BASE + 1000 - index,
    confidence: index % 3 === 0 ? null : (index % 10) / 10,
    text: verdict === 'mismatch' ? MISMATCH_TEXT : MATCH_TEXT,
    kind: verdict === 'excluded' ? 'retweet' : 'original'
  }))

// ---- 受信履歴のステータス絞り込み ----

/** 保存する回答。ステータス列は、この status の選択肢を表示する。 */
export const statusAnswers = (choice: string) =>
  JSON.stringify({
    is_event: { type: 'noul', noul: 0.9 },
    status: { type: 'choice', choice, probabilities: { [choice]: 0.9 } }
  })

/**
 * ステータスの絞り込みを確かめる並び。
 * - 投稿IDの桁数が違う、created_at と confidence の同値、NULL がある（ページ送りの重複・欠落を捉える）。
 * - 却下(ignored)のジョブは保存済み回答が announce でも「却下」にだけ一致する。
 * - 回答が無い・壊れた JSON・JSON でも status が選択式でない・4値にない選択肢の行は、どの4値にも一致しない。
 */
export const postStatusSeeds: readonly ListSeed[] = [
  { postId: '9', createdAt: BASE, confidence: 0.5, text: MATCH_TEXT, answersJson: statusAnswers('announce') },
  { postId: '10', createdAt: BASE, confidence: 0.5, text: MISMATCH_TEXT, answersJson: statusAnswers('announce') },
  { postId: '100', createdAt: BASE, confidence: null, text: MATCH_TEXT, answersJson: statusAnswers('start') },
  {
    postId: '1000',
    createdAt: BASE + 1,
    confidence: 0.9,
    text: MATCH_TEXT,
    kind: 'retweet',
    answersJson: statusAnswers('start')
  },
  { postId: '11', createdAt: BASE + 1, confidence: 0.9, text: MISMATCH_TEXT, answersJson: statusAnswers('ongoing') },
  { postId: '12', createdAt: BASE + 2, confidence: 0, text: MATCH_TEXT, answersJson: statusAnswers('ongoing') },
  { postId: '13', createdAt: BASE + 2, confidence: 1, text: MATCH_TEXT, answersJson: statusAnswers('end') },
  {
    postId: '14',
    createdAt: BASE + 3,
    confidence: 0.9,
    text: MISMATCH_TEXT,
    kind: 'retweet',
    answersJson: statusAnswers('end')
  },
  // 却下: 保存済み回答は announce でも、画面のステータスは「却下」。
  {
    postId: '15',
    createdAt: BASE + 3,
    confidence: null,
    text: MATCH_TEXT,
    status: 'ignored',
    answersJson: statusAnswers('announce')
  },
  { postId: '16', createdAt: BASE + 4, confidence: 0.25, text: MATCH_TEXT, status: 'ignored', answersJson: null },
  // 登録済みのジョブでも、回答の選択肢で絞れる。
  {
    postId: '22',
    createdAt: BASE + 4,
    confidence: 0.8,
    text: MATCH_TEXT,
    status: 'registered',
    answersJson: statusAnswers('announce')
  },
  // どの4値にも一致しない行。
  { postId: '17', createdAt: BASE + 5, confidence: 0.5, text: MATCH_TEXT, answersJson: null },
  { postId: '18', createdAt: BASE + 5, confidence: 0.5, text: MATCH_TEXT, answersJson: 'not json{' },
  { postId: '19', createdAt: BASE + 5, confidence: 0.5, text: MATCH_TEXT, answersJson: '[]' },
  { postId: '20', createdAt: BASE + 6, confidence: 0.5, text: MATCH_TEXT, answersJson: '{"status":"announce"}' },
  {
    postId: '21',
    createdAt: BASE + 6,
    confidence: 0.5,
    text: MATCH_TEXT,
    answersJson: JSON.stringify({ status: { type: 'noul', noul: 0.5, choice: 'announce' } })
  },
  { postId: '23', createdAt: BASE + 6, confidence: 0.5, text: MATCH_TEXT, answersJson: statusAnswers('unknown_status') }
]

/** 期待する行の投稿IDを、並びのとおりに seed へ引き直す。 */
export const postStatusSeedsOf = (postIds: readonly string[]): ListSeed[] =>
  postStatusSeeds.filter((seed) => postIds.includes(seed.postId))

/** 値ごとに一致するはずの投稿ID。画面の表示とは独立に、シードの内容から固定する。 */
export const POST_STATUS_IDS = {
  announce: ['9', '10', '22'],
  start: ['100', '1000'],
  ongoing: ['11', '12'],
  end: ['13', '14'],
  ignored: ['15', '16']
} as const

export const POST_STATUSES = ['announce', 'start', 'ongoing', 'end', 'ignored'] as const
