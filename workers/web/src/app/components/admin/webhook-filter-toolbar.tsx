import { WEBHOOK_KEYWORD_VERDICTS } from '@biccame/shared/event-detect/detection'
import type { StoreData } from '@biccame/shared/schemas/store.dto'
import {
  WebhookDiscoveryFilterSchema,
  type WebhookJobRange,
  WebhookJobRangeSchema,
  WebhookKeywordVerdictSchema,
  WebhookPostStatusFilterSchema,
  WebhookScreenNameSchema
} from '@biccame/shared/schemas/webhook.dto'
import { FilterX } from 'lucide-react'
import {
  hasWebhookFilterConditions,
  NO_WEBHOOK_FILTER,
  setWebhookDiscovery,
  setWebhookPostStatus,
  setWebhookRange,
  setWebhookScreenName,
  setWebhookVerdict,
  type WebhookFilter
} from '@/atoms/webhook-filter-atom'
import { webhookDiscoveryFilterLabel } from '@/components/admin/webhook-discovery-labels'
import {
  webhookAccountLabel,
  webhookKeywordVerdictLabel,
  webhookPostStatusFilterLabel
} from '@/components/admin/webhook-labels'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const RANGE_LABELS = { '1h': '直近1時間', '24h': '直近24時間' } as const satisfies Record<WebhookJobRange, string>
const ALL_LABEL = 'すべて'

/** ビッカメ娘・期間・判定・ステータスの絞り込み。変更はすべて changeFilter 経由で、ページ位置を1ページ目へ戻す。 */
export const WebhookFilterToolbar = ({
  filter,
  changeFilter,
  characters
}: {
  characters: readonly StoreData[]
  filter: WebhookFilter
  changeFilter: (update: (filter: WebhookFilter) => WebhookFilter) => void
}) => (
  <fieldset aria-label='絞り込み' className='mb-4 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 border-0 p-0'>
    <div className='flex items-center gap-2'>
      <span className='text-sm text-muted-foreground'>ビッカメ娘</span>
      <Select
        value={filter.screenName === null ? 'all' : filter.screenName}
        onValueChange={(value) => {
          const screenName = WebhookScreenNameSchema.safeParse(value)
          changeFilter((previous) =>
            setWebhookScreenName(previous, value !== 'all' && screenName.success ? screenName.data : null)
          )
        }}
      >
        <SelectTrigger aria-label='ビッカメ娘' size='sm' className='w-44'>
          <SelectValue>
            {filter.screenName === null ? ALL_LABEL : webhookAccountLabel(filter.screenName, characters)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{ALL_LABEL}</SelectItem>
          {characters.flatMap(({ character }) =>
            character.twitter_id === undefined
              ? []
              : [
                  <SelectItem key={character.twitter_id} value={character.twitter_id}>
                    {webhookAccountLabel(character.twitter_id, characters)}
                  </SelectItem>
                ]
          )}
        </SelectContent>
      </Select>
    </div>
    <div className='flex items-center gap-2'>
      <span className='text-sm text-muted-foreground'>検出結果</span>
      <Select
        value={filter.discovery === null ? 'all' : filter.discovery}
        onValueChange={(value) => {
          const discovery = WebhookDiscoveryFilterSchema.safeParse(value)
          changeFilter((previous) => setWebhookDiscovery(previous, discovery.success ? discovery.data : null))
        }}
      >
        <SelectTrigger aria-label='検出結果' size='sm' className='w-44'>
          <SelectValue>
            {filter.discovery === null ? ALL_LABEL : webhookDiscoveryFilterLabel(filter.discovery)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{ALL_LABEL}</SelectItem>
          {WebhookDiscoveryFilterSchema.options.map((discovery) => (
            <SelectItem key={discovery} value={discovery}>
              {webhookDiscoveryFilterLabel(discovery)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className='flex items-center gap-2'>
      <span className='text-sm text-muted-foreground'>期間</span>
      <Select
        value={filter.range === null ? 'all' : filter.range}
        onValueChange={(value) => {
          const range = WebhookJobRangeSchema.safeParse(value)
          changeFilter((previous) => setWebhookRange(previous, range.success ? range.data : null))
        }}
      >
        <SelectTrigger aria-label='期間' size='sm' className='w-36'>
          <SelectValue>{filter.range === null ? ALL_LABEL : RANGE_LABELS[filter.range]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{ALL_LABEL}</SelectItem>
          {WebhookJobRangeSchema.options.map((range) => (
            <SelectItem key={range} value={range}>
              {RANGE_LABELS[range]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className='flex items-center gap-2'>
      <span className='text-sm text-muted-foreground' title='現在のキーワードルールによる判定'>
        判定
      </span>
      <Select
        value={filter.verdict === null ? 'all' : filter.verdict}
        onValueChange={(value) => {
          const verdict = WebhookKeywordVerdictSchema.safeParse(value)
          changeFilter((previous) => setWebhookVerdict(previous, verdict.success ? verdict.data : null))
        }}
      >
        <SelectTrigger aria-label='判定' size='sm' className='w-32'>
          <SelectValue>{filter.verdict === null ? ALL_LABEL : webhookKeywordVerdictLabel(filter.verdict)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{ALL_LABEL}</SelectItem>
          {WEBHOOK_KEYWORD_VERDICTS.map((verdict) => (
            <SelectItem key={verdict} value={verdict}>
              {webhookKeywordVerdictLabel(verdict)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className='flex items-center gap-2'>
      <span className='text-sm text-muted-foreground'>ステータス</span>
      <Select
        value={filter.postStatus === null ? 'all' : filter.postStatus}
        onValueChange={(value) => {
          const postStatus = WebhookPostStatusFilterSchema.safeParse(value)
          changeFilter((previous) => setWebhookPostStatus(previous, postStatus.success ? postStatus.data : null))
        }}
      >
        <SelectTrigger aria-label='ステータス' size='sm' className='w-32'>
          <SelectValue>
            {filter.postStatus === null ? ALL_LABEL : webhookPostStatusFilterLabel(filter.postStatus)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{ALL_LABEL}</SelectItem>
          {WebhookPostStatusFilterSchema.options.map((postStatus) => (
            <SelectItem key={postStatus} value={postStatus}>
              {webhookPostStatusFilterLabel(postStatus)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <Button
      variant='outline'
      className='border-card-border'
      onClick={() => changeFilter(() => NO_WEBHOOK_FILTER)}
      disabled={!hasWebhookFilterConditions(filter)}
    >
      <FilterX className='size-4' />
      条件をクリア
    </Button>
  </fieldset>
)
