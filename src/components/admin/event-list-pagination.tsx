import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination'

type EventListPaginationProps = {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

/**
 * イベント一覧のページネーション UI。
 * 先頭・末尾・現在ページ周辺 ±1 のみ表示し、 それ以外は省略記号。
 */
export const EventListPagination = ({ page, totalPages, onChange }: EventListPaginationProps) => {
  if (totalPages <= 1) return null

  return (
    <div className='mt-6'>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              size='default'
              href='#'
              onClick={(e) => {
                e.preventDefault()
                if (page > 1) onChange(page - 1)
              }}
              className={page === 1 ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
              return (
                <PaginationItem key={p}>
                  <PaginationLink
                    size='icon'
                    href='#'
                    onClick={(e) => {
                      e.preventDefault()
                      onChange(p)
                    }}
                    isActive={page === p}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            }
            if (p === page - 2 || p === page + 2) {
              return (
                <PaginationItem key={p}>
                  <PaginationEllipsis />
                </PaginationItem>
              )
            }
            return null
          })}

          <PaginationItem>
            <PaginationNext
              size='default'
              href='#'
              onClick={(e) => {
                e.preventDefault()
                if (page < totalPages) onChange(page + 1)
              }}
              className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
