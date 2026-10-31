import { describe, expect, test } from 'bun:test'
import { type EventCharacter, EventSchema } from '@biccame/shared/schemas/event.dto'
import type { StoreKey } from '@biccame/shared/schemas/store.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useForm } from 'react-hook-form'
import { EventClassificationFields } from '@/components/admin/event-classification-fields'
import { EventForm } from '@/components/admin/event-form'
import { webhookEventCreateSearch } from '@/components/admin/webhook-form-defaults'
import { charactersQueryKey } from '@/hooks/use-characters'
import {
  buildInitialValues,
  characterIdsAfterStoresChange,
  DEFAULT_VALUES,
  defaultCharacterIds,
  type EventFormValues,
  initialFollowsStores,
  toCopyFormValues,
  toFormValues,
  toFormValuesFromQuery
} from '@/lib/event-form'
import { CHARACTER_NAME_LABELS } from '@/locales/app.content'
import characters from '../workers/web/public/characters.json'
import { baseJob } from './fixtures/webhook-detail-link'

const uuid = '11111111-1111-4111-8111-111111111111'
const newUuid = '22222222-2222-4222-8222-222222222222'
const OLD_NOTE = '未選択は未判定です。開催店舗の娘を自動設定しません。'
const NEW_NOTE = '初期値は開催店舗の娘です。変更すると、その選択をそのまま使います。'

const savedEvent = (characterIds: EventCharacter[]) => {
  const result = EventSchema.safeParse({
    uuid,
    category: 'ackey',
    title: '保存済みのイベント',
    stores: ['funabashi', 'akiba'],
    characterIds,
    startDate: '2026-10-20T00:00:00Z',
    conditions: [{ uuid, type: 'everyone' }],
    isVerified: true,
    isPreliminary: false,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
    status: 'ongoing',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0
  })
  if (!result.success) throw new Error(result.error.message)
  return { ...result.data, referenceUrls: [], comments: [] }
}

const draftJob = (draft: { characterIds: EventCharacter[]; stores: string[] }): WebhookJob => ({
  ...baseJob,
  draft: { ...draft, title: '下書きのイベント', conditions: [] }
})

describe('開催店舗から対象ビッカメ娘の初期値を導出する', () => {
  test('店舗が無ければ空、1店舗ならその娘', () => {
    expect(defaultCharacterIds([])).toEqual([])
    expect(defaultCharacterIds(['funabashi'])).toEqual(['funabashi'])
  })

  test('複数店舗は選択順のまま、重複は1つにまとめる', () => {
    expect(defaultCharacterIds(['funabashi', 'akiba', 'abeno'])).toEqual(['funabashi', 'akiba', 'abeno'])
    expect(defaultCharacterIds(['akiba', 'funabashi', 'akiba', 'funabashi'])).toEqual(['akiba', 'funabashi'])
  })

  test('店舗キーでない値は娘にしない', () => {
    const stores: (StoreKey | undefined)[] = ['funabashi', undefined]
    expect(defaultCharacterIds(stores)).toEqual(['funabashi'])
  })
})

describe('店舗への追従の初期状態', () => {
  test('新規作成で娘が空のときだけ追従する', () => {
    expect(initialFollowsStores('create', [])).toBe(true)
    expect(initialFollowsStores('create', undefined)).toBe(true)
    expect(initialFollowsStores('create', ['funabashi'])).toBe(false)
    expect(initialFollowsStores('create', ['other'])).toBe(false)
  })

  test('編集は娘が空でも追従しない', () => {
    expect(initialFollowsStores('edit', [])).toBe(false)
    expect(initialFollowsStores('edit', undefined)).toBe(false)
    expect(initialFollowsStores('edit', ['funabashi'])).toBe(false)
  })
})

