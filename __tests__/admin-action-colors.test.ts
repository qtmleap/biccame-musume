import { describe, expect, test } from 'bun:test'
import ts from 'typescript'

const brandClass = 'bg-brand text-brand-foreground hover:bg-brand/90'

const buttonClasses = async (path: string): Promise<string[]> => {
  const source = ts.createSourceFile(path, await Bun.file(path).text(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const classes: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'Button') {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute)
      const variant = attributes.find((attribute) => attribute.name.getText(source) === 'variant')
      if (variant === undefined) {
        const className = attributes.find((attribute) => attribute.name.getText(source) === 'className')?.initializer
        classes.push(className && ts.isStringLiteral(className) ? className.text : '')
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return classes
}

describe('管理画面の黒背景防止', () => {
  test.each([
    ['workers/web/src/app/components/admin/bot-management.tsx', 2],
    ['workers/web/src/app/components/admin/webhook-job-detail.tsx', 2],
    ['workers/web/src/app/components/admin/bot-action-confirmation.tsx', 1]
  ] as const)('%sの塗りボタンは既存ブランド色を使う', async (path, count) => {
    const classes = await buttonClasses(path)
    expect(classes).toHaveLength(count)
    for (const className of classes) {
      expect(className).toBe(brandClass)
      expect(className).not.toContain('bg-primary')
    }
  })

  test('新規イベントのモードバッジだけブランド色へ上書きする', async () => {
    const source = await Bun.file('workers/web/src/app/components/admin/event-form.tsx').text()
    expect(source).toContain("variant={formMode === 'edit' ? 'secondary' : 'default'}")
    expect(source).toContain("className={cn(formMode !== 'edit' && 'bg-brand text-brand-foreground')}")
  })
})
