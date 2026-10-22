import type { SocialSummaryKind } from '@biccame/shared/domain/social-post'
import type { Event, EventCharacter } from '@biccame/shared/schemas/event.dto'
import type { StoreKey } from '@biccame/shared/schemas/store.dto'
import { socialEvent, socialUuid } from '../../__tests__/fixtures/social-snapshots'

// scripts/test-og-render.ts の既定の入力。.cache に何も無い CI でも同じ画像になるように、日付・題名・店舗を固定した架空のイベントだけで作る。
// 題名は架空で、店舗は実在の StoreKey を使う。ケース名は試作（.cache/og-lab/out/v2）と同じにして見比べられるようにしている。

/** 追加・更新（1件表示）の役割。単独の娘が対象 / 複数店舗 / シークレット / その他。 */
export type EventRole = 'single' | 'multi' | 'secret' | 'other'

export type PostCase = {
  /** 出力ファイル名の頭（試作と同じ。例: daily-H2-over）。 */
  name: string
  kind: SocialSummaryKind
  /** 投稿する日（JST）。毎週は月曜。 */
  day: string
  starting: Event[]
  ending: Event[]
}

export type OgRenderInputs = {
  eventRoles: [EventRole, Event][]
  postCases: PostCase[]
}

/* ------------------------------------------------------------------ */
/* 組み立て                                                              */
/* ------------------------------------------------------------------ */

type Fixture = {
  title: string
  stores: StoreKey[]
  /** 開始日時（JST）。例: 2026-04-29 10:00 */
  start: string
  /** 終了日時（JST）。省略すると終了日未定。 */
  end?: string
  characterIds?: EventCharacter[]
  limitedQuantity?: number
  conditions?: Record<string, unknown>[]
}

const jst = (value: string): string => `${value.replace(' ', 'T')}:00+09:00`

const fixtureEvent = (n: number, { start, end, ...rest }: Fixture): Event =>
  socialEvent(n, {
    ...rest,
    startDate: jst(start),
    // 既定の終了日（10/18）を打ち消すため、終了日未定は undefined を明示する。
    endDate: end === undefined ? undefined : jst(end)
  })

const purchase = (amount: number): Record<string, unknown> => ({
  uuid: socialUuid(8001),
  type: 'purchase',
  purchaseAmount: amount
})
const firstCome = (quantity: number): Record<string, unknown> => ({
  uuid: socialUuid(8002),
  type: 'first_come',
  quantity
})
const everyone: Record<string, unknown> = { uuid: socialUuid(8003), type: 'everyone' }

const LONG_TITLE = 'スマホ用カードケース+擬人化10周年記念アクキー・デカ立川たんアクキー'

// 行にまとまらないよう、行ごとに題名と店舗を変えるための表（13件以上）。
const TITLES = [
  'ビッカメ娘11周年記念名刺',
  'スマホ用カードケース+擬人化10周年記念アクキー',
  'ご当地限定アクリルスタンド',
  '先着配布の缶バッジ',
  'ハロウィン限定ステッカー',
  '店舗限定ポストカードセット',
  'コラボ記念ミニ色紙',
  '来店スタンプラリー景品',
  '冬のあったかカイロ配布',
  '夏のうちわ配布',
  '新生活応援クリアファイル',
  'お年玉くじ引き',
  '感謝祭ノベルティ配布'
]
const STORES: StoreKey[] = [
  'chofu',
  'akiba',
  'tachikawa',
  'sapporo',
  'kyoto',
  'hiroshima',
  'nanba',
  'urawa',
  'tenjin',
  'yuurakuchou',
  'ohmiya',
  'kawasaki',
  'nagoya'
]

const time = (day: string, hour: number, index: number): string =>
  `${day} ${String(hour).padStart(2, '0')}:${String(index * 3).padStart(2, '0')}`

/**
 * その日に始まる index 行目のイベント。開始時刻は index が大きいほど遅く、並びが決定的になる。
 * store を変えて同じ index で呼ぶと、同じ行にまとまる（店舗違いの同内容イベント）。
 */
const startingRow = (n: number, index: number, day: string, endDay: string, store: StoreKey = STORES[index]): Event =>
  fixtureEvent(n, { title: TITLES[index], stores: [store], start: time(day, 9, index), end: `${endDay} 23:00` })

