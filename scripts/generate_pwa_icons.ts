#!/usr/bin/env bun

/**
 * PWA用のアイコンを生成するスクリプト
 * 既存のog_image.webpをベースに、各サイズのPWAアイコンを生成
 */

import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const sharp = require('sharp')

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
const SOURCE_IMAGE = resolve(__dirname, '../public/og_image.webp')
const APPLE_TOUCH_ICON = resolve(__dirname, '../public/apple-touch-icon.png')
const OUTPUT_DIR = resolve(__dirname, '../public/icons')

/**
 * アイコンディレクトリを作成
 */
function ensureIconDirectory() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
    console.log(`Created directory: ${OUTPUT_DIR}`)
  }
}

/**
 * 各サイズのアイコンを生成
 */
async function generateIcons() {
  if (!existsSync(SOURCE_IMAGE)) {
    console.error(`Source image not found: ${SOURCE_IMAGE}`)
    process.exit(1)
  }

  console.log('Generating PWA icons...')

  // 通常のアイコンを生成
  for (const size of ICON_SIZES) {
    const outputPath = resolve(OUTPUT_DIR, `icon-${size}x${size}.png`)
    
    try {
      await sharp(SOURCE_IMAGE)
        .resize(size, size, {
          fit: 'cover',
          position: 'center',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png({ quality: 100, compressionLevel: 9 })
        .toFile(outputPath)
      
      console.log(`✓ Generated: icon-${size}x${size}.png`)
    } catch (error) {
      console.error(`✗ Failed to generate icon-${size}x${size}.png:`, error)
    }
  }

  // Maskable icons (192x192, 512x512のみ)
  const maskableSizes = [192, 512]
  for (const size of maskableSizes) {
    const outputPath = resolve(OUTPUT_DIR, `icon-${size}x${size}-maskable.png`)
    
    try {
      // Maskableアイコンは中央に配置し、周囲に余白を持たせる
      const padding = Math.floor(size * 0.2) // 20%の余白
      const innerSize = size - padding * 2

      await sharp(SOURCE_IMAGE)
        .resize(innerSize, innerSize, {
          fit: 'cover',
          position: 'center'
        })
        .extend({
          top: padding,
          bottom: padding,
          left: padding,
          right: padding,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png({ quality: 100, compressionLevel: 9 })
        .toFile(outputPath)
      
      console.log(`✓ Generated: icon-${size}x${size}-maskable.png`)
    } catch (error) {
      console.error(`✗ Failed to generate icon-${size}x${size}-maskable.png:`, error)
    }
  }

  // Apple touch iconが存在しない場合は生成
  if (!existsSync(APPLE_TOUCH_ICON)) {
    try {
      await sharp(SOURCE_IMAGE)
        .resize(180, 180, {
          fit: 'cover',
          position: 'center',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png({ quality: 100, compressionLevel: 9 })
        .toFile(APPLE_TOUCH_ICON)
      
      console.log('✓ Generated: apple-touch-icon.png')
    } catch (error) {
      console.error('✗ Failed to generate apple-touch-icon.png:', error)
    }
  } else {
    console.log('✓ apple-touch-icon.png already exists')
  }

  console.log('\n✅ PWA icon generation completed!')
}

// メイン処理
async function main() {
  try {
    ensureIconDirectory()
    await generateIcons()
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
