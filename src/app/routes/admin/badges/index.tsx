import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useMemo, useState } from 'react'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PHYSICAL_STORE_KEYS } from '@/data/badges/store-exclusion'
import {
  useAllBadges,
  useCreateSpecialBadge,
  useDeleteBadge,
  useRecalculateBadges,
  useUpdateBadge
} from '@/hooks/use-admin-badges'
import { BADGE_CATEGORY_DEFS } from '@/lib/badge-categories'
import { getBadgeIcon, ICON_MAP } from '@/lib/badge-icons'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'
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

const RARITY_ICON_BG: Record<string, string> = {
  common: 'bg-muted text-muted-foreground',
  rare: 'bg-status-upcoming/30 text-status-upcoming-foreground',
  epic: 'bg-favorite/20 text-favorite',
  legendary: 'bg-rank-gold/20 text-rank-gold-foreground'
}

const ICON_NAMES = Object.keys(ICON_MAP)

const ACCENT_DOT: Record<string, string> = {
  'rank-gold': 'bg-rank-gold',
  favorite: 'bg-favorite',
  brand: 'bg-brand',
  'category-limited-card-solid': 'bg-category-limited-card-solid',
  'rank-bronze': 'bg-rank-bronze'
}

const ACCENT_TEXT: Record<string, string> = {
  'rank-gold': 'text-rank-gold',
  favorite: 'text-favorite',
  brand: 'text-brand',
  'category-limited-card-solid': 'text-category-limited-card-solid',
  'rank-bronze': 'text-rank-bronze'
}

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
          <DialogTitle className='font-display'>特別バッジ 新規作成</DialogTitle>
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
// Badge card
// ---------------------------------------------------------------------------

const BadgeCard = ({ badge }: { badge: BadgeDto }) => {
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
      <div className='group relative flex flex-col rounded-xl border border-card-border bg-card p-3 transition-shadow hover:shadow-sm'>
        {/* Hover actions */}
        <div className='absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size='icon'
                  variant='ghost'
                  className='size-7 bg-card/80 backdrop-blur'
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className='size-3.5' />
                  <span className='sr-only'>編集</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>編集</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {isSpecial && (
            <AlertDialog>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        size='icon'
                        variant='ghost'
                        className='size-7 bg-card/80 backdrop-blur text-destructive hover:text-destructive'
                      >
                        <Trash2 className='size-3.5' />
                        <span className='sr-only'>削除</span>
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>削除</TooltipContent>
                </Tooltip>
              </TooltipProvider>
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

        {/* Tooltip-wrapped main content (icon + name) */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='flex flex-col cursor-default'>
                <div className='flex justify-center mb-2'>
                  <div
                    className={cn('flex size-14 items-center justify-center rounded-2xl', RARITY_ICON_BG[badge.rarity])}
                  >
                    {Icon && <Icon className='size-7' />}
                  </div>
                </div>

                <p className='text-sm font-bold text-foreground line-clamp-2 leading-tight min-h-[2.5em] text-center'>
                  {badge.name}
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent side='bottom' className='max-w-xs'>
              <div className='space-y-1'>
                <div className='flex items-center gap-1.5'>
                  <span
                    className={cn(
                      'text-[9px] font-numeric font-bold tracking-widest px-1.5 py-0.5 rounded-full',
                      RARITY_CHIP[badge.rarity]
                    )}
                  >
                    {RARITY_LABELS[badge.rarity]}
                  </span>
                  <span className='font-bold'>{badge.name}</span>
                </div>
                <p className='text-[10px] font-numeric text-muted-foreground'>{badge.code}</p>
                <p className='text-xs'>{badge.description}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Status chips (only when meaningful) */}
        {(badge.is_hidden || isSpecial) && (
          <div className='mt-1.5 flex items-center justify-center gap-1 flex-wrap'>
            {badge.is_hidden && (
              <span className='text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground'>
                非表示
              </span>
            )}
            {isSpecial && (
              <span className='text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rank-gold/15 text-rank-gold-foreground'>
                特別
              </span>
            )}
          </div>
        )}
      </div>

      <EditBadgeDialog badge={badge} open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

const CategorySection = ({
  categoryKey,
  badges,
  totalInCategory
}: {
  categoryKey: string
  badges: BadgeDto[]
  totalInCategory: number
}) => {
  const catDef = BADGE_CATEGORY_DEFS.find((d) => d.key === categoryKey)
  const label = catDef?.label ?? categoryKey
  const accent = catDef?.accent ?? 'rank-gold'

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal }}
    >
      <header className='flex items-center justify-between gap-3 mb-3'>
        <div className='flex items-center gap-2 min-w-0'>
          <span aria-hidden className={cn('inline-block size-2.5 rounded-full shrink-0', ACCENT_DOT[accent])} />
          <h2 className={cn('font-bold text-base md:text-lg truncate', ACCENT_TEXT[accent])}>{label}</h2>
        </div>
        <span className='shrink-0 text-xs font-numeric tabular-nums text-muted-foreground'>
          <span className='font-bold text-foreground'>{badges.length}</span>
          {badges.length !== totalInCategory && <span> / {totalInCategory}</span>}
        </span>
      </header>
      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 md:gap-3'>
        {badges.map((badge) => (
          <BadgeCard key={badge.code} badge={badge} />
        ))}
      </div>
    </motion.section>
  )
}

