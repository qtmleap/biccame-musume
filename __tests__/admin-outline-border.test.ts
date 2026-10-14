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
    // 更新・既存へ紐付け・対象外にする・失敗した処理を再実行・AI で判定し直す・通知を再送と、紐付けダイアログのキャンセル。
    ['workers/web/src/app/components/admin/webhook-job-detail.tsx', 7],
    // 更新・bot 設定・条件をクリア・前へ・次へ。
    ['workers/web/src/app/components/admin/webhook-job-list.tsx', 5],
    // 接続確認と受信履歴。
    ['workers/web/src/app/components/admin/bot-management.tsx', 2]
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

  test('shadcn の Button（components/ui）は編集せず、outline の枠線色は呼び出し側で決める', async () => {
    const source = await Bun.file('workers/web/src/app/components/ui/button.tsx').text()
    expect(source).not.toContain(BORDER_CLASS)
  })
})