/** その日に終わる index 行目のイベント。 */
const endingRow = (n: number, index: number, startDay: string, day: string): Event =>
  fixtureEvent(n, {
    title: TITLES[(index + 5) % TITLES.length],
    stores: [STORES[(index + 3) % STORES.length]],
    start: `${startDay} 10:00`,
    end: time(day, 18, index)
  })

const rows = <Item>(count: number, build: (index: number) => Item): Item[] => Array.from({ length: count }, (_, i) => build(i))

/** 特殊値（secret / other）の行を含む開始側。残りは通常の行。 */
const specialStarting = (n: number, days: [string, string, string, string]): Event[] => [
  fixtureEvent(n, {
    title: '缶バッジくじ',
    stores: ['ikenishi'],
    start: `${days[0]} 10:00`,
    characterIds: ['secret'],
    conditions: [everyone]
  }),
  fixtureEvent(n + 1, {
    title: '缶バッジくじ',
    stores: ['ikenishi'],
    start: `${days[1]} 10:00`,
    characterIds: ['other'],
    conditions: [everyone]
  }),
  startingRow(n + 2, 0, days[2], '2026-10-31'),
  startingRow(n + 3, 1, days[3], '2026-10-31')
]

/* ------------------------------------------------------------------ */
/* 追加・更新の1件表示                                                    */
/* ------------------------------------------------------------------ */

const eventRoles: [EventRole, Event][] = [
  [
    'single',
    fixtureEvent(1, {
      title: LONG_TITLE,
      stores: ['chofu'],
      start: '2026-10-12 10:00',
      end: '2026-10-18 21:00',
      characterIds: ['seiseki'],
      limitedQuantity: 100,
      conditions: [purchase(3000)]
    })
  ],
  [
    'multi',
    fixtureEvent(2, {
      title: '8がつく店舗コラボ名刺',
      stores: ['hachioji', 'shibuhachi', 'yao', 'nagoya'],
      // 対象の娘は店舗から補完しないので、立ち絵が上限の 3 人に収まる確認のために明示する。
      characterIds: ['hachioji', 'shibuhachi', 'yao'],
      start: '2026-10-12 10:00',
      end: '2026-11-03 21:00',
      conditions: [firstCome(50)]
    })
  ],
  [
    'secret',
    fixtureEvent(3, {
      title: '缶バッジくじ',
      stores: ['ikenishi'],
      start: '2026-10-12 10:00',
      characterIds: ['secret'],
      conditions: [everyone]
    })
  ],
  [
    'other',
    fixtureEvent(4, {
      title: '缶バッジくじ',
      stores: ['ikenishi'],
      start: '2026-10-12 10:00',
      characterIds: ['other'],
      conditions: [everyone]
    })
  ]
]

/* ------------------------------------------------------------------ */
/* 毎朝・毎週                                                            */
/* ------------------------------------------------------------------ */

