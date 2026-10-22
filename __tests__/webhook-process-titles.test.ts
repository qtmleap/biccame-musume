import { expect, spyOn, test } from 'bun:test'
import { resolveWebhookJob } from '@api/services/webhook-admin'
import { TITLE_MAX_TOKENS, TITLE_MODEL } from '@api/services/webhook-title'
import { titleSystem } from '@biccame/shared/event-detect/title'
import {
  DEFAULT_TITLE,
  processWebhookJob,
  TITLE_BASE_URL,
  TITLE_TOKEN,
  titleHarness,
  titleToolInput,
  toolReply
} from './fixtures/webhook-process'

test('automatic registration falls back to the current title and still registers when the title request fails or is unusable', async () => {
  const harness = await titleHarness('webhook-title-fallback-test')
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const { ai, postOf, run } = harness
    // 失敗の形と検査違反。どれも登録は成功し、題は今の形のまま、理由に title_fallback が付く。
    const failures: [string, () => Response | Promise<Response>][] = [
      ['HTTP 429', () => new Response('{"error":"rate_limited"}', { status: 429 })],
      ['HTTP 500', () => new Response('{"error":"internal"}', { status: 500 })],
      ['HTTP 401', () => new Response('{"error":"unauthorized"}', { status: 401 })],
      ['通信エラー', () => Promise.reject(new TypeError('synthetic network failure'))],
      ['JSON でない応答', () => new Response('not json', { status: 200 })],
      ['tool_use が無い', () => Response.json({ content: [{ type: 'text', text: '題は「ハロウィン名刺」です' }] })],
      ['content が無い', () => Response.json({ type: 'message' })],
      ['title が文字列でない', () => toolReply({ title: 3 })],
      ['title が空', () => toolReply({ title: '' })],
      ['input に title が無い', () => toolReply({ name: 'ハロウィン名刺' })],
      ['キャラ名入り', titleToolInput('アキバたんのハロウィン名刺')],
      ['店舗名入り', titleToolInput('AKIBA店ハロウィン名刺')],
      ['括弧入り', titleToolInput('ハロウィン名刺（限定）')],
      ['31 文字', titleToolInput('あ'.repeat(31))],
      ['説明語入り', titleToolInput('ハロウィン名刺配布')],
      ['複数行', titleToolInput('ハロウィン\n名刺')]
    ]
    for (const [index, [label, reply]] of failures.entries()) {
      ai.title.reply = reply
      const before = ai.titles.length
      const { job, title } = await run(postOf(12 + index))
      expect(job.status, label).toBe('registered')
      // 通信は 1 回だけ（再試行しない）
      expect(ai.titles, label).toHaveLength(before + 1)
      expect(title, label).toBe(DEFAULT_TITLE)
      expect(job.candidate?.title, label).toBe(DEFAULT_TITLE)
      expect(job.reasons, label).toContain('title_fallback')
      expect(job.reasons, label).not.toContain('title_generated')
    }
    // 理由の種類だけを警告に出し、本文・題・トークン・エラー本文は出さない
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('falling back to the default title')
    for (const secret of ['限定名刺をどなたでも', 'synthetic network failure', TITLE_TOKEN, 'anthropic.example.test'])
      expect(logged, secret).not.toContain(secret)
    // 直った後は同じ流れで題が付く
    ai.title.reply = titleToolInput('夏名刺')
    const recovered = await run(postOf(12 + failures.length))
    expect(recovered.title).toBe('夏名刺')
    expect(recovered.job.reasons).toContain('title_generated')
  } finally {
    warn.mockRestore()
    await harness.dispose()
  }
}, 120000)

