#!/usr/bin/env python3
"""
ビックカメ娘のプロフィールページから情報を取得してJSON/YAMLファイルに保存するスクリプト
"""

import urllib.request
import json
import yaml
from datetime import datetime
from bs4 import BeautifulSoup
import re

def fetch_html(url):
    """
    URLからHTMLを取得
    """
    with urllib.request.urlopen(url) as response:
        return response.read().decode('utf-8')

def parse_character_info(html_content):
    """
    HTMLを解析してキャラクター情報を抽出
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    characters = []

    # キャラクター名が定義されている要素を探す
    profile_name_divs = soup.find_all('div', class_='profile_name')

    for name_div in profile_name_divs:
        character = {}

        # キャラクター名を取得
        char_name = name_div.get_text(strip=True)
        # 「（ 別名 ）」形式を「/別名」に変換
        char_name = re.sub(r'（\s*([^）]+?)\s*）', r'/\1', char_name)
        character['character_name'] = char_name

        # 同じ親要素内の店舗名を取得
        parent = name_div.parent
        if parent:
            shop_div = parent.find('div', class_='profile_shop')
            if shop_div:
                # 改行を空白に変換してクリーンアップ
                store_name = ' '.join(shop_div.get_text().split())
                # 「ビックカメラ」を削除して前後のスペースをトリム
                store_name = store_name.replace('ビックカメラ', '').strip()
                character['store_name'] = store_name

            # さらに上の親要素から詳細情報を取得
            grandparent = parent.parent
            if grandparent:
                # 詳細ページへのリンク
                detail_link = grandparent.find('a', href=lambda x: x and '/profile/' in x and x.endswith('.html'))
                if detail_link:
                    href = detail_link['href']
                    character['detail_url'] = f"https://biccame.jp{href}" if href.startswith('/') else href

                    # URLからキーを抽出（例: /profile/mito.html -> mito）
                    key_match = re.search(r'/profile/([^/]+)\.html', href)
                    if key_match:
                        character['key'] = key_match.group(1)

                # 説明文
                desc_elem = grandparent.find('p')
                if desc_elem:
                    character['description'] = desc_elem.get_text(strip=True)

                # Twitterリンク
                twitter_link = grandparent.find('a', href=lambda x: x and 'twitter.com' in x)
                if twitter_link:
                    character['twitter_url'] = twitter_link['href']

        if character.get('character_name'):
            characters.append(character)

    # 重複を除去（character_nameをキーとして）
    seen_names = set()
    unique_characters = []
    for char in characters:
        name = char.get('character_name')
        if name and name not in seen_names:
            seen_names.add(name)
            unique_characters.append(char)

    return unique_characters

def fetch_detail_page(url):
    """
    詳細ページから追加情報を取得
    """
    try:
        html = fetch_html(url)
        soup = BeautifulSoup(html, 'html.parser')
        detail_info = {}

        # 住所、電話番号などの情報を抽出
        info_text = soup.get_text()

        # 住所を抽出（〒記号を含む行を探す）
        address_match = re.search(r'〒([\d\-]+)\s*(.+?)(?:\n|電話)', info_text)
        if address_match:
            detail_info['zipcode'] = address_match.group(1).strip()
            detail_info['address'] = address_match.group(2).strip()

        # 電話番号を抽出
        phone_match = re.search(r'電話[：:]\s*([\d\-]+)', info_text)
        if phone_match:
            detail_info['phone'] = phone_match.group(1)

        # 店舗URLを抽出
        store_url_match = re.search(r'(https?://www\.biccamera\.com/[^\s\)]+)', info_text)
        if store_url_match:
            detail_info['store_url'] = store_url_match.group(1)

        # 誕生日を抽出
        birthday_match = re.search(r'誕生日[：:]\s*(\d+月\d+日)', info_text)
        if birthday_match:
            detail_info['birthday'] = birthday_match.group(1)

        # 店舗誕生日を抽出
        shop_info_divs = soup.find_all('div', class_='shop_info')
        for div in shop_info_divs:
            div_text = div.get_text()
            if '店舗誕生日' in div_text:
                store_birthday_match = re.search(r'(\d{4})年(\d{2})月(\d{2})日', div_text)
                if store_birthday_match:
                    detail_info['store_birthday'] = f"{store_birthday_match.group(1)}-{store_birthday_match.group(2)}-{store_birthday_match.group(3)}"
                    break

        # 店舗リンクを抽出（shoplistを含むリンク）
        store_link = soup.find('a', href=lambda x: x and 'shoplist' in x)
        if store_link and store_link.get('href'):
            href = store_link['href']
            # 相対URLの場合は絶対URLに変換
            if href.startswith('http'):
                detail_info['store_link'] = href
            else:
                detail_info['store_link'] = f"http://www.biccamera.co.jp{href}" if href.startswith('/') else href

        # 画像URLを配列で取得（/profile/images/配下の画像）
        image_urls = []
        images = soup.find_all('img', src=lambda x: x and '/profile/images/' in x)
        for img in images:
            img_url = img['src']
            if img_url.startswith('/'):
                img_url = f"https://biccame.jp{img_url}"
            if img_url not in image_urls:
                image_urls.append(img_url)

        if image_urls:
            detail_info['image_urls'] = image_urls

        return detail_info
    except Exception as e:
        print(f'Error fetching detail page {url}: {e}')
        return {}

def main():
    """
    メイン処理
    """
    url = 'https://biccame.jp/profile/'

    try:
        print('Fetching HTML...')
        html_content = fetch_html(url)

        print('Parsing character information...')
        characters = parse_character_info(html_content)

        print(f'Found {len(characters)} characters')

        # 全キャラクターの詳細情報を取得
        print('Fetching details for all characters...')
        for i, char in enumerate(characters):
            if 'detail_url' in char:
                print(f'  [{i+1}/{len(characters)}] {char.get("character_name", "unknown")}...')
                detail_info = fetch_detail_page(char['detail_url'])
                char.update(detail_info)

        # タイムスタンプ
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        # JSONとして保存（絶対パスを使用）
        json_file = f'biccame_characters_{timestamp}.json'
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(characters, f, ensure_ascii=False, indent=2)
        print(f'Saved to {json_file}')

        # YAMLとして保存
        yaml_file = f'biccame_characters_{timestamp}.yaml'
        with open(yaml_file, 'w', encoding='utf-8') as f:
            yaml.dump(characters, f, allow_unicode=True, default_flow_style=False)
        print(f'Saved to {yaml_file}')

        # HTMLも保存
        html_file = f'biccame_profile_{timestamp}.html'
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f'Saved HTML to {html_file}')

        print(f'\nTotal characters: {len(characters)}')

    except Exception as e:
        print(f'Error: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
