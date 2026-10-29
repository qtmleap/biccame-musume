import { describe, expect, test } from 'bun:test'
import { questionLabel } from '@biccame/shared/event-detect/answer-view'
import { FIELD_THRESHOLD_KEYS } from '@biccame/shared/event-detect/detection'
import { EDITABLE_FIELD_THRESHOLD_KEYS } from '@/components/admin/field-threshold-form'
import { discordStatus, renderSettings, savedThresholds, settingMarkup } from './fixtures/bot-configuration'

// 項目別の12項目と判定全体の3つのラベル（行のクラスを調べるときに使う）。
const EDITABLE_LABELS: readonly string[] = [
  ...EDITABLE_FIELD_THRESHOLD_KEYS.map((key) => questionLabel(key)),
  'イベント判定の登録閾値',
  '必須項目の選択閾値',
  '対象外判定の閾値'
]

describe('項目別のしきい値', () => {
  const percentOf = (value: number) => String(Math.round(value * 1000) / 10)

  test('12項目が、回答表の質問名と同じラベルで、質問の順に、保存済みの値を%で入力欄に出す', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    // 保存・状態の形は12キー。画面の入力欄も同じ12項目（編集できるキーは FIELD_THRESHOLD_KEYS と同じ）。
    expect(FIELD_THRESHOLD_KEYS).toHaveLength(12)
    expect([...EDITABLE_FIELD_THRESHOLD_KEYS]).toEqual([...FIELD_THRESHOLD_KEYS])
    // 項目別の12項目に、判定全体の3つ（登録・必須項目の選択・対象外）を足した15個が入力欄。
    expect(markup.match(/data-slot="input"/g)).toHaveLength(15)
    const labels = EDITABLE_FIELD_THRESHOLD_KEYS.map((key) => questionLabel(key))
    expect(labels).toEqual([
      '状態',
      '配布物',
      '開催・配布店舗',
      '開催・配布店舗の確認',
      '対象ビッカメ娘',
      '対象ビッカメ娘の確認',
      '開始日',
      '終了日',
      '配布数',
      '配布条件',
      '購入額',
      '入金・チャージ額'
    ])
    // 並びは質問の順（項目別の見出しより後で、この順に出る）。
    const positions = labels.map((label) => markup.indexOf(`>${label}</dt>`))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(positions[0]).toBeGreaterThan(markup.indexOf('項目別の選択閾値'))
    for (const key of EDITABLE_FIELD_THRESHOLD_KEYS) {
      const label = questionLabel(key)
      const row = settingMarkup(markup, label)
      expect(row, key).toContain(`aria-label="${label}の閾値（%）"`)
      expect(row, key).toContain(`value="${percentOf(savedThresholds[key])}"`)
      expect(row, key).toContain('inputMode="decimal"')
      // 数値はラベルと同じフォント（等幅だと数字が上に寄る）の右寄せ。高さ32px・文字14pxで md でも拡大せず、行の中身は上下中央。
      expect(row, key).toContain('h-8 w-20 text-right text-sm tabular-nums')
      expect(row, key).not.toContain('font-mono')
      expect(row, key).not.toContain('md:h-10')
      expect(row, key).not.toContain('md:w-28')
      expect(row, key).not.toContain('md:text-base')
      expect(row, key).toContain('flex items-center')
      expect(row, key).not.toContain('aria-invalid="true"')
      expect(row, key).not.toContain('role="alert"')
    }
    // 状態は共通値より低い 80%、購入額は 82.5%、店舗・娘は 92% / 72% のように、行ごとに別の値が入る。
    expect(settingMarkup(markup, '状態')).toContain('value="80"')
    expect(settingMarkup(markup, '購入額')).toContain('value="82.5"')
    expect(settingMarkup(markup, '開催・配布店舗')).toContain('value="92"')
    expect(settingMarkup(markup, '対象ビッカメ娘')).toContain('value="72"')
    expect(settingMarkup(markup, '入金・チャージ額')).toContain('value="97"')
  })

  test('店舗・娘の行には、確認を省く条件を説明する補足を出し、確認の行には「はい」の条件を出す。他の項目には出さない', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const skip = 'この確率以上なら確認を省いて確定。未満なら「確認」の質問で決めます。'
    const yes = '「はい」の確率がこの値以上なら確定します。'
    for (const [label, key, note] of [
      ['開催・配布店舗', 'store', skip],
      ['開催・配布店舗の確認', 'store_confirm', yes],
      ['対象ビッカメ娘', 'character', skip],
      ['対象ビッカメ娘の確認', 'character_confirm', yes]
    ] as const) {
      const row = settingMarkup(markup, label)
      expect(row, label).toContain(note)
      expect(row, label).toContain(`aria-describedby="field-threshold-${key}-note"`)
      expect(row, label).toContain(`id="field-threshold-${key}-note"`)
    }
    expect(markup.split(skip)).toHaveLength(3)
    expect(markup.split(yes)).toHaveLength(3)
    for (const label of ['状態', '配布物', '開始日', '終了日', '配布数', '配布条件', '購入額', '入金・チャージ額'])
      expect(settingMarkup(markup, label), label).not.toContain('aria-describedby')
  })

  test('行は上揃えにし、ラベルは入力欄の高さの中で中央揃えにする（補足文・エラー文のある行でラベルがずれない）', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const rows = [...markup.matchAll(/<div class="grid[^"]*"><dt class="([^"]*)">([^<]*)<\/dt>/g)]
    const thresholdRows = rows.filter(([, , label]) => label.includes('閾値') || EDITABLE_LABELS.includes(label))
    expect(thresholdRows.length).toBeGreaterThanOrEqual(15)
    for (const [, labelClass, label] of thresholdRows) {
      expect(labelClass, label).toContain('sm:flex sm:h-8 sm:items-center')
    }
    const gridClasses = [...markup.matchAll(/<div class="(grid[^"]*)"><dt[^>]*>([^<]*)<\/dt>/g)]
    for (const [, gridClass, label] of gridClasses.filter(([, , text]) => EDITABLE_LABELS.includes(text)))
      expect(gridClass, label).toContain('sm:items-start')
  })

  test('判定全体の3つは読み取り専用の表示ではなく、保存済みの値を%で入れた入力欄になる', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const expected = [
      ['イベント判定の登録閾値', '90'],
      ['必須項目の選択閾値', '80'],
      ['対象外判定の閾値', '10']
    ] as const
    for (const [label, percent] of expected) {
      const row = settingMarkup(markup, label)
      expect(row, label).toContain('<input')
      expect(row, label).toContain('data-slot="input"')
      expect(row, label).toContain(`aria-label="${label}（%）"`)
      expect(row, label).toContain(`value="${percent}"`)
      expect(row, label).toContain('inputMode="decimal"')
      // 項目別と同じ見た目（ラベルと同じフォントの右寄せ、高さ32px・文字14pxで md でも拡大せず、行の中身は上下中央）。
      expect(row, label).toContain('h-8 w-20 text-right text-sm tabular-nums')
      expect(row, label).not.toContain('font-mono')
      expect(row, label).not.toContain('md:h-10')
      expect(row, label).not.toContain('md:text-base')
      expect(row, label).toContain('flex items-center')
      expect(row, label).not.toContain('disabled=""')
      expect(row, label).not.toContain('aria-invalid="true"')
      expect(row, label).not.toContain('role="alert"')
      // 読み取り専用の表示（90.0% のような 1 桁固定の文字列）は残さない。
      expect(row, label).not.toMatch(/\d+\.0%/)
    }
    // 3つの入力欄は、項目別の見出しより前（判定モデルの直後）に並ぶ。
    const heading = markup.indexOf('項目別の選択閾値')
    for (const [label] of expected) expect(markup.indexOf(`>${label}</dt>`)).toBeLessThan(heading)
    expect(markup.indexOf('>イベント判定の登録閾値</dt>')).toBeLessThan(markup.indexOf('>必須項目の選択閾値</dt>'))
    expect(markup.indexOf('>必須項目の選択閾値</dt>')).toBeLessThan(markup.indexOf('>対象外判定の閾値</dt>'))
  })

  test('必須項目の選択閾値の入力欄の近くに、項目別が優先されることを説明する補足を出す', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const note =
      '項目別の閾値を保存済みの場合、各項目は項目別の値が優先されます。ここは項目別の閾値が未保存のときの既定値に使われます。'
    const row = settingMarkup(markup, '必須項目の選択閾値')
    expect(row).toContain(note)
    // 件数のしきい値は環境変数だけで決まり、この入力欄とは連動しない。
    expect(row).not.toContain('配布物の種類数')
    // 入力欄の説明として関連付ける。
    expect(row).toContain('aria-describedby="field-threshold-choiceThreshold-note"')
    expect(row).toContain('id="field-threshold-choiceThreshold-note"')
    // 補足は必須項目の選択閾値の行だけに出す。
    expect(markup.split(note)).toHaveLength(2)
    expect(settingMarkup(markup, 'イベント判定の登録閾値')).not.toContain('aria-describedby')
    expect(settingMarkup(markup, '対象外判定の閾値')).not.toContain('aria-describedby')
  })

  test('注意書きに、過去の判定結果は変わらず再判定が必要であることを出す', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    expect(markup).toContain(
      'しきい値を変えても、過去の判定結果は変わりません。反映するには「再実行」を実行してください。'
    )
  })

  test('変更前は保存が無効で、ボタンは常に同じフッターに出ている', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    expect(markup).toMatch(/<footer[^>]*><button[^>]*disabled=""[^>]*>保存<\/button><\/footer>/)
  })

  test('outline のボタンは枠線に共通テーマ色（border-card-border）を指定する', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const outlined = [...markup.matchAll(/<(?:button|a)\b[^>]*data-variant="outline"[^>]*>/g)].map((match) => match[0])
    // 接続確認（button）と受信履歴（asChild の a）。
    expect(outlined).toHaveLength(2)
    for (const tag of outlined) expect(tag).toContain('border-card-border')
  })

  test('左上の戻るリンクは従来どおり管理画面（/admin）を指す', async () => {
    const markup = await renderSettings(discordStatus('valid'), true)
    const anchors = [...markup.matchAll(/<a\b[^>]*>.*?<\/a>/g)].map((match) => match[0])
    const back = anchors.find((anchor) => anchor.includes('管理画面に戻る'))
    expect(back).toBeDefined()
    expect(back).toContain('href="/admin"')
    expect(markup).not.toContain('受信履歴に戻る')
    // 下の「受信履歴」ボタンは受信履歴（/admin/webhooks）への入口として残る。
    const history = anchors.find((anchor) => anchor.includes('受信履歴'))
    expect(history).toBeDefined()
    expect(history).toContain('href="/admin/webhooks"')
  })
})
