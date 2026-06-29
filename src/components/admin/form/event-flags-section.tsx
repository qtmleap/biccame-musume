import { type Control, Controller } from 'react-hook-form'
import { Checkbox } from '@/components/ui/checkbox'
import type { EventRequest } from '@/schemas/event.dto'

type EventFlagsSectionProps = {
  control: Control<EventRequest>
}

/**
 * イベントフォーム末尾の 3 つのフラグ (検証済み / 未確定情報 / 投稿フラグ) 群
 */
export const EventFlagsSection = ({ control }: EventFlagsSectionProps) => (
  <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
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
)
