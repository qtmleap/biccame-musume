import { AlertTriangle, Link2, X } from 'lucide-react'
import type { UseFieldArrayAppend, UseFieldArrayRemove, UseFormRegister } from 'react-hook-form'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { REFERENCE_URL_TYPE_LABELS } from '@/locales/app.content'
import type { Event, EventRequest, ReferenceUrlType } from '@/schemas/event.dto'
import { ReferenceUrlTypeSchema } from '@/schemas/event.dto'

/**
 * 参照URLフィールドの型
 */
type ReferenceUrlField = {
  id: string
  uuid: string
  type: ReferenceUrlType
  url: string
}

type Props = {
  fields: ReferenceUrlField[]
  register: UseFormRegister<EventRequest>
  append: UseFieldArrayAppend<EventRequest, 'referenceUrls'>
  remove: UseFieldArrayRemove
  referenceUrls: EventRequest['referenceUrls']
  duplicateWarnings: Record<number, Event | null>
  onCheckDuplicate: (index: number, url: string) => void
  onClearWarning: (index: number) => void
}

/**
 * 参考URLセクションコンポーネント
 * X・公式・その他のURL入力を管理
 */
export function ReferenceUrlsSection({
  fields,
  register,
  append,
  remove,
  referenceUrls,
  duplicateWarnings,
  onCheckDuplicate,
  onClearWarning
}: Props) {
  /**
   * URLタイプが既に追加されているか
   */
  const hasType = (type: string) => referenceUrls.some((r) => r.type === type)

  /**
   * 参照URLを削除
   */
  const handleRemove = (index: number) => {
    remove(index)
    onClearWarning(index)
  }

  return (
    <div>
      <div className='mb-1.5 flex items-center gap-1.5 text-sm font-medium'>
        <Link2 className='size-4' />
        参考URL（任意）
      </div>
      {/* URLタイプボタン */}
      <div className='mb-2 flex flex-wrap gap-2'>
        {ReferenceUrlTypeSchema.options.map((type) => (
          <Button
            key={type}
            type='button'
            size='sm'
            variant='outline'
            onClick={() => append({ uuid: uuidv4(), type, url: '' })}
            disabled={hasType(type)}
            className={
              hasType(type) ? 'border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800' : ''
            }
          >
            {REFERENCE_URL_TYPE_LABELS[type]}
          </Button>
        ))}
      </div>
      {/* URL入力リスト */}
      <div className='space-y-1.5'>
        {fields.map((field, index) => (
          <div key={field.id}>
            <div className='flex items-center gap-2'>
              <span className='shrink-0 text-sm font-medium w-10'>{REFERENCE_URL_TYPE_LABELS[field.type]}</span>
              <Input
                type='url'
                placeholder='https://twitter.com/...'
                {...register(`referenceUrls.${index}.url`)}
                onBlur={(e) => onCheckDuplicate(index, e.target.value)}
                className='flex-1'
              />
              <Button
                type='button'
                size='icon'
                variant='ghost'
                onClick={() => handleRemove(index)}
                className='shrink-0'
              >
                <X className='size-4' />
              </Button>
            </div>
            {/* 重複警告 */}
            {duplicateWarnings[index] && (
              <div className='mt-1 ml-12 flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1.5'>
                <AlertTriangle className='size-3.5 shrink-0 mt-0.5' />
                <div>
                  <span className='font-medium'>同じURLが設定されているイベントがあります:</span>
                  <span className='ml-1'>{duplicateWarnings[index]?.title}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
