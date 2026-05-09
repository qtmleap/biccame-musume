/**
 * キャラ id → stampcamera.com の (パッケージID, スタンプ番号) マッピング。
 *
 * stampcamera のパッケージは 1 つで複数キャラのスタンプを含むので、
 * パッケージID とパッケージ内のスタンプ番号 (images/{NNN}.png) のペアで指定する。
 *
 * OG 画像生成時、ここに記入されているキャラだけ stampcamera から透過 SD 画像を
 * 抽出して使う。未記入のキャラは biccame.jp の画像にフォールバック。
 *
 * 検証: https://stampcamera.com/packages/{packageId}/images/{NNN}.png を直接ブラウザで
 * 開いて確認できる (NNN は 3 桁ゼロ埋め)。
 *
 * 現状: パッケージ 53 を主に使い、53 に含まれない bicsim だけ パッケージ 16 を参照。
 */
export type StampcameraEntry = { packageId: number; stickerId: number }

export const STAMPCAMERA_PACKAGE_MAP: Record<string, StampcameraEntry> = {
  mito: { packageId: 53, stickerId: 2 },
  honten: { packageId: 53, stickerId: 4 },
  bicqlo: { packageId: 53, stickerId: 5 },
  hachioji: { packageId: 53, stickerId: 6 },
  kashiwa: { packageId: 53, stickerId: 7 },
  hamamatsu: { packageId: 53, stickerId: 1 },
  sagami: { packageId: 53, stickerId: 8 },
  funabashi: { packageId: 53, stickerId: 9 },
  prosta: { packageId: 53, stickerId: 10 },
  ohmiya: { packageId: 53, stickerId: 11 },
  fujisawa: { packageId: 53, stickerId: 12 },
  photo: { packageId: 53, stickerId: 13 },
  nagoya: { packageId: 53, stickerId: 14 },
  yuurakuchou: { packageId: 53, stickerId: 15 },
  shinjyuku: { packageId: 53, stickerId: 16 },
  camera: { packageId: 53, stickerId: 20 },
  pkan: { packageId: 53, stickerId: 21 },
  sapporo: { packageId: 53, stickerId: 23 },
  hiroshima: { packageId: 53, stickerId: 24 },
  seiseki: { packageId: 53, stickerId: 25 },
  abeno: { packageId: 53, stickerId: 26 },
  okayama: { packageId: 53, stickerId: 27 },
  tachikawa: { packageId: 53, stickerId: 28 },
  kawasaki: { packageId: 53, stickerId: 29 },
  kyoto: { packageId: 53, stickerId: 30 },
  nanba: { packageId: 53, stickerId: 31 },
  nagoyagate: { packageId: 53, stickerId: 32 },
  ikenishi: { packageId: 53, stickerId: 33 },
  akiba: { packageId: 53, stickerId: 34 },
  chofu: { packageId: 53, stickerId: 35 },
  tenjin2: { packageId: 53, stickerId: 36 },
  funato: { packageId: 53, stickerId: 37 },
  kagoshima: { packageId: 53, stickerId: 38 },
  niigata: { packageId: 53, stickerId: 39 },
  akasaka: { packageId: 53, stickerId: 40 },
  machida: { packageId: 53, stickerId: 41 },
  shibuhachi: { packageId: 53, stickerId: 42 },
  shibuto: { packageId: 53, stickerId: 43 },
  shinyoko: { packageId: 53, stickerId: 44 },
  shintou: { packageId: 53, stickerId: 45 },
  tamapla: { packageId: 53, stickerId: 46 },
  tenjin: { packageId: 53, stickerId: 47 },
  tokorozawa: { packageId: 53, stickerId: 48 },
  yao: { packageId: 53, stickerId: 49 },
  takatsuki: { packageId: 53, stickerId: 50 },
  chiba: { packageId: 53, stickerId: 51 },
  yokonishi: { packageId: 53, stickerId: 52 },
  kumamoto: { packageId: 53, stickerId: 53 },
  itt: { packageId: 53, stickerId: 54 },
  takasaki: { packageId: 53, stickerId: 55 },
  air: { packageId: 53, stickerId: 56 },
  oeraitan: { packageId: 53, stickerId: 3 },
  // bicsim は package 53 に未収録、package 16 を使う
  bicsim: { packageId: 16, stickerId: 38 }
}
