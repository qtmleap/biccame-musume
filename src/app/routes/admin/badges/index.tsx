import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { LoadingFallback } from '@/components/common/loading-fallback'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PHYSICAL_STORE_KEYS } from '@/data/badges/store-exclusion'
import { useAllBadges, useCreateSpecialBadge, useDeleteBadge, useUpdateBadge } from '@/hooks/use-admin-badges'
import { getBadgeIcon, ICON_MAP } from '@/lib/badge-icons'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import {
  type Badge as BadgeDto,
  BadgeRaritySchema,
  type CreateSpecialBadgeBody,
  CreateSpecialBadgeBodySchema,
  type UpdateBadgeBody,
  UpdateBadgeBodySchema
} from '@/schemas/badge.dto'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RARITY_LABELS: Record<string, string> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY'
}

const RARITY_CHIP: Record<string, string> = {
  common: 'bg-muted text-muted-foreground',
  rare: 'bg-status-upcoming text-status-upcoming-foreground',
  epic: 'bg-favorite text-favorite-foreground',
  legendary: 'bg-rank-gold text-rank-gold-foreground'
}

const CATEGORY_LABELS: Record<string, string> = {
  store: '店舗訪問',
  area: 'エリア',
  milestone: 'マイルストーン',
  event: 'イベント参加',
  event_clear: '店舗別イベント達成',
  vote: '投票',
  special: '特別'
}

const ICON_NAMES = Object.keys(ICON_MAP)

// ---------------------------------------------------------------------------
// Edit form
// ---------------------------------------------------------------------------

type EditFormValues = UpdateBadgeBody

