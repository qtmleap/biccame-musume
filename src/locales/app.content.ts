import type { Dictionary } from 'intlayer'
import {
  type EventCategory,
  EventCategorySchema,
  type EventConditionType,
  EventConditionTypeSchema,
  type EventStatus,
  EventStatusSchema,
  type ReferenceUrlType,
  ReferenceUrlTypeSchema
} from '@/schemas/event.dto'
import { type Region, RegionSchema, type StoreKey, StoreKeySchema } from '@/schemas/store.dto'

const appContent = {
  key: 'app',
  content: {
    status: {
      [EventStatusSchema.enum.upcoming]: '開催前',
      [EventStatusSchema.enum.ongoing]: '開催中',
      [EventStatusSchema.enum.last_day]: '最終日',
      [EventStatusSchema.enum.ended]: '終了'
    },
    category: {
      [EventCategorySchema.enum.limited_card]: '限定名刺',
      [EventCategorySchema.enum.regular_card]: '通年名刺',
      [EventCategorySchema.enum.ackey]: 'アクキー',
      [EventCategorySchema.enum.other]: 'その他'
    },
    condition: {
      [EventConditionTypeSchema.enum.purchase]: '購入条件',
      [EventConditionTypeSchema.enum.first_come]: '先着順',
      [EventConditionTypeSchema.enum.lottery]: '抽選',
      [EventConditionTypeSchema.enum.everyone]: '全員配布'
    },
    ref: {
      [ReferenceUrlTypeSchema.enum.announce]: '告知',
      [ReferenceUrlTypeSchema.enum.start]: '開始',
      [ReferenceUrlTypeSchema.enum.end]: '終了'
    },
    refLong: {
      [ReferenceUrlTypeSchema.enum.announce]: '告知ツイート',
      [ReferenceUrlTypeSchema.enum.start]: '開始ツイート',
      [ReferenceUrlTypeSchema.enum.end]: '終了ツイート'
    },
    region: {
      [RegionSchema.enum.all]: '全国',
      [RegionSchema.enum.hokkaido]: '北海道',
      [RegionSchema.enum.kanto]: '関東',
      [RegionSchema.enum.chubu]: '中部',
      [RegionSchema.enum.kansai]: '関西',
      [RegionSchema.enum.kyushu]: '九州'
    },
    store_name: {
      [StoreKeySchema.enum.abeno]: 'あべのキューズモール店',
      [StoreKeySchema.enum.akasaka]: '赤坂見附駅店',
      [StoreKeySchema.enum.akiba]: 'AKIBA',
      [StoreKeySchema.enum.biccamera]: 'ビックカメラ',
      [StoreKeySchema.enum.bicqlo]: '新宿東口店',
      [StoreKeySchema.enum.bicsim]: 'ビックシム',
      [StoreKeySchema.enum.camera]: 'カメラ',
      [StoreKeySchema.enum.chiba]: '千葉駅前店',
      [StoreKeySchema.enum.chofu]: '京王調布店',
      [StoreKeySchema.enum.fujisawa]: '藤沢店',
      [StoreKeySchema.enum.funabashi]: '船橋駅FACE店',
      [StoreKeySchema.enum.funato]: '船渡店',
      [StoreKeySchema.enum.hachioji]: 'JR八王子駅店',
      [StoreKeySchema.enum.hamamatsu]: '浜松店',
      [StoreKeySchema.enum.hiroshima]: '広島駅前店',
      [StoreKeySchema.enum.honten]: '池袋本店',
      [StoreKeySchema.enum.ikenishi]: '池袋西口店',
      [StoreKeySchema.enum.kagoshima]: '鹿児島中央駅店',
      [StoreKeySchema.enum.kashiwa]: '柏店',
      [StoreKeySchema.enum.kawasaki]: 'ラゾーナ川崎店',
      [StoreKeySchema.enum.kumamoto]: 'アミュプラザくまもと店',
      [StoreKeySchema.enum.kyoto]: '京都店',
      [StoreKeySchema.enum.machida]: '町田店',
      [StoreKeySchema.enum.mito]: '水戸駅店',
      [StoreKeySchema.enum.nagoya]: '名古屋駅西店',
      [StoreKeySchema.enum.nagoyagate]: '名古屋JRゲートタワー店',
      [StoreKeySchema.enum.naisen]: 'ナイセン',
      [StoreKeySchema.enum.nanba]: 'なんば店',
      [StoreKeySchema.enum.niigata]: '新潟店',
      [StoreKeySchema.enum.oeraitan]: 'お偉いたん',
      [StoreKeySchema.enum.ohmiya]: '大宮西口そごう店',
      [StoreKeySchema.enum.okayama]: '岡山駅前店',
      [StoreKeySchema.enum.photo]: 'フォト',
      [StoreKeySchema.enum.pkan]: '池袋本店パソコン館',
      [StoreKeySchema.enum.prosta]: 'プロスタ',
      [StoreKeySchema.enum.sagami]: '相模大野駅店',
      [StoreKeySchema.enum.sapporo]: '札幌店',
      [StoreKeySchema.enum.seiseki]: '聖蹟桜ヶ丘駅店',
      [StoreKeySchema.enum.shibuhachi]: '渋谷ハチ公口店',
      [StoreKeySchema.enum.shibuto]: '渋谷東口店',
      [StoreKeySchema.enum.shinjyuku]: '新宿西口店',
      [StoreKeySchema.enum.shintou]: '新宿東口駅前店',
      [StoreKeySchema.enum.shinyoko]: '新横浜店',
      [StoreKeySchema.enum.tachikawa]: '立川店',
      [StoreKeySchema.enum.takatsuki]: '高槻阪急スクエア店',
      [StoreKeySchema.enum.tamapla]: '多摩プラーザ店',
      [StoreKeySchema.enum.tenjin]: '天神1号館',
      [StoreKeySchema.enum.tenjin2]: '天神2号館',
      [StoreKeySchema.enum.tokorozawa]: '所沢駅店',
      [StoreKeySchema.enum.yao]: 'アリオ八尾店',
      [StoreKeySchema.enum.yokonishi]: '横浜西口店',
      [StoreKeySchema.enum.yuurakuchou]: '有楽町店'
    },
    character_name: {
      [StoreKeySchema.enum.abeno]: 'あべのたん',
      [StoreKeySchema.enum.akasaka]: 'みっけたん',
      [StoreKeySchema.enum.akiba]: 'アキバたん',
      [StoreKeySchema.enum.biccamera]: 'ビックカメラ',
      [StoreKeySchema.enum.bicqlo]: 'しんじゅくたん',
      [StoreKeySchema.enum.bicsim]: 'ビックシムたん',
      [StoreKeySchema.enum.camera]: 'カメ館たん',
      [StoreKeySchema.enum.chiba]: '千葉たん',
      [StoreKeySchema.enum.chofu]: '調布たん',
      [StoreKeySchema.enum.fujisawa]: '藤沢たん',
      [StoreKeySchema.enum.funabashi]: 'ふなたん',
      [StoreKeySchema.enum.funato]: 'ふなとーたん',
      [StoreKeySchema.enum.hachioji]: '八王子たん',
      [StoreKeySchema.enum.hamamatsu]: 'はまたん',
      [StoreKeySchema.enum.hiroshima]: '広島たん',
      [StoreKeySchema.enum.honten]: '本店たん',
      [StoreKeySchema.enum.ikenishi]: '池西たん',
      [StoreKeySchema.enum.kagoshima]: '鹿児島たん',
      [StoreKeySchema.enum.kashiwa]: '柏たん',
      [StoreKeySchema.enum.kawasaki]: '川崎たん',
      [StoreKeySchema.enum.kumamoto]: 'くまもとたん',
      [StoreKeySchema.enum.kyoto]: '京都たん',
      [StoreKeySchema.enum.machida]: '町田たん',
      [StoreKeySchema.enum.mito]: '水戸たん',
      [StoreKeySchema.enum.nagoya]: 'なごやたん',
      [StoreKeySchema.enum.nagoyagate]: 'なごやげーとたん',
      [StoreKeySchema.enum.naisen]: 'ナイセン',
      [StoreKeySchema.enum.nanba]: 'なんばたん',
      [StoreKeySchema.enum.niigata]: 'にいがたたん',
      [StoreKeySchema.enum.oeraitan]: 'お偉いたん',
      [StoreKeySchema.enum.ohmiya]: '大宮たん',
      [StoreKeySchema.enum.okayama]: '岡山たん',
      [StoreKeySchema.enum.photo]: 'フォトたん',
      [StoreKeySchema.enum.pkan]: 'パソ館たん',
      [StoreKeySchema.enum.prosta]: 'プロスタたん',
      [StoreKeySchema.enum.sagami]: 'さがみたん',
      [StoreKeySchema.enum.sapporo]: 'さっぽろたん',
      [StoreKeySchema.enum.seiseki]: 'せいせきたん',
      [StoreKeySchema.enum.shibuhachi]: 'しぶハチたん',
      [StoreKeySchema.enum.shibuto]: 'しぶとーたん',
      [StoreKeySchema.enum.shinjyuku]: '新宿西口たん',
      [StoreKeySchema.enum.shintou]: '新東たん',
      [StoreKeySchema.enum.shinyoko]: '新横たん',
      [StoreKeySchema.enum.tachikawa]: '立川たん',
      [StoreKeySchema.enum.takatsuki]: 'たかつきたん',
      [StoreKeySchema.enum.tamapla]: 'たまプラたん',
      [StoreKeySchema.enum.tenjin]: '天神1号たん',
      [StoreKeySchema.enum.tenjin2]: '天神2号たん',
      [StoreKeySchema.enum.tokorozawa]: '所沢たん',
      [StoreKeySchema.enum.yao]: '八尾たん',
      [StoreKeySchema.enum.yokonishi]: '横西たん',
      [StoreKeySchema.enum.yuurakuchou]: '有楽町たん'
    },
    common: {
      loading: '読み込み中...',
      error: 'エラーが発生しました',
      retry: '再試行',
      close: '閉じる'
    },
    myPage: {
      title: 'マイページ',
      backButton: '戻る',
      logout: 'ログアウト',
      logoutSuccess: 'ログアウトしました',
      logoutError: 'ログアウトに失敗しました',
      visitedStores: '訪れた店舗の記録',
      visitedStoresCount: '店舗を訪問済み',
      noVisitedStores: 'まだ訪問した店舗がありません',
      interestedEvents: '気になるイベント',
      noInterestedEvents: 'まだ気になるイベントがありません',
      completedEvents: '達成したイベント',
      noCompletedEvents: 'まだ達成したイベントがありません',
      viewAll: '一覧を見る',
      backToMyPage: 'マイページに戻る',
      findEvents: 'イベントを探す'
    },
    filter: {
      region: '地域で絞り込み',
      category: '種別で絞り込み',
      status: '開催状況で絞り込み'
    },
    sort: {
      random: 'ランダム',
      characterBirthday: '誕生日順',
      storeBirthday: '開店日順',
      upcomingBirthday: '誕生日が近い順'
    },
    characterDetail: {
      storeName: '店舗名',
      address: '住所',
      phone: '電話番号',
      hours: '営業時間',
      access: 'アクセス',
      openDate: '店舗開店日'
    },
    event: {
      untilEnd: '〜なくなり次第',
      untilStockLasts: '〜なくなり次第終了',
      firstCome: '先着',
      lottery: '抽選',
      lotteryWithCount: '抽選{count}名',
      everyone: '全員に配布',
      storeAndOthers: '{stores} 他'
    },
    navigation: {
      characters: 'ビッカメ娘一覧',
      events: 'イベント一覧',
      calendar: '誕生日一覧',
      location: 'マップ',
      ranking: '総選挙',
      closeMenu: 'メニューを閉じる',
      openMenu: 'メニューを開く'
    },
    admin: {
      eventManagement: 'イベント管理',
      eventManagementDesc: 'アクキー配布などのイベントを登録・管理',
      eventEdit: 'イベント編集',
      eventNew: '新規イベント登録',
      eventEditDesc: 'イベント情報を編集',
      eventNewDesc: 'アクキー配布などのイベント情報を入力',
      startDate: '開始日',
      endDateHint: '配布が終了した場合に設定すると、自動的に「終了」として扱われます',
      selectCategory: '種別を選択',
      selectStore: '店舗を選択',
      storeSelected: '{count}店舗選択中'
    },
    auth: {
      login: 'ログイン・新規登録',
      loginSuccess: 'ログインしました',
      loginError: 'ログインに失敗しました',
      signupSuccess: 'アカウントを作成しました',
      signupError: 'アカウント作成に失敗しました',
      emulatorMessage: '開発環境ではメール/パスワード認証を使用してください',
      loginMessage:
        '外部アカウントを使って、かんたんにログインできます。アカウントをお持ちでない場合は、そのまま新規登録されます。',
      passwordPlaceholder: 'パスワード',
      displayNamePlaceholder: '表示名'
    },
    calendar: {
      weekDays: ['日', '月', '火', '水', '木', '金', '土'],
      age: '歳',
      anniversary: '周年'
    },
    vote: {
      error: '投票に失敗しました',
      voted: '応援済み',
      vote: '応援する'
    },
    route: {
      station: '駅'
    },
    lineSticker: {
      biccameMusume: 'ビッカメ娘',
      originalStamp: 'オリジナルスタンプ',
      dailyConversation: '日常会話スタンプ'
    },
    date: {
      today: '今日',
      tomorrow: '明日'
    },
    home: {
      displayPattern: '表示パターンを変更',
      hidePattern: '表示パターンを隠す',
      patternDialog: 'ダイアログ',
      patternFullscreen: 'フルスクリーン',
      patternBanner: 'バナー',
      patternHero: 'ヒーロー',
      patternFloating: 'フローティング',
      patternBackground: '背景',
      patternNone: 'なし',
      nextCharacter: 'タップして次へ ({current}/{total})',
      tapToClose: 'タップして閉じる',
      biccameMusumeTitle: 'ビッカメ娘',
      relatedCharactersTitle: 'ビッカメ娘の関係者'
    },
    share: {
      hashtag: 'ビッカメ娘',
      text: 'ビッカメ娘応援プロジェクト'
    },
    confirmation: {
      registering: '登録中...',
      register: '登録する'
    },
    eventList: {
      deleteError: '削除に失敗しました'
    },
    birthdayDialog: {
      close: '閉じる',
      next: '次へ'
    },
    eventListItem: {
      today: '本日開始',
      tomorrow: '明日',
      untilEnd: '〜なくなり次第終了'
    },
    ganttChart: {
      ariaLabel: 'ガントチャートスクロールエリア'
    }
  }
} satisfies Dictionary

