import { type NextRequest, NextResponse } from 'next/server'

/**
 * 全キャラクターの投票カウント取得
 * GET /api/votes
 */
export const GET = async (_request: NextRequest) => {
  try {
    // TODO: KV接続を実装（現在はモック）
    const counts: Record<string, number> = {}

    return NextResponse.json(counts)
  } catch (error) {
    console.error('Get all votes error:', error)
    return NextResponse.json({}, { status: 500 })
  }
}
