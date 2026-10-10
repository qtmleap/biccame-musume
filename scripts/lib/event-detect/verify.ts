import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ClefModel, ClefRequest } from '@biccame/shared/event-detect/clef'
import { callClef } from './decide'
import { describeEvent, describeMention, type EmulatedEvent, type Mention, type Verifier } from './emulate'
import { writeAtomic } from './store'

// 「新規」と判断された言及を Clef で確かめる。Haiku は進行中のイベントの一覧を見たうえで new を選んだが、
// 別のモデルに同じ一覧を見せて「どれと同じか」を選ばせ、既存のイベントを高い確率で選んだら合流させる。
// Clef は選択肢ごとの確率を返すので、しきい値で厳しさを調整できる。

export const VERIFY_VERSION = 'v1'

const NEW = 'new'

export const buildVerifyRequest = (
  mention: Mention,
  candidates: readonly EmulatedEvent[]
): Omit<ClefRequest, 'model'> => ({
  state: [mention.state, '', `この投稿から読み取った配布イベント: ${describeMention(mention)}`].join('\n'),
  questions: {
    same: {
      type: 'choice',
      instructions:
        'この投稿が伝えている配布イベントは、店舗で進行中の次のイベントのどれと同じですか？ 同じ配布物の告知の繰り返しや、開始・継続・終了の報告なら同じイベントです。時期の違う同じ種類の配布物（毎年のハロウィン名刺など）は別のイベントです。どれとも違う新しい配布イベントなら new を選んでください。',
      criteria: {
        ...Object.fromEntries(candidates.map((event, index) => [`e${index}`, describeEvent(event)])),
        [NEW]: '一覧のどれとも違う、新しい配布イベント'
      }
    }
  }
})

const verifyKey = (model: ClefModel, request: Omit<ClefRequest, 'model'>) =>
  createHash('sha256')
    .update(JSON.stringify({ model, version: VERIFY_VERSION, request }))
    .digest('hex')
    .slice(0, 32)

/** 同時に走らせる Clef の呼び出しを制限する。dev サーバー経由は混んでいると遅くなる */
const limiter = (limit: number) => {
  const state = { running: 0, waiting: [] as (() => void)[] }
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (state.running >= limit) await new Promise<void>((resume) => state.waiting.push(resume))
    state.running += 1
    try {
      return await task()
    } finally {
      state.running -= 1
      state.waiting.shift()?.()
    }
  }
}

type Saved = { choice: string; probabilities: Record<string, number>; elapsedMs: number }

/**
 * Clef で再確認する Verifier。結果（選択肢ごとの確率）は入力ごとに保存し、同じ入力は呼ばない。
 */
export const clefVerifier = async (options: {
  endpoint: string
  model: ClefModel
  cacheDir: string
  concurrency: number
}): Promise<Verifier> => {
  await mkdir(options.cacheDir, { recursive: true })
  const limit = limiter(options.concurrency)
  return async (mention, candidates) => {
    const request = buildVerifyRequest(mention, candidates)
    const path = resolve(options.cacheDir, `${verifyKey(options.model, request)}.json`)
    const saved: Saved | undefined = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : undefined
    const cached = saved !== undefined
    const result = saved
      ? saved
      : await limit(async () => {
          const started = performance.now()
          const response = await callClef(options.endpoint, { model: options.model, ...request })
          const answer = response.answers.same
          if (answer?.type !== 'choice') throw new Error('Clef returned no choice for the question')
          const value: Saved = {
            choice: answer.choice,
            probabilities: answer.probabilities,
            elapsedMs: Math.round(performance.now() - started)
          }
          await writeAtomic(path, JSON.stringify(value))
          return value
        })
    const probability = result.probabilities[result.choice]
    return {
      choice: result.choice,
      probability: probability === undefined ? 0 : probability,
      probabilities: result.probabilities,
      cached
    }
  }
}
