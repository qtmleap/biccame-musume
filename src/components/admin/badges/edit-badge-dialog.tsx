import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PHYSICAL_STORE_KEYS } from '@/data/badges/store-exclusion'
import { useUpdateBadge } from '@/hooks/use-admin-badges'
import { BADGE_RARITY_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import {
  type Badge as BadgeDto,
  BadgeRaritySchema,
  type UpdateBadgeBody,
  UpdateBadgeBodySchema
} from '@/schemas/badge.dto'
import { ICON_NAMES } from './badge-display-constants'

type EditFormValues = UpdateBadgeBody

export const EditBadgeDialog = ({ badge, open, onClose }: { badge: BadgeDto; open: boolean; onClose: () => void }) => {
  const updateBadge = useUpdateBadge()
  const isSpecial = badge.code.startsWith('special_')

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty }
  } = useForm<EditFormValues>({
    resolver: zodResolver(UpdateBadgeBodySchema),
    defaultValues: {
      name: badge.name,
      description: badge.description,
      hint: badge.hint,
      rarity: badge.rarity,
      icon_name: badge.icon_name,
      sort_order: badge.sort_order,
      is_hidden: badge.is_hidden,
      sub_category: isSpecial ? (badge.sub_category as 'special_multi_store_clear' | 'special_event_id') : undefined,
      condition_meta: undefined
    }
  })

  const subCategory = useWatch({ control, name: 'sub_category' })

  const onSubmit = async (values: EditFormValues) => {
    const payload: UpdateBadgeBody = { ...values }
    if (!isSpecial) {
      delete payload.sub_category
      delete payload.condition_meta
    }
    await updateBadge.mutateAsync({ code: badge.code, body: payload })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='font-display'>バッジ編集: {badge.code}</DialogTitle>
        </DialogHeader>

        {!isSpecial && (
          <p className='text-xs text-muted-foreground bg-muted rounded px-3 py-2'>
            自動生成バッジです。表示フィールド (名称・説明・ヒント・アイコン・レアリティ・並び順・表示)
            のみ編集できます。
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
          <div className='space-y-1'>
            <Label>名称</Label>
            <Input {...register('name')} className='md:text-base' />
            {errors.name && <p className='text-xs text-destructive'>{errors.name.message}</p>}
          </div>

          <div className='space-y-1'>
            <Label>説明</Label>
            <Input {...register('description')} className='md:text-base' />
            {errors.description && <p className='text-xs text-destructive'>{errors.description.message}</p>}
          </div>

          <div className='space-y-1'>
            <Label>ヒント (未獲得時表示)</Label>
            <Input {...register('hint')} className='md:text-base' />
            {errors.hint && <p className='text-xs text-destructive'>{errors.hint.message}</p>}
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-1'>
              <Label>レアリティ</Label>
              <Controller
                control={control}
                name='rarity'
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder='選択' />
                    </SelectTrigger>
                    <SelectContent>
                      {BadgeRaritySchema.options.map((r) => (
                        <SelectItem key={r} value={r}>
                          {BADGE_RARITY_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className='space-y-1'>
              <Label>アイコン</Label>
              <Controller
                control={control}
                name='icon_name'
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder='選択' />
                    </SelectTrigger>
                    <SelectContent>
                      {ICON_NAMES.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className='space-y-1'>
            <Label>並び順</Label>
            <Input type='number' {...register('sort_order', { valueAsNumber: true })} className='md:text-base' />
          </div>

          <div className='flex items-center gap-3'>
            <Controller
              control={control}
              name='is_hidden'
              render={({ field }) => (
                <Checkbox
                  id='is_hidden'
                  checked={field.value ?? false}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <Label htmlFor='is_hidden'>非表示</Label>
          </div>

          {isSpecial && (
            <>
              <div className='space-y-1'>
                <Label>サブカテゴリ (特別バッジ用)</Label>
                <Controller
                  control={control}
                  name='sub_category'
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder='選択' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='special_multi_store_clear'>複数店舗イベント達成</SelectItem>
                        <SelectItem value='special_event_id'>特定イベント達成</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {subCategory === 'special_multi_store_clear' && (
                <div className='space-y-1'>
                  <Label>対象店舗 (condition_meta.storeKeys)</Label>
                  <Controller
                    control={control}
                    name='condition_meta'
                    render={({ field }) => {
                      const current = (field.value as { storeKeys?: string[] } | undefined)?.storeKeys ?? []
                      return (
                        <div className='space-y-2'>
                          <div className='flex flex-wrap gap-1'>
                            {current.map((sk) => (
                              <Badge
                                key={sk}
                                variant='secondary'
                                className='cursor-pointer'
                                onClick={() => field.onChange({ storeKeys: current.filter((s) => s !== sk) })}
                              >
                                {STORE_NAME_LABELS[sk as keyof typeof STORE_NAME_LABELS] ?? sk} ×
                              </Badge>
                            ))}
                          </div>
                          <Select
                            onValueChange={(v) => {
                              if (!current.includes(v)) {
                                field.onChange({ storeKeys: [...current, v] })
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder='店舗を追加' />
                            </SelectTrigger>
                            <SelectContent>
                              {PHYSICAL_STORE_KEYS.filter((sk) => !current.includes(sk)).map((sk) => (
                                <SelectItem key={sk} value={sk}>
                                  {STORE_NAME_LABELS[sk as keyof typeof STORE_NAME_LABELS] ?? sk}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    }}
                  />
                </div>
              )}

              {subCategory === 'special_event_id' && (
                <div className='space-y-1'>
                  <Label>対象イベントID (UUID)</Label>
                  <Controller
                    control={control}
                    name='condition_meta'
                    render={({ field }) => {
                      const current = (field.value as { eventId?: string } | undefined)?.eventId ?? ''
                      return (
                        <Input
                          value={current}
                          onChange={(e) => field.onChange({ eventId: e.target.value })}
                          placeholder='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
                          className='md:text-base'
                        />
                      )
                    }}
                  />
                </div>
              )}
            </>
          )}

          <div className='flex justify-end gap-2 pt-2'>
            <Button type='button' variant='outline' onClick={onClose}>
              キャンセル
            </Button>
            <Button
              type='submit'
              disabled={!isDirty || updateBadge.isPending}
              className='bg-brand hover:bg-brand/90 text-brand-foreground'
            >
              {updateBadge.isPending ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
