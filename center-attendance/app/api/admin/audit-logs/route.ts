import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams

    const page = Number(searchParams.get('page') || 1)
    const limit = Number(searchParams.get('limit') || 20)
    const actionType = searchParams.get('actionType') || ''
    const targetTable = searchParams.get('targetTable') || ''
    const actorStaffId = searchParams.get('actorStaffId') || ''

    const safePage = Number.isFinite(page) && page > 0 ? page : 1
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20
    const offset = (safePage - 1) * safeLimit

    let query = supabaseAdmin
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (actionType) {
      query = query.eq('action_type', actionType)
    }

    if (targetTable) {
      query = query.eq('target_table', targetTable)
    }

    if (actorStaffId) {
      query = query.eq('actor_staff_id', Number(actorStaffId))
    }

    const { data, error, count } = await query.range(offset, offset + safeLimit - 1)

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: '감사로그 조회 실패',
          error: error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      rows: data ?? [],
      total: count ?? 0,
      page: safePage,
      limit: safeLimit,
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: '서버 오류',
        error: e instanceof Error ? e.message : 'unknown error',
      },
      { status: 500 }
    )
  }
}