import { zodResolver } from '@hookform/resolvers/zod'
import dayjs from 'dayjs'
import { FileText, FolderTree, ListOrdered, Package } from 'lucide-react'
import { useState } from 'react'
import { Controller, type DefaultValues, useForm } from 'react-hook-form'
import { v4 as uuidv4 } from 'uuid'
import { DateField } from '@/components/admin/form/date-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useCreateEventGroup, useUpdateEventGroup } from '@/hooks/use-event-groups'
import {
  type EventGroupDetail,
  EventGroupItemTypeSchema,
  type EventGroupRequest,
  EventGroupRequestSchema
} from '@/schemas/event-group.dto'

const ITEM_TYPE_LABELS: Record<EventGroupRequest['itemType'], string> = {
  card: '名刺',
  badge: '缶バッジ',
  other: 'その他'
}

const DEFAULT_VALUES: DefaultValues<EventGroupRequest> = {
  uuid: undefined,
  title: '',
  description: '',
  itemType: undefined,
  startDate: '',
  endDate: undefined,
  sortOrder: 0
}

export const toGroupFormValues = (group: EventGroupDetail): DefaultValues<EventGroupRequest> => ({
  uuid: group.uuid,
  title: group.title,
  description: group.description ?? '',
  itemType: group.itemType,
  startDate: dayjs(group.startDate).format('YYYY-MM-DD'),
  endDate: group.endDate ? dayjs(group.endDate).format('YYYY-MM-DD') : undefined,
  sortOrder: group.sortOrder
})

const buildInitialValues = (defaultValues?: DefaultValues<EventGroupRequest>): DefaultValues<EventGroupRequest> => {
  if (defaultValues) {
    return {
      ...DEFAULT_VALUES,
      ...defaultValues,
      startDate: defaultValues.startDate ? dayjs(defaultValues.startDate).format('YYYY-MM-DD') : '',
      endDate: defaultValues.endDate ? dayjs(defaultValues.endDate).format('YYYY-MM-DD') : undefined,
      uuid: defaultValues.uuid || uuidv4()
    }
  }
  return {
    ...DEFAULT_VALUES,
    uuid: uuidv4()
  }
}

const toPayload = (
  data: EventGroupRequest,
  opts: { isEditMode: boolean; fallbackUuid?: string }
): EventGroupRequest => ({
  uuid: opts.isEditMode && opts.fallbackUuid ? opts.fallbackUuid : data.uuid || uuidv4(),
  title: data.title.trim(),
  description: data.description?.trim() ? data.description.trim() : undefined,
  itemType: data.itemType,
  startDate: dayjs(data.startDate).toISOString(),
  endDate: data.endDate && data.endDate.trim() !== '' ? dayjs(data.endDate).toISOString() : undefined,
  sortOrder: data.sortOrder ?? 0
})

export const EventGroupForm = ({
  defaultValues,
  onSuccess,
  isEditMode = false
}: {
  defaultValues?: DefaultValues<EventGroupRequest>
  onSuccess?: (group: { uuid: string }) => void
  isEditMode?: boolean
}) => {
  const createGroup = useCreateEventGroup()
  const updateGroup = useUpdateEventGroup()
  const [isSubmitted, setIsSubmitted] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<EventGroupRequest>({
    resolver: zodResolver(EventGroupRequestSchema),
    defaultValues: buildInitialValues(defaultValues),
    mode: 'onBlur'
  })

  const handleReset = () => {
    reset(buildInitialValues(defaultValues))
    setIsSubmitted(false)
  }

  const onSubmit = async (data: EventGroupRequest) => {
    if (isSubmitted) return
    setIsSubmitted(true)
    const payload = toPayload(data, { isEditMode, fallbackUuid: defaultValues?.uuid })
    try {
      const result =
        isEditMode && defaultValues?.uuid
          ? await updateGroup.mutateAsync({ id: defaultValues.uuid, data: payload })
          : await createGroup.mutateAsync(payload)
      handleReset()
      onSuccess?.({ uuid: result.uuid })
    } catch (_error) {
      setIsSubmitted(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className='space-y-5'>
      {/* タイトル */}
      <div>
        <label htmlFor='group-title' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
          <FileText className='size-4' />
          グループ名
        </label>
        <Input
          id='group-title'
          type='text'
          placeholder='例: 11周年記念キャンペーン（名刺）'
          {...register('title')}
          className='w-full'
        />
        {errors.title && <p className='mt-1 text-xs text-destructive'>{errors.title.message}</p>}
      </div>

      {/* アイテム種別・並び順 */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div>
          <label htmlFor='group-item-type-trigger' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
            <Package className='size-4' />
            アイテム種別
          </label>
          <Controller
            name='itemType'
            control={control}
            render={({ field }) => (
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger id='group-item-type-trigger' className='w-full'>
                  <SelectValue placeholder='種別を選択' />
                </SelectTrigger>
                <SelectContent>
                  {EventGroupItemTypeSchema.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {ITEM_TYPE_LABELS[opt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.itemType && <p className='mt-1 text-xs text-destructive'>{errors.itemType.message}</p>}
        </div>

        <div>
          <label htmlFor='group-sort-order' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
            <ListOrdered className='size-4' />
            並び順
          </label>
          <Input
            id='group-sort-order'
            type='number'
            min={0}
            {...register('sortOrder', { valueAsNumber: true })}
            className='w-full'
          />
          {errors.sortOrder && <p className='mt-1 text-xs text-destructive'>{errors.sortOrder.message}</p>}
        </div>
      </div>

      {/* 期間 */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <DateField
          id='group-start-date'
          label='開始日'
          control={control}
          name='startDate'
          error={errors.startDate?.message}
        />
        <DateField
          id='group-end-date'
          label='終了日（任意・期間未定なら空欄）'
          control={control}
          name='endDate'
          clearable
        />
      </div>

      <Separator />

      {/* 説明文 */}
      <div>
        <label htmlFor='group-description' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
          <FolderTree className='size-4' />
          説明文（任意）
        </label>
        <Textarea
          id='group-description'
          rows={4}
          placeholder='ページ上部に表示される説明文'
          {...register('description')}
          className='w-full'
        />
        {errors.description && <p className='mt-1 text-xs text-destructive'>{errors.description.message}</p>}
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
          {isSubmitted ? '送信中…' : isEditMode ? '更新する' : '登録する'}
        </Button>
      </div>
    </form>
  )
}