describe('フォームの初期値', () => {
  test('値の無い新規作成は店舗も娘も空', () => {
    const values = buildInitialValues(undefined, 'create')
    expect(values.stores).toEqual([])
    expect(values.characterIds).toEqual([])
  })

  test('?stores= の新規作成は、店舗の娘が初期値になる', () => {
    const query = toFormValuesFromQuery({ stores: 'funabashi,akiba,funabashi' }, newUuid)
    expect(query.characterIds).toEqual([])
    const values = buildInitialValues(query, 'create')
    expect(values.stores).toEqual(['funabashi', 'akiba', 'funabashi'])
    expect(values.characterIds).toEqual(['funabashi', 'akiba'])
  })

  test('?characterIds= があるときはそれを使い、店舗の娘で上書きしない', () => {
    const query = toFormValuesFromQuery({ stores: 'funabashi,akiba', characterIds: 'kawasaki' }, newUuid)
    expect(buildInitialValues(query, 'create').characterIds).toEqual(['kawasaki'])
  })

  test('コピー元が娘を持つときはそのまま、持たないときだけ店舗の娘にする', () => {
    const withCharacters = toCopyFormValues(savedEvent(['kawasaki']), newUuid)
    expect(buildInitialValues(withCharacters, 'create').characterIds).toEqual(['kawasaki'])
    const empty = toCopyFormValues(savedEvent([]), newUuid)
    expect(empty.characterIds).toEqual([])
    expect(buildInitialValues(empty, 'create').characterIds).toEqual(['funabashi', 'akiba'])
  })

  test('受信詳細の下書きが娘を持つときはそのまま、持たないときだけ店舗の娘にする', () => {
    const initial = (job: WebhookJob) =>
      buildInitialValues(toFormValuesFromQuery(webhookEventCreateSearch(job), newUuid), 'create')
    expect(initial(draftJob({ characterIds: ['kawasaki'], stores: ['funabashi'] })).characterIds).toEqual(['kawasaki'])
    expect(initial(draftJob({ characterIds: [], stores: ['funabashi', 'akiba'] })).characterIds).toEqual([
      'funabashi',
      'akiba'
    ])
    expect(initial(draftJob({ characterIds: [], stores: [] })).characterIds).toEqual([])
  })

  test('既存イベントの編集は、読み込んだ娘をそのまま使い空でも埋めない', () => {
    const loaded = toFormValues(savedEvent([]))
    expect(buildInitialValues(loaded, 'edit').characterIds).toEqual([])
    expect(buildInitialValues(loaded, 'edit').stores).toEqual(['funabashi', 'akiba'])
    expect(buildInitialValues(toFormValues(savedEvent(['kawasaki'])), 'edit').characterIds).toEqual(['kawasaki'])
  })

  test('クエリからの復元そのものは娘を補完しない（補完は初期値の組み立てだけで行う）', () => {
    expect(toFormValuesFromQuery({ stores: 'funabashi' }, newUuid).characterIds).toEqual([])
    expect(DEFAULT_VALUES.characterIds).toEqual([])
  })
})

