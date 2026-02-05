import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { RouteResult } from './types'

type Props = {
  result: RouteResult
}

/**
 * ルート計算結果の表示
 */
export const RouteResultCard = ({ result }: Props) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-lg'>計算結果</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-4'>
          <div className='bg-primary/10 text-primary rounded-lg p-4 text-center'>
            <div className='text-sm'>総移動距離</div>
            <div className='text-xl font-bold'>{(result.totalDistance * 111).toFixed(1)} km</div>
          </div>
          <div className='bg-primary/10 text-primary rounded-lg p-4 text-center'>
            <div className='text-sm'>総所要時間</div>
            <div className='text-xl font-bold'>{result.totalDuration}</div>
          </div>
        </div>

        <div className='space-y-2'>
          <div className='font-medium'>最短ルート順序</div>
          <div className='space-y-0'>
            {result.route.map((store, index) => {
              const leg = result.legs[index]

              return (
                <div key={store.id}>
                  <div className='flex items-center gap-2 py-2 text-sm'>
                    <span className='flex size-6 shrink-0 items-center justify-center rounded-full border text-xs'>
                      {index + 1}
                    </span>
                    <div>
                      <span>{store.name}</span>
                      <span className='text-muted-foreground ml-2 text-xs'>({store.station})</span>
                    </div>
                  </div>
                  {leg && (
                    <div className='text-muted-foreground ml-3 space-y-1 border-l-2 py-1 pl-4 text-xs'>
                      <div className='flex items-center gap-2'>
                        <span>↓</span>
                        <span className='text-primary font-medium'>
                          {leg.duration > 0 ? `${leg.duration}分` : '不明'}
                        </span>
                        {leg.transfers > 0 && <span>（乗換{leg.transfers}回）</span>}
                      </div>
                      <div className='flex flex-wrap gap-1'>
                        {leg.lines.map((line) => (
                          <span key={line} className='bg-secondary rounded px-1.5 py-0.5'>
                            {line}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
