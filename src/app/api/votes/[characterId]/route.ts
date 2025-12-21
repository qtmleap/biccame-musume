import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getNextJSTDate } from '@/utils/vote'

/**
 * 投票カウント取得
 * GET /api/votes/[characterId]
 */
export const GET = async (_request: NextRequest, { params }: { params: { characterId: string } }) => {
  const { characterId } = params

  // TODO: KV接続を実装（現在はモック）
  const count = 0

  return NextResponse.json({
    characterId,
    count
  })
}

/**
 * 投票実行
 * POST /api/votes/[characterId]
 */
export const POST = async (request: NextRequest, { params: _params }: { params: { characterId: string } }) => {
  try {
    // IPアドレス取得
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'

    if (ip === 'unknown') {
      return NextResponse.json({ success: false, message: 'IP address not found' }, { status: 400 })
    }

    // TODO: KV接続を実装（現在はモック）
    // Rate Limiting、投票チェック、カウント増加処理をここに実装

    return NextResponse.json({
      success: true,
      message: '投票ありがとうございます！',
      count: 1,
      nextVoteDate: getNextJSTDate()
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
    }

    console.error('Vote error:', error)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
}
