import { zodResolver } from '@hookform/resolvers/zod'
import { FileText, Package, Store, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Controller, type DefaultValues, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { EventConfirmation } from '@/components/admin/event-confirmation'
import { ConditionsSection } from '@/components/admin/form/conditions-section'
import { DateField } from '@/components/admin/form/date-field'
import { ReferenceUrlsSection } from '@/components/admin/form/reference-urls-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useCharacters } from '@/hooks/use-characters'
import { checkDuplicateUrl, useCreateEvent, useUpdateEvent } from '@/hooks/use-events'
import { buildInitialValues, toEventPayload } from '@/lib/event-form'
import { ADMIN_LABELS, EVENT_CATEGORY_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { type Event, EventCategorySchema, type EventRequest, EventRequestSchema } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

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
      handleReset()
      onSuccess?.()
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

        <div>
          <label htmlFor='store-trigger' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
            <Store className='size-4' />
            開催店舗
          </label>
          <Select value='' onValueChange={handleAddStore}>
            <SelectTrigger id='store-trigger' className='w-full'>
              <SelectValue
                placeholder={
                  stores.length > 0
                    ? ADMIN_LABELS.storeSelected.replace('{count}', stores.length.toString())
                    : ADMIN_LABELS.selectStore
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='_all'>全店舗を選択</SelectItem>
              {storeKeys.map((key) => {
                const storeKey = key as StoreKey
                const displayName = STORE_NAME_LABELS[storeKey] || key
                return (
                  <SelectItem key={key} value={key} disabled={stores.includes(storeKey)}>
                    {displayName}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          {errors.stores && <p className='mt-1 text-xs text-destructive'>{errors.stores.message}</p>}
        </div>
      </div>

      {/* 選択された店舗のバッジ */}
      {stores.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {stores.length === storeKeys.length ? (
            <Badge variant='secondary' className='pr-1'>
              <span className='text-xs font-semibold'>全店舗</span>
              <button type='button' onClick={() => setValue('stores', [])} className='ml-0.5 rounded-sm'>
                <X className='size-3' />
              </button>
            </Badge>
          ) : (
            stores.map((key) => {
              const storeKey = key as StoreKey
              const displayName = STORE_NAME_LABELS[storeKey] || key
              return (
                <Badge key={key} variant='secondary' className='pr-1'>
                  <span className='text-xs font-semibold'>{displayName}</span>
                  <button type='button' onClick={() => handleRemoveStore(key)} className='ml-0.5 rounded-sm'>
                    <X className='size-3' />
                  </button>
                </Badge>
              )
            })
          )}
        </div>
      )}

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

      {/* 検証済み・未確定情報・ツイート投稿フラグ */}
      <div className='grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-3'>
        <div className='flex items-center gap-2'>
          <Controller
            name='isVerified'
            control={control}
            render={({ field }) => (
              <Checkbox
                id='is-verified'
                checked={field.value ?? false}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                className='data-[state=checked]:bg-info data-[state=checked]:border-info'
              />
            )}
          />
          <label htmlFor='is-verified' className='text-sm font-medium cursor-pointer'>
            検証済み
          </label>
        </div>
        <div className='flex items-center gap-2'>
          <Controller
            name='isPreliminary'
            control={control}
            render={({ field }) => (
              <Checkbox
                id='is-preliminary'
                checked={field.value ?? false}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                className='data-[state=checked]:bg-warning data-[state=checked]:border-warning'
              />
            )}
          />
          <label htmlFor='is-preliminary' className='text-sm font-medium cursor-pointer'>
            未確定情報
          </label>
        </div>
        <div className='flex items-center gap-2'>
          <Controller
            name='shouldTweet'
            control={control}
            render={({ field }) => (
              <Checkbox
                id='should-tweet'
                checked={field.value ?? false}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                className='data-[state=checked]:bg-social-x data-[state=checked]:border-social-x'
              />
            )}
          />
          <label htmlFor='should-tweet' className='text-sm font-medium cursor-pointer'>
            保存時に投稿する
          </label>
        </div>
      </div>

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