export default appContent

// コンポーネントから使いやすいようにエクスポート
export const EVENT_STATUS_LABELS = appContent.content.status as Record<EventStatus, string>
export const EVENT_CATEGORY_LABELS = appContent.content.category as Record<EventCategory, string>
export const EVENT_CONDITION_LABELS = appContent.content.condition as Record<EventConditionType, string>
export const REFERENCE_URL_TYPE_LABELS = appContent.content.ref as Record<ReferenceUrlType, string>
export const REFERENCE_URL_TYPE_LABELS_LONG = appContent.content.refLong as Record<ReferenceUrlType, string>
export const REGION_LABELS = appContent.content.region as Record<Region, string>
export const STORE_NAME_LABELS = appContent.content.store_name
export const CHARACTER_NAME_LABELS = appContent.content.character_name as Record<StoreKey, string>
export const MY_PAGE_LABELS = appContent.content.myPage
export const FILTER_LABELS = appContent.content.filter
export const SORT_LABELS = appContent.content.sort
export const CHARACTER_DETAIL_LABELS = appContent.content.characterDetail
export const EVENT_LABELS = appContent.content.event
export const NAVIGATION_LABELS = appContent.content.navigation
export const ADMIN_LABELS = appContent.content.admin
export const AUTH_LABELS = appContent.content.auth
export const CALENDAR_LABELS = appContent.content.calendar
export const VOTE_LABELS = appContent.content.vote
export const ROUTE_LABELS = appContent.content.route
export const LINE_STICKER_LABELS = appContent.content.lineSticker
export const DATE_LABELS = appContent.content.date
export const HOME_LABELS = appContent.content.home
export const SHARE_LABELS = appContent.content.share
export const CONFIRMATION_LABELS = appContent.content.confirmation
export const EVENT_LIST_LABELS = appContent.content.eventList
export const BIRTHDAY_DIALOG_LABELS = appContent.content.birthdayDialog
export const EVENT_LIST_ITEM_LABELS = appContent.content.eventListItem
export const GANTT_CHART_LABELS = appContent.content.ganttChart
export const COMMON_LABELS = appContent.content.common