test('without ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN nothing is sent and registration still succeeds with the current title', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    // 両方未登録、片方だけ未登録、空文字はどれも未設定として扱う（登録前のステージング・本番でも登録は止まらない）
    const cases: [string, Record<string, string>][] = [
      ['どちらも未登録', {}],
      ['URL だけ未登録', { ANTHROPIC_AUTH_TOKEN: TITLE_TOKEN }],
      ['トークンだけ未登録', { ANTHROPIC_BASE_URL: TITLE_BASE_URL }],
      ['空文字', { ANTHROPIC_BASE_URL: '', ANTHROPIC_AUTH_TOKEN: '' }]
    ]
    for (const [index, [label, secrets]] of cases.entries()) {
      const harness = await titleHarness(`webhook-title-not-configured-test-${index}`, { secrets: false })
      try {
        Object.assign(harness.env, secrets)
        const { job, title } = await harness.run(harness.postOf(12))
        expect(job.status, label).toBe('registered')
        expect(title, label).toBe(DEFAULT_TITLE)
        expect(job.reasons, label).toContain('title_fallback')
        // タイトル用の通信は一度も行われない
        expect(harness.ai.titles, label).toHaveLength(0)
        // Clef の判定は通常どおり行われる
        expect(harness.ai.clefCalls, label).toHaveLength(1)
        expect(
          warn.mock.calls.map((call) => String(call[0])),
          label
        ).toContain('Title generation is not configured')
      } finally {
        await harness.dispose()
      }
    }
  } finally {
    warn.mockRestore()
  }
}, 120000)

test('held jobs without a candidate and ignored jobs never send a title request, even when an admin registers the held one by hand', async () => {
  const harness = await titleHarness('webhook-title-skipped-test')
  try {
    const { ai, postOf, run } = harness
    // 保留（開始日が書かれていない投稿）。登録候補（candidate）が作れないので題を付ける材料が無く、呼ばない
    const held = await run(postOf(20, '限定名刺をどなたでも配布します'))
    expect(held.job.status).toBe('held')
    // 無視（キーワードの無い投稿）
    const ignored = await run(postOf(21, 'こんにちは'))
    expect(ignored.job.status).toBe('ignored')
    // Clef は呼ばれるが、タイトル用の通信は一度も無い
    expect(ai.clefCalls).toHaveLength(2)
    expect(ai.titles).toHaveLength(0)
    for (const job of [held.job, ignored.job]) {
      expect(job.reasons).not.toContain('title_generated')
      expect(job.reasons).not.toContain('title_fallback')
    }
    // 保留のまま管理画面で補完して登録しても（人が編集）、タイトル用の通信は無い
    expect(held.job.candidate).toBeNull()
    const manual = {
      category: 'limited_card' as const,
      title: '手入力の名刺',
      stores: ['akiba' as const],
      characterIds: ['akiba' as const],
      startDate: '2026-10-20T00:00:00+09:00',
      referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce' as const, url: held.job.sourceUrl }],
      conditions: [{ uuid: crypto.randomUUID(), type: 'everyone' as const }],
      isPreliminary: false,
      isVerified: true,
      shouldTweet: false,
      uuid: held.job.eventUUID
    }
    await resolveWebhookJob(harness.env, held.job.postId, { action: 'register', event: manual })
    await processWebhookJob(harness.env, held.job.postId, { titleFetcher: ai.fetcher })
    expect(await harness.env.DB.prepare('SELECT title FROM events').first<string>('title')).toBe('手入力の名刺')
    expect(ai.titles).toHaveLength(0)
  } finally {
    await harness.dispose()
  }
}, 60000)

