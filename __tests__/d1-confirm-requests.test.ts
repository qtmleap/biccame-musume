import { expect, test } from 'bun:test'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import {
  CHARACTER_CONFIRM_A_KEY,
  CHARACTER_CONFIRM_B_KEY,
  CHARACTER_TARGET_LABEL,
  characterShortName,
  confirmQuestionsSha256,
  confirmRequest,
  STORE_CONFIRM_KEY,
  STORE_TARGET_LABEL,
  yesProbability
} from '../scripts/lib/event-detect/d1-confirm-requests'
import { STATE, yesResponse } from './d1-confirm-fixtures'

test('the target lines are appended to the end of the saved state, with short names only', () => {
  const request = confirmRequest(STATE, { store: 'yuurakuchou', character: 'tenjin2' })
  expect(request.state.startsWith(`${STATE}\n`)).toBe(true)
  const lines = request.state.split('\n')
  expect(lines.at(-2)).toBe(`${STORE_TARGET_LABEL}: 有楽町店`)
  expect(lines.at(-1)).toBe(`${CHARACTER_TARGET_LABEL}: ${characterShortName('tenjin2')}`)
  // 「ビックカメラ」も括弧の ID も付けない。
  const added = lines.slice(-2).join('\n')
  expect(added).not.toContain('ビックカメラ')
  expect(added).not.toMatch(/[（(][a-z0-9]+[）)]/)
  expect(request.model).toBe('clef')
})

test('the store request carries one question and the character request carries a and b, all noul', () => {
  const store = confirmRequest(STATE, { store: 'akiba' })
  expect(Object.keys(store.questions)).toEqual([STORE_CONFIRM_KEY])
  const character = confirmRequest(STATE, { character: 'akiba' })
  expect(Object.keys(character.questions)).toEqual([CHARACTER_CONFIRM_A_KEY, CHARACTER_CONFIRM_B_KEY])
  const both = confirmRequest(STATE, { store: 'akiba', character: 'akiba' })
  expect(Object.values(both.questions).every((question) => question.type === 'noul')).toBe(true)
  expect(ClefRequestSchema.safeParse(both).success).toBe(true)
})

test('question text never contains a per-post value, and only b drops the "do not assume" note', () => {
  const first = confirmRequest(STATE, { store: 'yuurakuchou', character: 'yuurakuchou' })
  const second = confirmRequest(`${STATE}\n別の投稿`, { store: 'akiba', character: 'nanba' })
  expect(second.questions).toEqual(first.questions)
  const text = JSON.stringify(first.questions)
  for (const value of ['有楽町', 'あきば', 'akiba', 'yuurakuchou']) expect(text).not.toContain(value)
  const a = first.questions[CHARACTER_CONFIRM_A_KEY]
  const b = first.questions[CHARACTER_CONFIRM_B_KEY]
  expect(a.instructions).toContain('同一と仮定しないでください')
  expect(b.instructions).not.toContain('仮定')
  expect(confirmQuestionsSha256).toMatch(/^[0-9a-f]{64}$/)
})

test('a request without any target is rejected', () => {
  expect(() => confirmRequest(STATE, {})).toThrow('at least one target')
  expect(() => characterShortName('nowhere')).toThrow('Unknown character id')
})

test('yesProbability reads noul answers only', () => {
  const request = confirmRequest(STATE, { store: 'akiba', character: 'nanba' })
  const response = yesResponse(request, 0.93)
  expect(yesProbability(response.answers, STORE_CONFIRM_KEY)).toBe(0.93)
  expect(yesProbability(response.answers, 'missing')).toBeNull()
  expect(yesProbability({ x: { type: 'choice', choice: 'a', probabilities: { a: 1 } } }, 'x')).toBeNull()
})
