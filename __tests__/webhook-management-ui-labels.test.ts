import { describe, expect, test } from 'bun:test'
import { type WebhookJob, WebhookNotificationStatusSchema } from '@biccame/shared/schemas/webhook.dto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import {
  detectionScoreLabel,
  notificationRetryWarning,
  webhookActionAvailability,
  webhookJobLabel,
  webhookNotificationLabel
} from '@/components/admin/webhook-labels'
import { WebhookStatusBadge } from '@/components/admin/webhook-status-badge'
import { adminEndpoints } from '@/utils/client/admin'
import { basicCellsOf, gridRootOf } from './fixtures/webhook-answer-grid'
import {
  anchorsOf,
  answerThresholds,
  listJob,
  outlineTags,
  renderDetail,
  renderList,
  shintouAnswers
} from './fixtures/webhook-management'

describe('Webhook管理画面の判定・通知表示', () => {
  test('回答表の全セルは1行目と2行目を基線揃えの flex にし、inline-flex を直下に使わず、バッジはステータス欄に入る', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds: answerThresholds })
    )
    const root = gridRootOf(markup)
    if (root === null) throw new Error('Missing grid root')
    const cells = root.querySelectorAll('li[data-key]')
    expect(cells).toHaveLength(4)
    for (const cell of cells) {
      const lines = cell.querySelectorAll(':scope > div')
      expect(lines).toHaveLength(2)
      for (const line of lines) {
        expect(line.getAttribute('class')).toContain('flex')
        expect(line.getAttribute('class')).toContain('items-baseline')
        expect(line.getAttribute('class')).not.toContain('inline-flex')
      }
      // Badge は inline-flex を持つが、flex コンテナ内では flex アイテムになり基線に乗らない。
      expect(cell.querySelector('[data-field="status"] [data-slot="badge"]')).not.toBeNull()
    }
    expect(basicCellsOf(markup).map((cell) => cell.status)).toEqual(['未確定', '未確定', '確定', '確定'])
    // 箱の中心揃え（items-center）は Badge の中身だけで、セルの行には使わない。
    expect(markup).not.toMatch(/<div class="flex items-center/)
  })

  test('回答が空の時は表の代わりに「回答の記録なし」を出す', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: {}, thresholds: answerThresholds })
    )
    expect(markup).toContain('回答の記録なし')
    expect(gridRootOf(markup)).toBeNull()
  })

  test('詳細は「元投稿」と「判定・イベント登録」の間に「Clef の回答」を出し、判定理由は日本語でコードをtitleに残す', async () => {
    const markup = await renderDetail(
      {
        ...listJob,
        answers: shintouAnswers,
        discovery: {
          relevance: 'detected',
          action: 'review',
          confidence: 0.96,
          evidence: ['model_event_confirmed'],
          missingFields: [],
          reasons: []
        },
        reasons: ['store_unconfirmed', 'possible_duplicate:550e8400-e29b-41d4-a716-446655440000', 'future_reason']
      },
      0.9
    )
    const headings = [...markup.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map((match) => match[1])
    expect(headings.slice(0, 3)).toEqual(['元投稿', 'Clef の回答', '判定・イベント登録'])
    // 検出の記録があっても、「検出と登録可否」の節は出さない。
    expect(markup).not.toContain('aria-label="検出と登録可否"')
    expect(markup).not.toContain('検出と登録可否')
    expect(markup).toContain('>開催店舗を確定できない</li>')
    expect(markup).toContain('title="store_unconfirmed"')
    expect(markup).toContain('>重複の可能性あり</li>')
    expect(markup).toContain('title="possible_duplicate:550e8400-e29b-41d4-a716-446655440000"')
    expect(markup).toContain('>future_reason</li>')
    expect(markup).toContain('2026-10-19')
    // bot 設定の choiceThreshold を現在のしきい値として表に渡す。
    expect(markup).toContain('data-slot="badge"')
  })

  test('詳細は検出の記録が無い古い履歴でも「検出と登録可否」を出さず、他の見出しの順序は保つ', async () => {
    const markup = await renderDetail({ ...listJob, answers: shintouAnswers, discovery: null }, 0.9)
    const headings = [...markup.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map((match) => match[1])
    expect(headings.slice(0, 3)).toEqual(['元投稿', 'Clef の回答', '判定・イベント登録'])
    expect(markup).not.toContain('検出と登録可否')
    expect(markup).not.toContain('検出の記録なし')
    expect(markup).not.toContain('旧履歴')
  })

  test('詳細で回答が無いジョブは「回答の記録なし」を出し、しきい値が無い間は判定バッジを出さない', async () => {
    const none = await renderDetail({ ...listJob, answers: null })
    expect(none).toContain('Clef の回答')
    expect(none).toContain('回答の記録なし')
    expect(gridRootOf(none)).toBeNull()
    expect(none).not.toContain('aria-label="Clef の回答"')
    const loading = await renderDetail({ ...listJob, answers: shintouAnswers })
    expect(gridRootOf(loading)).not.toBeNull()
    expect(loading).toContain('2026-10-19')
    expect(loading).not.toContain('border-success/50')
    expect(loading).not.toContain('border-warning/60')
  })

  test('空状態は列数と同じ9列をまたぐ', async () => {
    const markup = await renderList([])
    const headerCount = [...markup.matchAll(/<th\b/g)].length
    expect(headerCount).toBe(9)
    expect(markup).toContain(`colSpan="${headerCount}"`)
    expect(markup).toContain('受信履歴はありません。')
  })

  test('一覧の全行に詳細画面へのリンクを同じ位置に出す', async () => {
    const second = { ...listJob, postId: '1000000000000000002', status: 'registered' } as const
    const ignored = {
      ...listJob,
      postId: '1000000000000000003',
      status: 'ignored',
      eventId: null,
      eventTitle: null
    } as const
    const jobs: WebhookJob[] = [listJob, second, ignored]
    const markup = await renderList(jobs, 0.9)
    const rows = [...markup.matchAll(/<tr\b[^>]*>.*?<\/tr>/g)]
      .map((match) => match[0])
      .filter((row) => row.includes('<td'))
    expect(rows).toHaveLength(jobs.length)
    for (const [index, row] of rows.entries()) {
      const cells = [...row.matchAll(/<td\b[^>]*>.*?<\/td>/g)].map((match) => match[0])
      expect(cells).toHaveLength(9)
      // 状態にかかわらず、最後のセルに /admin/webhooks/<postId> へのリンクがある。
      const detailCell = cells.at(-1)
      expect(detailCell).toContain(`href="/admin/webhooks/${jobs[index]?.postId}"`)
      expect(detailCell).toContain('詳細')
      // 行を識別できるアクセシブルな名前を持つ。
      expect(detailCell).toContain('aria-label="@synthetic_accountの判定詳細"')
    }
    // 外部リンクのアカウント列は、詳細画面ではなく X の投稿を指したまま。
    expect(rows[0]?.match(/<td\b[^>]*>.*?<\/td>/)?.[0]).toContain(`href="${listJob.sourceUrl}"`)
    expect(rows[0]?.match(/<td\b[^>]*>.*?<\/td>/)?.[0]).not.toContain('/admin/webhooks/')
  })

  test('詳細列の見出しは sr-only の「詳細」で視覚的に隠し、各行には「詳細」リンクが残る', async () => {
    const jobs = [listJob, { ...listJob, postId: '1000000000000000002' }]
    const markup = await renderList(jobs)
    const headings = [...markup.matchAll(/<th\b([^>]*)>(.*?)<\/th>/g)]
    expect(headings).toHaveLength(9)
    // 見出しの文字は sr-only の span に入り、th 自身は表示用の文字を持たない（列の幅用の whitespace-nowrap は維持）。
    expect(headings.at(-1)?.[2]).toBe('<span class="sr-only">詳細</span>')
    expect(headings.at(-1)?.[1]).toContain('whitespace-nowrap')
    // sr-only でない「詳細」は、各行のリンクだけ。
    expect(markup.match(/<th\b[^>]*>[^<]*詳細/g)).toBeNull()
    const links = [...markup.matchAll(/<a\b[^>]*href="\/admin\/webhooks\/[^"]*"[^>]*>(.*?)<\/a>/g)]
    expect(links).toHaveLength(jobs.length)
    for (const link of links) expect(link[1]).toMatch(/^詳細<svg/)
  })

  test('登録済みアカウントの詳細リンクはキャラクター名で行を識別する', async () => {
    const markup = await renderList([{ ...listJob, post: { ...listJob.post, screenName: 'BIC_ABENO' } }])
    expect(markup).toContain('aria-label="あべのたんの判定詳細"')
  })

  test('詳細リンクのセルはブロックのflexで上下中央に揃え、inline-flexを使わない', async () => {
    const markup = await renderList([listJob, { ...listJob, postId: '1000000000000000002' }])
    const rows = [...markup.matchAll(/<tr\b[^>]*>.*?<\/tr>/g)]
      .map((match) => match[0])
      .filter((row) => row.includes('<td'))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const detailCell = [...row.matchAll(/<td\b[^>]*>.*?<\/td>/g)].map((match) => match[0]).at(-1)
      expect(detailCell).toContain('align-middle')
      const link = detailCell?.match(/<a\b[^>]*class="([^"]*)"/)?.[1]
      expect(link?.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center']))
      expect(link?.split(' ')).not.toContain('inline-flex')
      // Button の ghost / sm の見た目と ChevronRight のアイコンを持つ。
      expect(detailCell).toContain('data-slot="button"')
      expect(detailCell).toContain('data-variant="ghost"')
      expect(detailCell).toContain('lucide-chevron-right')
    }
  })

  test('接続状態はGET、実送信・保留解決・再試行はPOSTを使う', () => {
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'getAdminBotStatus')?.method).toBe('get')
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'checkAdminBotConnection')?.method).toBe('post')
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'testAdminBotNotification')?.method).toBe('post')
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'retryAdminWebhookJob')?.method).toBe('post')
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'resolveAdminWebhookJob')?.method).toBe('post')
  })

  test('受信履歴のクライアントパスは管理APIの経路に一致する', () => {
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'listAdminWebhookJobs')?.path).toBe(
      '/api/admin/webhook/jobs'
    )
    expect(adminEndpoints.find((endpoint) => endpoint.alias === 'getAdminWebhookJob')?.path).toBe(
      '/api/admin/webhook/jobs/:postId'
    )
  })

  test('処理状態と通知状態を別々に表示する', () => {
    expect(webhookJobLabel('registered')).toBe('登録済み')
    expect(webhookNotificationLabel('failed')).toBe('通知失敗')
    expect(webhookJobLabel('held')).toBe('保留')
    expect(webhookNotificationLabel('unknown')).toBe('送信結果不明')
  })

  test.each(WebhookNotificationStatusSchema.options)('通知状態%sに表示ラベルがある', (status) => {
    expect(webhookNotificationLabel(status)).not.toBe(status)
  })

  test('通知対象外は中立色を使い、再送可能にしない', () => {
    const markup = renderToStaticMarkup(createElement(WebhookStatusBadge, { status: 'skipped', notification: true }))
    expect(markup).toContain('通知対象外')
    expect(markup).toContain('bg-muted/40')
    expect(markup).toContain('text-muted-foreground')
    expect(markup).not.toContain('bg-status-ongoing')
    expect(webhookActionAvailability('held', 'skipped', []).canRetryNotification).toBe(false)
  })

  test.each([
    ['registered', '登録済み', 'circle-check'],
    ['held', '保留', 'clock'],
    ['queued', '処理待ち', 'hourglass'],
    ['processing', '判定中', 'loader-circle'],
    ['ignored', '対象外', 'circle-minus'],
    ['failed', '処理失敗', 'circle-alert']
  ])('省幅の処理状態%sはアイコンと読み上げラベル・説明を維持する', (status, label, icon) => {
    const markup = renderToStaticMarkup(createElement(WebhookStatusBadge, { status, compact: true }))
    expect(markup).toContain(`title="${label}"`)
    expect(markup).toContain(`<span class="sr-only">${label}</span>`)
    expect(markup).toContain(`lucide-${icon}`)
    expect(markup).toContain('size-6 shrink-0 justify-center p-0')
    expect(markup).toContain('aria-hidden="true"')
  })

  test('通常の処理状態は文字を残し、未知の状態も省略しない', () => {
    const normal = renderToStaticMarkup(createElement(WebhookStatusBadge, { status: 'held' }))
    expect(normal).toContain('>保留</span>')
    expect(normal).not.toContain('sr-only')
    const unknown = renderToStaticMarkup(createElement(WebhookStatusBadge, { status: 'future_state', compact: true }))
    expect(unknown).toContain('>future_state</span>')
    expect(unknown).not.toContain('sr-only')
  })

  test('未判定と低スコアを区別する', () => {
    expect(detectionScoreLabel(null)).toBe('—')
    expect(detectionScoreLabel(0)).toBe('0.0%')
    expect(detectionScoreLabel(0.9)).toBe('90.0%')
  })

  test('未知の状態は成功に変換しない', () => {
    expect(webhookJobLabel('future_state')).toBe('future_state')
    expect(webhookNotificationLabel('future_state')).toBe('future_state')
  })

  test('登録後の通知失敗でも、判定の再実行（登録を変えない）と連携の付け替えと通知の再送ができる。解決はできない', () => {
    expect(webhookActionAvailability('registered', 'failed', [])).toEqual({
      canResolve: false,
      canLink: true,
      canRejudge: true,
      canRetryNotification: true
    })
  })

  test('保留の解決と、失敗したジョブの再実行（判定し直し）を区別する', () => {
    expect(webhookActionAvailability('held', 'sent', []).canResolve).toBe(true)
    // 失敗したジョブは解決の対象ではなく、再実行（canRejudge）で最初からやり直す。
    expect(webhookActionAvailability('failed', 'pending', []).canResolve).toBe(false)
    expect(webhookActionAvailability('failed', 'pending', []).canRejudge).toBe(true)
    expect(webhookActionAvailability('processing', 'unknown', []).canRetryNotification).toBe(false)
    expect(webhookActionAvailability('ignored', 'sent', []).canResolve).toBe(false)
    // 対象外は解決の対象ではないが、人が却下していなければ再判定はできる。
    expect(webhookActionAvailability('ignored', 'skipped', ['not_distribution_event']).canRejudge).toBe(true)
    expect(webhookActionAvailability('ignored', 'skipped', ['manually_rejected']).canRejudge).toBe(false)
  })

  test('結果不明の再送は重複の危険を明示する', () => {
    expect(notificationRetryWarning('unknown')).toContain('重複')
    expect(notificationRetryWarning('failed')).toContain('AI判定は繰り返しません')
  })
})

