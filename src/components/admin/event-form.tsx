import { zodResolver } from '@hookform/resolvers/zod'
import dayjs from 'dayjs'
import { FileText, Package, Store, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Controller, type DefaultValues, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { v4 as uuidv4 } from 'uuid'
import { EventConfirmation } from '@/components/admin/event-confirmation'
import { ConditionsSection } from '@/components/admin/form/conditions-section'
import { DateField } from '@/components/admin/form/date-field'
import { ReferenceUrlsSection } from '@/components/admin/form/reference-urls-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCharacters } from '@/hooks/useCharacters'
import { checkDuplicateUrl, useCreateEvent, useUpdateEvent } from '@/hooks/useEvents'
import { EVENT_CATEGORY_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { type Event, EventCategorySchema, type EventRequest, EventRequestSchema } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * フォームのデフォルト値
 */
const DEFAULT_VALUES: DefaultValues<EventRequest> = {
  category: undefined,
  title: '',
  referenceUrls: [],
  stores: [],
  limitedQuantity: undefined,
  startDate: '',
  endDate: undefined,
  endedAt: undefined,
  conditions: [],
  isVerified: true,
  isPreliminary: false,
  shouldTweet: true,
  uuid: undefined
}

/**
 * イベントフォーム
 */
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

  // URL重複チェック結果を保持
  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<number, Event | null>>({})

  // 確認画面の表示状態
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmedData, setConfirmedData] = useState<EventRequest | null>(null)
  // 二重送信防止フラグ
  const [isSubmitted, setIsSubmitted] = useState(false)

  // 住所がある店舗のみフィルタリングしてユニークリストを取得（キーのリスト）
  const storeKeys = Array.from(
    new Set(characters.filter((c) => c.store?.address && c.store.address.trim() !== '').map((c) => c.id))
  ).sort()

  // デフォルト値を生成
  const getInitialValues = (): DefaultValues<EventRequest> => {
    if (defaultValues) {
      return {
        ...DEFAULT_VALUES,
        ...defaultValues,
        startDate: defaultValues.startDate ? dayjs(defaultValues.startDate).format('YYYY-MM-DD') : '',
        endDate: defaultValues.endDate ? dayjs(defaultValues.endDate).format('YYYY-MM-DD') : undefined,
        endedAt: defaultValues.endedAt ? dayjs(defaultValues.endedAt).format('YYYY-MM-DD') : undefined,
        uuid: defaultValues.uuid || uuidv4()
      }
    }

    // 新規作成時はuuidを生成
    return {
      ...DEFAULT_VALUES,
      uuid: uuidv4()
    }
  }

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
    defaultValues: getInitialValues()
  })

  const { fields, remove, update } = useFieldArray({
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

  /**
   * URLの重複チェック
   */
  const checkUrlDuplicate = useCallback(
    async (index: number, url: string) => {
      if (!url || !url.startsWith('http')) {
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
        // エラー時は警告を消す
        setDuplicateWarnings((prev) => ({ ...prev, [index]: null }))
      }
    },
    [defaultValues?.uuid]
  )

  /**
   * 店舗を追加
   */
  const handleAddStore = (storeKey: string) => {
    if (storeKey === '_all') {
      setValue('stores', storeKeys as StoreKey[])
    } else if (!stores.includes(storeKey as StoreKey)) {
      setValue('stores', [...stores, storeKey as StoreKey])
    }
  }

  /**
   * 店舗を削除
   */
  const handleRemoveStore = (storeKey: string) => {
    setValue(
      'stores',
      stores.filter((s) => s !== storeKey)
    )
  }

  /**
   * フォームをリセット
   */
  const handleReset = () => {
    reset(DEFAULT_VALUES)
    setIsConfirming(false)
    setConfirmedData(null)
    setIsSubmitted(false)
  }

  /**
   * 確認画面へ進む
   */
  const handleConfirm = (data: EventRequest) => {
    setConfirmedData(data)
    setIsConfirming(true)
  }

  /**
   * バリデーションエラー時のハンドラ
   */
  const handleValidationError = (formErrors: typeof errors) => {
    console.error('Validation errors:', formErrors)
  }

  /**
   * 入力画面に戻る
   */
  const handleBack = () => {
    setIsConfirming(false)
  }

  /**
   * キャンペーンを保存
   */
  const onSubmit = async () => {
    if (!confirmedData) return
    // 二重送信防止
    if (isSubmitted) {
      console.warn('Already submitted, skipping duplicate submission')
      return
    }

    setIsSubmitted(true)

    // biome-ignore lint/suspicious/noExplicitAny: 動的にプロパティを追加するため
    const payload: any = {
      category: confirmedData.category,
      title: confirmedData.title,
      startDate: dayjs(confirmedData.startDate).toISOString(),
      conditions: confirmedData.conditions.map((c) => ({
        uuid: c.uuid || uuidv4(),
        type: c.type,
        purchaseAmount: c.purchaseAmount,
        quantity: c.quantity
      })),
      stores: confirmedData.stores && confirmedData.stores.length > 0 ? confirmedData.stores : [],
      isVerified: confirmedData.isVerified,
      isPreliminary: confirmedData.isPreliminary,
      shouldTweet: confirmedData.shouldTweet,
      // 新規作成時のみクライアント生成のuuidを含める
      ...(!isEditMode && confirmedData.uuid ? { uuid: confirmedData.uuid } : {})
    }

    // 終了日が空文字やundefined、nullでない場合のみ設定
    if (confirmedData.endDate && confirmedData.endDate.trim() !== '') {
      payload.endDate = dayjs(confirmedData.endDate).toISOString()
    }

    // 実際の終了日が空文字やundefined、nullでない場合のみ設定
    if (confirmedData.endedAt && confirmedData.endedAt.trim() !== '') {
      payload.endedAt = dayjs(confirmedData.endedAt).toISOString()
    }

    // 参照URLが設定されている場合のみ追加
    if (confirmedData.referenceUrls && confirmedData.referenceUrls.length > 0) {
      payload.referenceUrls = confirmedData.referenceUrls.map((r) => ({
        uuid: r.uuid || uuidv4(),
        type: r.type,
        url: r.url
      }))
    }

    // 限定数量が設定されている場合のみ追加
    if (confirmedData.limitedQuantity) {
      payload.limitedQuantity = confirmedData.limitedQuantity
    }

    try {
      if (isEditMode && defaultValues?.uuid) {
        await updateEvent.mutateAsync({
          id: defaultValues.uuid,
          data: payload as Parameters<typeof updateEvent.mutateAsync>[0]['data']
        })
      } else {
        await createEvent.mutateAsync(payload as Parameters<typeof createEvent.mutateAsync>[0])
      }
      handleReset()
      onSuccess?.()
    } catch (_error) {
      // エラー時は再送信可能にする（エラー通知はuseMutationのonErrorで処理）
      setIsSubmitted(false)
    }
  }

  // 確認画面の表示
  if (isConfirming && confirmedData) {
    const isMutating = createEvent.isPending || updateEvent.isPending
    return <EventConfirmation data={confirmedData} isSubmitting={isMutating} onBack={handleBack} onSubmit={onSubmit} />
  }

  return (
    <div>
      <form onSubmit={handleSubmit(handleConfirm, handleValidationError)} className='space-y-3'>
        {/* イベント名 */}
        <div>
          <label htmlFor='event-title' className='mb-1 flex items-center gap-1.5 text-sm font-medium'>
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
            label='開始日'
            register={register('startDate')}
            error={errors.startDate?.message}
          />
          <DateField
            id='end-date'
            label='終了日（任意）'
            register={register('endDate')}
            clearable
            onClear={() => setValue('endDate', undefined, { shouldDirty: true, shouldValidate: true })}
          />
        </div>

        {/* 実際の終了日 */}
        <DateField
          id='actual-end-date'
          label='実際の終了日（配布終了時に設定）'
          register={register('endedAt')}
          clearable
          onClear={() => setValue('endedAt', undefined, { shouldDirty: true, shouldValidate: true })}
          hint='配布が終了した場合に設定すると、自動的に「終了」として扱われます'
        />

        {/* イベント種別・開催店舗 */}
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div>
            <label htmlFor='category' className='mb-1 flex items-center gap-1.5 text-sm font-medium'>
              <Package className='size-4' />
              イベント種別
            </label>
            <Controller
              name='category'
              control={control}
              render={({ field }) => {
                return (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='種別を選択' />
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
            <label htmlFor='store' className='mb-1 flex items-center gap-1.5 text-sm font-medium'>
              <Store className='size-4' />
              開催店舗
            </label>
            <Select value='' onValueChange={handleAddStore}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={stores.length > 0 ? `${stores.length}店舗選択中` : '店舗を選択'} />
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
              <Badge className='gap-1 pr-1 bg-rose-100 text-rose-700 hover:bg-rose-200'>
                <span className='text-xs font-semibold'>全店舗</span>
                <button
                  type='button'
                  onClick={() => setValue('stores', [])}
                  className='ml-0.5 rounded-sm hover:bg-rose-200'
                >
                  <X className='size-3' />
                </button>
              </Badge>
            ) : (
              stores.map((key) => {
                const storeKey = key as StoreKey
                const displayName = STORE_NAME_LABELS[storeKey] || key
                return (
                  <Badge key={key} className='gap-1 pr-1 bg-rose-100 text-rose-700 hover:bg-rose-200'>
                    <span className='text-xs font-semibold'>{displayName}</span>
                    <button
                      type='button'
                      onClick={() => handleRemoveStore(key)}
                      className='ml-0.5 rounded-sm hover:bg-rose-200'
                    >
                      <X className='size-3' />
                    </button>
                  </Badge>
                )
              })
            )}
          </div>
        )}

        {/* 配布条件 */}
        <ConditionsSection
          fields={fields}
          register={register}
          remove={remove}
          update={update}
          error={errors.conditions?.message}
        />

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

        {/* 検証済み・未確定情報・ツイート投稿フラグ */}
        <div className='grid grid-cols-2 gap-4 rounded-md p-3 sm:grid-cols-3'>
          <div className='flex items-center gap-2'>
            <Controller
              name='isVerified'
              control={control}
              render={({ field }) => (
                <Checkbox
                  id='is-verified'
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className='data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600'
                />
              )}
            />
            <label htmlFor='is-verified' className='text-sm font-medium text-gray-700 cursor-pointer'>
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
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className='data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600'
                />
              )}
            />
            <label htmlFor='is-preliminary' className='text-sm font-medium text-gray-700 cursor-pointer'>
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
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className='data-[state=checked]:bg-sky-600 data-[state=checked]:border-sky-600'
                />
              )}
            />
            <label htmlFor='should-tweet' className='text-sm font-medium text-gray-700 cursor-pointer'>
              保存時に投稿する
            </label>
          </div>
        </div>

        {/* ボタン */}
        <div className='flex gap-2 max-w-md mx-auto'>
          <Button type='submit' className='flex-1 bg-[#e50012] hover:bg-[#c5000f]' disabled={isSubmitted}>
            確認する
          </Button>
          <Button type='button' variant='outline' onClick={handleReset} className='flex-1' disabled={isSubmitted}>
            クリア
          </Button>
        </div>
      </form>
    </div>
  )
}
