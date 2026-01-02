import { zodResolver } from '@hookform/resolvers/zod'
import dayjs from 'dayjs'
import { Calendar, Coins, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { useFieldArray, useForm, useWatch, Controller } from 'react-hook-form'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCharacters } from '@/hooks/useCharacters'
import { useCreateEvent, useUpdateEvent } from '@/hooks/useEvents'
import { type AckeyCampaign, AckeyCampaignConditionTypeSchema, EventCategorySchema, EVENT_CATEGORY_LABELS, ReferenceUrlTypeSchema, REFERENCE_URL_TYPE_LABELS } from '@/schemas/ackey-campaign.dto'

/**
 * フォームのスキーマ定義
 */
const EventFormSchema = z.object({
  category: EventCategorySchema,
  name: z.string().min(1, 'イベント名は必須です'),
  referenceUrls: z.array(
    z.object({
      type: ReferenceUrlTypeSchema,
      url: z.string().url('有効なURLを入力してください')
    })
  ).optional(),
  stores: z.array(z.string()).optional(),
  limitedQuantity: z.number().min(1).optional(),
  startDate: z.string().min(1, '開始日は必須です'),
  endDate: z.string().optional(),
  conditions: z
    .array(
      z.object({
        type: AckeyCampaignConditionTypeSchema,
        purchaseAmount: z.number().min(0).optional(),
        quantity: z.number().min(1).optional()
      })
    )
    .min(1, '最低1つの条件を設定してください'),
  isEnded: z.boolean()
})

type EventFormValues = z.infer<typeof EventFormSchema>

/**
 * イベントフォーム
 */
