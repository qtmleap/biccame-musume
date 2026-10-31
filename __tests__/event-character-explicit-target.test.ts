import { expect, test } from 'bun:test'
import { explicitTargetCharacters } from '@biccame/shared/domain/event-character'
import type { Event } from '@biccame/shared/schemas/event.dto'

const target = (stores: Event['stores'], characterIds: Event['characterIds']) =>
  explicitTargetCharacters({ stores, characterIds })

// 娘の集合が開催店舗の集合とちょうど同じなら、バックフィルで入れた既定として空配列。それ以外は娘をそのまま（重複なし・昇順）返す。

test('娘が空なら空', () => {
  expect(target(['akiba'], [])).toEqual([])
  expect(target(['akiba', 'chiba'], [])).toEqual([])
})

test('stores [A]・chars [A] は既定なので空（娘が空のイベントと同じ）', () => {
  expect(target(['akiba'], ['akiba'])).toEqual([])
  expect(target(['akiba'], [])).toEqual(target(['akiba'], ['akiba']))
})

test('stores [A,B]・chars [A,B] は既定なので空（並び順に依らない）', () => {
  expect(target(['akiba', 'chiba'], ['akiba', 'chiba'])).toEqual([])
  expect(target(['akiba', 'chiba'], ['chiba', 'akiba'])).toEqual([])
  expect(target(['chiba', 'akiba'], ['akiba', 'chiba'])).toEqual([])
})

test('stores [A,B]・chars [A] は開催店舗の一部だけの明示なので、そのまま返す（バックフィル前と同じキー）', () => {
  expect(target(['akiba', 'chiba'], ['akiba'])).toEqual(['akiba'])
})

test('stores [A]・chars [A,secret] は自店舗の娘を引かずにそのまま返す', () => {
  expect(target(['akiba'], ['akiba', 'secret'])).toEqual(['akiba', 'secret'])
  expect(target(['akiba'], ['secret', 'akiba'])).toEqual(['akiba', 'secret'])
})

test('stores [A]・chars [B] は別の娘なのでそのまま返す', () => {
  expect(target(['akiba'], ['chiba'])).toEqual(['chiba'])
})

test('自店舗の娘に別の娘を足した共同デザインは、別の娘だけのイベントと同じ結果にならない', () => {
  expect(target(['akiba'], ['akiba', 'chiba'])).toEqual(['akiba', 'chiba'])
  expect(target(['akiba'], ['akiba', 'chiba'])).not.toEqual(target(['akiba'], ['chiba']))
})

test('other と secret は店舗の娘ではないので残る', () => {
  expect(target(['akiba'], ['other'])).toEqual(['other'])
  expect(target(['akiba'], ['secret'])).toEqual(['secret'])
  expect(target(['akiba'], ['akiba', 'other', 'secret'])).toEqual(['akiba', 'other', 'secret'])
})

test('複数店舗のイベントで、開催店舗を超える娘や一部だけの娘は残る', () => {
  expect(target(['akiba', 'chiba'], ['chiba', 'honten', 'akiba'])).toEqual(['akiba', 'chiba', 'honten'])
  expect(target(['akiba', 'chiba'], ['honten'])).toEqual(['honten'])
})

test('開催店舗が空なら、娘が空のときだけ空で、娘があればそのまま返す', () => {
  expect(target([], [])).toEqual([])
  expect(target([], ['akiba', 'chiba'])).toEqual(['akiba', 'chiba'])
})

test('重複を除き、入力の並び順に依らず昇順で返す', () => {
  expect(target(['akiba'], ['honten', 'chiba', 'secret'])).toEqual(['chiba', 'honten', 'secret'])
  expect(target(['akiba'], ['secret', 'honten', 'chiba'])).toEqual(target(['akiba'], ['honten', 'chiba', 'secret']))
  expect(target(['akiba'], ['chiba', 'chiba', 'honten'])).toEqual(['chiba', 'honten'])
  expect(target(['akiba', 'akiba'], ['akiba', 'akiba'])).toEqual([])
})

test('入力の配列を書き換えない', () => {
  const stores: Event['stores'] = ['akiba']
  const characterIds: Event['characterIds'] = ['chiba', 'akiba']
  target(stores, characterIds)
  expect(characterIds).toEqual(['chiba', 'akiba'])
  expect(stores).toEqual(['akiba'])
})
