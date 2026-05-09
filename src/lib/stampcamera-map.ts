/**
 * キャラ id → stampcamera.com のスタンプ群マッピング。
 *
 * 1 キャラに対して複数のパッケージ × スタンプ番号の組をリストで保持する。
 * これにより各キャラ最大 6 ポーズ程度を取得できる（同じキャラでもパッケージごとに
 * 衣装やポーズが違う）。
 *
 * 参照しているパッケージ:
 *   16, 53, 78, 83, 112, 113 (公開済みの主要なビッカメ娘パッケージ)
 *
 * 検証:
 *   https://stampcamera.com/packages/{packageId}/images/{NNN}.png
 *   (NNN は 3 桁ゼロ埋め)
 */
export type StampcameraEntry = { packageId: number; stickerId: number }

const entry = (packageId: number, stickerId: number): StampcameraEntry => ({ packageId, stickerId })

export const STAMPCAMERA_POSES: Record<string, StampcameraEntry[]> = {
  mito: [entry(16, 1), entry(16, 2), entry(53, 2), entry(78, 1), entry(83, 1), entry(112, 1), entry(113, 1)],
  honten: [entry(16, 3), entry(53, 4), entry(78, 8), entry(83, 8), entry(112, 8), entry(113, 8)],
  bicqlo: [entry(16, 4), entry(53, 5), entry(78, 5), entry(83, 5), entry(112, 5), entry(113, 5)],
  hachioji: [entry(16, 5), entry(53, 6), entry(78, 3), entry(83, 3), entry(112, 3), entry(113, 3)],
  kashiwa: [entry(16, 6), entry(53, 7), entry(78, 2), entry(83, 2), entry(112, 2), entry(113, 2)],
  hamamatsu: [entry(16, 7), entry(53, 1), entry(78, 6), entry(83, 6), entry(112, 6), entry(113, 6)],
  sagami: [entry(16, 8), entry(53, 8), entry(78, 7), entry(83, 7), entry(112, 7), entry(113, 7)],
  funabashi: [entry(16, 9), entry(53, 9), entry(78, 4), entry(83, 4), entry(112, 4), entry(113, 4)],
  prosta: [entry(16, 10), entry(53, 10), entry(78, 9), entry(83, 9), entry(112, 9), entry(113, 9)],
  ohmiya: [entry(16, 11), entry(53, 11), entry(78, 10), entry(83, 10), entry(112, 10), entry(113, 10)],
  fujisawa: [entry(16, 12), entry(53, 12), entry(78, 11), entry(83, 11), entry(112, 11), entry(113, 11)],
  photo: [entry(16, 13), entry(53, 13), entry(78, 12), entry(83, 12), entry(112, 12), entry(113, 12)],
  nagoya: [entry(16, 14), entry(53, 14), entry(78, 13), entry(83, 13), entry(112, 13), entry(113, 13)],
  yuurakuchou: [entry(16, 15), entry(53, 15), entry(78, 14), entry(83, 14), entry(112, 14), entry(113, 14)],
  shinjyuku: [entry(16, 16), entry(53, 16), entry(78, 15), entry(83, 15), entry(112, 15), entry(113, 15)],
  camera: [entry(16, 17), entry(53, 20), entry(78, 16), entry(83, 16), entry(112, 16), entry(113, 16)],
  pkan: [entry(16, 18), entry(53, 21), entry(78, 17), entry(83, 17), entry(112, 17), entry(113, 17)],
  sapporo: [entry(16, 19), entry(53, 23), entry(78, 18), entry(83, 18), entry(112, 18), entry(113, 18)],
  hiroshima: [entry(16, 20), entry(53, 24), entry(78, 19), entry(83, 19), entry(112, 19), entry(113, 19)],
  seiseki: [entry(16, 23), entry(53, 25), entry(78, 20), entry(83, 20), entry(112, 20), entry(113, 20)],
  abeno: [entry(16, 24), entry(53, 26), entry(78, 21), entry(83, 21), entry(112, 21), entry(113, 21)],
  okayama: [entry(16, 25), entry(53, 27), entry(78, 22), entry(83, 22), entry(112, 22), entry(113, 22)],
  tachikawa: [entry(16, 26), entry(53, 28), entry(78, 23), entry(83, 23), entry(112, 23), entry(113, 23)],
  kawasaki: [entry(16, 27), entry(53, 29), entry(78, 24), entry(83, 24), entry(112, 24), entry(113, 24)],
  kyoto: [entry(16, 28), entry(53, 30), entry(78, 26), entry(83, 27), entry(112, 25), entry(113, 25)],
  nanba: [entry(16, 29), entry(53, 31), entry(78, 27), entry(83, 28), entry(112, 26), entry(113, 26)],
  nagoyagate: [entry(16, 30), entry(53, 32), entry(78, 28), entry(83, 29), entry(112, 27), entry(113, 27)],
  ikenishi: [entry(16, 31), entry(53, 33), entry(78, 29), entry(83, 30), entry(112, 28), entry(113, 28)],
  akiba: [entry(16, 32), entry(53, 34), entry(78, 30), entry(83, 31), entry(112, 29), entry(113, 29)],
  chofu: [entry(16, 33), entry(53, 35), entry(78, 31), entry(83, 32), entry(112, 30), entry(113, 30)],
  tenjin2: [entry(16, 34), entry(53, 36), entry(78, 32), entry(83, 33), entry(112, 31), entry(113, 31)],
  funato: [entry(16, 35), entry(53, 37), entry(78, 33), entry(83, 34), entry(112, 32), entry(113, 32)],
  kagoshima: [entry(16, 36), entry(53, 38), entry(78, 34), entry(83, 35), entry(112, 33), entry(113, 33)],
  niigata: [entry(16, 37), entry(53, 39), entry(78, 35), entry(83, 36), entry(112, 34), entry(113, 34)],
  bicsim: [entry(16, 38)],
  akasaka: [entry(16, 39), entry(53, 40), entry(78, 36), entry(113, 35)],
  machida: [entry(16, 40), entry(53, 41), entry(78, 37), entry(113, 36)],
  shibuhachi: [entry(16, 41), entry(53, 42), entry(78, 38), entry(113, 37)],
  shibuto: [entry(16, 42), entry(53, 43), entry(78, 39), entry(113, 38)],
  shinyoko: [entry(16, 43), entry(53, 44), entry(78, 40)],
  shintou: [entry(16, 44), entry(53, 45), entry(78, 41)],
  tamapla: [entry(16, 45), entry(53, 46), entry(78, 42)],
  tenjin: [entry(16, 46), entry(53, 47), entry(78, 43)],
  tokorozawa: [entry(16, 47), entry(53, 48), entry(78, 44)],
  yao: [entry(16, 48), entry(53, 49), entry(78, 45)],
  takatsuki: [entry(16, 49), entry(53, 50), entry(78, 46)],
  chiba: [entry(16, 50), entry(53, 51), entry(78, 47)],
  yokonishi: [entry(16, 51), entry(53, 52), entry(78, 48)],
  kumamoto: [entry(53, 53)],
  itt: [entry(53, 54)],
  takasaki: [entry(53, 55)],
  air: [entry(53, 56)],
  oeraitan: [entry(53, 3)],
  naisen: [entry(53, 17)]
}

/**
 * OG カードなど 1 ポーズだけ欲しいユースケース用の代表選択。
 * 最も新しい主要パッケージ 53 → 16 → 先頭の順で優先する。
 */
export const getCanonicalPose = (id: string): StampcameraEntry | undefined => {
  const poses = STAMPCAMERA_POSES[id]
  if (!poses?.length) return undefined
  return poses.find((p) => p.packageId === 53) ?? poses.find((p) => p.packageId === 16) ?? poses[0]
}