describe('開催店舗を変えたときの対象ビッカメ娘', () => {
  type Selection = { followsStores: boolean; stores: StoreKey[]; characterIds: EventCharacter[] }
  const changeStores = (selection: Selection, stores: StoreKey[]): Selection => ({
    ...selection,
    stores,
    characterIds: characterIdsAfterStoresChange({
      followsStores: selection.followsStores,
      stores,
      characterIds: selection.characterIds
    })
  })
  // フォームでは、娘のチェックを手で変えた時点で追従をやめる。
  const editCharacters = (selection: Selection, characterIds: EventCharacter[]): Selection => ({
    ...selection,
    characterIds,
    followsStores: false
  })
  const start = (mode: 'create' | 'edit', characterIds: EventCharacter[], stores: StoreKey[]): Selection => {
    const values = buildInitialValues({ stores, characterIds }, mode)
    return {
      followsStores: initialFollowsStores(mode, characterIds),
      stores,
      characterIds: values.characterIds ? values.characterIds.flatMap((id) => (id === undefined ? [] : [id])) : []
    }
  }

  test('追従中は店舗を足し引きするたびに娘も合わせ、外した店舗の娘は外れる', () => {
    const initial = start('create', [], [])
    const first = changeStores(initial, ['funabashi'])
    const second = changeStores(first, ['funabashi', 'akiba'])
    const third = changeStores(second, ['akiba'])
    const last = changeStores(third, [])
    expect([initial, first, second, third, last].map((step) => step.characterIds)).toEqual([
      [],
      ['funabashi'],
      ['funabashi', 'akiba'],
      ['akiba'],
      []
    ])
  })

  test('娘を手で変えたあとは、店舗を変えても手動の選択をそのまま使う', () => {
    const followed = changeStores(start('create', [], []), ['funabashi', 'akiba'])
    expect(followed.characterIds).toEqual(['funabashi', 'akiba'])
    const edited = editCharacters(followed, ['akiba', 'other'])
    const added = changeStores(edited, ['funabashi', 'akiba', 'abeno'])
    expect(added.characterIds).toEqual(['akiba', 'other'])
    expect(changeStores(added, []).characterIds).toEqual(['akiba', 'other'])
  })

  test('手で変えた結果が店舗の娘と同じ値でも、追従は再開しない', () => {
    const followed = changeStores(start('create', [], []), ['funabashi'])
    const toggled = editCharacters(editCharacters(followed, []), ['funabashi'])
    expect(toggled.characterIds).toEqual(followed.characterIds)
    expect(changeStores(toggled, ['funabashi', 'akiba']).characterIds).toEqual(['funabashi'])
  })

  test('既存イベントの編集では、店舗を変えても追従しない', () => {
    const empty = start('edit', [], ['funabashi'])
    expect(changeStores(empty, ['funabashi', 'akiba']).characterIds).toEqual([])
    const loaded = start('edit', ['kawasaki'], ['funabashi'])
    expect(changeStores(loaded, []).characterIds).toEqual(['kawasaki'])
  })

  test('下書きやコピー元が娘を持つ新規作成は、店舗を変えても追従しない', () => {
    const copied = start('create', ['kawasaki'], ['funabashi'])
    expect(changeStores(copied, ['funabashi', 'akiba']).characterIds).toEqual(['kawasaki'])
  })
})

describe('フォームの描画', () => {
  const seededClient = () => {
    const client = new QueryClient()
    client.setQueryData(charactersQueryKey, characters)
    client.setQueryData(['event-groups'], [])
    return client
  }
  const render = (element: ReturnType<typeof createElement>) =>
    renderToStaticMarkup(createElement(QueryClientProvider, { client: seededClient() }, element))
  const FieldsProbe = () => {
    const { control, formState } = useForm<EventFormValues>({ defaultValues: DEFAULT_VALUES })
    return createElement(EventClassificationFields, {
      control,
      errors: formState.errors,
      onStoresChange: () => {},
      onCharacterIdsEdit: () => {}
    })
  }
  // 欄は名前順に並ぶので、チェック済みの娘の名前を表示順のまま取り出す。
  const checkedCharacters = (markup: string) => {
    const fieldset = markup.match(/<fieldset aria-labelledby="event-characters-label".*?<\/fieldset>/s)
    if (!fieldset) throw new Error('対象ビッカメ娘の欄がありません')
    return [...fieldset[0].matchAll(/<input([^>]*)\/>([^<]*)<\/label>/g)].flatMap((match) =>
      match[1].includes('checked=""') ? [match[2]] : []
    )
  }

  test('注記は新しい挙動を伝え、旧文言は残らない', () => {
    const markup = render(createElement(FieldsProbe))
    expect(markup).toContain(NEW_NOTE)
    expect(markup).not.toContain(OLD_NOTE)
    expect(markup).not.toContain('自動設定しません')
  })

  test('?stores= で開いた新規作成は、店舗の娘にチェックが入っている', () => {
    const defaultValues = toFormValuesFromQuery({ stores: 'funabashi,akiba' }, newUuid)
    const markup = render(createElement(EventForm, { defaultValues, mode: 'create' }))
    expect(checkedCharacters(markup).sort()).toEqual(
      [CHARACTER_NAME_LABELS.funabashi, CHARACTER_NAME_LABELS.akiba].sort()
    )
  })

  test('娘が空の既存イベントを開いても、娘にチェックを入れない', () => {
    const defaultValues = toFormValues(savedEvent([]))
    const markup = render(createElement(EventForm, { defaultValues, isEditMode: true, mode: 'edit' }))
    expect(checkedCharacters(markup)).toEqual([])
  })
})
