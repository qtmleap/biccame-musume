import { describe, expect, test } from 'bun:test'
import ts from 'typescript'

// outline の Button は枠線色を持たず、既定（currentColor）で黒く出る。components/ui/** は触らないため、
// 呼び出し側の className で共通テーマ色（border-card-border）を指定する。描画テストでは見えない
// 閉じたダイアログの中のボタンも含め、ソースの JSX から確かめる。
const BORDER_CLASS = 'border-card-border'

const stringValue = (node: ts.JsxAttribute['initializer'] | undefined): string | undefined => {
  if (node === undefined) return undefined
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression))
    return node.expression.text
  return undefined
}

/** variant='outline' の Button ごとの className（文字列リテラルのみ。無ければ空文字、式のときは undefined）。 */
const outlineButtonClasses = async (path: string): Promise<(string | undefined)[]> => {
  const source = ts.createSourceFile(path, await Bun.file(path).text(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const classes: (string | undefined)[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(source) === 'Button') {
        const attributes = node.attributes.properties.filter(ts.isJsxAttribute)
        const attribute = (name: string) => attributes.find((entry) => entry.name.getText(source) === name)
        if (stringValue(attribute('variant')?.initializer) === 'outline') {
          const className = attribute('className')
          classes.push(className === undefined ? '' : stringValue(className.initializer))
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return classes
}

describe('管理画面の outline ボタンの枠線色', () => {
  test.each([
    // 更新・対象外にする・再実行・通知を再送。
    ['workers/web/src/app/components/admin/webhook-job-detail.tsx', 4],
    // 既存へ紐付け・検索候補の再取得・キャンセル。
    ['workers/web/src/app/components/admin/webhook-event-link-dialog.tsx', 3],
    // キャンセル・別のイベントを選ぶ(連携先の提案の確認)。
    ['workers/web/src/app/components/admin/webhook-event-link-confirm.tsx', 2],
    // 保存済みプロンプトの再取得。
    ['workers/web/src/app/components/admin/webhook-prompt-dialog.tsx', 1],
    // 更新・bot 設定・前へ・次へ。
    ['workers/web/src/app/components/admin/webhook-job-list.tsx', 4],
    // 条件をクリア。
    ['workers/web/src/app/components/admin/webhook-filter-toolbar.tsx', 1],
    // 接続確認と受信履歴。
    ['workers/web/src/app/components/admin/bot-management.tsx', 2],
    // バッジの所持数ランキング。
    ['workers/web/src/app/routes/admin/badges/index.tsx', 1]
  ] as const)('%sの outline ボタンはすべて %i 個とも border-card-border を指定する', async (path, count) => {
    const classes = await outlineButtonClasses(path)
    expect(classes).toHaveLength(count)
    for (const className of classes) {
      expect(className).toBeDefined()
      expect(className?.split(/\s+/)).toContain(BORDER_CLASS)
    }
  })

  test('確認ダイアログのキャンセル（AlertDialogCancel は variant を書かずに outline になる）も枠線色を指定する', async () => {
    const path = 'workers/web/src/app/components/admin/bot-action-confirmation.tsx'
    const source = ts.createSourceFile(
      path,
      await Bun.file(path).text(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    )
    const cancels: (string | undefined)[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (node.tagName.getText(source) === 'AlertDialogCancel') {
          const className = node.attributes.properties
            .filter(ts.isJsxAttribute)
            .find((entry) => entry.name.getText(source) === 'className')
          cancels.push(className === undefined ? '' : stringValue(className.initializer))
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(cancels).toHaveLength(1)
    expect(cancels[0]?.split(/\s+/)).toContain(BORDER_CLASS)
  })

  test('index.css の outline 統一ルールは <a> として描画される Button（asChild + Link）にも当たる（通常と hover の両方）', async () => {
    const css = await Bun.file('workers/web/src/app/index.css').text()
    const anchorSelector = 'a[data-variant="outline"][data-slot="button"]'
    // コメントを除き、`{` `}` で区切った塊ごとにセレクターリストとして分解する。
    const selectorLists = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/[{}]/)
      .map((chunk) => chunk.split(',').map((entry) => entry.trim()))
    const base = selectorLists.find((list) => list.includes('button[data-variant="outline"][data-slot]'))
    const hover = selectorLists.find((list) => list.includes('button[data-variant="outline"][data-slot]:hover'))
    expect(base).toContain(anchorSelector)
    expect(hover).toContain(`${anchorSelector}:hover`)
    // <a> は button と別のルールにはせず、同じ見た目（transparent の border + outline）になる。
    expect(base).toContain('[data-slot="select-trigger"]')
    // data-slot="button" に限定し、バッジなど他の data-slot を巻き込まない。
    expect(css).not.toContain('a[data-variant="outline"][data-slot]')
  })

  test('index.css の outline 統一ルールは PaginationLink の現在ページ（data-variant を持たない）にも当たり、非アクティブには当たらない', async () => {
    const css = await Bun.file('workers/web/src/app/index.css').text()
    const activeSelector = 'a[data-slot="pagination-link"][data-active="true"]'
    const selectorLists = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/[{}]/)
      .map((chunk) => chunk.split(',').map((entry) => entry.trim()))
    const base = selectorLists.find((list) => list.includes('button[data-variant="outline"][data-slot]'))
    const hover = selectorLists.find((list) => list.includes('button[data-variant="outline"][data-slot]:hover'))
    expect(base).toContain(activeSelector)
    expect(hover).toContain(`${activeSelector}:hover`)
    // data-active なしで pagination-link を単独で指す広いセレクターは置かない（ghost の非アクティブに枠が付くため）。
    const everySelector = selectorLists.flat()
    const bareLinkSelectors = everySelector.filter(
      (selector) => selector.includes('[data-slot="pagination-link"]') && !selector.includes('[data-active="true"]')
    )
    expect(bareLinkSelectors).toEqual([])
  })

  test('受信詳細の操作ボタン行は色指定のない border-b（黒い横線）を持たない', async () => {
    const source = await Bun.file('workers/web/src/app/components/admin/webhook-job-detail.tsx').text()
    expect(source).not.toContain('border-b pb-5')
    expect(source).toContain("className='mb-6 flex flex-wrap gap-2'")
  })

  test('shadcn の Button（components/ui）は編集せず、outline の枠線色は呼び出し側で決める', async () => {
    const source = await Bun.file('workers/web/src/app/components/ui/button.tsx').text()
    expect(source).not.toContain(BORDER_CLASS)
  })
})
