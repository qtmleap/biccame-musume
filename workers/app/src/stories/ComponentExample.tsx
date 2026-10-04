import { atom } from 'jotai'
import { Store } from 'lucide-react'
import { type ComponentType, createElement, useEffect, useRef, useState } from 'react'
import { FormProvider, useFieldArray, useForm } from 'react-hook-form'
import { EventForm } from '@/components/admin/event-form'
import { EventGroupForm, toGroupFormValues } from '@/components/admin/event-group-form'
import { ConditionsSection } from '@/components/admin/form/conditions-section'
import { DateField } from '@/components/admin/form/date-field'
import { EventFlagsSection } from '@/components/admin/form/event-flags-section'
import { ReferenceUrlsSection } from '@/components/admin/form/reference-urls-section'
import { AuthProvider } from '@/components/auth/auth-provider'
import { BackendSessionGate } from '@/components/auth/backend-session-gate'
import { CalendarEventDrawerContent } from '@/components/calendar/calendar-event-drawer-content'
import { CharacterFavoriteButton } from '@/components/characters/character-favorite-button'
import { CharacterFollowButton } from '@/components/characters/character-follow-button'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { EventCategoryFilter } from '@/components/events/event-category-filter'
import { EventUserActivityFilter } from '@/components/events/event-user-activity-filter'
import { GanttHeader } from '@/components/events/gantt/gantt-header'
import { GanttRow } from '@/components/events/gantt/gantt-row'
import { GanttTimeline } from '@/components/events/gantt/gantt-timeline'
import { useGanttLayout } from '@/components/events/gantt/use-gantt-layout'
import { GanttDateHeader, GanttGridCell, GanttMonthSelector } from '@/components/events/gantt-chart-parts'
import { showUpdatePrompt } from '@/components/pwa/update-prompt'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Toaster } from '@/components/ui/sonner'
import { DEFAULT_VALUES, type EventFormValues, toFormValues } from '@/lib/event-form'
import { EventCategorySchema } from '@/schemas/event.dto'
import { runtime } from '../../../../.storybook/catalogue/runtime'
import {
  badge,
  badges,
  calendarEvents,
  characters,
  comments,
  date,
  eventDetail,
  events,
  group,
  now,
  rankedCharacters,
  routeResult,
  stores
} from './catalogue-fixtures'

const isComponent = (value: unknown): value is ComponentType<Record<string, unknown>> =>
  typeof value === 'function' || (typeof value === 'object' && value !== null && '$$typeof' in value)
