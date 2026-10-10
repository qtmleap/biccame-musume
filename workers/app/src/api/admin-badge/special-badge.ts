import type { CreateSpecialBadgeBody } from '@/schemas/badge.dto'

/**
 * Generate an 8-char URL-safe random string using Web Crypto (no nanoid dep).
 */
export function generateShortId(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '0')
    .replace(/\//g, '1')
    .replace(/=/g, '')
    .slice(0, 8)
}

export function isSpecialCode(code: string): boolean {
  return code.startsWith('special_')
}

export function validateSpecialConditionMeta(body: CreateSpecialBadgeBody): string | null {
  const { sub_category, condition_meta } = body
  if (sub_category === 'special_multi_store_clear') {
    if (!('storeKeys' in condition_meta) || !condition_meta.storeKeys?.length) {
      return 'sub_category が special_multi_store_clear の場合は condition_meta.storeKeys が必要です'
    }
  } else if (sub_category === 'special_event_id') {
    if (!('eventId' in condition_meta) || !condition_meta.eventId) {
      return 'sub_category が special_event_id の場合は condition_meta.eventId が必要です'
    }
  }
  return null
}
