import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

const ITEMS = [
  { to: '/admin/event-detect', label: '統計', exact: true },
  { to: '/admin/event-detect/charts', label: 'チャート', exact: false },
  { to: '/admin/event-detect/emulated', label: 'LLM イベント', exact: false },
  { to: '/admin/event-detect/posts', label: '投稿', exact: false },
  { to: '/admin/event-detect/events', label: 'D1 イベント', exact: false },
  { to: '/admin/event-detect/gaps', label: '登録漏れ候補', exact: false },
  { to: '/admin/event-detect/keywords', label: 'キーワード', exact: false }
] as const

/**
 * 7 つの画面を切り替えるリンク。選択中は Router が data-status=active を付けるので、枠と淡い背景で示す
 * （太さは変えない）。D1 イベントと LLM イベントは詳細画面でも選択中のままにする。
 */
export const EventDetectNav = () => (
  <nav aria-label='イベント検出' className='flex flex-wrap gap-2'>
    {ITEMS.map((item) => (
      <Button
        key={item.to}
        variant='ghost'
        size='sm'
        className='border border-transparent text-muted-foreground hover:text-foreground data-[status=active]:border-brand data-[status=active]:bg-brand/10 data-[status=active]:text-foreground'
        asChild
      >
        <Link to={item.to} activeOptions={{ exact: item.exact }}>
          {item.label}
        </Link>
      </Button>
    ))}
  </nav>
)