const modules = import.meta.glob('/workers/app/src/components/**/*.tsx', { eager: true })
const statusFilter = atom({ upcoming: true, ongoing: true, ended: false })
const SyntheticFailure = (): never => {
  throw new Error('Storybookで指定した子コンポーネントのエラー')
}
const providerChild = (
  <section className='rounded-xl bg-card p-4 border border-card-border'>
    <h2 className='font-bold mb-3'>認証コンテキスト内の実コンポーネント</h2>
    <CharacterFavoriteButton characterId='abeno' characterName='あべのたん' />
    <CharacterFollowButton twitterId='storybook_fixture' />
  </section>
)
export type ComponentExampleProps = {
  source: string
  exportName: string
  compact?: boolean
  disabled?: boolean
  label?: string
  displayError?: boolean
}
/** One exported production component, with its real provider/form/interaction context and schema-valid fixtures. */
export const ComponentExample = ({
  source,
  exportName,
  compact = false,
  disabled = false,
  label = '表示用の固定データ',
  displayError = false
}: ComponentExampleProps) => {
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(true)
  const [month, setMonth] = useState(10)
  const [page, setPage] = useState(1)
  const [selectedStores, setSelectedStores] = useState(stores)
  const [value, setValue] = useState<string | null>('abeno')
  const [categories, setCategories] = useState(() => new Set(EventCategorySchema.options))
  const [activity, setActivity] = useState({ hideInterested: false, hideCompleted: false })
  const [loading, setLoading] = useState(false)
  const [trigger, setTrigger] = useState(1)
  const action = (..._args: unknown[]) => setMessage('Storybook内で操作を確認しました（送信なし）')
  const form = useForm<EventFormValues>({ defaultValues: { ...DEFAULT_VALUES, ...toFormValues(eventDetail) } })
  const conditions = useFieldArray({ control: form.control, name: 'conditions' })
  const references = useFieldArray({ control: form.control, name: 'referenceUrls' })
  const layout = useGanttLayout(events)
  const dragRef = useRef(false)
  useEffect(() => {
    if (exportName !== 'IosInstallPrompt') return
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Storybook fixture' })
    return () => {
      if (descriptor) Object.defineProperty(navigator, 'userAgent', descriptor)
      else Reflect.deleteProperty(navigator, 'userAgent')
    }
  }, [exportName])
  const module = modules[`/${source}`]
  if (!module || typeof module !== 'object' || !(exportName in module))
    throw new Error(`Uncatalogued production export: ${source}#${exportName}`)
  // Import boundary: the catalogue manifest and source AST verify the dynamic export; smoke tests execute it.
  const Component = Reflect.get(module, exportName)
  if (!isComponent(Component)) throw new Error(`Not a React component: ${source}#${exportName}`)
  const formValues = { ...DEFAULT_VALUES, ...toFormValues(eventDetail) }
  const props: Record<string, unknown> = {
    children: providerChild,
    character: source.includes('/ranking/') ? rankedCharacters[0] : characters[0],
    currentCharacter: characters[0],
    characters: source.includes('/ranking/') ? rankedCharacters : characters,
    event: eventDetail,
    events,
    eventUuid: events[0].uuid,
    comment: comments[0],
    comments,
    uuid: events[0].uuid,
    title: events[0].title,
    index: 0,
    rank: 1,
    maxVote: 120,
    voteCount: 120,
    top3: rankedCharacters,
    ranks: [1, 2, 3],
    rotation: 0,
    characterId: 'abeno',
    characterName: 'あべのたん',
    characterIds: characters.map((c) => c.id),
    storeKey: 'abeno',
    storeName: characters[0].store.name,
    twitterId: 'storybook_fixture',
    isBiccameMusume: true,
    hasStore: true,
    label,
    description: '表示と折り返しを確認する固定データ',
    url: 'https://example.invalid/storybook-reference',
    delay: 0,
    distance: 2.4,
    compact,
    disabled,
    year: 2026,
    month,
    day: 2,
    selectedMonth: month,
    onSelectMonth: setMonth,
    onPrevMonth: () => setMonth((m) => (m === 1 ? 12 : m - 1)),
    onNextMonth: () => setMonth((m) => (m === 12 ? 1 : m + 1)),
    onCurrentMonth: () => setMonth(10),
    onDayClick: action,
    onRandomize: action,
    onBack: action,
    onSubmit: action,
    onSuccess: action,
    onDelete: action,
    onClose: () => setOpen(false),
    onChange: setValue,
    onStatsUpdate: action,
    onLoadingChange: setLoading,
    isLoading: loading,
    isSubmitting: false,
    isAuthenticated: runtime.authenticated,
    value: exportName === 'StatCard' ? 12 : value,
    page,
    totalPages: 3,
    onPageChange: setPage,
    statusFilterAtom: statusFilter,
    open,
    onOpenChange: setOpen,
    isOpen: open,
    onCharacterSelect: action,
    mapCenter: { lat: 34.65, lng: 135.51 },
    stores: selectedStores,
    onSelect: (id: string) => {
      const selected = stores.find((s) => s.id === id)
      if (selected) setSelectedStores((old) => [...old, selected])
    },
    onRemove: (id: string) => setSelectedStores((old) => old.filter((s) => s.id !== id)),
    onClearAll: () => setSelectedStores([]),
    onChangeStation: (id: string, station: string) =>
      setSelectedStores((old) => old.map((s) => (s.id === id ? { ...s, station } : s))),
    result: routeResult,
    badge,
    badges,
    earnedAt: now,
    earnedMap: new Map([[badge.code, now]]),
    categoryKey: 'store',
    totalInCategory: 2,
    groupId: group.uuid,
    linkedEvents: events,
    defaultValues: source.includes('event-group-form')
      ? { ...group, startDate: '2026-10-01', endDate: '2026-10-31' }
      : formValues,
    data: { ...formValues, startDate: '2026-10-01', endDate: '2026-10-31' },
    id: 'story-field',
    name: 'startDate',
    control: form.control,
    register: form.register,
    fields: conditions.fields,
    remove: conditions.remove,
    append: conditions.append,
    referenceUrls: references.fields,
    duplicateWarnings: {},
    onCheckDuplicate: action,
    onClearWarning: action,
    icon: Store,
    items: [{ label: 'ホーム', to: '/' }, { label: 'キャラクター一覧', to: '/characters' }, { label: 'あべのたん' }],
    error: new Error('Storybookで指定したエラー状態'),
    reset: action,
    monthOffset: layout.monthOffset,
    onMonthSelect: layout.setMonthOffset,
    dates: layout.dates,
    today: layout.today,
    date,
    actualMonthEnd: layout.actualMonthEnd,
    eventBars: layout.eventBars,
    bar: layout.eventBars[0],
    isScrolling: layout.isScrolling,
    isDragging: layout.isDragging,
    scrollContainerRef: layout.scrollContainerRef,
    onScroll: layout.handleScroll,
    onMouseDown: layout.handleMouseDown,
    onMouseMove: layout.handleMouseMove,
    onMouseUp: layout.handleMouseUp,
    onMouseLeave: layout.handleMouseLeave,
    getLabelOffset: layout.getLabelOffset,
    hasDraggedRef: dragRef,
    labelOffset: 0,
    triggerKey: trigger,
    count: 5,
    visible: true,
    status: 'clearing',
    nameStore: characters[0].store.name,
    address: characters[0].store.address,
    postalCode: '545-0052',
    phone: '06-0000-0000',
    hours: characters[0].store.hours,
    access: characters[0].store.access,
    openAllYear: true,
    birthday: '2011-04-26',
    storeId: 1
  }
  if (source.includes('/calendar/') && !source.includes('controls')) props.events = calendarEvents
  if (exportName === 'UpcomingEventListItem')
    props.event = { character: characters[2], type: 'character', date, daysUntil: 0 }
  if (exportName === 'EventCharacterBadge') props.event = { ...eventDetail, characterId: 'kyoto' }
  if (exportName === 'StoreName') props.name = characters[0].store.name
  if (exportName === 'InfoItem') props.children = <p>営業時間 10:00〜21:00</p>
  if (exportName === 'StoreAccess') props.access = characters[0].store.access
  if (exportName === 'ReferenceUrlsSection') {
    props.fields = references.fields
    props.remove = references.remove
    props.append = references.append
  }
  if (exportName === 'EventListPagination') props.onChange = setPage
  if (exportName === 'GanttMonthSelector') props.onSelect = layout.setMonthOffset
  if (exportName === 'RankingVoteBadge') props.characterId = 'abeno'
  if (exportName === 'HeartBurstOverlay' || exportName === 'FireworkBurstOverlay') props.visible = trigger % 2 === 1
  const animation = exportName.includes('Burst')
  // Typed render fixtures for contracts that require form/provider/layout context.
  let content = createElement(Component, props)
  if (exportName === 'ErrorBoundary')
    content = <ErrorBoundary>{displayError ? <SyntheticFailure /> : providerChild}</ErrorBoundary>
  if (exportName === 'BackendSessionGate') content = <BackendSessionGate>{providerChild}</BackendSessionGate>
  if (exportName === 'CalendarEventDrawerContent')
    content = (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>2026年10月2日の予定</DrawerTitle>
          </DrawerHeader>
          <CalendarEventDrawerContent year={2026} month={10} day={2} events={calendarEvents} />
        </DrawerContent>
      </Drawer>
    )
  if (exportName === 'AuthProvider') content = <AuthProvider>{providerChild}</AuthProvider>
  if (exportName === 'EventForm') content = <EventForm defaultValues={formValues} onSuccess={action} />
  if (exportName === 'EventGroupForm')
    content = <EventGroupForm defaultValues={toGroupFormValues(group)} onSuccess={action} />
  if (exportName === 'ConditionsSection')
    content = (
      <ConditionsSection
        fields={conditions.fields}
        register={form.register}
        remove={conditions.remove}
        append={conditions.append}
      />
    )
  if (exportName === 'ReferenceUrlsSection')
    content = (
      <ReferenceUrlsSection
        fields={references.fields}
        register={form.register}
        remove={references.remove}
        append={references.append}
        referenceUrls={references.fields}
        duplicateWarnings={{}}
        onCheckDuplicate={action}
        onClearWarning={action}
      />
    )
  if (exportName === 'DateField')
    content = (
      <DateField<EventFormValues>
        id='story-start-date'
        label='開始日'
        control={form.control}
        name='startDate'
        clearable
      />
    )
  if (exportName === 'EventFlagsSection') content = <EventFlagsSection control={form.control} />
  if (exportName === 'EventCategoryFilter')
    content = <EventCategoryFilter value={categories} onChange={setCategories} />
  if (exportName === 'EventUserActivityFilter')
    content = <EventUserActivityFilter value={activity} onChange={setActivity} />
  if (exportName === 'GanttHeader')
    content = (
      <GanttHeader
        monthOffset={layout.monthOffset}
        onMonthSelect={layout.setMonthOffset}
        onToday={() => layout.setMonthOffset(0)}
      />
    )
  if (exportName === 'GanttMonthSelector')
    content = <GanttMonthSelector monthOffset={layout.monthOffset} onSelect={layout.setMonthOffset} />
  if (exportName === 'GanttDateHeader')
    content = <GanttDateHeader dates={layout.dates} today={layout.today} actualMonthEnd={layout.actualMonthEnd} />
  if (exportName === 'GanttGridCell')
    content = (
      <div className='w-fit'>
        <GanttDateHeader dates={[date]} today={layout.today} actualMonthEnd={layout.actualMonthEnd} />
        <div className='flex h-8'>
          <GanttGridCell date={date} today={layout.today} actualMonthEnd={layout.actualMonthEnd} />
        </div>
      </div>
    )
  if (exportName === 'GanttRow') {
    const bar = layout.eventBars[0]
    if (!bar) throw new Error('Gantt fixture must include a visible event')
    content = (
      <GanttRow
        bar={bar}
        dates={layout.dates}
        today={layout.today}
        actualMonthEnd={layout.actualMonthEnd}
        isScrolling={layout.isScrolling}
        labelOffset={0}
        hasDraggedRef={dragRef}
      />
    )
  }
  if (exportName === 'GanttTimeline')
    content = (
      <GanttTimeline
        eventBars={layout.eventBars}
        dates={layout.dates}
        today={layout.today}
        actualMonthEnd={layout.actualMonthEnd}
        monthOffset={layout.monthOffset}
        isScrolling={layout.isScrolling}
        isDragging={layout.isDragging}
        scrollContainerRef={layout.scrollContainerRef}
        onScroll={layout.handleScroll}
        onMouseDown={layout.handleMouseDown}
        onMouseMove={layout.handleMouseMove}
        onMouseUp={layout.handleMouseUp}
        onMouseLeave={layout.handleMouseLeave}
        getLabelOffset={layout.getLabelOffset}
        hasDraggedRef={dragRef}
      />
    )
  return (
    <FormProvider {...form}>
      <div
        className='mx-auto max-w-6xl'
        data-testid='production-component'
        data-production-export={`${source}#${exportName}`}
      >
        {exportName === 'UpdatePrompt' && (
          <Button className='mb-4' onClick={() => showUpdatePrompt()}>
            更新通知を表示
          </Button>
        )}
        {animation && (
          <Button className='mb-8' onClick={() => setTrigger((n) => n + 1)}>
            アニメーションを再生
          </Button>
        )}
        <div className={animation ? 'relative min-h-40 flex items-center justify-center' : 'relative'}>{content}</div>
        {message && (
          <p role='status' className='mt-4'>
            {message}
          </p>
        )}
        {(exportName === 'UpdatePrompt' || exportName === 'LoginButton') && <Toaster />}
      </div>
    </FormProvider>
  )
}
