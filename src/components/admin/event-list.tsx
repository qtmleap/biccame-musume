import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, ExternalLink, Package, Pencil, Store, Trash2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDeleteEvent, useEvents } from '@/hooks/useEvents'
import { useCloudflareAccess } from '@/hooks/useCloudflareAccess'
import type { AckeyCampaign, AckeyCampaignCondition } from '@/schemas/ackey-campaign.dto'
import { REFERENCE_URL_TYPE_LABELS } from '@/schemas/ackey-campaign.dto'

/**
 * カテゴリラベル
 */
const CATEGORY_LABELS: Record<AckeyCampaign['category'], string> = {
  limited_card: '限定名刺',
  ackey: 'アクキー',
  other: 'その他'
}

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
 * イベントのステータスを取得
 */
const getEventStatus = (campaign: AckeyCampaign): 'upcoming' | 'ongoing' | 'ended' => {
  if (campaign.isEnded) return 'ended'

  const now = dayjs()
  const startDate = dayjs(campaign.startDate)
  const endDate = campaign.endDate ? dayjs(campaign.endDate) : null

  // 開始前
  if (now.isBefore(startDate)) return 'upcoming'

  // 終了日が設定されている場合、終了日を過ぎていたら終了
  if (endDate && now.isAfter(endDate)) return 'ended'

  // 開始日以降で、終了日未設定または終了日前なら開催中
  return 'ongoing'
}

/**
 * ステータスに応じたBadgeを返す
 */
const StatusBadge = ({ campaign }: { campaign: AckeyCampaign }) => {
  const status = getEventStatus(campaign)

  switch (status) {
    case 'upcoming':
      return (
        <Badge variant='outline' className='border-blue-600 bg-blue-50 text-blue-700'>
          開催前
        </Badge>
      )
    case 'ongoing':
      return (
        <Badge variant='outline' className='border-green-600 bg-green-50 text-green-700'>
          開催中
        </Badge>
      )
    case 'ended':
      return <Badge variant='secondary'>終了</Badge>
  }
}

/**
 * キャンペーンカードコンポーネント
 */
const CampaignCard = ({
  campaign,
  onDelete,
  isAuthenticated
}: {
  campaign: AckeyCampaign
  onDelete: (id: string) => void
  isAuthenticated: boolean
}) => {
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
        <StatusBadge campaign={campaign} />
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
        <div className='flex items-center gap-1'>
          {campaign.referenceUrls && campaign.referenceUrls.length > 0 ? (
            campaign.referenceUrls.map((ref) => (
              <a key={ref.type} href={ref.url} target='_blank' rel='noopener noreferrer'>
                <Button size='sm' variant='outline' className='h-7 text-xs'>
                  <ExternalLink className='mr-1 size-3' />
                  {REFERENCE_URL_TYPE_LABELS[ref.type]}
                </Button>
              </a>
            ))
          ) : (
            <div />
          )}
        </div>
        {isAuthenticated && (
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
        )}
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
  const { isAuthenticated } = useCloudflareAccess()
  const [activeTab, setActiveTab] = useState<AckeyCampaign['category']>('limited_card')

  // カテゴリ別にフィルタリングし、開始時間順でソート
  const filteredCampaigns = useMemo(() => {
    return campaigns
      .filter((campaign) => campaign.category === activeTab)
      .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
  }, [campaigns, activeTab])

  // 各カテゴリのイベント数
  const categoryCounts = useMemo(() => {
    return {
      limited_card: campaigns.filter((c) => c.category === 'limited_card').length,
      ackey: campaigns.filter((c) => c.category === 'ackey').length,
      other: campaigns.filter((c) => c.category === 'other').length
    }
  }, [campaigns])

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
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AckeyCampaign['category'])}>
      <TabsList className='mb-4 w-full bg-gray-200'>
        {(['limited_card', 'ackey', 'other'] as const).map((category) => (
          <TabsTrigger key={category} value={category} className='flex-1 data-[state=active]:bg-white'>
            {CATEGORY_LABELS[category]}
            <span className='ml-1.5 text-xs text-muted-foreground'>({categoryCounts[category]})</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {(['limited_card', 'ackey', 'other'] as const).map((category) => (
        <TabsContent key={category} value={category}>
          {filteredCampaigns.length === 0 ? (
            <div className='rounded-lg border p-6 text-center'>
              <p className='text-sm text-muted-foreground'>{CATEGORY_LABELS[category]}のイベントはありません</p>
            </div>
          ) : (
            <div className='space-y-2.5'>
              {filteredCampaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} onDelete={handleDelete} isAuthenticated={isAuthenticated} />
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}
