import { parse } from 'node-html-parser'

/**
 * プロフィールHTMLからビッカメ娘情報を抽出
 */
export const parseProfileHtml = (
  html: string,
  storeId: string
): {
  character: {
    name: string
    aliases?: string[]
    description: string
    twitter_id?: string
    images: string[]
    is_biccame_musume: boolean
  }
  store_fields: {
    postal_code?: string
    phone?: string
    birthday?: string
    address?: string
  }
} | null => {
  const root = parse(html)

  // キャラクター名を取得（直下のテキストノードとfontタグ内のみ）
  const nameElement = root.querySelector('.char_name')
  if (!nameElement) {
    return null
  }

  // spanタグ以外のテキストを取得（直下のテキストノード + fontタグ内）
  let characterName = ''
  for (const child of nameElement.childNodes) {
    if (child.nodeType === 3) {
      // テキストノード
      characterName += child.text
    } else if (child.rawTagName === 'font') {
      // fontタグ
      characterName += child.text
    }
  }
  characterName = characterName.trim()

  // 別名を抽出（例: 「有楽町たん（ゆうらくちょうたん）」または「<font>（ 秋葉原たん ）</font>」）
  // 全ての括弧内の文字列を配列として取得
  const aliasMatches = characterName.matchAll(/[（(]\s*([^）)]+?)\s*[）)]/g)
  const _aliases = Array.from(aliasMatches)
    .map((match) => match[1].trim())
    .filter((alias) => alias.length > 0)
  const _cleanName = characterName.replace(/[（(]\s*[^）)]+?\s*[）)]/g, '').trim()

  // キャラクター説明を取得
  const descElement = root.querySelector('.char_text p')
  const description = descElement?.text.trim().replace(/\s+/g, '') || ''

  // Twitter IDを取得
  const twitterLink = root.querySelector('.tw_bt')?.getAttribute('href') || ''
  const twitter_id_match = twitterLink.match(/twitter\.com\/([^/?]+)/)
  const twitter_id = twitter_id_match ? twitter_id_match[1] : ''

  // 画像URLを取得
  const images: string[] = []
  const img1 = root.querySelector('.pro_detail_img1')?.getAttribute('src')
  const img2 = root.querySelector('.pro_detail_img2')?.getAttribute('src')
  if (img1) images.push(img1)
  if (img2) images.push(img2)

  // 追加の画像を取得（shop_info_frame_left → pro_detail_frame2 の順）
  for (const selector of ['.shop_info_frame_left', '.pro_detail_frame2']) {
    const container = root.querySelector(selector)
    if (container) {
      const additionalImages = container.querySelectorAll('img')
      for (const img of additionalImages) {
        const src = img.getAttribute('src')
        if (src?.includes('/profile/images/')) {
          images.push(src)
        }
      }
    }
  }

  // 画像URLから共通部分を削除（https://biccame.jp/profile/）
  const shortImages = images.map((url) => url.replace('https://biccame.jp/profile/', ''))

  // 郵便番号を取得
  const addressElement = root.querySelector('.shop_info')
  const addressText = addressElement?.text || ''
  const postal_code_match = addressText.match(/〒(\d{3}-\d{4})/)
  const postal_code = postal_code_match ? postal_code_match[1] : undefined

  // 住所を取得（「住所：〒XXX-XXXX 住所本文」形式）
  let address: string | undefined
  const addressMatch = addressText.match(/住所：〒\d{3}-\d{4}\s*([^\n]+)/)
  if (addressMatch) {
    address = addressMatch[1].trim().replace(/\s+/g, '')
  }

  // 電話番号を取得
  const phoneElement = root.querySelectorAll('.shop_info')[1]
  const phoneText = phoneElement?.text || ''
  const phoneMatch = phoneText.match(/TEL：(.+)/)
  const phone = phoneMatch ? phoneMatch[1].trim() : undefined

  // 店舗誕生日を取得
  const birthdayElement = Array.from(root.querySelectorAll('.shop_info')).find((el) => el.text.includes('店舗誕生日'))
  const birthdayText = birthdayElement?.text || ''
  const birthdayMatch = birthdayText.match(/(\d{4})年(\d{2})月(\d{2})日/)
  const birthday = birthdayMatch ? `${birthdayMatch[1]}-${birthdayMatch[2]}-${birthdayMatch[3]}` : undefined

  if (!_cleanName) {
    return null
  }

  // is_biccame_musumeのデフォルト値を設定
  // ナイセン、お偉いたん、ビックシムたん、ビックカメラ、Airたんはfalse、それ以外はtrue
  const excludedCharacterIds = ['naisen', 'oeraitan', 'bicsim', 'biccamera', 'air']
  const is_biccame_musume = !excludedCharacterIds.includes(storeId)

  return {
    character: {
      name: _cleanName,
      aliases: _aliases.length > 0 ? _aliases : undefined,
      description,
      twitter_id: twitter_id || undefined,
      images: shortImages,
      is_biccame_musume
    },
    store_fields: {
      postal_code,
      phone,
      birthday,
      address
    }
  }
}