export const EventForm = ({ event, onSuccess }: { event?: AckeyCampaign; onSuccess?: () => void }) => {
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const { data: characters } = useCharacters()

  // 住所がある店舗のみフィルタリングしてユニークリストを取得
  const storeNames = Array.from(
    new Set(characters.filter((c) => c.address && c.address.trim() !== '').map((c) => c.store_name))
  ).sort()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<EventFormValues>({
    resolver: zodResolver(EventFormSchema),
    defaultValues: event
      ? {
          category: event.category,
          name: event.name,
          referenceUrls: event.referenceUrls || [],
          stores: event.stores || [],
          limitedQuantity: event.limitedQuantity,
          startDate: dayjs(event.startDate).format('YYYY-MM-DD'),
          endDate: event.endDate ? dayjs(event.endDate).format('YYYY-MM-DD') : '',
          conditions: event.conditions,
          isEnded: event.isEnded ?? false
        }
      : {
          category: undefined,
          name: '',
          referenceUrls: [],
          stores: [],
          limitedQuantity: undefined,
          startDate: '',
          endDate: '',
          conditions: [],
          isEnded: false
        }
  })

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'conditions'
  })

  const { fields: referenceUrlFields, append: appendReferenceUrl, remove: removeReferenceUrl } = useFieldArray({
    control,
    name: 'referenceUrls'
  })

  const stores = watch('stores') || []
  const conditions = useWatch({ control, name: 'conditions' })
  const referenceUrls = useWatch({ control, name: 'referenceUrls' }) || []

  // 編集モードの場合、初期値をセット
  useEffect(() => {
    if (event) {
      console.log('EventForm useEffect - event:', event)
      console.log('EventForm useEffect - event.category:', event.category)
      reset({
        category: event.category,
        name: event.name,
        referenceUrls: event.referenceUrls || [],
        stores: event.stores || [],
        limitedQuantity: event.limitedQuantity,
        startDate: dayjs(event.startDate).format('YYYY-MM-DD'),
        endDate: event.endDate ? dayjs(event.endDate).format('YYYY-MM-DD') : '',
        conditions: event.conditions,
        isEnded: event.isEnded ?? false
      })
    }
  }, [event, reset])

  /**
   * 特定タイプの条件が既に存在するかチェック
   */
  const hasConditionType = (type: EventFormValues['conditions'][number]['type']): boolean => {
    return conditions?.some((c) => c.type === type) ?? false
  }

  /**
   * 全員配布・抽選・先着のいずれかが選択されているかチェック
   */
  const hasDistributionCondition = (): boolean => {
    return conditions?.some((c) => c.type === 'everyone' || c.type === 'first_come' || c.type === 'lottery') ?? false
  }

  /**
   * 条件を追加
   */
  const handleAddCondition = (type: EventFormValues['conditions'][number]['type']) => {
    if (hasConditionType(type)) return
    if ((type === 'everyone' || type === 'first_come' || type === 'lottery') && hasDistributionCondition()) return

    const newCondition = {
      type,
      ...(type === 'purchase' ? { purchaseAmount: 3000 } : {}),
      ...(type === 'first_come' || type === 'lottery' ? { quantity: 1 } : {})
    }
    append(newCondition)

    // 先着・抽選の場合は限定数を自動入力
    if (type === 'first_come' || type === 'lottery') {
      setValue('limitedQuantity', 1)
    }
  }

  /**
   * 条件を更新（先着・抽選の人数変更時に限定数も更新）
   */
  const handleUpdateQuantity = (index: number, quantity: number) => {
    const current = fields[index]
    update(index, { ...current, quantity })
    setValue('limitedQuantity', quantity)
  }

  /**
   * 店舗を追加
   */
  const handleAddStore = (storeName: string) => {
    if (storeName === '_all') {
      setValue('stores', storeNames)
    } else if (!stores.includes(storeName)) {
      setValue('stores', [...stores, storeName])
    }
  }

  /**
   * 店舗を削除
   */
  const handleRemoveStore = (storeName: string) => {
    setValue(
      'stores',
      stores.filter((s) => s !== storeName)
    )
  }

  /**
   * フォームをリセット
   */
  const handleReset = () => {
    reset({
      category: undefined,
      name: '',
      referenceUrls: [],
      stores: [],
      limitedQuantity: undefined,
      startDate: '',
      endDate: '',
      conditions: [],
      isEnded: false
    })
  }

  /**
   * キャンペーンを保存
   */
  const onSubmit = async (data: EventFormValues) => {
    const payload = {
      ...data,
      startDate: dayjs(data.startDate).toISOString(),
      endDate: data.endDate ? dayjs(data.endDate).toISOString() : undefined,
      stores: data.stores && data.stores.length > 0 ? data.stores : undefined,
      referenceUrls: data.referenceUrls && data.referenceUrls.length > 0 ? data.referenceUrls : undefined
    }

    if (event) {
      await updateEvent.mutateAsync({ id: event.id, data: payload })
    } else {
      await createEvent.mutateAsync(payload)
    }
    handleReset()
    onSuccess?.()
  }

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className='space-y-3'>
        {/* イベント名 */}
        <div>
          <label htmlFor='event-name' className='mb-1 block text-sm font-medium'>
            イベント名
          </label>
          <Input
            id='event-name'
            type='text'
            placeholder='例: 新春アクキープレゼント'
            {...register('name')}
            className='w-full'
          />
          {errors.name && <p className='mt-1 text-xs text-destructive'>{errors.name.message}</p>}
        </div>

        {/* 日付設定 */}
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div>
            <label htmlFor='start-date' className='mb-1 flex items-center gap-1.5 text-sm font-medium'>
              <Calendar className='size-4' />
              開始日
            </label>
            <Input id='start-date' type='date' {...register('startDate')} className='w-full' />
            {errors.startDate && <p className='mt-1 text-xs text-destructive'>{errors.startDate.message}</p>}
          </div>
          <div>
            <label htmlFor='end-date' className='mb-1 flex items-center gap-1.5 text-sm font-medium'>
              <Calendar className='size-4' />
              終了日（任意）
            </label>
            <Input id='end-date' type='date' {...register('endDate')} className='w-full' />
          </div>
        </div>

        {/* イベント種別・開催店舗 */}
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div>
            <label htmlFor='category' className='mb-1 block text-sm font-medium'>
              イベント種別
            </label>
            <Controller
              name='category'
              control={control}
              render={({ field }) => {
                console.log('Controller field.value:', field.value)
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
            <label htmlFor='store' className='mb-1 block text-sm font-medium'>
              開催店舗（任意）
            </label>
            <Select value='' onValueChange={handleAddStore}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={stores.length > 0 ? `${stores.length}店舗選択中` : '店舗を選択'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='_all'>全店舗を選択</SelectItem>
                {storeNames.map((storeName) => (
                  <SelectItem key={storeName} value={storeName} disabled={stores.includes(storeName)}>
                    {storeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 選択された店舗のバッジ */}
        {stores.length > 0 && (
          <div className='flex flex-wrap gap-1.5'>
            {stores.length === storeNames.length ? (
              <Badge className='gap-1 pr-1 bg-rose-100 text-rose-700 hover:bg-rose-200'>
                <span className='text-xs font-semibold'>全店舗</span>
                <button type='button' onClick={() => setValue('stores', [])} className='ml-0.5 rounded-sm hover:bg-rose-200'>
                  <X className='size-3' />
                </button>
              </Badge>
            ) : (
              stores.map((storeName) => (
                <Badge key={storeName} className='gap-1 pr-1 bg-rose-100 text-rose-700 hover:bg-rose-200'>
                  <span className='text-xs font-semibold'>{storeName}</span>
                  <button type='button' onClick={() => handleRemoveStore(storeName)} className='ml-0.5 rounded-sm hover:bg-rose-200'>
                    <X className='size-3' />
                  </button>
                </Badge>
              ))
            )}
          </div>
        )}

        {/* 配布条件 */}
        <div>
          <div className='mb-1.5 block text-sm font-medium'>配布条件</div>
          <div className='mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => handleAddCondition('purchase')}
              disabled={false}
              className={hasConditionType('purchase') ? 'border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800' : ''}
            >
              <Coins className='mr-1.5 size-4' />
              購入金額
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => handleAddCondition('first_come')}
              disabled={hasDistributionCondition() && !hasConditionType('first_come')}
              className={hasConditionType('first_come') ? 'border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800' : ''}
            >
              <Users className='mr-1.5 size-4' />
              先着
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => handleAddCondition('lottery')}
              disabled={hasDistributionCondition() && !hasConditionType('lottery')}
              className={hasConditionType('lottery') ? 'border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800' : ''}
            >
              <Users className='mr-1.5 size-4' />
              抽選
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => handleAddCondition('everyone')}
              disabled={hasDistributionCondition() && !hasConditionType('everyone')}
              className={hasConditionType('everyone') ? 'border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800' : ''}
            >
              <Users className='mr-1.5 size-4' />
              全員配布
            </Button>
          </div>
          {errors.conditions && <p className='mb-2 text-xs text-destructive'>{errors.conditions.message}</p>}

          {/* 条件リスト */}
          <div className='grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2'>
            <AnimatePresence initial={false}>
              {fields.map((field, index) => (
                <motion.div
                  key={field.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className='bg-background'
                >
                  <div className='flex items-center gap-2 p-2'>
                  <div className='flex-1'>
                    {field.type === 'purchase' && (
                    <div className='flex items-center gap-2'>
                      <Coins className='size-4 shrink-0 text-muted-foreground' />
                      <Input
                        type='number'
                        min='0'
                        step='1'
                        {...register(`conditions.${index}.purchaseAmount`, { valueAsNumber: true })}
                        className='w-full'
                      />
                      <span className='shrink-0 text-sm text-muted-foreground'>円以上</span>
                    </div>
                  )}
                  {field.type === 'first_come' && (
                    <div className='flex items-center gap-2'>
                      <Users className='size-4 shrink-0 text-muted-foreground' />
                      <Input
                        type='number'
                        min='1'
                        defaultValue={field.quantity || 1}
                        onChange={(e) => handleUpdateQuantity(index, Number.parseInt(e.target.value, 10))}
                        className='w-full'
                      />
                      <span className='shrink-0 text-sm text-muted-foreground'>名</span>
                    </div>
                  )}
                  {field.type === 'lottery' && (
                    <div className='flex items-center gap-2'>
                      <Users className='size-4 shrink-0 text-muted-foreground' />
                      <Input
                        type='number'
                        min='1'
                        defaultValue={field.quantity || 1}
                        onChange={(e) => handleUpdateQuantity(index, Number.parseInt(e.target.value, 10))}
                        className='w-full'
                      />
                      <span className='shrink-0 text-sm text-muted-foreground'>名</span>
                    </div>
                  )}
                  {field.type === 'everyone' && (
                    <div className='flex items-center gap-2'>
                      <Users className='size-4 shrink-0 text-muted-foreground' />
                      <span className='text-sm text-muted-foreground'>全員配布</span>
                    </div>
                  )}
                    </div>
                    <Button type='button' size='icon' variant='ghost' onClick={() => remove(index)} className='shrink-0'>
                      <X className='size-4' />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* 参考URL */}
        <div>
          <div className='mb-1.5 block text-sm font-medium'>参考URL（任意）</div>
          <div className='mb-2 flex flex-wrap gap-2'>
            {ReferenceUrlTypeSchema.options.map((type) => (
              <Button
                key={type}
                type='button'
                size='sm'
                variant='outline'
                onClick={() => appendReferenceUrl({ type, url: '' })}
                disabled={referenceUrls.some((r) => r.type === type)}
                className={referenceUrls.some((r) => r.type === type) ? 'border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800' : ''}
              >
                {REFERENCE_URL_TYPE_LABELS[type]}
              </Button>
            ))}
          </div>
          <div className='space-y-1.5'>
            <AnimatePresence mode='popLayout'>
              {referenceUrlFields.map((field, index) => (
                <motion.div
                  key={field.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className='flex items-center gap-2'>
                    <span className='shrink-0 text-sm font-medium w-10'>{REFERENCE_URL_TYPE_LABELS[field.type]}</span>
                    <Input
                      type='url'
                      placeholder='https://twitter.com/...'
                      {...register(`referenceUrls.${index}.url`)}
                      className='flex-1'
                    />
                    <Button type='button' size='icon' variant='ghost' onClick={() => removeReferenceUrl(index)} className='shrink-0'>
                      <X className='size-4' />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* ステータスフラグ */}
        <div className='flex items-center gap-2'>
          <Checkbox
            id='is-ended'
            checked={watch('isEnded')}
            onCheckedChange={(checked) => setValue('isEnded', checked === true)}
            className='border-rose-400 data-[state=checked]:bg-rose-500 data-[state=checked]:border-rose-500'
          />
          <label htmlFor='is-ended' className='text-sm font-medium'>
            終了済み
          </label>
        </div>

        {/* ボタン */}
        <div className='flex gap-2'>
          <Button type='submit' className='flex-1 bg-[#e50012] hover:bg-[#c5000f]' disabled={isSubmitting}>
            {isSubmitting ? '登録中...' : '登録'}
          </Button>
          <Button type='button' variant='outline' onClick={handleReset} className='flex-1'>
            クリア
          </Button>
        </div>
      </form>
    </div>
  )
}
