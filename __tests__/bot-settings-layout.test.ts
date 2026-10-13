import { describe, expect, test } from 'bun:test'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BotSettingsLayout } from '@/components/admin/bot-settings-layout'

type Back = { to: '/admin' | '/admin/webhooks'; label: string }

const renderLayout = async (back?: Back) => {
  const routeTree = createRootRoute({
    // BotSettingsLayout は hooks を持たないので直接呼べる。children を props で渡すと noChildrenProp に触れ、
    // createElement の第3引数で渡すと children 必須の props 型を満たせないため、関数として呼んで要素を得る。
    component: () =>
      BotSettingsLayout({
        title: '見出し',
        description: '説明',
        ...(back === undefined ? {} : { back }),
        children: createElement('p', null, '本文')
      })
  })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}

const backLink = (markup: string) => [...markup.matchAll(/<a\b[^>]*>.*?<\/a>/g)].map((match) => match[0])[0]

describe('BotSettingsLayout の戻るリンク', () => {
  test('back を指定しなければ従来どおり管理画面（/admin）「管理画面に戻る」', async () => {
    const link = backLink(await renderLayout())
    expect(link).toContain('href="/admin"')
    expect(link).toContain('管理画面に戻る')
  })

  test('back を指定すると、その戻り先とラベルになる', async () => {
    const link = backLink(await renderLayout({ to: '/admin/webhooks', label: '受信履歴に戻る' }))
    expect(link).toContain('href="/admin/webhooks"')
    expect(link).toContain('受信履歴に戻る')
    expect(link).not.toContain('管理画面に戻る')
  })

  test('管理画面を明示しても同じ', async () => {
    const link = backLink(await renderLayout({ to: '/admin', label: '管理画面に戻る' }))
    expect(link).toContain('href="/admin"')
  })
})
