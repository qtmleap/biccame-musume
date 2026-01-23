#!/bin/bash

# images.jsonの各キー(16, 53, 78, 83, 112, 113)について重複と抜けている番号をチェック

JSON_FILE="${1:-.vscode/scripts/images.json}"

if [ ! -f "$JSON_FILE" ]; then
  echo "Error: File not found: $JSON_FILE"
  exit 1
fi

# 各キーをチェック
KEYS=("16" "53" "78" "83" "112" "113")

for KEY in "${KEYS[@]}"; do
  echo "======================================"
  echo "Checking key: $KEY"
  echo "======================================"
  
  # すべての値を抽出してソート (空配列とbirthdayがnullのものは除外)
  VALUES=$(jq -r ".[] | select(.birthday != null) | .images.\"$KEY\" | .[]?" "$JSON_FILE" | sort -n)
  
  if [ -z "$VALUES" ]; then
    echo "No values found for key $KEY"
    echo ""
    continue
  fi
  
  # 配列に変換
  VALUE_ARRAY=($VALUES)
  
  # 最小値と最大値を取得
  MIN=${VALUE_ARRAY[0]}
  MAX=${VALUE_ARRAY[-1]}
  
  echo "Range: $MIN - $MAX"
  echo "Total values: ${#VALUE_ARRAY[@]}"
  
  # 重複チェック
  echo ""
  echo "Duplicates:"
  DUPLICATES=$(echo "$VALUES" | uniq -d)
  if [ -z "$DUPLICATES" ]; then
    echo "  None"
  else
    echo "$DUPLICATES" | while read -r DUP; do
      # どのキャラクターが重複しているか表示
      CHARS=$(jq -r "to_entries[] | select(.value.birthday != null) | select(.value.images.\"$KEY\"[]? == $DUP) | .key" "$JSON_FILE" | tr '\n' ', ' | sed 's/,$//')
      echo "  $DUP: $CHARS"
    done
  fi
  
  # 抜けている番号をチェック
  echo ""
  echo "Missing numbers:"
  MISSING=()
  for ((i=$MIN; i<=$MAX; i++)); do
    if ! echo "$VALUES" | grep -q "^${i}$"; then
      MISSING+=($i)
    fi
  done
  
  if [ ${#MISSING[@]} -eq 0 ]; then
    echo "  None"
  else
    echo "  ${MISSING[*]}"
  fi
  
  # 空配列のキャラクターを表示 (birthdayがnullでないもののみ)
  echo ""
  echo "Characters with empty array (birthday not null):"
  EMPTY_CHARS=$(jq -r "to_entries[] | select(.value.birthday != null) | select(.value.images.\"$KEY\" | length == 0) | .key" "$JSON_FILE" | tr '\n' ', ' | sed 's/,$//')
  if [ -z "$EMPTY_CHARS" ]; then
    echo "  None"
  else
    echo "  $EMPTY_CHARS"
  fi
  
  echo ""
done
