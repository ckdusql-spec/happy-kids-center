import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { staffId, childId, note, status, classTime, classDate } = body as {
      staffId?: number
      childId?: number
      note?: string
      status?: 'attended' | 'absent' | 'makeup'
      classTime?: string
      classDate?: string
    }

    if (!staffId || !childId || !status || !classTime || !classDate) {
      return NextResponse.json(
        { ok: false, message: '필수값이 누락되었습니다.' },
        { status: 400 }
      )
    }

    const classDateTime = `${classDate}T${classTime}:00+09:00`

    const { error } = await supabaseAdmin
      .from('class_logs')
      .insert({
        staff_id: staffId,
        child_id: childId,
        class_date: classDate,
        class_time: classDateTime,
        status,
        note: note ?? '',
      })

    if (error) {
      return NextResponse.json(
        { ok: false, message: '수업 저장 실패' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: '수업 기록 저장 완료',
    })
  } catch {
    return NextResponse.json(
      { ok: false, message: '서버 오류' },
      { status: 500 }
    )
  }
}