#!/usr/bin/env python3
"""
JSONデータの全角文字を半角に変換するスクリプト
"""

import json
import yaml
import unicodedata
from datetime import datetime

def zen_to_han(text):
    """
    全角文字を半角に変換（unicodedataを使用）
    """
    if not isinstance(text, str):
        return text

    # NFKC正規化で全角英数字・記号を半角に変換
    return unicodedata.normalize('NFKC', text)

def convert_dict(obj):
    """
    辞書またはリストの全角文字を再帰的に半角に変換
    """
    if isinstance(obj, dict):
        return {key: convert_dict(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_dict(item) for item in obj]
    elif isinstance(obj, str):
        return zen_to_han(obj)
    else:
        return obj

def main():
    input_file = 'biccame_characters_merged_20251216_201439.json'

    # JSONファイルを読み込み
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 全角を半角に変換
    converted_data = convert_dict(data)

    # タイムスタンプ
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    # 変換後のデータを保存
    output_json = f'biccame_characters_final_{timestamp}.json'
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(converted_data, f, ensure_ascii=False, indent=2)
    print(f'Saved to {output_json}')

    output_yaml = f'biccame_characters_final_{timestamp}.yaml'
    with open(output_yaml, 'w', encoding='utf-8') as f:
        yaml.dump(converted_data, f, allow_unicode=True, default_flow_style=False)
    print(f'Saved to {output_yaml}')

if __name__ == '__main__':
    main()
