import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const staffId = searchParams.get('staffId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!staffId || !startDate || !endDate) {
      return NextResponse.json(
        { ok: false, message: 'staffId, startDate, endDate가 필요합니다.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('weekly_schedules')
      .select('id, staff_id, child_id, schedule_date, time_slot, memo')
      .eq('staff_id', Number(staffId))
      .gte('schedule_date', startDate)
      .lte('schedule_date', endDate)
      .order('schedule_date', { ascending: true })
      .order('time_slot', { ascending: true })

    if (error) {
      return NextResponse.json(
        { ok: false, message: '시간표 조회 실패', error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      rows: data ?? [],
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