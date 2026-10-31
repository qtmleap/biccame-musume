import type { Event, EventRequest } from '@biccame/shared/schemas/event.dto'
import type { StoreKey } from '@biccame/shared/schemas/store.dto'
import { zodResolver } from '@hookform/resolvers/zod'
import { FileText } from 'lucide-react'
import { useCallback, useState } from 'react'
import { type DefaultValues, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { EventClassificationFields } from '@/components/admin/event-classification-fields'
import { EventConfirmation } from '@/components/admin/event-confirmation'
import { ConditionsSection } from '@/components/admin/form/conditions-section'
import { DateField } from '@/components/admin/form/date-field'
import { EventFlagsSection } from '@/components/admin/form/event-flags-section'
import { ReferenceUrlsSection } from '@/components/admin/form/reference-urls-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { checkDuplicateUrl, useCreateEvent, useUpdateEvent } from '@/hooks/use-events'
import {
  buildInitialValues,
  characterIdsAfterStoresChange,
  EventFormSchema,
  type EventFormValues,
  initialFollowsStores,
  toEventPayload
} from '@/lib/event-form'
import { cn } from '@/lib/utils'
import { ADMIN_LABELS } from '@/locales/app.content'

export const EventForm = ({
  defaultValues,
  onSuccess,
  onSubmitPayload,
  allowTweet = true,
  isEditMode = false,
  mode
}: {
  defaultValues?: DefaultValues<EventFormValues>
  onSuccess?: () => void
  onSubmitPayload?: (data: EventRequest) => Promise<void>
  allowTweet?: boolean
  isEditMode?: boolean
  mode?: 'create' | 'edit'
}) => {
  const formMode = mode || (isEditMode ? 'edit' : 'create')
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()

  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<number, Event | null>>({})
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmedData, setConfirmedData] = useState<EventRequest | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  // 対象ビッカメ娘を開催店舗に追従させるか。dirtyFields は初期値へ戻すと false に戻るため使わず、手で変えた時点で明示的にやめる。
  const [followsStores, setFollowsStores] = useState(() => initialFollowsStores(formMode, defaultValues?.characterIds))

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors }
  } = useForm<EventFormValues>({
    resolver: zodResolver(EventFormSchema),
    defaultValues: buildInitialValues(defaultValues, formMode),
    mode: 'onBlur'
  })

  const handleStoresChange = (stores: StoreKey[]) =>
    setValue(
      'characterIds',
      characterIdsAfterStoresChange({ followsStores, stores, characterIds: getValues('characterIds') })
    )

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

  const handleReset = () => {
    reset(buildInitialValues(defaultValues, formMode))
    setFollowsStores(initialFollowsStores(formMode, defaultValues?.characterIds))
    setIsConfirming(false)
    setConfirmedData(null)
    setIsSubmitted(false)
  }

  const handleConfirm = (data: EventFormValues) => {
    setConfirmedData({
      ...toEventPayload(data, { isEditMode, fallbackUuid: defaultValues?.uuid }),
      shouldTweet: allowTweet && data.shouldTweet
    })
    setIsConfirming(true)
  }

  const handleBack = () => {
    setIsConfirming(false)
  }

  const onSubmit = async () => {
    if (!confirmedData) return
    if (isSubmitted) return

    setIsSubmitted(true)

    try {
      if (onSubmitPayload) {
        await onSubmitPayload(confirmedData)
      } else if (isEditMode && defaultValues?.uuid) {
        await updateEvent.mutateAsync({
          id: defaultValues.uuid,
          data: confirmedData
        })
      } else {
        await createEvent.mutateAsync(confirmedData)
      }
      // 先に親に成功を伝えて navigate を走らせる。handleReset は遷移後の表示には不要。
      onSuccess?.()
      handleReset()
    } catch (_error) {
      setIsSubmitted(false)
    }
  }

  if (isConfirming && confirmedData) {
    const isMutating = isSubmitted || createEvent.isPending || updateEvent.isPending
    return (
      <EventConfirmation
        data={confirmedData}
        isSubmitting={isMutating}
        onBack={handleBack}
        onSubmit={onSubmit}
        mode={formMode}
      />
    )
  }

  return (
    <form onSubmit={handleSubmit(handleConfirm)} className='space-y-5'>
      <Badge
        variant={formMode === 'edit' ? 'secondary' : 'default'}
        className={cn(formMode !== 'edit' && 'bg-brand text-brand-foreground')}
      >
        {formMode === 'edit' ? ADMIN_LABELS.eventEdit : ADMIN_LABELS.eventNew}
      </Badge>

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

      <EventClassificationFields
        control={control}
        errors={errors}
        onStoresChange={handleStoresChange}
        onCharacterIdsEdit={() => setFollowsStores(false)}
      />
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

      <EventFlagsSection control={control} postingDisabled={!allowTweet} />

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
