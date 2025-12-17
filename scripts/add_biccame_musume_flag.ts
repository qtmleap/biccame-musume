import fs from 'node:fs'

// characters.jsonを読み込み
const data = JSON.parse(fs.readFileSync('public/characters.json', 'utf-8'))

// 除外するキャラクターのkey
const excludeKeys = ['biccamera', 'naisen', 'bicsim', 'oeraitan']

// is_biccame_musumeフラグを追加
const updated = data.map((char: any) => ({
  ...char,
  is_biccame_musume: !excludeKeys.includes(char.key)
}))

// 更新したデータを保存
fs.writeFileSync('public/characters.json', JSON.stringify(updated, null, 2))

console.log('Updated characters.json with is_biccame_musume flag')
console.log('Excluded characters:', excludeKeys.join(', '))
console.log(`Total characters: ${updated.length}`)
console.log(`Biccame musume: ${updated.filter((c: any) => c.is_biccame_musume).length}`)
console.log(`Excluded: ${updated.filter((c: any) => !c.is_biccame_musume).length}`)
