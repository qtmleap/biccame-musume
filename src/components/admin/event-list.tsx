import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, ExternalLink, Package, Pencil, Store, Trash2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDeleteEvent, useEvents } from '@/hooks/useEvents'
import type { AckeyCampaign, AckeyCampaignCondition } from '@/schemas/ackey-campaign.dto'

/**
 * 条件の詳細テキストを取得
 */
const getConditionDetail = (condition: AckeyCampaignCondition): string => {
  switch (condition.type) {
    case 'purchase':
      return `${condition.purchaseAmount?.toLocaleString()}円以上購入`
    case 'first_come':
      return '先着'
    case 'lottery':
      return '抽選'
    case 'everyone':
      return '全員配布'
  }
}

/**
 * 条件アイコンコンポーネント
 */
const ConditionIcon = ({ type }: { type: AckeyCampaignCondition['type'] }) => {
  switch (type) {
    case 'purchase':
      return null
    case 'first_come':
    case 'lottery':
    case 'everyone':
      return <Users className='size-4' />
  }
}

/**
 * キャンペーンカードコンポーネント
 */
const CampaignCard = ({ campaign, onDelete }: { campaign: AckeyCampaign; onDelete: (id: string) => void }) => {
  return (
    <div className='border-b py-3 last:border-b-0'>
      <div className='mb-2 flex items-start justify-between gap-3'>
        <div className='flex-1'>
          <h3 className='text-sm font-semibold text-gray-900'>{campaign.name}</h3>
          <div className='mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
            <span className='flex items-center gap-1'>
              <Calendar className='size-3' />
              <span>{dayjs(campaign.startDate).format('YYYY/MM/DD')}</span>
              {campaign.endDate && (
                <>
                  <span>〜</span>
                  <span>{dayjs(campaign.endDate).format('YYYY/MM/DD')}</span>
                </>
              )}
            </span>
            {campaign.stores && campaign.stores.length > 0 && (
              <span className='flex items-center gap-1'>
                <Store className='size-3' />
                {campaign.stores.length === 1 ? campaign.stores[0] : `${campaign.stores.length}店舗`}
              </span>
            )}
            {campaign.limitedQuantity && !campaign.conditions.some((c) => c.type === 'everyone') && (
              <span className='flex items-center gap-1'>
                <Package className='size-3' />
                限定{campaign.limitedQuantity}個
              </span>
            )}
          </div>
        </div>
        <Badge
          variant={campaign.isEnded ? 'secondary' : 'outline'}
          className={campaign.isEnded ? '' : 'border-green-600 bg-green-50 text-green-700'}
        >
          {campaign.isEnded ? '終了' : '開催中'}
        </Badge>
      </div>

      {/* 配布条件 */}
      <div className='mb-3 flex flex-wrap gap-2'>
        {campaign.conditions.map((condition, index) => (
          <Badge key={`${campaign.id}-${index}`} variant='outline' className='gap-1.5 border-gray-300 px-3 py-1'>
            <ConditionIcon type={condition.type} />
            <span>{getConditionDetail(condition)}</span>
          </Badge>
        ))}
      </div>

      {/* アクション */}
      <div className='flex items-center justify-between'>
        {campaign.referenceUrl ? (
          <a href={campaign.referenceUrl} target='_blank' rel='noopener noreferrer'>
            <Button size='sm' variant='outline' className='h-7 text-xs'>
              <ExternalLink className='mr-1 size-3' />
              参考URL
            </Button>
          </a>
        ) : (
          <div />
        )}
        <div className='flex items-center gap-2'>
          <Link to='/admin/events/$id/edit' params={{ id: campaign.id }}>
            <Button size='sm' variant='outline' className='h-7 text-xs'>
              <Pencil className='mr-1 size-3' />
              編集
            </Button>
          </Link>
          <Button size='sm' variant='outline' onClick={() => onDelete(campaign.id)} className='h-7 text-xs text-destructive hover:bg-destructive/10'>
            <Trash2 className='mr-1 size-3' />
            削除
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * イベント一覧
 */
export const EventList = () => {
  const { data: campaigns = [], isLoading, error } = useEvents()
  const deleteEvent = useDeleteEvent()

  /**
   * キャンペーンを削除
   */
  const handleDelete = async (id: string) => {
    if (confirm('このイベントを削除しますか?')) {
      try {
        await deleteEvent.mutateAsync(id)
      } catch {
        alert('削除に失敗しました')
      }
    }
  }

  if (isLoading) {
    return (
      <div className='rounded-lg border p-6 text-center'>
        <p className='text-sm text-muted-foreground'>読み込み中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className='rounded-lg border p-6 text-center'>
        <p className='text-sm text-destructive'>エラーが発生しました</p>
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className='rounded-lg border p-6 text-center'>
        <p className='text-sm text-muted-foreground'>登録されたイベントはありません</p>
      </div>
    )
  }

  return (
    <div className='space-y-2.5'>
      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} onDelete={handleDelete} />
      ))}
    </div>
  )
}
