import { expect, test } from 'bun:test'
import { socialEventView } from '@biccame/shared/domain/social-post'
import { SPECIAL_CHARACTER_NAMES } from '@biccame/shared/domain/special-character-names'
import { storeCharacterContent } from '@/locales/app-dictionary/store-character-labels'
import { daily, event, required, sideRows, startingToday } from '../fixtures/social-post-domain'

test('single event view resolves stores, avatars, target, period and conditions', () => {
  const multi = socialEventView(
    event(1, {
      stores: ['hachioji', 'shibuhachi', 'yao', 'nagoya'],
      conditions: [
        { uuid: crypto.randomUUID(), type: 'lottery', quantity: 30 },
        { uuid: crypto.randomUUID(), type: 'purchase', purchaseAmount: 1500 }
      ],
      limitedQuantity: 50
    })
  )
  expect(multi.avatars).toEqual(['akiba'])
  expect(multi.target).toBe('アキバたん')
  expect(multi.stores).toHaveLength(4)
  expect(multi.conditions).toEqual(['抽選30名', '1,500円以上購入', '限定50個'])
  expect(multi.period).toBe('10/12(月) 〜 10/18(日)')
  const explicit = socialEventView(event(2, { stores: ['chofu', 'hachioji'], characterIds: ['seiseki'] }))
  expect(explicit.avatars).toEqual(['seiseki'])
  expect(explicit.target).toBe('せいせきたん')
  const secret = socialEventView(event(3, { characterIds: ['secret'] }))
  expect(secret.avatars).toEqual(['secret'])
  expect(secret.target).toBe('シークレット')
  const other = socialEventView(event(4, { characterIds: ['other'] }))
  expect(other.avatars).toEqual(['other'])
  expect(other.target).toBe('その他')
  expect(socialEventView(event(5, { stores: ['akiba'], characterIds: ['akiba'] })).target).toBe('アキバたん')
})

test('special character names match the site badge labels', () => {
  expect(SPECIAL_CHARACTER_NAMES).toEqual(storeCharacterContent.special_character)
})

test('rows show a target only when every merged event points to the same character', () => {
  const snapshot = required(
    daily(
      [
        startingToday(1, { title: 'A', stores: ['chofu'], characterIds: ['seiseki'] }),
        startingToday(2, { title: 'A', stores: ['chofu'], characterIds: ['seiseki'] }),
        startingToday(3, { title: 'B', characterIds: ['secret'] }),
        startingToday(4, { title: 'C' })
      ],
      []
    )
  )
  const [rows] = sideRows(snapshot, 'starting')
  expect(rows.map((row) => row.target)).toEqual(['せいせきたん', 'シークレット', 'アキバたん'])
  expect(rows.map((row) => row.avatars)).toEqual([['seiseki'], ['secret'], ['akiba']])
})