// ---------------------------------------------------------------------------
// Recalculate button
// ---------------------------------------------------------------------------

const RecalculateBadgesButton = () => {
  const recalc = useRecalculateBadges()
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size='sm' variant='outline' disabled={recalc.isPending}>
          <RefreshCw className={cn('size-4 mr-1', recalc.isPending && 'animate-spin')} />
          {recalc.isPending ? '再評価中...' : 'バッジ再評価'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className='rounded-2xl shadow-2xl border-transparent'>
        <AlertDialogHeader>
          <AlertDialogTitle>全ユーザーのバッジを再評価しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            店舗数や条件メタが変わった時に使用。全ユーザー × 全バッジを評価して未獲得の条件達成バッジを付与します。
            ユーザー数によっては数十秒かかる場合があります。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              recalc.mutate()
              setOpen(false)
            }}
            variant='outline'
            className='border-brand/50 text-brand hover:bg-brand/10 hover:text-brand hover:border-brand/50'
          >
            実行する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------------------
// Stats hero
// ---------------------------------------------------------------------------

type StatCardProps = { label: string; value: number; accent?: string }

const StatCard = ({ label, value, accent = 'text-foreground' }: StatCardProps) => (
  <div className='bg-card border border-card-border rounded-xl px-4 py-3 flex-1 min-w-0 text-center'>
    <div
      className={cn('font-numeric font-black tabular-nums text-2xl md:text-3xl leading-none', accent)}
      style={{ letterSpacing: '-0.04em' }}
    >
      {value}
    </div>
    <div className='mt-1 text-[11px] text-muted-foreground'>{label}</div>
  </div>
)

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

const categoryOrder: string[] = [
  'store',
  'area',
  'event_clear_store',
  'event_clear_area',
  'milestone',
  'event',
  'vote',
  'special'
]

const BadgesContent = () => {
  const [createOpen, setCreateOpen] = useState(false)
  const { data } = useAllBadges()
  const badges = data.badges

  const totalCount = badges.length
  const hiddenCount = badges.filter((b) => b.is_hidden).length
  const visibleCount = totalCount - hiddenCount
  const specialCount = badges.filter((b) => b.category === 'special').length
  const totalEarned = badges.reduce((s, b) => s + (b.earned_count ?? 0), 0)

  const grouped = useMemo(() => {
    return badges.reduce<Record<string, BadgeDto[]>>((acc, badge) => {
      const cat = badge.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(badge)
      return acc
    }, {})
  }, [badges])

  const totalsByCategory = useMemo(() => {
    return badges.reduce<Record<string, number>>((acc, badge) => {
      acc[badge.category] = (acc[badge.category] ?? 0) + 1
      return acc
    }, {})
  }, [badges])

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='pb-2'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground -ml-2 border border-transparent'
            asChild
          >
            <Link to='/admin'>
              <ArrowLeft className='h-4 w-4 mr-1' />
              管理画面に戻る
            </Link>
          </Button>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal }}
          className='mb-4 md:mb-6'
        >
          <div className='flex items-start justify-between gap-4'>
            <div>
              <h1 className='font-display font-bold text-2xl md:text-3xl text-foreground'>バッジ管理</h1>
              <p className='mt-1 text-sm text-muted-foreground'>
                特別バッジの作成・編集と表示設定。自動生成バッジは表示フィールドのみ編集可。
              </p>
            </div>
            <div className='flex items-center gap-2 shrink-0'>
              <RecalculateBadgesButton />
              <Button
                size='sm'
                className='bg-brand hover:bg-brand/90 text-brand-foreground'
                onClick={() => setCreateOpen(true)}
              >
                <Plus className='size-4 mr-1' />
                特別バッジ作成
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal, delay: 0.06 }}
          className='flex gap-2 md:gap-3 mb-5 md:mb-6'
        >
          <StatCard label='総バッジ' value={totalCount} accent='text-foreground' />
          <StatCard label='表示中' value={visibleCount} accent='text-brand' />
          <StatCard label='非表示' value={hiddenCount} accent='text-muted-foreground' />
          <StatCard label='特別' value={specialCount} accent='text-rank-gold' />
          <StatCard label='総獲得数' value={totalEarned} accent='text-favorite' />
        </motion.div>

        {/* Badge list */}
        <div className='space-y-8'>
          {categoryOrder
            .filter((cat) => grouped[cat]?.length)
            .map((cat) => (
              <CategorySection
                key={cat}
                categoryKey={cat}
                badges={grouped[cat]}
                totalInCategory={totalsByCategory[cat] ?? 0}
              />
            ))}
        </div>

        <CreateBadgeDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
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
