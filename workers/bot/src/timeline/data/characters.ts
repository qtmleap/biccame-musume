export interface Character {
  id: string
  name: string
  twitter_id: string
}

export const characters: Character[] = [
  {
    id: 'abeno',
    name: 'あべのたん',
    twitter_id: 'bic_abeno'
  },
  {
    id: 'akasaka',
    name: 'みっけたん',
    twitter_id: 'bicakasaka'
  },
  {
    id: 'akiba',
    name: 'アキバたん',
    twitter_id: 'bic_akiba'
  },
  {
    id: 'bicqlo',
    name: 'しんじゅくたん',
    twitter_id: 'bic_shinjuku3ch'
  },
  {
    id: 'chiba',
    name: '千葉たん',
    twitter_id: 'bic_chiba'
  },
  {
    id: 'chofu',
    name: '調布たん',
    twitter_id: 'bic_keiochofu'
  },
  {
    id: 'fujisawa',
    name: '藤沢たん',
    twitter_id: 'bic_fujisawa'
  },
  {
    id: 'funabashi',
    name: 'ふなたん',
    twitter_id: 'bic_funabashi'
  },
  {
    id: 'hachioji',
    name: '八王子たん',
    twitter_id: 'bichachioji'
  },
  {
    id: 'hamamatsu',
    name: 'はまたん',
    twitter_id: 'bic_hamamatsu'
  },
  {
    id: 'hiroshima',
    name: '広島たん',
    twitter_id: 'bic_hiroshima'
  },
  {
    id: 'honten',
    name: '本店たん',
    twitter_id: 'bicikebukuro'
  },
  {
    id: 'ikenishi',
    name: '池西たん',
    twitter_id: 'bicikenishi'
  },
  {
    id: 'kagoshima',
    name: '鹿児島たん',
    twitter_id: 'bic_kagoshima'
  },
  {
    id: 'kashiwa',
    name: '柏たん',
    twitter_id: 'bic_kashiwa'
  },
  {
    id: 'kawasaki',
    name: '川崎たん',
    twitter_id: 'Bic_kawasaki'
  },
  {
    id: 'mito',
    name: '水戸たん',
    twitter_id: 'biccameramito'
  },
  {
    id: 'nagoya',
    name: 'なごやたん',
    twitter_id: 'bic_nagoya'
  },
  {
    id: 'nagoyagate',
    name: 'なごやげーとたん',
    twitter_id: 'bic_nagoyagate'
  },
  {
    id: 'nanba',
    name: 'なんばたん',
    twitter_id: 'biccamera_nanba'
  },
  {
    id: 'niigata',
    name: 'にいがたたん',
    twitter_id: 'niigata_bic'
  },
  {
    id: 'ohmiya',
    name: '大宮たん',
    twitter_id: 'bic_ohmiya'
  },
  {
    id: 'okayama',
    name: '岡山たん',
    twitter_id: 'Bic_Okayamaten'
  },
  {
    id: 'pkan',
    name: 'パソ館たん',
    twitter_id: 'bicpkanhonten'
  },
  {
    id: 'prosta',
    name: 'プロスタたん',
    twitter_id: 'bic_shasinkan'
  },
  {
    id: 'sagami',
    name: 'さがみたん',
    twitter_id: 'bic_sagamioono'
  },
  {
    id: 'sapporo',
    name: 'さっぽろたん',
    twitter_id: 'bic_sapporo'
  },
  {
    id: 'shibuhachi',
    name: 'しぶハチたん',
    twitter_id: 'bicshibuhachi00'
  },
  {
    id: 'shibuto',
    name: 'しぶとーたん',
    twitter_id: 'bic_shibuya'
  },
  {
    id: 'shinjyuku',
    name: '新宿西口たん',
    twitter_id: 'bic_shinjyuku'
  },
  {
    id: 'shintou',
    name: '新東たん',
    twitter_id: 'Bic_shintoueki'
  },
  {
    id: 'shinyoko',
    name: '新横たん',
    twitter_id: 'bic_shinyoko'
  },
  {
    id: 'tachikawa',
    name: '立川たん',
    twitter_id: 'bic_tachikawa'
  },
  {
    id: 'takatsuki',
    name: 'たかつきたん',
    twitter_id: 'bic_takatsuki'
  },
  {
    id: 'tenjin',
    name: '天神1号たん',
    twitter_id: 'bic_tenjin'
  },
  {
    id: 'tenjin2',
    name: '天神2号たん',
    twitter_id: 'biccameratenjin'
  },
  {
    id: 'tokorozawa',
    name: '所沢たん',
    twitter_id: 'bic_toko'
  },
  {
    id: 'yao',
    name: '八尾たん',
    twitter_id: 'bic_yao'
  },
  {
    id: 'yokonishi',
    name: '横西たん',
    twitter_id: 'bicyokonishi'
  },
  {
    id: 'yuurakuchou',
    name: '有楽町たん',
    twitter_id: 'bic_yuurakuchou'
  }
] as const satisfies Character[]
