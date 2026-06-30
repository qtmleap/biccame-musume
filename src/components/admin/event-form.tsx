import { zodResolver } from '@hookform/resolvers/zod'
import { FileText, FolderTree, Package } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Controller, type DefaultValues, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { EventConfirmation } from '@/components/admin/event-confirmation'
import { ConditionsSection } from '@/components/admin/form/conditions-section'
import { DateField } from '@/components/admin/form/date-field'
import { EventFlagsSection } from '@/components/admin/form/event-flags-section'
import { ReferenceUrlsSection } from '@/components/admin/form/reference-urls-section'
import { SelectedStoreBadges, StoreSelectField } from '@/components/admin/form/store-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useCharacters } from '@/hooks/use-characters'
import { useEventGroups } from '@/hooks/use-event-groups'
import { checkDuplicateUrl, useCreateEvent, useUpdateEvent } from '@/hooks/use-events'
import { buildInitialValues, toEventPayload } from '@/lib/event-form'
import { ADMIN_LABELS, EVENT_CATEGORY_LABELS } from '@/locales/app.content'
import { type Event, EventCategorySchema, type EventRequest, EventRequestSchema } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

const NO_GROUP_VALUE = '__none__'

export const EventForm = ({
  defaultValues,
  onSuccess,
  isEditMode = false
}: {
  defaultValues?: DefaultValues<EventRequest>
  onSuccess?: () => void
  isEditMode?: boolean
}) => {
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const { data: characters } = useCharacters()
  const { data: eventGroups } = useEventGroups()

  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<number, Event | null>>({})
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmedData, setConfirmedData] = useState<EventRequest | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const storeKeys = Array.from(
    new Set(characters.filter((c) => c.store?.address && c.store.address.trim() !== '').map((c) => c.id))
  ).sort()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<EventRequest>({
    resolver: zodResolver(EventRequestSchema),
    defaultValues: buildInitialValues(defaultValues),
    mode: 'onBlur'
  })

  const { fields, remove, append } = useFieldArray({
    control,
    name: 'conditions'
  })

  const {
    fields: referenceUrlFields,
    append: appendReferenceUrl,
    remove: removeReferenceUrl
  } = useFieldArray({
    control,
    name: 'referenceUrls'
  })

  const stores = watch('stores') || []
  const referenceUrls = useWatch({ control, name: 'referenceUrls' }) || []

  const checkUrlDuplicate = useCallback(
    async (index: number, url: string) => {
      if (!url?.startsWith('http')) {
        setDuplicateWarnings((prev) => ({ ...prev, [index]: null }))
        return
      }

      try {
        const result = await checkDuplicateUrl(url, defaultValues?.uuid)
        setDuplicateWarnings((prev) => ({
          ...prev,
          [index]: result.exists ? (result.event ?? null) : null
        }))
      } catch {
        setDuplicateWarnings((prev) => ({ ...prev, [index]: null }))
      }
    },
    [defaultValues?.uuid]
  )

  const handleAddStore = (storeKey: string) => {
    if (storeKey === '_all') {
      setValue('stores', storeKeys as StoreKey[])
    } else if (!stores.includes(storeKey as StoreKey)) {
      setValue('stores', [...stores, storeKey as StoreKey])
    }
  }

  const handleRemoveStore = (storeKey: string) => {
    setValue(
      'stores',
      stores.filter((s) => s !== storeKey)
    )
  }

  const handleReset = () => {
    reset(buildInitialValues(defaultValues))
    setIsConfirming(false)
    setConfirmedData(null)
    setIsSubmitted(false)
  }

  const handleConfirm = (data: EventRequest) => {
    setConfirmedData(data)
    setIsConfirming(true)
  }

  const handleBack = () => {
    setIsConfirming(false)
  }

  const onSubmit = async () => {
    if (!confirmedData) return
    if (isSubmitted) return

    setIsSubmitted(true)

    const payload = toEventPayload(confirmedData, { isEditMode, fallbackUuid: defaultValues?.uuid })

    try {
      if (isEditMode && defaultValues?.uuid) {
        await updateEvent.mutateAsync({
          id: defaultValues.uuid,
          data: payload
        })
      } else {
        await createEvent.mutateAsync(payload)
      }
      // 先に親に成功を伝えて navigate を走らせる。handleReset は遷移後の表示には不要。
      onSuccess?.()
      handleReset()
    } catch (_error) {
      setIsSubmitted(false)
    }
  }

  if (isConfirming && confirmedData) {
    const isMutating = createEvent.isPending || updateEvent.isPending
    return <EventConfirmation data={confirmedData} isSubmitting={isMutating} onBack={handleBack} onSubmit={onSubmit} />
  }

  return (
    <form onSubmit={handleSubmit(handleConfirm)} className='space-y-5'>
      {/* イベント名 */}
      <div>
        <label htmlFor='event-title' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
          <FileText className='size-4' />
          イベント名
        </label>
        <Input
          id='event-title'
          type='text'
          placeholder='例: 新春アクキープレゼント'
          {...register('title')}
          className='w-full'
        />
        {errors.title && <p className='mt-1 text-xs text-destructive'>{errors.title.message}</p>}
      </div>

      {/* 日付設定 */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <DateField
          id='start-date'
          label={ADMIN_LABELS.startDate}
          control={control}
          name='startDate'
          error={errors.startDate?.message}
        />
        <DateField id='end-date' label='終了日（任意）' control={control} name='endDate' clearable />
      </div>

      {/* 実際の終了日 */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <DateField
          id='actual-end-date'
          label='実際の終了日（配布終了時に設定）'
          control={control}
          name='endedAt'
          clearable
          hint={ADMIN_LABELS.endDateHint}
        />
      </div>

      <Separator />

      {/* イベント種別・開催店舗 */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div>
          <label htmlFor='category-trigger' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
            <Package className='size-4' />
            イベント種別
          </label>
          <Controller
            name='category'
            control={control}
            render={({ field }) => {
              return (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger id='category-trigger' className='w-full'>
                    <SelectValue placeholder={ADMIN_LABELS.selectCategory} />
                  </SelectTrigger>
                  <SelectContent>
                    {EventCategorySchema.options.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {EVENT_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            }}
          />
          {errors.category && <p className='mt-1 text-xs text-destructive'>{errors.category.message}</p>}
        </div>

        <StoreSelectField
          allStoreKeys={storeKeys}
          selectedStoreKeys={stores}
          onAdd={handleAddStore}
          error={errors.stores?.message}
        />
      </div>

      <SelectedStoreBadges
        allStoreKeys={storeKeys}
        selectedStoreKeys={stores}
        onRemove={handleRemoveStore}
        onClearAll={() => setValue('stores', [])}
      />

      {/* 所属グループ（将来的に横にもう 1 項目追加する想定で 2 列 grid） */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div>
          <label htmlFor='group-trigger' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
            <FolderTree className='size-4' />
            所属グループ（任意）
          </label>
          <Controller
            name='groupId'
            control={control}
            render={({ field }) => (
              <Select
                value={field.value ?? ''}
                onValueChange={(value) => field.onChange(value === NO_GROUP_VALUE ? undefined : value)}
              >
                <SelectTrigger id='group-trigger' className='w-full'>
                  <SelectValue placeholder='グループを選択' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP_VALUE}>なし</SelectItem>
                  {eventGroups.map((group) => (
                    <SelectItem key={group.uuid} value={group.uuid}>
                      {group.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.groupId && <p className='mt-1 text-xs text-destructive'>{errors.groupId.message}</p>}
        </div>
      </div>

      <Separator />

      {/* 配布条件 */}
      <ConditionsSection
        fields={fields}
        register={register}
        remove={remove}
        append={append}
        error={errors.conditions?.message}
      />

      <Separator />

      {/* 参考URL */}
      <ReferenceUrlsSection
        fields={referenceUrlFields}
        register={register}
        append={appendReferenceUrl}
        remove={removeReferenceUrl}
        referenceUrls={referenceUrls}
        duplicateWarnings={duplicateWarnings}
        onCheckDuplicate={checkUrlDuplicate}
        onClearWarning={(index) =>
          setDuplicateWarnings((prev) => {
            const next = { ...prev }
            delete next[index]
            return next
          })
        }
        error={errors.referenceUrls?.message}
      />

      <Separator />

      <EventFlagsSection control={control} />

      {/* ボタン */}
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button type='button' variant='outline' onClick={handleReset} disabled={isSubmitted} className='sm:w-32'>
          クリア
        </Button>
        <Button
          type='submit'
          className='bg-brand hover:bg-brand/90 text-brand-foreground sm:w-48'
          disabled={isSubmitted}
        >
          {isSubmitted ? '送信中…' : '確認する'}
        </Button>
      </div>
    </form>
  )
}