test('the title request has the right URL, headers, model and tool, and carries the D1 examples and the forbidden words; an empty D1 still generates', async () => {
  const harness = await titleHarness('webhook-title-prompt-test')
  try {
    const { env, ai, postOf, run } = harness
    // D1 に何も無い（イベント 0 件）→ 失敗扱いにせず、空の手本で生成する（この方針をここで固定する）
    const first = await run(postOf(12))
    expect(first.title).toBe('ハロウィン名刺')
    expect(first.job.reasons).toContain('title_generated')
    expect(ai.titles).toHaveLength(1)
    expect(ai.titles[0].body.system).toBe(
      titleSystem({ top: [], byCategory: { limited_card: [], regular_card: [], ackey: [], other: [] } })
    )
    // D1 に手本を入れる（登録の重複にならないよう、店舗なし。規則に合わない古い登録も混ぜる）
    const now = '2026-10-01 00:00:00'
    const insert = env.DB.prepare(
      'INSERT INTO events (id,category,title,start_date,is_verified,is_preliminary,created_at,updated_at) VALUES (?,?,?,?,1,0,?,?)'
    )
    const examples: [string, string][] = [
      ['缶バッジで繋ぐビッカメ娘旅', 'other'],
      ['缶バッジで繋ぐビッカメ娘旅', 'other'],
      ['誕生日限定名刺', 'limited_card'],
      ['1月限定名刺配布開始', 'limited_card'],
      ['新東たんの名刺', 'limited_card'],
      ['ハロウィン名刺（アキバたん）', 'limited_card']
    ]
    await env.DB.batch(
      examples.map(([title, category]) => insert.bind(crypto.randomUUID(), category, title, now, now, now))
    )
    const post = postOf(13)
    const second = await run(post)
    expect(second.job.status).toBe('registered')
    expect(ai.titles).toHaveLength(2)
    const call = ai.titles[1]
    // 宛先とヘッダ（Authorization と x-api-key の両方。末尾のスラッシュは除く）
    expect(call.url).toBe('https://anthropic.example.test/v1/messages')
    expect(call.headers['content-type']).toBe('application/json')
    expect(call.headers['anthropic-version']).toBe('2023-06-01')
    expect(call.headers.authorization).toBe(`Bearer ${TITLE_TOKEN}`)
    expect(call.headers['x-api-key']).toBe(TITLE_TOKEN)
    // モデル・トークン上限・answer ツール・tool_choice（CLI の callTool と同じ形）
    expect(call.body.model).toBe(TITLE_MODEL)
    expect(TITLE_MODEL).toBe('claude-haiku-5-5')
    expect(call.body.max_tokens).toBe(TITLE_MAX_TOKENS)
    expect(call.body.tool_choice).toEqual({ type: 'auto' })
    expect(call.body.tools).toEqual([
      {
        name: 'answer',
        description: '質問への回答を返す',
        input_schema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'このイベントのタイトル。規則に沿った短い名詞句だけを入れる（説明や括弧は付けない）'
            }
          },
          required: ['title'],
          additionalProperties: false
        }
      }
    ])
    // system: CLI と同じ命名の指示 + D1 の手本（規則に合うものだけ。件数つき）。入れてはいけない語ではなく手本の題が入る
    const { system } = call.body
    expect(system).toContain('命名の規則:')
    expect(system).toContain('- 缶バッジで繋ぐビッカメ娘旅（2）')
    expect(system).toContain('- 誕生日限定名刺（1）')
    expect(system).toContain(
      '- other（アクスタ・缶バッジ・ステッカー・ポストカード・ギフトカードなど名刺とアクキー以外）: 缶バッジで繋ぐビッカメ娘旅'
    )
    for (const bad of ['1月限定名刺配布開始', '新東たんの名刺', 'ハロウィン名刺（アキバたん）'])
      expect(system, bad).not.toContain(bad)
    for (const term of ['アキバたん', 'AKIBA店']) expect(system, term).not.toContain(term)
    // user の state: この店舗のキャラ名・店舗名（入れてはいけない語）・カテゴリ・開始日・投稿本文
    const [message] = call.body.messages
    expect(message.content).toContain('入れてはいけない語（この店舗のキャラ名・店舗名）:')
    for (const term of ['アキバたん', 'AKIBA店']) expect(message.content, term).toContain(term)
    expect(message.content).toContain('カテゴリ: limited_card（期間限定・数量限定・記念の名刺）')
    expect(message.content).toContain('開始日: 2026-10-13（10月）')
    expect(message.content).toContain(`投稿本文:\n${post.text}`)
    // 抽出した配布物の名前（item）も渡す。無いときの「事前に抽出したものはありません」にはならない
    expect(message.content).toContain('この配布物の題だけを付ける')
    expect(message.content).toContain('）: アキバたん 限定名刺配布\n')
    expect(message.content).not.toContain('事前に抽出したものはありません')
  } finally {
    await harness.dispose()
  }
}, 60000)