describe('受信詳細・受信履歴の戻り先', () => {
  test('受信詳細の左上は受信履歴（/admin/webhooks）に戻り、管理画面に戻るリンクは出さない', async () => {
    const markup = await renderDetail(listJob, 0.9)
    const back = anchorsOf(markup).find((anchor) => anchor.includes('受信履歴に戻る'))
    expect(back).toBeDefined()
    expect(back).toContain('href="/admin/webhooks"')
    expect(markup).not.toContain('管理画面に戻る')
    expect(markup).not.toContain('href="/admin"')
  })

  test('受信詳細の右上に受信履歴ボタンは無く、更新ボタンだけが残る', async () => {
    const markup = await renderDetail(listJob, 0.9)
    // 受信履歴（/admin/webhooks）へのリンクは、左上の戻るリンク1つだけ。
    expect(anchorsOf(markup).filter((anchor) => anchor.includes('href="/admin/webhooks"'))).toHaveLength(1)
    expect(markup).not.toMatch(/<\/svg>受信履歴<\/a>/)
    const header = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))
    expect(header).toContain('更新')
    expect(header).not.toContain('受信履歴')
  })

  test('受信履歴（一覧）の戻り先は従来どおり管理画面（/admin）', async () => {
    const markup = await renderList([listJob], 0.9)
    const back = anchorsOf(markup).find((anchor) => anchor.includes('管理画面に戻る'))
    expect(back).toBeDefined()
    expect(back).toContain('href="/admin"')
    expect(markup).not.toContain('受信履歴に戻る')
  })
})

describe('管理画面の outline ボタンの枠線', () => {
  test('受信詳細の outline ボタンはすべて枠線に border-card-border を指定する', async () => {
    const tags = outlineTags(await renderDetail(listJob, 0.9))
    // 更新・連携・対象外にする・再実行・通知を再送。
    expect(tags).toHaveLength(5)
    for (const tag of tags) expect(tag).toContain('border-card-border')
  })

  test('受信履歴の outline ボタンはすべて枠線に border-card-border を指定する', async () => {
    const tags = outlineTags(await renderList([listJob], 0.9))
    // 更新・bot 設定・条件をクリア・前へ・次へ。
    expect(tags).toHaveLength(5)
    for (const tag of tags) expect(tag).toContain('border-card-border')
  })
})
