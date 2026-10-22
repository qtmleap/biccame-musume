import { describe, expect, test } from 'bun:test'
import { anchorsOf, listJob, renderDetail } from './fixtures/webhook-management'

describe('受信詳細の先頭ボタン（補完して登録 / 編集）', () => {
  // どちらも <a> で出る。ボタンの見た目は data-slot="button" の a から取る。
  const registerAnchor = (markup: string) => anchorsOf(markup).find((anchor) => anchor.includes('補完して登録'))
  const editAnchor = (markup: string) => anchorsOf(markup).find((anchor) => anchor.endsWith('編集</a>'))
  const firstButton = (markup: string) =>
    anchorsOf(markup).find((anchor) => anchor.includes('bg-brand text-brand-foreground'))
  const hrefOf = (anchor: string | undefined) => {
    const href = anchor?.match(/href="([^"]*)"/)?.[1]
    if (href === undefined) throw new Error('Missing href')
    return new URL(href.replaceAll('&amp;', '&'), 'https://example.invalid')
  }

  test('イベント作成ページ（/admin/events/new）へのリンクで、元投稿URLと下書きを初期値に渡す', async () => {
    const anchor = registerAnchor(
      await renderDetail({
        ...listJob,
        draft: {
          characterIds: [],
          title: '新東たん アクリルスタンド配布',
          category: 'acsta',
          stores: ['shintou'],
          conditions: []
        }
      })
    )
    expect(anchor).toContain('data-slot="button"')
    const url = hrefOf(anchor)
    expect(url.pathname).toBe('/admin/events/new')
    expect(url.searchParams.get('referenceUrls')).toBe(listJob.sourceUrl)
    expect(url.searchParams.get('title')).toBe('新東たん アクリルスタンド配布')
    expect(url.searchParams.get('category')).toBe('acsta')
    expect(url.searchParams.get('stores')).toBe('shintou')
  })

  test('保留・対象外・失敗は無効にならず、「補完して登録」のリンクとして出る', async () => {
    for (const status of ['held', 'ignored', 'failed'] as const) {
      const markup = await renderDetail({ ...listJob, status })
      const anchor = registerAnchor(markup)
      expect(anchor).toBeDefined()
      expect(anchor).toContain('href="/admin/events/new?')
      // class の disabled: 修飾子とは区別し、属性としての disabled / aria-disabled が無いことを見る。
      expect(anchor).not.toMatch(/\sdisabled[\s=>]/)
      expect(anchor).not.toContain('aria-disabled')
      expect(editAnchor(markup)).toBeUndefined()
    }
  })

  test('登録済みでイベントIDがあれば、同じ位置のボタンが「編集」になり、編集画面へ直接向かう', async () => {
    const eventId = '550e8400-e29b-41d4-a716-4466554400aa'
    const markup = await renderDetail({ ...listJob, status: 'registered', eventId })
    const anchor = editAnchor(markup)
    expect(anchor).toContain(`href="/admin/events/${eventId}/edit"`)
    expect(anchor).toContain('data-slot="button"')
    expect(anchor).toContain('bg-brand text-brand-foreground')
    expect(anchor).toContain('lucide-pencil')
    expect(anchor).not.toMatch(/\sdisabled[\s=>]/)
    // ラベルに対象名は足さず、同じ描画に「補完して登録」は出さない。
    expect(anchor).toContain('編集</a>')
    expect(anchor).not.toContain(listJob.eventTitle)
    expect(markup).not.toContain('補完して登録')
    // 位置と見た目は変えない。先頭のブランド色ボタンがそのまま「編集」になる。
    expect(firstButton(markup)).toBe(anchor)
    // 登録イベントの行内・判定欄のリンクは、編集ではなくイベント詳細へ向けたまま。
    expect(markup).toContain(`href="/events/${eventId}"`)
  })

  test('登録済みでもイベントIDが無ければ従来どおり「補完して登録」に倒す', async () => {
    const markup = await renderDetail({ ...listJob, status: 'registered', eventId: null, eventTitle: null })
    expect(registerAnchor(markup)).toContain('href="/admin/events/new?')
    expect(editAnchor(markup)).toBeUndefined()
  })

  test('登録済みの候補を先頭にすると「編集」、保留の候補を先頭にすると「補完して登録」になる', async () => {
    const registered = {
      ...listJob,
      item: 'ハロウィンアクキー',
      storeKey: 'akiba',
      status: 'registered' as const,
      eventUUID: '550e8400-e29b-41d4-a716-446655440002',
      eventId: '550e8400-e29b-41d4-a716-4466554400bb'
    }
    const held = { ...listJob, item: 'ハロウィン限定名刺', storeKey: 'akiba', status: 'held' as const }
    const registeredFirst = await renderDetail({ ...listJob, candidates: [registered, held] })
    expect(editAnchor(registeredFirst)).toContain(`href="/admin/events/${registered.eventId}/edit"`)
    expect(registerAnchor(registeredFirst)).toBeUndefined()
    const heldFirst = await renderDetail({ ...listJob, candidates: [held, registered] })
    expect(registerAnchor(heldFirst)).toContain('href="/admin/events/new?')
    expect(editAnchor(heldFirst)).toBeUndefined()
  })

  test('識別されたイベントが複数あるとき、選択中（先頭）の候補の下書きを初期値にする', async () => {
    const candidates = [
      {
        ...listJob,
        item: '名刺',
        storeKey: 'akiba',
        draft: { characterIds: [], title: 'ハロウィン限定名刺', stores: ['akiba'], conditions: [] }
      },
      {
        ...listJob,
        item: 'アクキー',
        storeKey: 'akiba',
        eventUUID: '550e8400-e29b-41d4-a716-446655440002',
        draft: { characterIds: [], title: 'ハロウィンアクキー', stores: ['shintou'], conditions: [] }
      }
    ]
    const url = hrefOf(registerAnchor(await renderDetail({ ...listJob, candidates })))
    // 登録候補が無く下書きだけのとき、題は下書きの定型題（店舗名・「配布」入り）ではなく、選択中の候補の抽出名にする。
    expect(url.searchParams.get('title')).toBe('名刺')
    expect(url.searchParams.get('stores')).toBe('akiba')
  })
})

