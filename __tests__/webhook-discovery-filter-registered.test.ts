import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { webhookDiscoveryFilterClause } from '@api/services/webhook-discovery-query'
import type { WebhookDiscovery, WebhookDiscoveryFilter } from '@biccame/shared/schemas/webhook.dto'

const discoveryJson = (relevance: WebhookDiscovery['relevance']): string =>
  JSON.stringify({
    discovery: {
      relevance,
      action: 'review',
      confidence: 0.96,
      evidence: ['model_event_confirmed'],
      missingFields: [],
      reasons: ['event_ended']
    }
  })

type Child = { status: string; relevance: WebhookDiscovery['relevance'] | null }
type Job = { postId: string; status: string; relevance: WebhookDiscovery['relevance'] | null; children: Child[] }

const resultJson = (relevance: WebhookDiscovery['relevance'] | null): string =>
  relevance === null ? '{}' : discoveryJson(relevance)

const jobs: Job[] = [
  // 人が連携して登録済みになった子候補。AI の記録は判定時点の uncertain のまま。
  {
    postId: 'registered-child',
    status: 'registered',
    relevance: null,
    children: [{ status: 'registered', relevance: 'uncertain' }]
  },
  { postId: 'held-child', status: 'held', relevance: null, children: [{ status: 'held', relevance: 'uncertain' }] },
  // 子候補が無い親だけのジョブ。
  { postId: 'registered-parent', status: 'registered', relevance: 'uncertain', children: [] },
  { postId: 'held-parent', status: 'held', relevance: 'uncertain', children: [] },
  // 登録済みの子と保留の子が並ぶ投稿は、登録済みの子があるので検出済み。
  {
    postId: 'registered-and-held',
    status: 'registered',
    relevance: null,
    children: [
      { status: 'registered', relevance: 'uncertain' },
      { status: 'held', relevance: 'uncertain' }
    ]
  },
  // 登録済みでない対象外は、これまでどおり対象外。
  {
    postId: 'held-not-detected',
    status: 'held',
    relevance: null,
    children: [{ status: 'held', relevance: 'not_detected' }]
  },
  // AI が検出済みと記録した保留の子は、これまでどおり検出済み。
  { postId: 'held-detected', status: 'held', relevance: null, children: [{ status: 'held', relevance: 'detected' }] },
  // 記録の無い保留のジョブは、これまでどおり記録なし。
  { postId: 'held-unrecorded', status: 'held', relevance: null, children: [] }
]

const createDb = (): Database => {
  const db = new Database(':memory:')
  db.run('CREATE TABLE webhook_event_jobs (post_id TEXT PRIMARY KEY, status TEXT NOT NULL, result_json TEXT)')
  db.run('CREATE TABLE webhook_event_candidates (post_id TEXT NOT NULL, status TEXT NOT NULL, result_json TEXT)')
  for (const job of jobs) {
    db.run('INSERT INTO webhook_event_jobs (post_id, status, result_json) VALUES (?, ?, ?)', [
      job.postId,
      job.status,
      resultJson(job.relevance)
    ])
    for (const child of job.children) {
      db.run('INSERT INTO webhook_event_candidates (post_id, status, result_json) VALUES (?, ?, ?)', [
        job.postId,
        child.status,
        resultJson(child.relevance)
      ])
    }
  }
  return db
}

describe('検出結果の絞り込みは、登録済みを AI の未確定より優先する', () => {
  /** 一覧のクエリと同じ形で、絞り込みに入る投稿IDを投稿ID順に返す。 */
  const matched = (value: WebhookDiscoveryFilter): string[] => {
    const db = createDb()
    try {
      const { where, values } = webhookDiscoveryFilterClause(value)
      // 値はプレースホルダだけで渡す。
      expect(values).toEqual([value])
      expect(where.endsWith('=?')).toBe(true)
      return db
        .query<{ post_id: string }, string[]>(
          `SELECT j.post_id FROM webhook_event_jobs j WHERE ${where} ORDER BY j.post_id`
        )
        .all(...values)
        .map((row) => row.post_id)
    } finally {
      db.close()
    }
  }

  test('登録済みで uncertain の子候補を持つジョブは、uncertain に入らず detected に入る', () => {
    expect(matched('uncertain')).not.toContain('registered-child')
    expect(matched('detected')).toContain('registered-child')
  })

  test('保留中で uncertain の子候補を持つジョブは、uncertain に入る', () => {
    expect(matched('uncertain')).toContain('held-child')
    expect(matched('detected')).not.toContain('held-child')
  })

  test('子候補の無い登録済みジョブは、親の discovery が uncertain でも detected に入る', () => {
    expect(matched('uncertain')).not.toContain('registered-parent')
    expect(matched('detected')).toContain('registered-parent')
  })

  test('子候補の無い保留中のジョブは、親の discovery が uncertain なら uncertain に入る', () => {
    expect(matched('uncertain')).toContain('held-parent')
    expect(matched('detected')).not.toContain('held-parent')
  })

  test('登録済みの子と保留の uncertain の子が並ぶジョブは detected に入る', () => {
    expect(matched('detected')).toContain('registered-and-held')
    expect(matched('uncertain')).not.toContain('registered-and-held')
  })

  test('全体の振り分けは、登録済みだけが detected へ動き、他は従来どおり', () => {
    expect(matched('detected')).toEqual([
      'held-detected',
      'registered-and-held',
      'registered-child',
      'registered-parent'
    ])
    expect(matched('uncertain')).toEqual(['held-child', 'held-parent'])
    expect(matched('not_detected')).toEqual(['held-not-detected'])
    expect(matched('unrecorded')).toEqual(['held-unrecorded'])
    // どのジョブもちょうど 1 つの絞り込みに入る。
    const all = (['detected', 'uncertain', 'not_detected', 'unrecorded'] as const).flatMap(matched)
    expect(all.toSorted()).toEqual(jobs.map((job) => job.postId).toSorted())
  })
})
