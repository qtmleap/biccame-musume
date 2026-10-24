import { describe, expect, test } from 'bun:test'
import { webhookAccountLabel, webhookKeywordLabel } from '@/components/admin/webhook-labels'
import { answerRows, characters, listJob, renderList, statusCell } from './fixtures/webhook-management'

describe('Webhook管理画面の判定・通知表示', () => {
  test('受信履歴は9列で投稿内容とキーワード判定、モデル、精度、投稿状態を別々に表示し、末尾に詳細列を置く', async () => {
    const markup = await renderList([listJob])
    // 精度の見出しは並べ替えのボタン（アイコン付き）なので、タグを除いた文字で比べる。
    expect([...markup.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((match) => match[1]?.replace(/<[^>]*>/g, ''))).toEqual([
      'アカウント',
      '投稿内容',
      '投稿時間',
      '判定',
      'モデル',
      '精度',
      'ステータス',
      'イベント名',
      '詳細'
    ])
    expect([...markup.matchAll(/<td\b/g)]).toHaveLength(9)
    expect(markup).toContain('@synthetic_account')
    expect(markup).toContain('2026/10/02')
    const dateCell = [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)].find((match) => match[0].includes('2026/10/02'))
    expect(dateCell?.[0]).toContain('tabular-nums')
    expect(dateCell?.[0]).not.toContain('text-xs')
    expect(markup).not.toContain('2026/10/05')
    expect(statusCell(markup)).toContain('>継続</td>')
    expect(markup).not.toContain('99%')
    expect(markup).toContain('72.0%')
    expect(markup).toContain('clef-flash')
    expect([...markup.matchAll(/\d+\.\d%/g)]).toHaveLength(1)
    expect(markup).toContain(`href="/events/${listJob.eventId}"`)
    expect(markup).toContain('紐付け先の実イベント名')
    expect(markup).not.toContain(`/events/${listJob.eventUUID}`)
    // 「詳細」は詳細列のリンクとして出すため、非表示の対象から外した。
    expect(markup).toContain('一覧に表示する投稿本文')
    for (const hidden of ['処理回数', 'Discord通知', '保留', '送信結果不明']) {
      expect(markup).not.toContain(hidden)
    }
    expect(markup).toContain('border-separator')
    expect(markup).toMatch(/<table\b[^>]*class="[^"]*whitespace-nowrap/)
    expect(markup).toContain('title="現在のキーワードルールによる判定"')
  })

  test.each(['長い投稿本文'.repeat(100), `https://example.invalid/${'a'.repeat(500)}`, '一行目\n二行目\n三行目'])(
    '投稿プレビューは長文・URL・改行を2行と固定幅に収め、全文を説明に残す: %s',
    async (text) => {
      const markup = await renderList([{ ...listJob, post: { ...listJob.post, text } }])
      const cell = [...markup.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)][1]?.[0]
      expect(cell).toContain('w-64 max-w-64')
      expect(cell).toContain('w-64 line-clamp-2 whitespace-pre-line break-all')
      expect(cell).toContain(`title="${text}"`)
      expect(cell).toContain(text)
      expect(cell).not.toContain('whitespace-nowrap')
      expect(markup).toContain('sticky right-0')
    }
  )

  test.each(['', ' \n\t '])('投稿本文が空ならプレビューにダッシュを出す: %s', async (text) => {
    const markup = await renderList([{ ...listJob, post: { ...listJob.post, text } }])
    const cell = [...markup.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)][1]?.[0]
    expect(cell).toContain('>—</p>')
    expect(cell).not.toContain('title=')
  })

  test('投稿本文のHTMLは実行せずテキストとして表示する', async () => {
    const markup = await renderList([{ ...listJob, post: { ...listJob.post, text: '<script>alert(1)</script>' } }])
    const cell = [...markup.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)][1]?.[0]
    expect(cell).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(cell).not.toContain('<script>')
  })

  test('詳細列は見出しと各行を右端に固定し、スクロールをTable内部の領域に任せる', async () => {
    const markup = await renderList([listJob, { ...listJob, postId: '1000000000000000002' }])
    const heads = [...markup.matchAll(/<th\b[^>]*>.*?<\/th>/g)].map((match) => match[0])
    const detailHead = heads.at(-1)
    expect(detailHead).toContain('sticky right-0')
    expect(detailHead).toContain('bg-page-bg')
    expect(detailHead).toContain('border-separator')
    for (const row of answerRows(markup)) {
      const cells = [...row.matchAll(/<td\b[^>]*>.*?<\/td>/g)].map((match) => match[0])
      const detailCell = cells.at(-1)
      expect(detailCell).toContain('sticky right-0')
      expect(detailCell).toContain('bg-page-bg')
      expect(detailCell).toContain('border-separator')
      expect(detailCell).toContain('判定詳細')
      expect(cells.slice(0, -1).join('')).not.toContain('sticky right-0')
    }
    expect([...markup.matchAll(/class="[^"]*overflow-x-auto[^"]*"/g)]).toHaveLength(1)
  })

  test('アカウント列は画像用アバターと一文字フォールバックで省幅表示し、名前と元投稿を維持する', async () => {
    for (const [screenName, label, initial] of [
      ['BIC_ABENO', 'あべのたん', 'あ'],
      ['synthetic_account', '@synthetic_account', 's']
    ]) {
      const markup = await renderList([{ ...listJob, post: { ...listJob.post, screenName } }])
      const accountCell = markup.match(/<td\b[^>]*>.*?<\/td>/)?.[0]
      expect(accountCell).toBeDefined()
      expect(accountCell).toContain(`title="${label}"`)
      expect(accountCell).toContain(`aria-label="${label}の元投稿を開く"`)
      expect(accountCell).toContain(`href="${listJob.sourceUrl}"`)
      expect(accountCell).toContain('target="_blank"')
      expect(accountCell).toContain('rel="noopener noreferrer"')
      expect(accountCell).toContain('data-slot="avatar"')
      expect(accountCell).toContain('data-slot="avatar-fallback"')
      expect(accountCell).toContain(`>${initial}</span>`)
      expect(accountCell).not.toContain(`>${label}<`)
      expect(accountCell).not.toContain('min-w-52')
      expect(accountCell).not.toContain('max-w-80')
      expect(accountCell).toContain('w-12')
    }
  })

  test('登録済みアカウントはキャラクター名を表示し投稿リンクを維持する', async () => {
    const markup = await renderList([{ ...listJob, post: { ...listJob.post, screenName: 'BIC_ABENO' } }])
    expect(markup).toContain('あべのたん')
    expect(markup).not.toContain('@BIC_ABENO')
    expect(markup).toContain(`href="${listJob.sourceUrl}"`)
    expect(webhookAccountLabel('bic_abeno', characters)).toBe('あべのたん')
    expect(webhookAccountLabel('synthetic_account', characters)).toBe('@synthetic_account')
    const storeAccount = characters.find((entry) => !entry.character.is_biccame_musume && entry.character.twitter_id)
    if (storeAccount === undefined || storeAccount.character.twitter_id === undefined)
      throw new Error('Missing canonical non-character account fixture')
    expect(webhookAccountLabel(storeAccount.character.twitter_id, characters)).toBe(
      storeAccount.store?.name === undefined ? storeAccount.character.name : storeAccount.store.name
    )
  })

  test.each([
    ['announce', 0.7499, '告知'],
    ['start', 1, '開始'],
    ['ongoing', 0.99, '継続'],
    ['end', 0, '終了'],
    [null, null, '—']
  ] as const)(
    '投稿状態%sを処理状態から推測せず確率を付けずラベルだけで表示する',
    async (postStatus, probability, label) => {
      const markup = await renderList([
        { ...listJob, postStatus, postStatusProbability: probability, model: 'clef', confidence: 0 }
      ])
      expect(statusCell(markup)).toContain(`>${label}</td>`)
      expect(statusCell(markup)).not.toMatch(/\d%/)
      expect(markup).toContain('0.0%')
      expect(markup).toContain('clef')
      expect(markup).not.toContain('clef-flash')
    }
  )

  test.each(['announce', 'start', 'ongoing', 'end', null] as const)(
    '対象外判定はAIの投稿状態%sより却下を優先する',
    async (postStatus) => {
      const markup = await renderList([
        {
          ...listJob,
          status: 'ignored',
          postStatus,
          postStatusProbability: postStatus === null ? null : 0.1,
          confidence: 0.038,
          eventId: null,
          eventTitle: null
        }
      ])
      expect(markup).toContain('>却下</td>')
      expect(markup).toContain('3.8%')
      expect(markup).not.toContain('>継続</td>')
      expect(markup).not.toContain('href="/events/')
    }
  )

  test('キーワード一致はAIの対象外判定と独立して表示する', async () => {
    const post = {
      ...listJob.post,
      screenName: 'bicpkanhonten',
      text: 'カタログギフトをプレゼント。無くなり次第終了！'
    }
    expect(webhookKeywordLabel(post)).toBe('一致')
    const markup = await renderList([
      { ...listJob, post, status: 'ignored', confidence: 0.038, eventId: null, eventTitle: null }
    ])
    expect(markup).toContain('>一致</td>')
    expect(markup).toContain('>clef-flash</td>')
    expect(markup).toContain('>却下</td>')
    expect(webhookKeywordLabel({ ...post, text: '本日は晴れです' })).toBe('不一致')
    expect(webhookKeywordLabel({ ...post, text: 'PCのキャンペーン終了' })).toBe('除外')
    expect(webhookKeywordLabel({ ...post, kind: 'retweet' })).toBe('除外')
    expect(webhookKeywordLabel({ ...post, screenName: 'synthetic_account' })).toBe('除外')
    expect(webhookKeywordLabel({ ...post, text: 'PCの名刺配布' })).toBe('一致')
    expect(markup).not.toContain('一致:')
  })

  // td に font-mono を付けると行の基線が等幅フォントで決まり、日本語フォントの隣のセルより数字が上にずれる。
  // span の行高を 0 にして、等幅フォントの余白が行ボックスを広げ、基線を1px動かすのも防ぐ。
  test('受信履歴の精度は、td ではなく内側の span が font-mono と tabular-nums を持つ', async () => {
    const markup = await renderList([listJob])
    const precisionCell = [...markup.matchAll(/<td\b([^>]*)>(.*?)<\/td>/g)][5]
    expect(precisionCell?.[1]).toContain('text-right')
    expect(precisionCell?.[1]).not.toContain('font-mono')
    expect(precisionCell?.[1]).not.toContain('tabular-nums')
    expect(precisionCell?.[2]).toBe(
      '<div class="flex items-center justify-end"><span class="font-mono tabular-nums leading-[0]">72.0%</span></div>'
    )
  })

  test('未判定とイベント未紐付けには確率やリンクを捏造しない', async () => {
    const markup = await renderList([
      {
        ...listJob,
        postStatus: null,
        postStatusProbability: null,
        confidence: null,
        model: null,
        eventId: null,
        eventTitle: null
      }
    ])
    const cells = [...markup.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map((match) => match[1])
    // 末尾の詳細列は常にリンクを出すので、モデル・精度・ステータス・イベント名の4列だけを見る。
    expect(cells.slice(4, 8)).toEqual(['—', '—', '—', '—'])
    expect(markup).not.toContain('未判定')
    const precisionCell = [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)][4]?.[0]
    expect(precisionCell).not.toContain('font-mono')
    expect(precisionCell).not.toContain('tabular-nums')
    expect(markup).not.toMatch(/\d+\.\d%/)
    expect(markup).not.toContain('href="/events/')
    expect(markup).not.toContain(listJob.eventUUID)
  })

  test('確率が0.75でも一覧は「告知」だけを出し、しきい値未満なら薄い文字色と理由のtitleが付く', async () => {
    const tentative = { ...listJob, postStatus: 'announce', postStatusProbability: 0.7499 } as const
    const markup = await renderList([tentative], 0.9)
    expect(statusCell(markup)).toContain('>告知</td>')
    expect(statusCell(markup)).not.toMatch(/\d%</)
    expect(statusCell(markup)).toContain('text-muted-foreground')
    expect(statusCell(markup)).toContain('title="確信度がしきい値(90%)未満のため未確定"')
  })

  test('しきい値は設定値から取り、ちょうど届く確率は確定として通常表示する', async () => {
    const markup = await renderList([{ ...listJob, postStatus: 'announce', postStatusProbability: 0.8 }], 0.8)
    expect(statusCell(markup)).toContain('>告知</td>')
    expect(statusCell(markup)).not.toContain('text-muted-foreground')
    expect(statusCell(markup)).not.toContain('title=')
    const lower = await renderList([{ ...listJob, postStatus: 'announce', postStatusProbability: 0.79 }], 0.8)
    expect(statusCell(lower)).toContain('title="確信度がしきい値(80%)未満のため未確定"')
  })

  test('しきい値を取得できない間と、対象外・未判定の行は通常の見た目にする', async () => {
    const low = { ...listJob, postStatus: 'announce', postStatusProbability: 0.3 } as const
    const loading = await renderList([low])
    expect(statusCell(loading)).toContain('>告知</td>')
    expect(statusCell(loading)).not.toContain('text-muted-foreground')
    expect(statusCell(loading)).not.toContain('title=')
    const ignored = await renderList([{ ...low, status: 'ignored' }], 0.9)
    expect(statusCell(ignored)).toContain('>却下</td>')
    expect(statusCell(ignored)).not.toContain('text-muted-foreground')
    const unknown = await renderList([{ ...low, postStatus: null, postStatusProbability: null }], 0.9)
    expect(statusCell(unknown)).toContain('>—</td>')
    expect(statusCell(unknown)).not.toContain('text-muted-foreground')
  })
})