const EditBadgeDialog = ({ badge, open, onClose }: { badge: BadgeDto; open: boolean; onClose: () => void }) => {
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
          <DialogTitle>バッジ編集: {badge.code}</DialogTitle>
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
                          {RARITY_LABELS[r]}
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

// ---------------------------------------------------------------------------
// Create form (special only)
// ---------------------------------------------------------------------------

type CreateFormValues = Omit<CreateSpecialBadgeBody, 'sort_order'> & { sort_order?: number }

const CreateBadgeDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const createBadge = useCreateSpecialBadge()

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<CreateFormValues>({
    resolver: zodResolver(CreateSpecialBadgeBodySchema),
    defaultValues: {
      sort_order: 0,
      rarity: 'common',
      icon_name: 'Star',
      sub_category: 'special_multi_store_clear'
    }
  })

  const subCategory = watch('sub_category')

  const onSubmit = async (values: CreateFormValues) => {
    await createBadge.mutateAsync(values as CreateSpecialBadgeBody)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>特別バッジ 新規作成</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
          <div className='space-y-1'>
            <Label>名称 *</Label>
            <Input {...register('name')} className='md:text-base' />
            {errors.name && <p className='text-xs text-destructive'>{errors.name.message}</p>}
          </div>

          <div className='space-y-1'>
            <Label>説明 *</Label>
            <Input {...register('description')} className='md:text-base' />
            {errors.description && <p className='text-xs text-destructive'>{errors.description.message}</p>}
          </div>

          <div className='space-y-1'>
            <Label>ヒント (未獲得時表示) *</Label>
            <Input {...register('hint')} className='md:text-base' />
            {errors.hint && <p className='text-xs text-destructive'>{errors.hint.message}</p>}
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-1'>
              <Label>レアリティ *</Label>
              <Controller
                control={control}
                name='rarity'
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BadgeRaritySchema.options.map((r) => (
                        <SelectItem key={r} value={r}>
                          {RARITY_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className='space-y-1'>
              <Label>アイコン *</Label>
              <Controller
                control={control}
                name='icon_name'
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
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

          <div className='space-y-1'>
            <Label>サブカテゴリ *</Label>
            <Controller
              control={control}
              name='sub_category'
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
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
              <Label>対象店舗 *</Label>
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
              {errors.condition_meta && <p className='text-xs text-destructive'>{errors.condition_meta.message}</p>}
            </div>
          )}

          {subCategory === 'special_event_id' && (
            <div className='space-y-1'>
              <Label>対象イベントID (UUID) *</Label>
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
              {errors.condition_meta && <p className='text-xs text-destructive'>{errors.condition_meta.message}</p>}
            </div>
          )}

          <div className='flex justify-end gap-2 pt-2'>
            <Button type='button' variant='outline' onClick={onClose}>
              キャンセル
            </Button>
            <Button
              type='submit'
              disabled={createBadge.isPending}
              className='bg-brand hover:bg-brand/90 text-brand-foreground'
            >
              {createBadge.isPending ? '作成中...' : '作成する'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Badge row
// ---------------------------------------------------------------------------

const BadgeRow = ({ badge }: { badge: BadgeDto }) => {
  const [editOpen, setEditOpen] = useState(false)
  const deleteBadge = useDeleteBadge()
  const isSpecial = badge.code.startsWith('special_')

  const Icon = (() => {
    try {
      return getBadgeIcon(badge.icon_name)
    } catch {
      return null
    }
  })()

  return (
    <>
      <div className='flex items-center gap-3 rounded-lg border p-3 bg-card'>
        <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
          {Icon && <Icon className='size-5' />}
        </div>

        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='text-sm font-semibold text-foreground truncate'>{badge.name}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${RARITY_CHIP[badge.rarity]}`}>
              {RARITY_LABELS[badge.rarity]}
            </span>
            {badge.is_hidden && (
              <span className='text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive'>
                非表示
              </span>
            )}
            {isSpecial && (
              <span className='text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground'>
                特別
              </span>
            )}
          </div>
          <p className='text-xs text-muted-foreground truncate mt-0.5'>{badge.code}</p>
        </div>

        <div className='flex items-center gap-1 shrink-0'>
          <Button size='sm' variant='outline' onClick={() => setEditOpen(true)}>
            <Pencil className='size-3 mr-1' />
            編集
          </Button>

          {isSpecial && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size='sm' variant='destructive'>
                  <Trash2 className='size-3 mr-1' />
                  削除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>バッジを削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    「{badge.name}」を削除します。この操作は取り消せません。獲得済みユーザーのバッジ記録も削除されます。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction variant='destructive' onClick={() => deleteBadge.mutate(badge.code)}>
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <EditBadgeDialog badge={badge} open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

const CategorySection = ({ category, badges }: { category: string; badges: BadgeDto[] }) => {
  return (
    <section>
      <h2 className='text-base font-bold text-foreground mb-2'>
        {CATEGORY_LABELS[category] ?? category}
        <span className='ml-2 text-sm font-normal text-muted-foreground'>({badges.length})</span>
      </h2>
      <div className='space-y-2'>
        {badges.map((badge) => (
          <BadgeRow key={badge.code} badge={badge} />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

const BadgesContent = () => {
  const [createOpen, setCreateOpen] = useState(false)
  const { data } = useAllBadges()
  const badges = data.badges

  const grouped = badges.reduce<Record<string, BadgeDto[]>>((acc, badge) => {
    const cat = badge.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(badge)
    return acc
  }, {})

  const categoryOrder = ['store', 'area', 'milestone', 'event', 'event_clear', 'vote', 'special']

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      <div className='mb-6 md:mb-8'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold text-foreground'>バッジ管理</h1>
            <p className='mt-2 text-sm text-muted-foreground'>
              特別バッジの作成・編集と表示設定。自動生成バッジは表示フィールドのみ編集可。
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              ※ 非表示バッジは現時点の API では一覧から除外されます (MVP 制限)。
            </p>
          </div>
          <Button
            size='sm'
            className='bg-brand hover:bg-brand/90 text-brand-foreground shrink-0'
            onClick={() => setCreateOpen(true)}
          >
            <Plus className='size-4 mr-1' />
            特別バッジ作成
          </Button>
        </div>
      </div>

      <div className='space-y-8'>
        {categoryOrder
          .filter((cat) => grouped[cat]?.length)
          .map((cat) => (
            <CategorySection key={cat} category={cat} badges={grouped[cat]} />
          ))}
      </div>

      <CreateBadgeDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

const BadgesPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <BadgesContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/admin/badges/')({
  component: BadgesPage
})
