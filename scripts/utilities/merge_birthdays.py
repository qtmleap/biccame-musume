#!/usr/bin/env python3
"""
カレンダーイベントをcharacters.jsonにマージするスクリプト
"""

import json
import sys

def merge_birthdays(calendar_file, characters_file, output_file):
    """
    カレンダーの誕生日データをキャラクターデータにマージ
    """
    # カレンダーデータを読み込み
    with open(calendar_file, 'r', encoding='utf-8') as f:
        calendar_events = json.load(f)

    # キャラクターデータを読み込み
    with open(characters_file, 'r', encoding='utf-8') as f:
        characters = json.load(f)

    # keyでキャラクターを検索できるようにする
    character_dict = {char['key']: char for char in characters}

    # キャラクター誕生日イベントを処理
    for event in calendar_events:
        if event['event_type'] == 'character_birthday':
            key = event['key']
            if key in character_dict:
                # 周年数から誕生年を計算
                event_year = int(event['date'][:4])
                years = event.get('years', 0)
                birth_year = event_year - years
                birth_date = f"{birth_year}{event['date'][4:]}"

                # character_birthdayを設定
                character_dict[key]['character_birthday'] = birth_date
                print(f"Added birthday for {character_dict[key]['character_name']}: {birth_date}")

    # 更新されたデータを保存
    updated_characters = list(character_dict.values())

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(updated_characters, f, ensure_ascii=False, indent=2)

    print(f"\nMerged data saved to {output_file}")

    # 統計情報
    birthday_count = sum(1 for char in updated_characters if 'character_birthday' in char)
    print(f"Total characters: {len(updated_characters)}")
    print(f"Characters with birthday: {birthday_count}")

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: merge_birthdays.py <calendar_file> <characters_file> <output_file>")
        sys.exit(1)

    calendar_file = sys.argv[1]
    characters_file = sys.argv[2]
    output_file = sys.argv[3]

    merge_birthdays(calendar_file, characters_file, output_file)