const postCases: PostCase[] = [
  {
    // 4行ずつの1枚。店舗違いの同内容（2店舗）、1日のみ、終了日未定、対象の娘が店舗と違う行を含む。
    name: 'daily-H2',
    kind: 'daily',
    day: '2026-04-29',
    starting: [
      fixtureEvent(101, {
        title: 'ビッカメ娘11周年記念名刺',
        stores: ['chofu'],
        start: '2026-04-29 10:00',
        end: '2026-05-06 21:00',
        limitedQuantity: 100,
        conditions: [purchase(3000)]
      }),
      fixtureEvent(102, {
        title: 'ゴールデンウィーク限定アクキー',
        stores: ['akiba'],
        start: '2026-04-29 10:30',
        end: '2026-05-06 21:00'
      }),
      fixtureEvent(103, {
        title: 'ゴールデンウィーク限定アクキー',
        stores: ['yuurakuchou'],
        start: '2026-04-29 10:30',
        end: '2026-05-06 21:00'
      }),
      fixtureEvent(104, {
        title: '1日限りの先着缶バッジ配布',
        stores: ['sapporo'],
        start: '2026-04-29 11:00',
        end: '2026-04-29 20:00',
        conditions: [firstCome(100)]
      }),
      fixtureEvent(105, { title: '終了日未定のスタンプラリー', stores: ['kyoto'], start: '2026-04-29 12:00' })
    ],
    ending: [
      fixtureEvent(106, {
        title: 'ビッカメ娘10周年記念ポストカード',
        stores: ['hiroshima'],
        start: '2026-04-01 10:00',
        end: '2026-04-29 21:00'
      }),
      fixtureEvent(107, {
        title: LONG_TITLE,
        stores: ['tachikawa'],
        start: '2026-04-10 10:00',
        end: '2026-04-29 20:00',
        characterIds: ['seiseki']
      })
    ]
  },
  {
    // 開始6行（4 + 2）、終了5行（4 + 1）で、どちらも2枚に分かれる。
    name: 'daily-H2-many',
    kind: 'daily',
    day: '2026-07-26',
    starting: rows(6, (i) => startingRow(201 + i, i, '2026-07-26', '2026-08-02')),
    ending: rows(5, (i) => endingRow(301 + i, i, '2026-07-12', '2026-07-26'))
  },
  {
    // 開始は8行ちょうど（4 + 4）で「ほか N件」は出ない。2行目だけ2店舗にまとまり、元イベントは9件。
    name: 'daily-H2-more',
    kind: 'daily',
    day: '2026-02-14',
    starting: [
      ...rows(8, (i) => startingRow(401 + i, i, '2026-02-14', '2026-02-28')),
      startingRow(409, 2, '2026-02-14', '2026-02-28', 'nanba')
    ],
    ending: rows(1, (i) => endingRow(501 + i, i, '2026-02-01', '2026-02-14'))
  },
  {
    // 開始は12行（9行目以降の4行は隠れる）。10行目は3店舗にまとまり、元イベントは14件で「ほか 6件」になる。
    name: 'daily-H2-over',
    kind: 'daily',
    day: '2026-08-31',
    starting: [
      ...rows(12, (i) => startingRow(601 + i, i, '2026-08-31', '2026-09-30')),
      startingRow(613, 9, '2026-08-31', '2026-09-30', 'nanba'),
      startingRow(614, 9, '2026-08-31', '2026-09-30', 'urawa')
    ],
    ending: rows(2, (i) => endingRow(701 + i, i, '2026-08-01', '2026-08-31'))
  },
  {
    // 終了が0件の側は文字だけの画像1枚。
    name: 'daily-H2-empty',
    kind: 'daily',
    day: '2026-08-22',
    starting: rows(3, (i) => startingRow(801 + i, i, '2026-08-22', '2026-09-05')),
    ending: []
  },
  {
    name: 'daily-H2-special',
    kind: 'daily',
    day: '2026-09-19',
    starting: specialStarting(901, ['2026-09-19', '2026-09-19', '2026-09-19', '2026-09-19']),
    ending: rows(1, (i) => endingRow(911 + i, i, '2026-09-05', '2026-09-19'))
  },
  {
    // 毎週。同じ日付が続く行は先頭だけ日付が残る（3/9 に2行、3/12 に2行）。
    name: 'weekly-H2',
    kind: 'weekly',
    day: '2026-03-09',
    starting: [
      startingRow(1001, 0, '2026-03-09', '2026-03-31'),
      startingRow(1002, 1, '2026-03-09', '2026-03-31'),
      startingRow(1003, 2, '2026-03-10', '2026-03-31'),
      startingRow(1004, 3, '2026-03-12', '2026-03-31'),
      startingRow(1005, 4, '2026-03-12', '2026-03-31')
    ],
    ending: [
      endingRow(1101, 0, '2026-02-20', '2026-03-11'),
      endingRow(1102, 1, '2026-02-20', '2026-03-11'),
      endingRow(1103, 2, '2026-02-20', '2026-03-15')
    ]
  },
  {
    name: 'weekly-H2-special',
    kind: 'weekly',
    day: '2026-09-14',
    starting: specialStarting(1201, ['2026-09-15', '2026-09-15', '2026-09-17', '2026-09-19']),
    ending: [endingRow(1301, 0, '2026-09-01', '2026-09-18'), endingRow(1302, 1, '2026-09-01', '2026-09-20')]
  }
]

export const fixtureInputs: OgRenderInputs = { eventRoles, postCases }
