import { EventCategorySchema, SpecialCharacterSchema } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { FolderTree, Package, Store, UserRound } from 'lucide-react'
import type { Control, FieldErrors } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCharacters } from '@/hooks/use-characters'
import { useEventGroups } from '@/hooks/use-event-groups'
import type { EventFormValues } from '@/lib/event-form'
import {
  ADMIN_LABELS,
  CHARACTER_NAME_LABELS,
  EVENT_CATEGORY_LABELS,
  SPECIAL_CHARACTER_LABELS,
  STORE_NAME_LABELS
} from '@/locales/app.content'

const NO_GROUP_VALUE = '__none__'

export const EventClassificationFields = ({
  control,
  errors
}: {
  control: Control<EventFormValues>
  errors: FieldErrors<EventFormValues>
}) => {
  const { data: characters } = useCharacters()
  const { data: eventGroups } = useEventGroups()
  const storeKeys = Array.from(
    new Set(
      characters
        .filter((c) => c.store?.address && c.store.address.trim() !== '')
        .flatMap((c) => {
          const parsed = StoreKeySchema.safeParse(c.id)
          return parsed.success ? [parsed.data] : []
        })
    )
  ).sort((a, b) => STORE_NAME_LABELS[a].localeCompare(STORE_NAME_LABELS[b], 'ja'))

  // 閉店店舗の娘のイベントを別の娘が担当することがあるため、店舗の有無で絞らない
  const characterKeys = Array.from(
    new Set(
      characters
        .filter((c) => c.character.is_biccame_musume)
        .flatMap((c) => {
          const parsed = StoreKeySchema.safeParse(c.id)
          return parsed.success ? [parsed.data] : []
        })
    )
  ).sort((a, b) => CHARACTER_NAME_LABELS[a].localeCompare(CHARACTER_NAME_LABELS[b], 'ja'))

  return (
    <>
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
          <p id='event-stores-label' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
            <Store className='size-4' />
            開催・配布店舗（複数選択可）
          </p>
          <Controller
            name='stores'
            control={control}
            render={({ field }) => (
              <fieldset
                aria-labelledby='event-stores-label'
                className='max-h-48 overflow-y-auto border border-card-border p-2 grid gap-2 sm:grid-cols-2'
              >
                {storeKeys.map((key) => (
                  <label key={key} className='flex items-center gap-2 text-sm'>
                    <input
                      type='checkbox'
                      checked={field.value.includes(key)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.checked ? [...field.value, key] : field.value.filter((value) => value !== key)
                        )
                      }
                      className='size-4 accent-brand'
                    />
                    {STORE_NAME_LABELS[key]}
                  </label>
                ))}
              </fieldset>
            )}
          />
          {errors.stores && <p className='mt-1 text-xs text-destructive'>{errors.stores.message}</p>}
        </div>
      </div>

      {/* 所属グループ・対象ビッカメ娘 */}
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
                value={field.value}
                onValueChange={(value) => field.onChange(value === NO_GROUP_VALUE ? '' : value)}
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

        <div>
          <p id='event-characters-label' className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
            <UserRound className='size-4' />
            対象ビッカメ娘（複数選択可）
          </p>
          <Controller
            name='characterIds'
            control={control}
            render={({ field }) => (
              <fieldset
                aria-labelledby='event-characters-label'
                className='max-h-48 overflow-y-auto border border-card-border p-2 grid gap-2 sm:grid-cols-2'
              >
                {[...SpecialCharacterSchema.options, ...characterKeys].map((key) => (
                  <label key={key} className='flex items-center gap-2 text-sm'>
                    <input
                      type='checkbox'
                      checked={field.value.includes(key)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.checked ? [...field.value, key] : field.value.filter((value) => value !== key)
                        )
                      }
                      className='size-4 accent-brand'
                    />
                    {key === 'other' || key === 'secret' ? SPECIAL_CHARACTER_LABELS[key] : CHARACTER_NAME_LABELS[key]}
                  </label>
                ))}
              </fieldset>
            )}
          />
          <p className='mt-1 text-xs text-muted-foreground'>未選択は未判定です。開催店舗の娘を自動設定しません。</p>
          {errors.characterIds && <p className='mt-1 text-xs text-destructive'>{errors.characterIds.message}</p>}
        </div>
      </div>
    </>
  )
}
