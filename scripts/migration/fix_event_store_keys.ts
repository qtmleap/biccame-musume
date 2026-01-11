#!/usr/bin/env bun
/**
 * イベントデータの店舗フィールドを店舗名から店舗キーに変換するスクリプト
 */
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const charactersPath = resolve(import.meta.dir, '../../public/characters.json')
const charactersData = JSON.parse(readFileSync(charactersPath, 'utf-8'))

type StoreData = {
	id: string
	store: {
		name: string | null
	} | null
}

/**
 * 店舗名から店舗キーへのマッピングを構築
 */
const buildStoreNameToKeyMap = (): Map<string, string> => {
	const map = new Map<string, string>()
	for (const char of charactersData as StoreData[]) {
		if (char.store?.name) {
			// 店舗名から「ビックカメラ」を除いた部分もマッピング
			const fullName = char.store.name
			map.set(fullName, char.id)

			// 「ビックカメラ」を除いた部分（「なんば店」など）
			const shortName = fullName.replace(/^ビックカメラ/, '').trim()
			if (shortName) {
				map.set(shortName, char.id)
			}
		}
	}

	// 手動マッピング追加（スペースや別名の対応）
	map.set('あべの キューズモール店', 'abeno')
	map.set('あべのキューズモール店', 'abeno')
	map.set('池袋本店パソコン館', 'honten')
	map.set('池袋本店', 'honten')

	return map
}

/**
 * イベントデータの店舗フィールドを変換
 */
const convertEventStores = async () => {
	const storeNameToKeyMap = buildStoreNameToKeyMap()
	console.log('Store name to key mapping built:', storeNameToKeyMap.size, 'entries')

	// KVからイベント一覧を取得
	const response = await fetch('http://localhost:5173/api/events')
	if (!response.ok) {
		throw new Error(`Failed to fetch events: ${response.statusText}`)
	}

	const { events } = await response.json()
	console.log(`Fetched ${events.length} events from API`)

	// 各イベントの店舗フィールドを変換
	let updatedCount = 0
	let skippedCount = 0

	for (const event of events) {
		if (!event.stores || event.stores.length === 0) {
			console.log(`Skipping event (no stores): ${event.name}`)
			skippedCount++
			continue
		}

		// 店舗名を店舗キーに変換
		const convertedStores: string[] = []
		const unconvertedStores: string[] = []

		for (const storeName of event.stores) {
			const storeKey = storeNameToKeyMap.get(storeName)
			if (storeKey) {
				convertedStores.push(storeKey)
			} else {
				unconvertedStores.push(storeName)
			}
		}

		if (unconvertedStores.length > 0) {
			console.warn(
				`Event "${event.name}": Could not convert stores:`,
				unconvertedStores
			)
		}

		if (convertedStores.length === 0) {
			console.warn(`Event "${event.name}": No stores could be converted`)
			skippedCount++
			continue
		}

		// イベントを更新
		console.log(
			`Updating event "${event.name}": ${event.stores.join(', ')} -> ${convertedStores.join(', ')}`
		)

		try {
			const updateResponse = await fetch(
				`http://localhost:5173/api/events/${event.id}`,
				{
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						...event,
						stores: convertedStores
					})
				}
			)

			if (!updateResponse.ok) {
				console.error(
					`Failed to update event "${event.name}": ${updateResponse.statusText}`
				)
				skippedCount++
			} else {
				updatedCount++
			}
		} catch (error) {
			console.error(`Error updating event "${event.name}":`, error)
			skippedCount++
		}
	}

	console.log('\n=== Summary ===')
	console.log(`Total events: ${events.length}`)
	console.log(`Updated: ${updatedCount}`)
	console.log(`Skipped: ${skippedCount}`)
}

// 実行
convertEventStores().catch(console.error)
