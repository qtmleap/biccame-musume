import type { RouteResult } from './types'

type Props = {
  result: RouteResult
}

/**
 * ルート計算結果の表示
 */
export const RouteResultCard = ({ result }: Props) => {
  return (
    <div className='space-y-4'>
      <h2 className='text-lg font-bold'>ルート案内</h2>

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
        <div>
          {result.route.map((store, index) => {
            const leg = result.legs[index]

            return (
              <div key={store.id}>
                {/* 店舗名 */}
                <div className='flex items-center gap-2 py-2 text-sm'>
                  <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-xs text-white'>
                    {index + 1}
                  </span>
                  <span className='font-medium'>{store.name}</span>
                </div>

                {/* 経路情報 */}
                {leg && leg.routes.length > 0 && (
                  <div className='ml-3 flex gap-6'>
                    {/* 縦線 + 合計時間オーバーレイ */}
                    <div className='relative flex flex-col items-center'>
                      <div className='h-full w-0 border-l-4 border-blue-400' />
                      {/* 合計時間を中央にオーバーレイ */}
                      <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-blue-400 px-2 py-0.5 text-sm font-medium text-white whitespace-nowrap'>
                        {leg.duration}分
                      </div>
                    </div>
                    {/* 経路詳細 */}
                    <div className='text-muted-foreground text-sm'>
                      {leg.routes.map((segment, i) => (
                        <div key={`${segment.operator}-${segment.line}-${i}`}>
                          {/* 出発駅 */}
                          <div className='py-1 font-medium'>
                            {segment.from}
                            {!segment.from.endsWith(ROUTE_LABELS.station) && ROUTE_LABELS.station}
                          </div>
                          {/* 路線情報 */}
                          <div className='text-muted-foreground flex items-center gap-2 py-1 pl-2 text-xs'>
                            <span>{segment.duration}分</span>
                            <span>|</span>
                            <span>
                              {segment.operator} {segment.line}
                            </span>
                          </div>
                          {/* 到着駅（次のセグメントがない場合のみ表示） */}
                          {i === leg.routes.length - 1 && (
                            <div className='py-1 font-medium'>
                              {segment.to}
                              {!segment.to.endsWith(ROUTE_LABELS.station) && ROUTE_LABELS.station}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
