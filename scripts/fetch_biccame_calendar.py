#!/usr/bin/env python3
"""
ビックカメ娘のカレンダーページから誕生日データを取得するスクリプト
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

def parse_calendar_events(html_content, year, month):
    """
    カレンダーHTMLから誕生日イベントを抽出
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    events = []

    # tdタグを全て取得
    td_tags = soup.find_all('td')

    for td in td_tags:
        # color:#CCCCCCが含まれているセルは翌月/先月のデータなのでスキップ
        style = td.get('style', '')
        if 'color:#CCCCCC' in style or 'color: #CCCCCC' in style:
            continue

        # 日付を取得
        day_div = td.find('div')
        if not day_div:
            continue

        day = day_div.get_text(strip=True)
        if not day.isdigit():
            continue        # イベントリンクを探す
        event_links = td.find_all('a', href=lambda x: x and '/profile/' in x)

        for link in event_links:
            event = {}

            # 日付を設定
            event['date'] = f"{year}-{month:02d}-{int(day):02d}"

            # リンクURLからキーを抽出
            href = link.get('href')
            key_match = re.search(r'/profile/([^/]+)\.html', href)
            if key_match:
                event['key'] = key_match.group(1)

            # イベントテキストを取得
            event_text = link.get_text(strip=True)
            event['event_text'] = event_text

            # イベントタイプを判定
            if '擬人化' in event_text:
                # 擬人化記念日
                event['event_type'] = 'character_birthday'
                # 年数を抽出
                year_match = re.search(r'(\d+)周年', event_text)
                if year_match:
                    event['years'] = int(year_match.group(1))
            elif '店舗誕生' in event_text or '店舗' in event_text:
                event['event_type'] = 'store_birthday'
                # 年数を抽出
                year_match = re.search(r'(\d+)周年', event_text)
                if year_match:
                    event['years'] = int(year_match.group(1))
            else:
                event['event_type'] = 'other'

            # 画像URL
            img = link.find('img')
            if img and img.get('src'):
                event['image_url'] = img['src']

            events.append(event)

    return events

def fetch_all_year_events(year):
    """
    1年分のカレンダーイベントを取得
    """
    all_events = []

    for month in range(1, 13):
        url = f'https://biccame.jp/calendar/{year}/{month:02d}/'

        try:
            print(f'Fetching calendar for {year}/{month:02d}...')
            html_content = fetch_html(url)
            events = parse_calendar_events(html_content, year, month)
            all_events.extend(events)
            print(f'  Found {len(events)} events')
        except Exception as e:
            print(f'  Error fetching {year}/{month:02d}: {e}')

    # 重複を除去（同じdateとkeyの組み合わせ）
    seen = set()
    unique_events = []
    for event in all_events:
        key_tuple = (event['date'], event['key'], event['event_type'])
        if key_tuple not in seen:
            seen.add(key_tuple)
            unique_events.append(event)

    return unique_events

def merge_with_profile_data(events, profile_file):
    """
    カレンダーイベントをプロフィールデータとマージ
    """
    # プロフィールデータを読み込み
    with open(profile_file, 'r', encoding='utf-8') as f:
        profiles = json.load(f)

    # keyでプロフィールを検索できるようにする
    profile_dict = {profile['key']: profile for profile in profiles if 'key' in profile}

    # 各プロフィールにキャラクター誕生日を追加
    for event in events:
        if event['event_type'] == 'character_birthday':
            key = event['key']
            if key in profile_dict:
                # 周年数から誕生年を計算
                birth_year = int(event['date'][:4]) - event.get('years', 0)
                birth_date = f"{birth_year}{event['date'][4:]}"
                profile_dict[key]['character_birthday'] = birth_date

    # リストに戻す
    updated_profiles = list(profile_dict.values())

    # keyを持たないプロフィールも追加
    for profile in profiles:
        if 'key' not in profile or profile['key'] not in profile_dict:
            updated_profiles.append(profile)

    return updated_profiles

def main():
    """
    メイン処理
    """
    year = 2025

    try:
        # 1年分のイベントを取得
        print(f'Fetching all events for {year}...')
        all_events = fetch_all_year_events(year)
        print(f'\nTotal events found: {len(all_events)}')

        # タイムスタンプ
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        # カレンダーイベントを保存
        calendar_json = f'biccame_calendar_{year}_{timestamp}.json'
        with open(calendar_json, 'w', encoding='utf-8') as f:
            json.dump(all_events, f, ensure_ascii=False, indent=2)
        print(f'Saved calendar to {calendar_json}')

        calendar_yaml = f'biccame_calendar_{year}_{timestamp}.yaml'
        with open(calendar_yaml, 'w', encoding='utf-8') as f:
            yaml.dump(all_events, f, allow_unicode=True, default_flow_style=False)
        print(f'Saved calendar to {calendar_yaml}')

        # プロフィールデータとマージ
        # 最新のプロフィールファイルを探す
        import glob
        profile_files = sorted(glob.glob('biccame_characters_*.json'), reverse=True)
        if profile_files:
            print(f'\nMerging with profile data from {profile_files[0]}...')
            merged_profiles = merge_with_profile_data(all_events, profile_files[0])

            # マージ結果を保存
            merged_json = f'biccame_characters_merged_{timestamp}.json'
            with open(merged_json, 'w', encoding='utf-8') as f:
                json.dump(merged_profiles, f, ensure_ascii=False, indent=2)
            print(f'Saved merged data to {merged_json}')

            merged_yaml = f'biccame_characters_merged_{timestamp}.yaml'
            with open(merged_yaml, 'w', encoding='utf-8') as f:
                yaml.dump(merged_profiles, f, allow_unicode=True, default_flow_style=False)
            print(f'Saved merged data to {merged_yaml}')

            # 誕生日が設定されたキャラクターを表示
            print(f'\nCharacters with birthday:')
            for profile in merged_profiles:
                if 'character_birthday' in profile:
                    print(f"  {profile.get('character_name', 'unknown')}: {profile['character_birthday']}")
        else:
            print('No profile data found to merge')

        # イベント一覧を表示
        print(f'\nAll events in {year}:')
        for event in all_events:
            print(f"  {event['date']}: {event['event_text']} ({event.get('event_type', 'unknown')})")

    except Exception as e:
        print(f'Error: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
