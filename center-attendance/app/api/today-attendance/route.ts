import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function todayKstDate() {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const y = kst.getFullYear()
  const m = String(kst.getMonth() + 1).padStart(2, '0')
  const d = String(kst.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const staffId = searchParams.get('staffId')

    if (!staffId) {
      return NextResponse.json(
        { ok: false, message: 'staffId가 필요합니다.' },
        { status: 400 }
      )
    }

    const workDate = todayKstDate()

    const { data, error } = await supabaseAdmin
      .from('attendance_logs')
      .select('*')
      .eq('staff_id', Number(staffId))
      .eq('work_date', workDate)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { ok: false, message: '오늘 출퇴근 조회 실패', error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      attendance: data ?? null,
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