describe('識別されたイベント一覧の見た目', () => {
  const candidates = ['名刺', 'アクキー', 'コースター'].map((item, index) => ({
    ...listJob,
    item,
    storeKey: 'akiba',
    eventUUID: `550e8400-e29b-41d4-a716-44665544010${index}`
  }))
  const listOf = async () => {
    const markup = await renderDetail({ ...listJob, candidates })
    const section = markup.match(/<section[^>]*aria-label="識別されたイベント"[^>]*>.*?<\/section>/)?.[0]
    if (section === undefined) throw new Error('Missing candidate section')
    return section
  }

  test('行は区切り線ではなく gap で離し、未選択行に影（ring）を付けない', async () => {
    const section = await listOf()
    const ul = section.match(/<ul\b[^>]*class="([^"]*)"/)?.[1]
    expect(ul).toContain('flex-col')
    expect(ul).toContain('gap-1.5')
    expect(ul).not.toContain('divide-')
    const items = [...section.matchAll(/<li\b[^>]*class="([^"]*)"/g)].map((match) => match[1])
    expect(items).toHaveLength(3)
    // 選択中は ring-1 で縁取り、未選択は ring と shadow を明示的に消す。
    expect(items[0]).toContain('ring-1')
    for (const item of items.slice(1)) {
      expect(item).toContain('ring-0')
      expect(item).toContain('shadow-none')
      expect(item).not.toContain('ring-1')
    }
    // キーボード操作の目印は影の ring ではなく outline にする。
    for (const item of items) {
      expect(item).toContain('has-[button:focus-visible]:outline-2')
      expect(item).not.toContain('has-[button:focus-visible]:ring')
    }
  })
})

describe('受信詳細の「判定・イベント登録」の行', () => {
  const sectionOf = (markup: string) => {
    const section = markup.match(/<h2\b[^>]*>判定・イベント登録<\/h2>[\s\S]*?<\/section>/)?.[0]
    if (section === undefined) throw new Error('Missing judgement section')
    return section
  }
  const labelsOf = (section: string) => [...section.matchAll(/<dt\b[^>]*>([^<]*)<\/dt>/g)].map((match) => match[1])

  test('Clef の回答の表と重なるスコア・店舗・ビッカメ娘の行は出さず、判定状態の次に判定モデルが続く', async () => {
    // 登録候補・下書き・信頼度があっても、この節では回答の表の質問結果を重ねて出さない。
    const section = sectionOf(
      await renderDetail({
        ...listJob,
        confidence: 0.861,
        candidate: null,
        draft: { characterIds: ['akiba'], title: 'ハロウィン限定名刺', stores: ['akiba'], conditions: [] }
      })
    )
    const labels = labelsOf(section)
    for (const label of ['イベント判定スコア', '開催・配布店舗', '対象ビッカメ娘']) {
      expect(labels).not.toContain(label)
      expect(section).not.toContain(label)
    }
    expect(section).not.toContain('86.1%')
    expect(labels[0]).toBe('判定状態')
    expect(labels[1]).toBe('判定モデル')
    expect(labels).toContain('プロンプトバージョン')
    expect(labels).toContain('処理回数')
    expect(labels).toContain('登録イベント')
  })
})
