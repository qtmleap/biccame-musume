import dayjs from 'dayjs'
import { Calendar, Coins, Plus, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCharacters } from '@/hooks/useCharacters'
import { useCreateEvent, useUpdateEvent } from '@/hooks/useEvents'
import {
  type AckeyCampaign,
  type AckeyCampaignCondition,
  CreateAckeyCampaignRequestSchema
} from '@/schemas/ackey-campaign.dto'

/**
 * イベントフォーム
 */
export const EventForm = ({ event, onSuccess }: { event?: AckeyCampaign; onSuccess?: () => void }) => {
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const { data: characters } = useCharacters()
  const [name, setName] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [stores, setStores] = useState<string[]>([])
  const [limitedQuantity, setLimitedQuantity] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [conditions, setConditions] = useState<(AckeyCampaignCondition & { id: string })[]>([])
  const [errors, setErrors] = useState<string[]>([])

  // 住所がある店舗のみフィルタリングしてユニークリストを取得
  const storeNames = Array.from(
    new Set(characters.filter((c) => c.address && c.address.trim() !== '').map((c) => c.store_name))
  ).sort()

  // 編集モードの場合、初期値をセット
  useEffect(() => {
    if (event) {
      setName(event.name)
      setReferenceUrl(event.referenceUrl)
      setStores(event.stores || [])
      setLimitedQuantity(event.limitedQuantity ? String(event.limitedQuantity) : '')
      setStartDate(dayjs(event.startDate).format('YYYY-MM-DDTHH:mm'))
      setEndDate(event.endDate ? dayjs(event.endDate).format('YYYY-MM-DDTHH:mm') : '')
      setConditions(
        event.conditions.map((c) => ({
          ...c,
          id: crypto.randomUUID()
        }))
      )
    }
  }, [event])

  /**
   * 特定タイプの条件が既に存在するかチェック
   */
  const hasConditionType = (type: AckeyCampaignCondition['type']): boolean => {
    return conditions.some((c) => c.type === type)
  }

  /**
   * 条件を追加
   */
  const handleAddCondition = (type: AckeyCampaignCondition['type']) => {
    // 既に同じタイプの条件が存在する場合は追加しない
    if (hasConditionType(type)) {
      return
    }

    const newCondition = {
      id: crypto.randomUUID(),
      type,
      ...(type === 'purchase' ? { purchaseAmount: 3000 } : {}),
      ...(type === 'first_come' || type === 'lottery' ? { quantity: 1 } : {})
    }
    setConditions([...conditions, newCondition])
  }

  /**
   * 条件を削除
   */
  const handleRemoveCondition = (id: string) => {
    setConditions(conditions.filter((c) => c.id !== id))
  }

  /**
   * 条件を更新
   */
  const handleUpdateCondition = (id: string, updates: Partial<AckeyCampaignCondition>) => {
    setConditions(conditions.map((condition) => (condition.id === id ? { ...condition, ...updates } : condition)))
  }

  /**
   * フォームをリセット
   */
  const handleReset = () => {
    setName('')
    setReferenceUrl('')
    setStores([])
    setLimitedQuantity('')
    setStartDate('')
    setEndDate('')
    setConditions([])
    setErrors([])
  }

  /**
   * キャンペーンを保存
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])

    const data = {
      name,
      referenceUrl,
      stores: stores.length > 0 ? stores : undefined,
      limitedQuantity: limitedQuantity ? Number(limitedQuantity) : undefined,
      startDate: startDate ? dayjs(startDate).toISOString() : undefined,
      endDate: endDate ? dayjs(endDate).toISOString() : undefined,
      conditions: conditions.map(({ id: _, ...rest }) => rest),
      isActive: true
    }

    const result = CreateAckeyCampaignRequestSchema.safeParse(data)

    if (!result.success) {
      const errorMessages = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      setErrors(errorMessages)
      return
    }

    try {
      if (event) {
        // 編集モード
        await updateEvent.mutateAsync({ id: event.id, data: result.data })
      } else {
        // 新規作成モード
        await createEvent.mutateAsync(result.data)
      }
      handleReset()
      onSuccess?.()
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'エラーが発生しました'])
    }
  }

  return (
    <div className='rounded-lg border p-3 md:p-4'>
      <h2 className='mb-3 text-base font-semibold md:text-lg'>{event ? 'イベント編集' : '新規イベント登録'}</h2>

      <form onSubmit={handleSubmit} className='space-y-3'>
        {/* イベント名 */}
        <div>
          <label htmlFor='event-name' className='mb-1 block text-sm font-medium'>
            イベント名
          </label>
          <Input
            id='event-name'
            type='text'
            placeholder='例: 新春アクキープレゼント'
            value={name}
            onChange={(e) => setName(e.target.value)}
            className='w-full'
          />
        </div>

        {/* 参考URL */}
        <div>
          <label htmlFor='reference-url' className='mb-1 block text-sm font-medium'>
            参考URL
          </label>
          <Input
            id='reference-url'
            type='url'
            placeholder='https://twitter.com/...'
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            className='w-full'
          />
        </div>

        {/* 開催店舗と限定数 */}
        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          <div>
            <label htmlFor='store' className='mb-1 block text-sm font-medium'>
              開催店舗（任意、複数可）
            </label>
            <Select
              value=''
              onValueChange={(value) => {
                if (value === '_all') {
                  setStores(storeNames)
                } else if (!stores.includes(value)) {
                  setStores([...stores, value])
                }
              }}
            >
              <SelectTrigger>
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
            {stores.length > 0 && (
              <div className='mt-2 flex flex-wrap gap-1.5'>
                {stores.map((storeName) => (
                  <Badge key={storeName} variant='outline' className='gap-1 pr-1'>
                    <span className='text-xs'>{storeName}</span>
                    <button
                      type='button'
                      onClick={() => setStores(stores.filter((s) => s !== storeName))}
                      className='ml-0.5 rounded-sm hover:bg-muted'
                    >
                      <X className='size-3' />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <label htmlFor='limited-quantity' className='mb-1 block text-sm font-medium'>
              限定数（任意）
            </label>
            <Input
              id='limited-quantity'
              type='number'
              min='1'
              placeholder='例: 100'
              value={limitedQuantity}
              onChange={(e) => setLimitedQuantity(e.target.value)}
              className='w-full'
            />
          </div>
        </div>

        {/* 日付設定 */}
        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          <div>
            <label htmlFor='start-date' className='mb-1 flex items-center gap-1.5 text-sm font-medium'>
              <Calendar className='size-4' />
              開始日時
            </label>
            <Input
              id='start-date'
              type='datetime-local'
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className='w-full'
            />
          </div>
          <div>
            <label htmlFor='end-date' className='mb-1 flex items-center gap-1.5 text-sm font-medium'>
              <Calendar className='size-4' />
              終了日時（任意）
            </label>
            <Input
              id='end-date'
              type='datetime-local'
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className='w-full'
            />
          </div>
        </div>

        {/* 配布条件 */}
        <div>
          <div className='mb-1.5 block text-sm font-medium'>配布条件</div>
          <div className='mb-2 flex flex-wrap gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => handleAddCondition('purchase')}
              disabled={hasConditionType('purchase')}
              className='flex-1 sm:flex-none'
            >
              <Coins className='mr-1.5 size-4' />
              購入金額
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => handleAddCondition('first_come')}
              disabled={hasConditionType('first_come')}
              className='flex-1 sm:flex-none'
            >
              <Users className='mr-1.5 size-4' />
              先着
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => handleAddCondition('lottery')}
              disabled={hasConditionType('lottery')}
              className='flex-1 sm:flex-none'
            >
              <Users className='mr-1.5 size-4' />
              抽選
            </Button>
          </div>

          {/* 条件リスト */}
          <div className='space-y-1.5'>
            {conditions.map((condition) => (
              <div key={condition.id} className='flex items-center gap-2 rounded-lg border p-2'>
                <div className='flex-1'>
                  {condition.type === 'purchase' && (
                    <div className='flex items-center gap-2'>
                      <Coins className='size-4 shrink-0 text-muted-foreground' />
                      <Input
                        type='number'
                        min='0'
                        step='100'
                        value={condition.purchaseAmount || 0}
                        onChange={(e) =>
                          handleUpdateCondition(condition.id, {
                            purchaseAmount: Number.parseInt(e.target.value, 10)
                          })
                        }
                        className='w-full'
                      />
                      <span className='shrink-0 text-sm text-muted-foreground'>円以上購入</span>
                    </div>
                  )}
                  {condition.type === 'first_come' && (
                    <div className='flex items-center gap-2'>
                      <Users className='size-4 shrink-0 text-muted-foreground' />
                      <span className='shrink-0 text-sm text-muted-foreground'>先着</span>
                      <Input
                        type='number'
                        min='1'
                        value={condition.quantity || 1}
                        onChange={(e) =>
                          handleUpdateCondition(condition.id, {
                            quantity: Number.parseInt(e.target.value, 10)
                          })
                        }
                        className='w-full'
                      />
                      <span className='shrink-0 text-sm text-muted-foreground'>名</span>
                    </div>
                  )}
                  {condition.type === 'lottery' && (
                    <div className='flex items-center gap-2'>
                      <Users className='size-4 shrink-0 text-muted-foreground' />
                      <span className='shrink-0 text-sm text-muted-foreground'>抽選</span>
                      <Input
                        type='number'
                        min='1'
                        value={condition.quantity || 1}
                        onChange={(e) =>
                          handleUpdateCondition(condition.id, {
                            quantity: Number.parseInt(e.target.value, 10)
                          })
                        }
                        className='w-full'
                      />
                      <span className='shrink-0 text-sm text-muted-foreground'>名</span>
                    </div>
                  )}
                </div>
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  onClick={() => handleRemoveCondition(condition.id)}
                  className='shrink-0'
                >
                  <X className='size-4' />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* エラー表示 */}
        {errors.length > 0 && (
          <div className='rounded-lg border border-destructive/50 bg-destructive/10 p-3'>
            <ul className='space-y-1 text-sm text-destructive'>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ボタン */}
        <div className='flex gap-2'>
          <Button type='submit' className='flex-1'>
            <Plus className='mr-1.5 size-4' />
            登録
          </Button>
          <Button type='button' variant='outline' onClick={handleReset} className='flex-1'>
            クリア
          </Button>
        </div>
      </form>
    </div>
  )
}
