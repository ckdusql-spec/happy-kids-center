import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const staffId = Number(searchParams.get('staffId'))
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!staffId || !startDate || !endDate) {
      return NextResponse.json(
        { ok: false, message: 'staffId, startDate, endDate가 필요합니다.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('class_logs')
      .select('id, staff_id, child_id, class_date, class_time, status')
      .eq('staff_id', staffId)
      .gte('class_date', startDate)
      .lte('class_date', endDate)
      .order('class_date', { ascending: true })
      .order('class_time', { ascending: true })

    if (error) {
      return NextResponse.json(
        { ok: false, message: '수업기록 조회 실패' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      rows: data ?? [],
    })
  } catch {
    return NextResponse.json(
      { ok: false, message: '서버 오류' },
      { status: 500 }
    )
  }
}